import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPartnerContext } from "@/lib/partner/auth";
import { buildConnectStatus } from "@/lib/partner/connect-status";

/** GET /api/partner/status[?as=slug] — 연동 탭 맨 위 상태: 마지막 수신 · 오래된 가격 · 구매 확정 보고 (lib/partner/connect-status.ts) */
export async function GET(req: NextRequest) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  try {
    return NextResponse.json(await buildConnectStatus(createServiceRoleClient(), ctx.partner.id));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
