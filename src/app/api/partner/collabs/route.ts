import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canAct, getPartnerContext, readOnly } from "@/lib/partner/auth";
import { CREATOR_TOPICS, TOPIC_OF_SEGMENT, listCandidates, partnerCollabs, propose } from "@/lib/partner/collabs";
import { notReady } from "@/lib/partner/crm";
import { limitRequest } from "@/lib/rate-limit";

/**
 * GET  /api/partner/collabs[?segment=meal_high_protein | ?topic=고단백][&candidates=0][&as=slug] — 협업 제안을 받기로 한 사람
 *      (어울림 점수 순, 점수·이유 포함)과 보낸 제안. segment 를 주면 그 조건의 커뮤니티 주제로 점수를 낸다. candidates=0 이면 보낸 제안만
 * POST /api/partner/collabs[?as=slug] — {code, title, offer, product_name?, coupon_id?, plan_id?} 제안 보내기
 */
export async function GET(req: NextRequest) {
  await connection();
  const sp = req.nextUrl.searchParams;
  const ctx = await getPartnerContext(sp.get("as"));
  if ("error" in ctx) return ctx.error;
  const seg = sp.get("segment");
  const raw = seg ? TOPIC_OF_SEGMENT[seg] || null : sp.get("topic");
  const topic = raw && (CREATOR_TOPICS as readonly string[]).includes(raw) ? raw : null;
  const sb = createServiceRoleClient();
  try {
    const [candidates, collabs] = await Promise.all([
      sp.get("candidates") === "0" ? Promise.resolve([]) : listCandidates(sb, ctx.partner.id, topic, !!ctx.partner.is_demo),
      partnerCollabs(sb, ctx.partner.id),
    ]);
    return NextResponse.json({ ready: true, read_only: !canAct(ctx), topic, topics: CREATOR_TOPICS, candidates, collabs });
  } catch (e) {
    if (notReady(e as { message?: string })) return NextResponse.json({ ready: false, read_only: true, topics: CREATOR_TOPICS, candidates: [], collabs: [] });
    console.error("협업 후보를 불러오지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "협업 후보를 불러오지 못했어요" }, { status: 500 });
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
    const r = await propose(createServiceRoleClient(), ctx.partner, {
      code: String(b?.code || ""), title: String(b?.title || ""), offer: String(b?.offer || ""), product_name: b?.product_name ? String(b.product_name) : null, coupon_id: b?.coupon_id ? String(b.coupon_id) : null,
      plan_id: b?.plan_id ? String(b.plan_id) : null,
    }, ctx.userId);
    if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });
    return NextResponse.json({ id: r.id });
  } catch (e) {
    console.error("협업 제안을 보내지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "제안을 보내지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
}
