/**
 * 날짜(YYYY-MM-DD) 는 모두 한국 시간 기준.
 *
 * 전에는 곳곳에서 `new Date().toISOString().slice(0, 10)` 을 썼는데, 이건 UTC 날짜라서
 * 한국 시간 0시~9시에 기록하면 전날로 들어갔다. 또 `new Date("2026-11-10T00:00:00")` 은
 * 브라우저 시간대로 읽혀서 날짜를 하루 옮기면 제자리였다.
 * → '지금이 한국 시간으로 며칠인지'는 todayKst(), 날짜끼리 더하고 빼기는 문자열 달력 계산만 쓴다.
 * 서버(UTC)·브라우저(어느 시간대든) 어디서 돌아도 같은 답이 나온다.
 */
const KST_OFFSET_MS = 9 * 3600e3;
const DAY_MS = 86400e3;

/** 어떤 순간(Date·밀리초·ISO 문자열)이 한국 시간으로 며칠인지 */
export function kstDay(at: Date | number | string = Date.now()): string {
  const ms = typeof at === "number" ? at : typeof at === "string" ? Date.parse(at) : at.getTime();
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 오늘 (한국 시간) */
export function todayKst(): string {
  return kstDay(Date.now());
}

/** 지금 한국 시간 몇 시인지 (0~23) — 끼니 고르기 등 */
export function kstHour(at: number = Date.now()): number {
  return new Date(at + KST_OFFSET_MS).getUTCHours();
}

function toUtcMs(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** 날짜 + n일 */
export function addDays(day: string, n: number): string {
  return new Date(toUtcMs(day) + n * DAY_MS).toISOString().slice(0, 10);
}

/** b - a (일) */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS);
}

/** 요일 0(일)~6(토) */
export function weekday(day: string): number {
  return new Date(toUtcMs(day)).getUTCDay();
}

/** 월·일 숫자 */
export function monthDay(day: string): { month: number; date: number } {
  const [, m, d] = day.split("-").map(Number);
  return { month: m, date: d };
}

/** 그 주 월요일 */
export function mondayOf(day: string): string {
  return addDays(day, -((weekday(day) + 6) % 7));
}

/** 한국 날짜의 0시가 UTC 로 언제인지 — created_at 같은 시각 칸을 날짜로 거를 때 */
export function kstDayStartIso(day: string): string {
  return new Date(toUtcMs(day) - KST_OFFSET_MS).toISOString();
}

export function isDay(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toUtcMs(s));
}
