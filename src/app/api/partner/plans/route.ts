import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canAct, getPartnerContext, readOnly } from "@/lib/partner/auth";
import { createPlan, listPlans } from "@/lib/partner/plans";
import { notReady } from "@/lib/partner/crm";
import { limitRequest } from "@/lib/rate-limit";

/**
 * GET  /api/partner/plans[?as=slug] — 내 기획(수요 빈틈에서 정한 만들 제품)
 * POST /api/partner/plans[?as=slug] — {segment, name, note?, target_price?} 기획 저장하기
 */
export async function GET(req: NextRequest) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  try {
    return NextResponse.json({ ready: true, read_only: !canAct(ctx), plans: await listPlans(createServiceRoleClient(), ctx.partner.id) });
  } catch (e) {
    if (notReady(e as { message?: string })) return NextResponse.json({ ready: false, read_only: true, plans: [] });
    console.error("기획을 불러오지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "기획을 불러오지 못했어요" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  await connection();
  const limited = await limitRequest(req, "upload");
  if (limited) return limited;
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  if (!canAct(ctx)) return readOnly();
  const b = await req.json().catch(() => ({}));
  try {
    const r = await createPlan(createServiceRoleClient(), ctx.partner.id, b || {}, ctx.userId);
    if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });
    return NextResponse.json({ id: r.id });
  } catch (e) {
    console.error("기획을 저장하지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "기획을 저장하지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
}
