import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canAct, getPartnerContext, readOnly } from "@/lib/partner/auth";
import { COUPON_COLS, grantCoupon, parseCoupon, type Coupon } from "@/lib/partner/coupons";
import { isStage, loadBuyers } from "@/lib/partner/customers";
import { userPusher } from "@/lib/push";
import { limitRequest } from "@/lib/rate-limit";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * POST /api/partner/coupons/:id[?as=slug]
 *  {action: "grant", codes?: string[], stage?: string} — 고른 고객(가명 번호) 또는 한 단계의 고객 모두에게 준다
 *  {action: "stop"} — 더 주지 않는다 (이미 준 쿠폰은 기간까지 쓸 수 있다)
 * 내 고객(이 업체 제품을 결제한 사람)에게만 줄 수 있다.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const limited = await limitRequest(req, "upload");
  if (limited) return limited;
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  if (!canAct(ctx)) return readOnly();
  const { id } = await params;
  if (!UUID.test(id)) return bad("쿠폰을 찾지 못했어요", 404);
  const b = await req.json().catch(() => ({}));
  const sb = createServiceRoleClient() as Sb;
  try {
    if (b?.action === "stop") {
      const { data, error } = await sb.from("partner_coupons").update({ status: "stopped" }).eq("id", id).eq("partner_id", ctx.partner.id).eq("status", "active").select("id");
      if (error) throw new Error(error.message);
      if (!data?.length) return bad("이미 멈췄거나 없는 쿠폰이에요", 409);
      return NextResponse.json({ ok: true });
    }
    if (b?.action !== "grant") return bad("할 일을 골라 주세요");
    const { data: coupon, error } = await sb.from("partner_coupons").select(COUPON_COLS).eq("id", id).eq("partner_id", ctx.partner.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!coupon) return bad("쿠폰을 찾지 못했어요", 404);
    if ((coupon as Coupon).status !== "active") return bad("멈춘 쿠폰은 줄 수 없어요", 409);
    const buyers = await loadBuyers(sb, ctx.partner.id);
    let users: string[];
    if (Array.isArray(b.codes) && b.codes.length) {
      const want = new Set((b.codes as unknown[]).map(String).slice(0, 2000));
      users = buyers.filter((x) => want.has(x.code)).map((x) => x.user);
    } else if (isStage(b.stage)) users = buyers.filter((x) => x.stage === b.stage).map((x) => x.user);
    else return bad("줄 고객을 골라 주세요");
    if (users.length === 0) return bad("줄 고객이 없어요");
    const r = await grantCoupon(sb, ctx.partner, coupon as Coupon, users, "manual", userPusher(sb));
    return NextResponse.json(r);
  } catch (e) {
    console.error("쿠폰을 처리하지 못했어요:", id, (e as Error).message);
    return bad("처리하지 못했어요. 다시 시도해 주세요", 500);
  }
}

/**
 * PATCH /api/partner/coupons/:id[?as=slug] — {name, kind, value, max_discount?, min_order, valid_days} 고치기
 * 아직 아무에게도 주지 않았으면 모든 칸, 이미 줬으면 이름만 (받은 사람의 할인이 바뀌지 않게). 금액을 바꾸려면 복사해서 새로 만든다.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  if (!canAct(ctx)) return readOnly();
  const { id } = await params;
  if (!UUID.test(id)) return bad("쿠폰을 찾지 못했어요", 404);
  const p = parseCoupon((await req.json().catch(() => ({}))) || {});
  if ("error" in p) return bad(p.error);
  const c = p.coupon;
  const { data, error } = await (createServiceRoleClient() as Sb).rpc("partner_coupon_update", {
    p_id: id, p_partner: ctx.partner.id, p_name: c.name, p_kind: c.kind, p_value: c.value, p_max: c.max_discount, p_min: c.min_order, p_days: c.valid_days,
  });
  if (error) {
    console.error("쿠폰을 고치지 못했어요:", id, error.message);
    return bad("쿠폰을 고치지 못했어요. 다시 시도해 주세요", 500);
  }
  if (data === "not_found") return bad("쿠폰을 찾지 못했어요", 404);
  if (data === "granted") return bad("이미 준 쿠폰은 이름만 고칠 수 있어요. 금액·조건을 바꾸려면 복사해서 새로 만들어 주세요", 409);
  return NextResponse.json({ ok: true });
}
