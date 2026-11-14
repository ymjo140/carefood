import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canAct, getPartnerContext } from "@/lib/partner/auth";
import { productBoard } from "@/lib/partner/product-sales";

/** GET /api/partner/products/board[?as=slug] — 제품별 재고·처리할 주문 줄 수·지난 30일 판매 수량 (앱 주문) */
export async function GET(req: NextRequest) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  try { return NextResponse.json({ rows: await productBoard(createServiceRoleClient(), ctx.partner.id), read_only: !canAct(ctx), as_of: new Date().toISOString() }); }
  catch (e) {
    console.error("판매 현황을 불러오지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "판매 현황을 불러오지 못했어요" }, { status: 500 });
  }
}
