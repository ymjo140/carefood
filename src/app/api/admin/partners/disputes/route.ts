import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { adminOnly, getAdminUser } from "@/lib/actor-server";
import { notReady } from "@/lib/partner/crm";

/**
 * 관리자 — 정산 이의 (v3 7.7)
 * GET  → {ready, open, recent} (답을 기다리는 것 · 최근 30일에 닫은 것)
 * POST {id, status: "resolved" | "rejected", reply} — 답을 남기고 닫는다. 금액을 고치는 일은 정산·충전금 화면에서 따로 한다
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const COLS = "id, partner_id, target, month, ledger_id, reason, status, reply, created_at, resolved_at, partners(name), partner_credit_ledger(kind, amount, created_at, note)";

export async function GET() {
  await connection();
  const denied = await adminOnly(); if (denied) return denied;
  const sb = createServiceRoleClient() as Sb;
  const [open, recent] = await Promise.all([
    sb.from("partner_disputes").select(COLS).eq("status", "open").order("created_at").limit(100),
    sb.from("partner_disputes").select(COLS).neq("status", "open").gte("resolved_at", new Date(Date.now() - 30 * 86400e3).toISOString()).order("resolved_at", { ascending: false }).limit(30),
  ]);
  for (const r of [open, recent]) if (r.error) return notReady(r.error) ? NextResponse.json({ ready: false, open: [], recent: [] }) : bad(r.error.message, 500);
  return NextResponse.json({ ready: true, open: open.data || [], recent: recent.data || [] });
}

export async function POST(req: NextRequest) {
  await connection();
  const admin = await getAdminUser();
  if (!admin) return bad("관리자만 답할 수 있어요", 403);
  const b = await req.json().catch(() => ({}));
  if (!UUID.test(String(b.id))) return bad("답할 이의를 골라 주세요");
  if (!["resolved", "rejected"].includes(b.status)) return bad("처리 결과를 골라 주세요");
  const reply = String(b.reply || "").trim();
  if (reply.length < 2) return bad("업체에 보낼 답을 적어 주세요");
  const sb = createServiceRoleClient() as Sb;
  const { data, error } = await sb.from("partner_disputes")
    .update({ status: b.status, reply: reply.slice(0, 1000), resolved_by: admin.id, resolved_at: new Date().toISOString() })
    .eq("id", b.id).eq("status", "open").select("id").maybeSingle();
  if (error) return bad(error.message, 500);
  if (!data) return bad("이미 답한 이의예요", 409);
  return NextResponse.json({ ok: true });
}
