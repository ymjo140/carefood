import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { adminOnly, getAdminUser } from "@/lib/actor-server";
import { patternError, type ClaimKind } from "@/lib/partner/claims";
import { clearClaimTerms } from "@/lib/partner/claims-server";
import { notReady } from "@/lib/partner/crm";

/**
 * 관리자 — 금지 표현 사전 (lib/partner/claims.ts, 표 partner_claim_terms)
 * GET  → {ready, terms}
 * POST {action: "create", pattern, kind, suggest?, note?} · {action: "update", id, pattern, kind, suggest?, note?} · {action: "toggle", id, is_active}
 * 바꾼 사전은 1분 안에 업체 화면·검수·요청 점검에 반영된다.
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS: ClaimKind[] = ["disease", "health_food", "review"];
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET() {
  await connection();
  const denied = await adminOnly(); if (denied) return denied;
  const sb = createServiceRoleClient() as Sb;
  const { data, error } = await sb.from("partner_claim_terms").select("id, pattern, kind, suggest, note, is_active, sort, updated_at").order("sort").order("created_at").limit(500);
  if (error) return notReady(error) ? NextResponse.json({ ready: false, terms: [] }) : bad(error.message, 500);
  return NextResponse.json({ ready: true, terms: data || [] });
}

export async function POST(req: NextRequest) {
  await connection();
  const admin = await getAdminUser();
  if (!admin) return bad("관리자만 바꿀 수 있어요", 403);
  const b = await req.json().catch(() => ({}));
  const sb = createServiceRoleClient() as Sb;
  const now = new Date().toISOString();

  if (b.action === "toggle") {
    if (!UUID.test(String(b.id)) || typeof b.is_active !== "boolean") return bad("바꿀 표현을 골라 주세요");
    const { error } = await sb.from("partner_claim_terms").update({ is_active: b.is_active, updated_at: now, updated_by: admin.id }).eq("id", b.id);
    if (error) return bad(error.message, 500);
    clearClaimTerms();
    return NextResponse.json({ ok: true });
  }

  if (b.action === "create" || b.action === "update") {
    const pattern = String(b.pattern || "").trim();
    const err = patternError(pattern);
    if (err) return bad(err);
    if (!KINDS.includes(b.kind)) return bad("분류를 골라 주세요");
    const suggest = String(b.suggest || "").trim().slice(0, 60) || null;
    const note = String(b.note || "").trim().slice(0, 200) || null;
    const row = { pattern, kind: b.kind, suggest, note, updated_at: now, updated_by: admin.id };
    if (b.action === "update") {
      if (!UUID.test(String(b.id))) return bad("고칠 표현을 골라 주세요");
      const { error } = await sb.from("partner_claim_terms").update(row).eq("id", b.id);
      if (error) return bad(error.message, 500);
    } else {
      const { data: last } = await sb.from("partner_claim_terms").select("sort").order("sort", { ascending: false }).limit(1);
      const { error } = await sb.from("partner_claim_terms").insert({ ...row, sort: ((last?.[0]?.sort as number) || 0) + 10 });
      if (error) return bad(error.message, 500);
    }
    clearClaimTerms();
    return NextResponse.json({ ok: true });
  }
  return bad("알 수 없는 요청이에요");
}
