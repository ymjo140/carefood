import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canAct, getPartnerContext } from "@/lib/partner/auth";
import { buildShipWorkbook, loadOpenOrders } from "@/lib/partner/fulfil-sheet";

export const maxDuration = 60;

/**
 * GET /api/partner/orders/export[?as=slug] — 보낼 주문(새 주문·접수) 엑셀: 출고 목록(송장 양식) · 상품별 줄 · 생산표.
 * 관리자 보기는 받는 분 정보를 빼고 만든다
 */
export async function GET(req: NextRequest) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  try {
    const { orders, truncated } = await loadOpenOrders(createServiceRoleClient(), ctx.partner.id);
    const buf = await buildShipWorkbook(orders, { withShipping: canAct(ctx), truncated });
    const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`오늘끼록_출고목록_${ctx.partner.slug}_${day}.xlsx`)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("출고 목록을 만들지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "출고 목록을 만들지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
}
