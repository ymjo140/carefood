/**
 * 브라우저에서 내 기록 주인 id 읽기 — 서버가 함께 내려주는 화면용 쿠키 cf_me (서명 쿠키 cf_uid 는 httpOnly).
 * 화면에서 "내 글인지" 비교할 때만 쓴다. API 는 이 값을 받지 않고 쿠키로 직접 확인한다.
 */
export function getClientActorId(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)cf_me=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
