import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { pushReady, sendToUser, type PushSub } from "@/lib/push";

/** POST /api/push/test — 내 기기로 확인 알림 한 번 (알림을 켠 직후) */
export async function POST() {
  const actor = await getActorId();
  if (!actor) return noActor();
  if (!pushReady()) return NextResponse.json({ error: "알림을 아직 준비하고 있어요" }, { status: 503 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { data, error } = await sb.from("push_subscriptions").select("endpoint, user_id, p256dh, auth").eq("user_id", actor);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "알림을 켠 기기가 없어요" }, { status: 404 });
  const ok = await sendToUser(sb, data as PushSub[], { title: "케어푸드", body: "알림을 켰어요. 기록할 때를 놓치지 않게 알려 드릴게요", url: "/me/notifications", tag: "test" });
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "보내지 못했어요" }, { status: 502 });
}
