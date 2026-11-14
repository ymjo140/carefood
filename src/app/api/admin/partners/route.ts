import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { adminOnly } from "@/lib/actor-server";
import { syncPartnerProducts } from "@/lib/partner/ingest";
import { asResult, selectAll } from "@/lib/supabase/all";
import { STANDARD_RATES } from "@/lib/partner/rates";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const KINDS = ["meal_service", "brand", "mall"];
const STATUSES = ["onboarding", "active", "paused"];

/** GET /api/admin/partners — 업체 목록 + 담당자 + 제품 상태별 수 */
export async function GET() {
  await connection();
  const denied = await adminOnly(); if (denied) return denied;
  const sb: Sb = createServiceRoleClient();
  const [p, m, i] = await Promise.all([
    sb.from("partners").select("id, slug, name, kind, status, contact_email, commission_rate, order_commission_rate, attribution_days, created_at").order("created_at", { ascending: false }),
    sb.from("partner_members").select("partner_id, email, role"),
    asResult(selectAll<{ partner_id: string; status: string }>(() => sb.from("partner_items").select("partner_id, status"), "id", 1_000_000)),
  ]);
  for (const r of [p, m, i]) if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
  const partners = (p.data || []).map((x: { id: string }) => {
    const counts: Record<string, number> = {};
    for (const it of i.data || []) if (it.partner_id === x.id) counts[it.status] = (counts[it.status] || 0) + 1;
    return { ...x, members: (m.data || []).filter((mm: { partner_id: string }) => mm.partner_id === x.id), counts };
  });
  return NextResponse.json({ partners });
}

/** POST /api/admin/partners — 업체 만들기 {slug, name, kind, contact_email?} (기본 수수료율로) */
export async function POST(req: NextRequest) {
  const denied = await adminOnly(); if (denied) return denied;
  const b = await req.json().catch(() => null);
  const slug = String(b?.slug || "").trim().toLowerCase();
  const name = String(b?.name || "").trim();
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) return NextResponse.json({ error: "영문 소문자·숫자·- 로 2~40자 (예: greating)" }, { status: 400 });
  if (!name || name.length > 60) return NextResponse.json({ error: "업체 이름을 적어 주세요" }, { status: 400 });
  if (!KINDS.includes(b?.kind)) return NextResponse.json({ error: "업체 유형을 골라 주세요" }, { status: 400 });
  const sb: Sb = createServiceRoleClient();
  // 새 업체는 기본 수수료율로 시작한다 (lib/partner/rates.ts) — 비워 두면 정산 마감이 막힌다
  const { data, error } = await sb.from("partners").insert({
    slug, name, kind: b.kind, commission_rate: STANDARD_RATES.link, order_commission_rate: STANDARD_RATES.order, attribution_days: 7, contact_email: typeof b.contact_email === "string" && b.contact_email.includes("@") ? b.contact_email.trim() : null,
  }).select("id, slug, name, kind, status").single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "같은 영문 이름의 업체가 있어요" : error.message }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ partner: data });
}

/** PATCH /api/admin/partners — {id, status?, commission_rate?, order_commission_rate?, attribution_days?} */
export async function PATCH(req: NextRequest) {
  const denied = await adminOnly(); if (denied) return denied;
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ error: "업체를 골라 주세요" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) return NextResponse.json({ error: "상태 값이 맞지 않아요" }, { status: 400 });
    patch.status = b.status;
  }
  if (b.commission_rate !== undefined) {
    const r = Number(b.commission_rate);
    if (!(r >= 0 && r <= 50)) return NextResponse.json({ error: "수수료율은 0~50% 예요" }, { status: 400 });
    patch.commission_rate = r;
  }
  if (b.order_commission_rate !== undefined && b.order_commission_rate !== null && b.order_commission_rate !== "") {
    const r = Number(b.order_commission_rate);
    if (!(r >= 0 && r <= 50)) return NextResponse.json({ error: "앱 주문 수수료율은 0~50% 예요" }, { status: 400 });
    patch.order_commission_rate = r;
  }
  if (b.attribution_days !== undefined) {
    const d = Number(b.attribution_days);
    if (!(Number.isInteger(d) && d >= 0 && d <= 90)) return NextResponse.json({ error: "인정 기간은 0~90일이에요" }, { status: 400 });
    patch.attribution_days = d;
  }
  const sb: Sb = createServiceRoleClient();
  const { error } = await sb.from("partners").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (patch.status) {
    try { await syncPartnerProducts(sb, b.id); } catch (e) { return NextResponse.json({ error: `상태는 바꿨지만 제품에 반영하지 못했어요: ${(e as Error).message}` }, { status: 500 }); }
  }
  return NextResponse.json({ ok: true });
}
