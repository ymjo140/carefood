/**
 * 브라우저에서 내 기록 주인 id 읽기 — 서버가 발급한 cf_uid 쿠키("<id>.<서명>")의 id 부분.
 * 화면에서 "내 글인지" 비교할 때만 쓴다. API 는 이 값을 받지 않고 쿠키로 직접 확인한다.
 */
export function getClientActorId(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)cf_uid=([^;]+)/);
  if (!m) return null;
  const v = decodeURIComponent(m[1]);
  const i = v.lastIndexOf(".");
  return i > 0 ? v.slice(0, i) : null;
}
