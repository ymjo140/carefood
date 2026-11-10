/**
 * 브라우저 쪽 웹 푸시 — 지원 여부 · 지금 상태 · 켜기 · 끄기.
 * 아이폰·아이패드는 '홈 화면에 추가'로 연 앱에서만 된다 (사파리 탭에서는 PushManager 가 없다).
 */
export type PushState = "unsupported" | "ios-install" | "denied" | "off" | "on";

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return "unsupported";
  if (!("PushManager" in window) || !("Notification" in window)) return isIos() && !isStandalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function keyBytes(base64url: string) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** 켜기 — 권한을 묻고, 구독을 서버에 적는다. 실패하면 이유를 담아 throw */
export async function enablePush(): Promise<void> {
  const k = await fetch("/api/push/key").then((r) => r.json());
  if (!k.key) throw new Error("not-ready");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied" ? "denied" : "dismissed");
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(k.key) }));
  const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
  if (!res.ok) throw new Error("save");
}

/** 이 기기 끄기 */
export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const res = await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
  if (!res.ok) throw new Error("save");
  await sub.unsubscribe();
}

/** 켜기 실패 이유 → 알림 문구 */
export function enableError(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (m === "denied") return "브라우저에서 알림을 막아 두었어요. 브라우저 설정에서 이 사이트 알림을 허용해 주세요";
  if (m === "dismissed") return "알림 허용을 누르지 않았어요. 다시 켜 볼 수 있어요";
  if (m === "not-ready") return "알림을 아직 준비하고 있어요. 잠시 뒤 다시 시도해 주세요";
  return "알림을 켜지 못했어요. 다시 시도해 주세요";
}
