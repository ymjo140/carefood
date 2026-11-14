import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPartnerContext } from "@/lib/partner/auth";
import { partnerReviews } from "@/lib/partner/reviews";

/**
 * GET /api/partner/reviews[?item=<partner_item id>][&as=slug] — 내 제품 리뷰: 제품별 요약 + 최근 리뷰 50개
 * 쓴 사람의 연령·성별·관심사·건강 상태는 주지 않고, 내 고객이면 가명 번호만 붙인다
 */
export async function GET(req: NextRequest) {
  await connection();
  const sp = req.nextUrl.searchParams;
  const ctx = await getPartnerContext(sp.get("as"));
  if ("error" in ctx) return ctx.error;
  const item = sp.get("item");
  try {
    return NextResponse.json(await partnerReviews(createServiceRoleClient(), ctx.partner.id, { item: item && /^[0-9a-f-]{36}$/i.test(item) ? item : null }));
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
