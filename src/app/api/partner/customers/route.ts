import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPartnerContext } from "@/lib/partner/auth";
import { listCustomers } from "@/lib/partner/customers";

/**
 * GET /api/partner/customers[?as=slug] — 앱에서 우리 제품을 결제한 고객 (가명 번호·단계·주문 수·금액·혜택 알림 받음 여부)
 * 연락처·이름·건강 목표는 주지 않는다 (lib/partner/customers.ts)
 */
export async function GET(req: NextRequest) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  try { return NextResponse.json(await listCustomers(createServiceRoleClient(), ctx.partner.id)); }
  catch (e) {
    console.error("고객을 불러오지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "고객을 불러오지 못했어요" }, { status: 500 });
  }
}
