import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canAct, getPartnerContext } from "@/lib/partner/auth";
import { agencyFee, listAgency } from "@/lib/partner/agency";
import { creditBalance, notReady } from "@/lib/partner/crm";

/** GET /api/partner/agency[?as=slug] — 오늘끼록이 대신 올린 파일 (최근 20개) · 파일마다 반영하면 낼 금액(due) · 충전금 잔액 */
export async function GET(req: NextRequest) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  try {
    const sb = createServiceRoleClient();
    const [uploads, credit] = await Promise.all([listAgency(sb, ctx.partner.id), creditBalance(sb, ctx.partner.id)]);
    return NextResponse.json({
      ready: true, read_only: !canAct(ctx), is_demo: !!ctx.partner.is_demo, balance: credit.balance,
      uploads: uploads.map((u) => ({ ...u, due: agencyFee(u, ctx.partner) })),
    });
  }
  catch (e) {
    if (notReady(e as { message?: string })) return NextResponse.json({ ready: false, uploads: [], read_only: true, is_demo: false });
    console.error("대행 파일을 불러오지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "대신 올린 파일을 불러오지 못했어요" }, { status: 500 });
  }
}
