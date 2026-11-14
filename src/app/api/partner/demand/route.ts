import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPartnerContext } from "@/lib/partner/auth";
import { buildDemand } from "@/lib/partner/demand";
import { buildDemandMore } from "@/lib/partner/demand-more";

/**
 * GET /api/partner/demand[?as=slug] — 조건별 찾는 사람 비율과 살 수 있는 제품 수 (통계만, lib/partner/demand.ts)
 * + 끼니·가격대·공구 수요 (lib/partner/demand-more.ts). 뒤쪽이 실패해도 앞쪽은 보여 주도록 more_error 로 따로 알린다
 */
export async function GET(req: NextRequest) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  const sb = createServiceRoleClient();
  try {
    const [base, more] = await Promise.all([
      buildDemand(sb, ctx.partner.id),
      buildDemandMore(sb, ctx.partner.id).then((m) => ({ ok: true as const, m }), (e: Error) => ({ ok: false as const, e })),
    ]);
    return NextResponse.json(more.ok ? { ...base, more: more.m } : { ...base, more: null, more_error: more.e.message });
  }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
