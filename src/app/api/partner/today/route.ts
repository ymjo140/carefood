import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPartnerContext } from "@/lib/partner/auth";
import { buildToday } from "@/lib/partner/today";

/** GET /api/partner/today[?as=slug] — 업체 화면 '오늘': 유형별 숫자 4개 · 할 일 Top 3 · 퍼널 · 수요 한 줄 (lib/partner/today.ts) */
export async function GET(req: NextRequest) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  try {
    return NextResponse.json(await buildToday(createServiceRoleClient(), ctx.partner));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
