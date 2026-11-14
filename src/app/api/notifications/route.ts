import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { adNotifications, buildNotifications } from "@/lib/notifications";
import { consentNotifications } from "@/lib/consent-notice";
import { couponNotifications } from "@/lib/partner/coupons";
import { flowNotifications } from "@/lib/partner/flows";

/**
 * GET /api/notifications — 내 소식 (lib/notifications 가 커뮤니티 기록에서 만든다)
 * ?latest=1 이면 가장 최근 소식 시각 + 마지막으로 본 시각만 (머리 줄의 새 소식 점)
 * 응답의 seen_at = 마지막으로 알림 화면을 연 시각 (사람 기준 — 로그인하면 기기가 달라도 같다)
 * POST /api/notifications — 지금 다 봤다고 적는다
 */
export async function GET(request: NextRequest) {
  await connection();
  const actor = await getActorId();
  const latestOnly = request.nextUrl.searchParams.get("latest") === "1";
  if (!actor) return NextResponse.json(latestOnly ? { latest_at: null, seen_at: null } : { items: [], seen_at: null });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { data: read, error: rErr } = await sb.from("notification_reads").select("seen_at").eq("user_id", actor).maybeSingle();
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
  const seen_at: string | null = read?.seen_at ?? null;

  let items;
  try {
    // 업체 광고(고객층 발송)는 알림함에만 — 커뮤니티 웹 푸시와 섞지 않는다
    // 업체 쿠폰·자동 알림도 광고라 같은 자리 — 받기로 한 사람에게만 들어간다
    const [community, ads, consent, coupons, flows] = await Promise.all([
      buildNotifications(sb, actor), adNotifications(sb, actor), consentNotifications(sb, actor), couponNotifications(sb, actor), flowNotifications(sb, actor),
    ]);
    items = [...community, ...ads, ...consent, ...coupons, ...flows].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  if (latestOnly) return NextResponse.json({ latest_at: items[0]?.at ?? null, seen_at });
  return NextResponse.json({ items: items.slice(0, 40), seen_at });
}

export async function POST() {
  const actor = await getActorId();
  if (!actor) return noActor();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const seen_at = new Date().toISOString();
  const { error } = await sb.from("notification_reads").upsert({ user_id: actor, seen_at }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, seen_at });
}
