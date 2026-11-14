import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPartnerContext } from "@/lib/partner/auth";
import { notReady } from "@/lib/partner/crm";

/**
 * 정산 이의 — "다르게 보여요" (v3 7.7). 업체가 달 정산이나 충전금 내역 한 줄에 사유를 남기면 케어푸드가 확인해 답한다.
 * GET  → {ready, disputes}
 * POST {target: "month", month: "YYYY-MM", reason} · {target: "ledger", ledger_id, reason}
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET(req: NextRequest) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  const sb = createServiceRoleClient() as Sb;
  const { data, error } = await sb.from("partner_disputes").select("id, target, month, ledger_id, reason, status, reply, created_at, resolved_at")
    .eq("partner_id", ctx.partner.id).order("created_at", { ascending: false }).limit(50);
  if (error) return notReady(error) ? NextResponse.json({ ready: false, disputes: [] }) : bad(error.message, 500);
  return NextResponse.json({ ready: true, disputes: data || [], read_only: ctx.role === "admin" });
}

export async function POST(req: NextRequest) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  if (ctx.role === "admin") return bad("관리자 보기에서는 남길 수 없어요", 403);
  const b = await req.json().catch(() => ({}));
  const reason = String(b.reason || "").trim();
  if (reason.length < 5) return bad("무엇이 다른지 5자 이상 적어 주세요");
  if (reason.length > 1000) return bad("1,000자 안으로 적어 주세요");
  const sb = createServiceRoleClient() as Sb;
  const pid = ctx.partner.id;

  const row: Record<string, unknown> = { partner_id: pid, reason, created_by: ctx.userId };
  if (b.target === "month") {
    if (!/^\d{4}-\d{2}$/.test(String(b.month))) return bad("어느 달인지 알려 주세요");
    Object.assign(row, { target: "month", month: b.month });
  } else if (b.target === "ledger") {
    if (!UUID.test(String(b.ledger_id))) return bad("어느 내역인지 알려 주세요");
    const { data: led, error } = await sb.from("partner_credit_ledger").select("id").eq("id", b.ledger_id).eq("partner_id", pid).maybeSingle();
    if (error) return bad(error.message, 500);
    if (!led) return bad("내 충전금 내역이 아니에요", 404);
    Object.assign(row, { target: "ledger", ledger_id: b.ledger_id });
  } else return bad("무엇에 대한 이의인지 알려 주세요");

  const { count, error: cErr } = await sb.from("partner_disputes").select("id", { count: "exact", head: true }).eq("partner_id", pid).eq("status", "open");
  if (cErr) return notReady(cErr) ? bad("이의 신청을 준비하고 있어요", 503) : bad(cErr.message, 500);
  if ((count || 0) >= 20) return bad("답을 기다리는 이의가 20건이에요. 답을 받은 뒤 남겨 주세요", 409);
  const { data, error } = await sb.from("partner_disputes").insert(row).select("id, target, month, ledger_id, reason, status, reply, created_at, resolved_at").single();
  if (error) return bad(error.message, 500);
  return NextResponse.json({ dispute: data });
}
