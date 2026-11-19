/**
 * 공식 챌린지 기수 — 격주 월요일에 함께 시작한다 (서버·화면 공용 계산 + 서버 읽기).
 *  - 기준 월요일(COHORT_ANCHOR)부터 2주마다 시작일. 21·30일처럼 2주보다 긴 챌린지는 기간이 겹치지 않게 그만큼 건너뛴다
 *    (간격 = 14일 × ⌈기간 ÷ 14⌉ — 7·14일은 2주, 21·28일은 4주, 30일은 6주마다)
 *  - 모집: 시작 전 14일 동안(전날까지) · 진행 중: 시작일~끝날 · 끝남
 *  - 참여는 '다음 기수로 시작'을 고르면 그 시작일 묶음을 연다 (community_challenge_members.cohort_id)
 * 다른 사람의 기록은 쓰지 않는다 — 기수마다 들어온 사람 수만.
 */
import { addDays, daysBetween } from "@/lib/day";

/** 기준 월요일 (한국 날짜) */
export const COHORT_ANCHOR = "2026-11-23";
export const COHORT_RECRUIT_DAYS = 14;

export const cohortGap = (days: number) => 14 * Math.max(1, Math.ceil(days / 14));

/** today 기준 진행 중인 기수(있으면)와 다음 기수의 시작일 */
export function cohortStarts(days: number, today: string): { current: string | null; next: string } {
  const gap = cohortGap(days);
  const k = Math.floor(daysBetween(COHORT_ANCHOR, today) / gap);
  const at = addDays(COHORT_ANCHOR, k * gap);
  const running = at <= today && addDays(at, days - 1) >= today ? at : null;
  const next = at > today ? at : addDays(at, gap);
  return { current: running, next };
}

export type CohortView = { start_on: string; ends_on: string; apply_until: string; state: "recruiting" | "running" | "soon"; joined: number };

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 진행 중 기수 + 다음 기수 (모집 중이거나, 아직 모집 전이면 soon) — 기수마다 들어온 사람 수 */
export async function cohortsOf(sb: Sb, c: { id: string; days: number }, today: string): Promise<CohortView[]> {
  const { current, next } = cohortStarts(c.days, today);
  const starts = [current, next].filter((s): s is string => !!s);
  const { data, error } = await sb.from("community_challenge_members").select("started_on").eq("challenge_id", c.id).in("started_on", starts).limit(5000);
  if (error) throw new Error(error.message);
  const n = new Map<string, number>();
  for (const r of (data || []) as { started_on: string }[]) n.set(r.started_on, (n.get(r.started_on) || 0) + 1);
  return starts.map((s) => ({
    start_on: s, ends_on: addDays(s, c.days - 1), apply_until: addDays(s, -1),
    state: s <= today ? "running" : daysBetween(today, s) <= COHORT_RECRUIT_DAYS ? "recruiting" : "soon",
    joined: n.get(s) || 0,
  }));
}

/** 기수 줄을 만들어 두고 id 를 돌려준다 (같은 시작일이면 같은 줄) */
export async function ensureCohort(sb: Sb, c: { id: string; days: number }, start: string): Promise<string> {
  const { data, error } = await sb.from("challenge_cohorts").upsert(
    { challenge_id: c.id, start_on: start, apply_until: addDays(start, -1), days: c.days },
    { onConflict: "challenge_id,start_on" },
  ).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}
