import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPartnerContext } from "@/lib/partner/auth";
import { buildMonthWorkbook } from "@/lib/partner/payout-board";
import { currentMonth } from "@/lib/partner/settlement";

export const maxDuration = 60;

/** GET /api/partner/settlement/export?month=YYYY-MM[&as=slug] — 달 정산 엑셀 (요약 · 날짜별 · 주문별, 구매확정일 기준) */
export async function GET(req: NextRequest) {
  await connection();
  const sp = req.nextUrl.searchParams;
  const ctx = await getPartnerContext(sp.get("as"));
  if ("error" in ctx) return ctx.error;
  const month = sp.get("month") || "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > currentMonth()) return NextResponse.json({ error: "달을 다시 골라 주세요" }, { status: 400 });
  try {
    const buf = await buildMonthWorkbook(createServiceRoleClient(), ctx.partner.id, month);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`케어푸드_정산_${ctx.partner.slug}_${month}.xlsx`)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("정산 엑셀을 만들지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "엑셀을 만들지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
}
