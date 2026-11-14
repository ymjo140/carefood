import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canAct, getPartnerContext, readOnly } from "@/lib/partner/auth";
import { FLOWS, flowCounts, isFlowKind, listFlows } from "@/lib/partner/flows";
import { checkMessage, creditBalance, notReady } from "@/lib/partner/crm";
import { FLOW_MESSAGE_PRICE } from "@/lib/partner/rates";
import { loadClaimTerms } from "@/lib/partner/claims-server";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** GET /api/partner/flows[?as=slug] — 자동 알림 세 가지와 지난 30일 보낸 수, 건당 요금·충전금 잔액 */
export async function GET(req: NextRequest) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  const sb = createServiceRoleClient() as Sb;
  try {
    const [flows, counts, credit] = await Promise.all([listFlows(sb, ctx.partner.id), flowCounts(sb, ctx.partner.id), creditBalance(sb, ctx.partner.id)]);
    return NextResponse.json({
      ready: true, read_only: !canAct(ctx), unit_price: ctx.partner.is_demo ? 0 : FLOW_MESSAGE_PRICE, balance: credit.balance,
      flows: flows.map((f) => ({ ...f, ...FLOWS[f.kind], sent_30: counts[f.kind] || 0 })),
    });
  } catch (e) {
    if (notReady(e as { message?: string })) return NextResponse.json({ ready: false, read_only: true, flows: [] });
    console.error("자동 알림을 불러오지 못했어요:", (e as Error).message);
    return bad("자동 알림을 불러오지 못했어요", 500);
  }
}

/** PUT /api/partner/flows[?as=slug] — {kind, is_on, title, body, delay_days, coupon_id?} */
export async function PUT(req: NextRequest) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  if (!canAct(ctx)) return readOnly();
  const b = await req.json().catch(() => ({}));
  if (!isFlowKind(b?.kind)) return bad("자동 알림 종류를 골라 주세요");
  const title = String(b.title || "").trim(), body = String(b.body || "").trim();
  const sb = createServiceRoleClient() as Sb;
  const msg = checkMessage(title, body, await loadClaimTerms(sb));
  if (msg.error) return bad(msg.error);
  if (msg.hits.length) return bad(`쓸 수 없는 표현이 있어요: ${msg.hits.map((h) => h.phrase).join(", ")}`);
  const days = Math.floor(Number(b.delay_days));
  if (!(days >= 1 && days <= 180)) return bad("날 수는 1~180일로 적어 주세요");
  let coupon_id: string | null = null;
  if (b.coupon_id) {
    if (!UUID.test(String(b.coupon_id))) return bad("쿠폰을 다시 골라 주세요");
    const { data, error } = await sb.from("partner_coupons").select("id").eq("id", b.coupon_id).eq("partner_id", ctx.partner.id).eq("status", "active").maybeSingle();
    if (error) return bad("쿠폰을 확인하지 못했어요", 500);
    if (!data) return bad("쓸 수 있는 내 쿠폰이 아니에요");
    coupon_id = data.id;
  }
  const { error } = await sb.from("partner_flows").upsert({
    partner_id: ctx.partner.id, kind: b.kind, is_on: b.is_on === true, coupon_id, title, body, delay_days: days, updated_at: new Date().toISOString(),
  }, { onConflict: "partner_id,kind" });
  if (error) {
    console.error("자동 알림을 저장하지 못했어요:", error.message);
    return bad("저장하지 못했어요. 다시 시도해 주세요", 500);
  }
  return NextResponse.json({ ok: true });
}
