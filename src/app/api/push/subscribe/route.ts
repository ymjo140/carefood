import { NextRequest, NextResponse } from "next/server";
import { limitRequest } from "@/lib/rate-limit";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";

/**
 * POST /api/push/subscribe { endpoint, keys: { p256dh, auth } } — 이 기기에서 알림 받기
 * DELETE /api/push/subscribe { endpoint } — 이 기기 알림 끄기
 * 처음 켜면 알림 종류(끼니·주간 요약·커뮤니티·챌린지)를 모두 켠 설정을 만든다.
 */
function okEndpoint(s: unknown): s is string {
  if (typeof s !== "string" || s.length > 1000) return false;
  try { return new URL(s).protocol === "https:"; } catch { return false; }
}

export async function POST(request: NextRequest) {
  const limited = await limitRequest(request, "push");
  if (limited) return limited;
  const actor = await getActorId();
  if (!actor) return noActor();
  const body = await request.json().catch(() => ({}));
  const p256dh = body?.keys?.p256dh, auth = body?.keys?.auth;
  if (!okEndpoint(body?.endpoint) || typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) {
    return NextResponse.json({ error: "구독 정보가 올바르지 않아요" }, { status: 400 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { error } = await sb.from("push_subscriptions").upsert({
    endpoint: body.endpoint, user_id: actor, p256dh, auth, user_agent: (request.headers.get("user-agent") || "").slice(0, 200), fail_count: 0,
  }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { error: pErr } = await sb.from("notification_prefs").upsert({ user_id: actor }, { onConflict: "user_id", ignoreDuplicates: true });
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const body = await request.json().catch(() => ({}));
  if (!okEndpoint(body?.endpoint)) return NextResponse.json({ error: "endpoint 필수" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { error } = await sb.from("push_subscriptions").delete().eq("endpoint", body.endpoint).eq("user_id", actor);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
