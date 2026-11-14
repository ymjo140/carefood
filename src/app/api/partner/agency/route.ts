import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canAct, getPartnerContext } from "@/lib/partner/auth";
import { listAgency } from "@/lib/partner/agency";
import { notReady } from "@/lib/partner/crm";

/** GET /api/partner/agency[?as=slug] — 오늘끼록이 대신 올린 파일 (최근 20개) */
export async function GET(req: NextRequest) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  try { return NextResponse.json({ ready: true, uploads: await listAgency(createServiceRoleClient(), ctx.partner.id), read_only: !canAct(ctx), is_demo: !!ctx.partner.is_demo }); }
  catch (e) {
    if (notReady(e as { message?: string })) return NextResponse.json({ ready: false, uploads: [], read_only: true, is_demo: false });
    console.error("대행 파일을 불러오지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "대신 올린 파일을 불러오지 못했어요" }, { status: 500 });
  }
}
