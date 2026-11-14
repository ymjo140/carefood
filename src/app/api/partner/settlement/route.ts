import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPartnerContext } from "@/lib/partner/auth";
import { confirmedBundles, payoutBoard } from "@/lib/partner/payout-board";

const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * GET /api/partner/settlement?month=YYYY-MM[&as=slug] — 정산 대시보드 (다음 지급일 받을 돈 · 이번 달 · 확정 전 · 흐름 · 날짜별 장부 · 입금 대사)
 * GET /api/partner/settlement?day=YYYY-MM-DD[&as=slug] — 그날 구매확정된 주문(업체 묶음)별 상세
 * 앱 주문 대금은 구매확정일(구매자가 누른 때 또는 배송 완료 8일 뒤) 기준 — lib/partner/payout.ts
 */
export async function GET(req: NextRequest) {
  await connection();
  const sp = req.nextUrl.searchParams;
  const ctx = await getPartnerContext(sp.get("as"));
  if ("error" in ctx) return ctx.error;
  const sb = createServiceRoleClient();
  try {
    const day = sp.get("day");
    if (day) {
      if (!DAY_RE.test(day)) return NextResponse.json({ error: "날짜를 다시 골라 주세요" }, { status: 400 });
      const from = Date.parse(`${day}T00:00:00+09:00`);
      return NextResponse.json(await confirmedBundles(sb, ctx.partner.id, { from, to: from + 86400e3 }));
    }
    return NextResponse.json(await payoutBoard(sb, ctx.partner.id, sp.get("month") || ""));
  } catch (e) {
    console.error("정산을 불러오지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "정산을 불러오지 못했어요" }, { status: 500 });
  }
}
