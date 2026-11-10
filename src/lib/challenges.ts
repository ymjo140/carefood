/**
 * 커뮤니티 챌린지 — 정해 둔 규칙을 참여한 날부터 N일 동안 채운다.
 * 하루 달성 여부는 그날 식단 기록(meal_diary)의 성분 합계로만 본다 (기록이 없으면 못 한 날).
 * 날짜는 식단 기록 화면과 같은 한국 날짜(YYYY-MM-DD, lib/day)를 쓴다.
 */
import { addDays } from "./day";

export type ChallengeMetric = "sodium_max" | "protein_min" | "sugar_max" | "meals_min" | "kcal_max";
export type DayState = "done" | "missed" | "today" | "future";

export type DiaryRow = { date: string; meal_type: string | null; calories: number | null; protein_g: number | null; sugar_g: number | null; sodium_mg: number | null };

export const METRIC_META: Record<ChallengeMetric, { label: string; unit: string; field?: keyof DiaryRow; max: boolean }> = {
  sodium_max: { label: "나트륨", unit: "mg", field: "sodium_mg", max: true },
  protein_min: { label: "단백질", unit: "g", field: "protein_g", max: false },
  sugar_max: { label: "당류", unit: "g", field: "sugar_g", max: true },
  kcal_max: { label: "열량", unit: "kcal", field: "calories", max: true },
  meals_min: { label: "기록한 끼니", unit: "끼", max: false },
};

export { addDays };

/** 그날 값 — 성분 합계, 끼니 규칙은 아침·점심·저녁 중 기록한 끼니 수. 기록이 없으면 null */
export function dayValue(metric: ChallengeMetric, rows: DiaryRow[]): number | null {
  if (!rows.length) return null;
  if (metric === "meals_min") return new Set(rows.map((r) => r.meal_type).filter((m) => m === "breakfast" || m === "lunch" || m === "dinner")).size;
  const f = METRIC_META[metric].field!;
  return Math.round(rows.reduce((s, r) => s + (Number(r[f]) || 0), 0) * 10) / 10;
}

export function meets(metric: ChallengeMetric, target: number, value: number | null) {
  if (value == null) return false;
  return METRIC_META[metric].max ? value <= target : value >= target;
}

export type RunProgress = {
  started_on: string;
  ends_on: string;
  finished: boolean;
  done_count: number;
  days: { date: string; state: DayState; value: number | null }[];
  today_value: number | null;
};

/**
 * 한 번 도전한 기간의 날마다 상태.
 * 오늘: '…이상' 규칙은 채우면 바로 해낸 날, '…이하' 규칙은 하루가 끝나야 알 수 있어 '오늘'로 둔다.
 */
export function runProgress(metric: ChallengeMetric, target: number, days: number, startedOn: string, rows: DiaryRow[], today: string): RunProgress {
  const byDay = new Map<string, DiaryRow[]>();
  for (const r of rows) byDay.set(r.date, [...(byDay.get(r.date) || []), r]);
  const endsOn = addDays(startedOn, days - 1);
  const list = Array.from({ length: days }, (_, i) => {
    const date = addDays(startedOn, i);
    const value = dayValue(metric, byDay.get(date) || []);
    let state: DayState;
    if (date > today) state = "future";
    else if (date === today) state = !METRIC_META[metric].max && meets(metric, target, value) ? "done" : "today";
    else state = meets(metric, target, value) ? "done" : "missed";
    return { date, state, value };
  });
  return {
    started_on: startedOn,
    ends_on: endsOn,
    finished: today > endsOn,
    done_count: list.filter((d) => d.state === "done").length,
    days: list,
    today_value: list.find((d) => d.date === today)?.value ?? null,
  };
}

/** 숫자 + 단위 — "1,240mg", "2끼" */
export function metricValue(metric: ChallengeMetric, v: number) {
  return `${Math.round(v).toLocaleString("ko-KR")}${METRIC_META[metric].unit}`;
}
