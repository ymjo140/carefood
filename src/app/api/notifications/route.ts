import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { adNotifications, buildNotifications } from "@/lib/notifications";
import { consentNotifications } from "@/lib/consent-notice";
import { couponNotifications } from "@/lib/partner/coupons";
import { flowNotifications } from "@/lib/partner/flows";
import { collabNotifications } from "@/lib/partner/collabs";
import { inquiryNotifications } from "@/lib/partner/inquiries";
import { nudgeNotifications } from "@/lib/family";
import { tagNotifications } from "@/lib/community-tags";
import { viewerFilters } from "@/lib/community-safety";

/**
 * GET /api/notifications — 내 소식 (lib/notifications 가 커뮤니티 기록에서 만든다)
 * ?latest=1 이면 가장 최근 소식 시각 + 마지막으로 본 시각만 (머리 줄의 새 소식 점)
 * 응답의 seen_at = 마지막으로 알림 화면을 연 시각 (사람 기준 — 로그인하면 기기가 달라도 같다)
 * POST /api/notifications — 지금 다 봤다고 적는다
 */
// ?latest=1 결과를 사람마다 1분 기억한다 (같은 서버 인스턴스 안에서만) — 새 소식 점 하나에 표 15개를 다시 읽지 않게
const LATEST_TTL = 60_000;
const latestMemo = new Map<string, { at: number; body: { latest_at: string | null; seen_at: string | null } }>();

export async function GET(request: NextRequest) {
  await connection();
  const actor = await getActorId();
  const latestOnly = request.nextUrl.searchParams.get("latest") === "1";
  if (!actor) return NextResponse.json(latestOnly ? { latest_at: null, seen_at: null } : { items: [], seen_at: null });
  if (latestOnly) {
    const m = latestMemo.get(actor);
    if (m && Date.now() - m.at < LATEST_TTL) return NextResponse.json(m.body);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { data: read, error: rErr } = await sb.from("notification_reads").select("seen_at").eq("user_id", actor).maybeSingle();
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
  const seen_at: string | null = read?.seen_at ?? null;

  let items;
  try {
    // 업체 광고(고객층 발송)는 알림함에만 — 커뮤니티 웹 푸시와 섞지 않는다
    // 업체 쿠폰·자동 알림도 광고라 같은 자리 — 받기로 한 사람에게만 들어간다
    const [community, ads, consent, coupons, flows, collabs, inquiries, nudges, tags] = await Promise.all([
      buildNotifications(sb, actor), adNotifications(sb, actor), consentNotifications(sb, actor), couponNotifications(sb, actor), flowNotifications(sb, actor), collabNotifications(sb, actor),
      inquiryNotifications(sb, actor), nudgeNotifications(sb, actor),
      viewerFilters(sb, actor).then((f) => tagNotifications(sb, actor, f.blocked)),
    ]);
    items = [...community, ...ads, ...consent, ...coupons, ...flows, ...collabs, ...inquiries, ...nudges, ...tags].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  if (latestOnly) {
    const body = { latest_at: items[0]?.at ?? null, seen_at };
    if (latestMemo.size > 5000) latestMemo.clear();
    latestMemo.set(actor, { at: Date.now(), body });
    return NextResponse.json(body);
  }
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
  latestMemo.delete(actor); // 다 봤으니 기억한 값을 버린다
  return NextResponse.json({ ok: true, seen_at });
}
