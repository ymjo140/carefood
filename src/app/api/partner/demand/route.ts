import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPartnerContext } from "@/lib/partner/auth";
import { buildDemand } from "@/lib/partner/demand";

/** GET /api/partner/demand[?as=slug] — 조건별 찾는 사람 비율과 살 수 있는 제품 수 (통계만, lib/partner/demand.ts) */
export async function GET(req: NextRequest) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  try { return NextResponse.json(await buildDemand(createServiceRoleClient(), ctx.partner.id)); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
