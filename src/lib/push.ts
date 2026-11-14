import webpush from "web-push";

/**
 * 웹 푸시 보내기 (서버 전용). 키는 Vercel 환경 변수
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY · VAPID_PRIVATE_KEY
 * 키가 없으면 pushReady() 가 false — 화면은 "알림 준비 중"으로 보이고 아무것도 보내지 않는다.
 */
export type PushPayload = { title: string; body: string; url: string; tag?: string };
export type PushSub = { endpoint: string; user_id: string; p256dh: string; auth: string };

let configured = false;
export function pushPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}
export function pushReady(): boolean {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://carefood-iota.vercel.app", pub, priv);
  configured = true;
  return true;
}

/** 한 기기에 보낸다. 기기가 구독을 끊었으면(404·410) 구독을 지운다. 성공 여부를 돌려준다 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendPush(sb: any, sub: PushSub, payload: PushPayload): Promise<boolean> {
  if (!pushReady()) return false;
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 6 * 3600, urgency: "normal" },
    );
    await sb.from("push_subscriptions").update({ last_sent_at: new Date().toISOString(), fail_count: 0 }).eq("endpoint", sub.endpoint);
    return true;
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) {
      await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    } else {
      const { data } = await sb.from("push_subscriptions").select("fail_count").eq("endpoint", sub.endpoint).maybeSingle();
      const n = (data?.fail_count || 0) + 1;
      // 계속 실패하는 기기는 정리한다
      if (n >= 5) await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      else await sb.from("push_subscriptions").update({ fail_count: n }).eq("endpoint", sub.endpoint);
    }
    return false;
  }
}

/** 이 사람의 모든 기기에 보낸다 — 한 곳이라도 가면 true */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendToUser(sb: any, subs: PushSub[], payload: PushPayload): Promise<boolean> {
  const results = await Promise.all(subs.map((s) => sendPush(sb, s, payload)));
  return results.some(Boolean);
}

/** 사람 한 명에게 보내는 함수 — 이 기기 알림을 쓸 수 없으면 undefined (알림함에만 남는다) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function userPusher(sb: any): ((userId: string, payload: PushPayload) => Promise<boolean>) | undefined {
  if (!pushReady()) return undefined;
  return async (userId, payload) => {
    const { data, error } = await sb.from("push_subscriptions").select("endpoint, user_id, p256dh, auth").eq("user_id", userId);
    if (error) throw new Error(error.message);
    if (!data?.length) return false;
    return sendToUser(sb, data as PushSub[], payload);
  };
}
