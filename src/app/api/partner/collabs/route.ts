import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canAct, getPartnerContext, readOnly } from "@/lib/partner/auth";
import { CREATOR_TOPICS, listCandidates, partnerCollabs, propose } from "@/lib/partner/collabs";
import { notReady } from "@/lib/partner/crm";
import { limitRequest } from "@/lib/rate-limit";

/**
 * GET  /api/partner/collabs[?topic=고단백][&as=slug] — 협업 제안을 받기로 한 사람(주제가 맞는 사람 먼저)과 보낸 제안
 * POST /api/partner/collabs[?as=slug] — {code, title, offer, product_name?, coupon_id?} 제안 보내기
 */
export async function GET(req: NextRequest) {
  await connection();
  const sp = req.nextUrl.searchParams;
  const ctx = await getPartnerContext(sp.get("as"));
  if ("error" in ctx) return ctx.error;
  const topic = sp.get("topic");
  const sb = createServiceRoleClient();
  try {
    const [candidates, collabs] = await Promise.all([
      listCandidates(sb, ctx.partner.id, topic && (CREATOR_TOPICS as readonly string[]).includes(topic) ? topic : null, !!ctx.partner.is_demo),
      partnerCollabs(sb, ctx.partner.id),
    ]);
    return NextResponse.json({ ready: true, read_only: !canAct(ctx), topics: CREATOR_TOPICS, candidates, collabs });
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
    }, ctx.userId);
    if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });
    return NextResponse.json({ id: r.id });
  } catch (e) {
    console.error("협업 제안을 보내지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "제안을 보내지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
}
