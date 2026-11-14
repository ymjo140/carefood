/** 업체 성과의 기간 — 한국 시간 달·날 경계. 서버·시험에서 같이 쓴다 */
const DAY = 86400e3;
const KST = 9 * 3600e3;
/** 기간 — 지난 30일(기본) · 이번 달 · 지난달 (한국 시간 달 경계). 비교할 지난 기간은 같은 길이의 바로 앞 (달이면 그 앞 달) */
export function periodOf(p: string | null, now = Date.now()) {
  const k = new Date(now + KST);
  const monthStart = (y: number, m: number) => Date.UTC(y, m, 1) - KST;
  if (p === "this_month") {
    const from = monthStart(k.getUTCFullYear(), k.getUTCMonth());
    // 지난달의 같은 날짜까지 (11월 14일이면 10월 1~14일). 자정에서 끊어 날짜 칸과 시각 칸의 경계를 맞춘다
    const pFrom = monthStart(k.getUTCFullYear(), k.getUTCMonth() - 1);
    const todayStart = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - KST;
    return { key: "this_month", cur: { from, to: now }, prev: { from: pFrom, to: Math.min(from, pFrom + (todayStart - from) + DAY) } };
  }
  if (p === "last_month") {
    const from = monthStart(k.getUTCFullYear(), k.getUTCMonth() - 1);
    const to = monthStart(k.getUTCFullYear(), k.getUTCMonth());
    return { key: "last_month", cur: { from, to }, prev: { from: monthStart(k.getUTCFullYear(), k.getUTCMonth() - 2), to: from } };
  }
  // 지난 30일 = 오늘을 넣은 30일, 한국 시간 자정에서 끊는다. 시각 칸(조회·클릭)과 날짜 칸(식단 기록·노출)의
  // 경계가 같아야 이번 기간과 지난 기간이 같은 날을 두 번 세지 않는다
  const todayStart = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - KST;
  const from = todayStart - 29 * DAY;
  return { key: "30d", cur: { from, to: now }, prev: { from: from - 30 * DAY, to: from } };
}
