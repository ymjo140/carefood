/** 업체 발송 한도 — 서버(요청 막기)와 화면(미리 알려 주기)이 같은 계산을 쓴다 */
export const WEEK_MS = 7 * 86400e3;

/**
 * t 에 하나 더 보내도 t 를 포함하는 어떤 7일 구간에서도 limit 번을 넘지 않는지.
 * booked: 이미 검수 중·예약·보내는 중·보낸 발송의 보낼 시각(ms). 지금 기준이 아니라 t 기준으로 센다
 * (몇 주 뒤 예약 두 건이 내일 발송을 막지 않게).
 */
export function fitsWeekly(booked: number[], t: number, limit: number): boolean {
  const all = [...booked.filter((x) => Math.abs(x - t) < WEEK_MS), t].sort((a, b) => a - b);
  for (const s of all) {
    if (s > t || s <= t - WEEK_MS) continue; // [s, s+7일) 이 t 를 포함하는 구간만
    if (all.filter((x) => x >= s && x < s + WEEK_MS).length > limit) return false;
  }
  return true;
}
