/**
 * 커뮤니티 챌린지 — 정해 둔 규칙을 참여한 날부터 N일 동안 채운다.
 * 하루 달성 여부는 그날 식단 기록(meal_diary)으로만 본다 (기록이 없으면 못 한 날).
 * 날짜는 식단 기록 화면과 같은 한국 날짜(YYYY-MM-DD, lib/day)를 쓴다.
 *
 * 끼니로 세는 기준: 아침·점심·저녁 중 그 끼니 열량 합계가 150kcal 이상(열량을 모르는 기록만 있으면 센다).
 *   간식 하나만 적고 한 끼로 세지 않게 (Lose It! 의 '150kcal 미만 끼니 제외'를 가져옴).
 */
import { addDays } from "./day";

export type ChallengeMetric =
  | "sodium_max" | "protein_min" | "sugar_max" | "meals_min" | "kcal_max" | "fiber_min" | "breakfast" | "record_any"
  | "photo_meals" | "snack_max" | "protein_each" | "kcal_band" | "macro_type";
export type DayState = "done" | "missed" | "today" | "future" | "before";

export type DiaryRow = {
  date: string; meal_type: string | null; calories: number | null; protein_g: number | null; sugar_g: number | null; sodium_mg: number | null;
  fiber_g?: number | null; carbs_g?: number | null; fat_g?: number | null; source?: string | null;
};
/** 판정에 필요한 식단 기록 칸 (select 에 그대로 쓴다) */
export const DIARY_COLS = "date, meal_type, calories, protein_g, carbs_g, fat_g, sugar_g, sodium_mg, fiber_g, source";

/** decide: 그날 결과를 언제 알 수 있나 — now(채우면 바로) · end(하루가 끝나야: '…이하'·구간·비율) */
export const METRIC_META: Record<ChallengeMetric, { label: string; unit: string; field?: keyof DiaryRow; max: boolean; decide: "now" | "end" }> = {
  sodium_max: { label: "나트륨", unit: "mg", field: "sodium_mg", max: true, decide: "end" },
  protein_min: { label: "단백질", unit: "g", field: "protein_g", max: false, decide: "now" },
  sugar_max: { label: "당류", unit: "g", field: "sugar_g", max: true, decide: "end" },
  kcal_max: { label: "열량", unit: "kcal", field: "calories", max: true, decide: "end" },
  meals_min: { label: "기록한 끼니", unit: "끼", max: false, decide: "now" },
  fiber_min: { label: "식이섬유", unit: "g", field: "fiber_g", max: false, decide: "now" },
  breakfast: { label: "아침 기록", unit: "끼", max: false, decide: "now" },
  record_any: { label: "기록", unit: "끼", max: false, decide: "now" },
  photo_meals: { label: "사진으로 기록한 끼니", unit: "끼", max: false, decide: "now" },
  snack_max: { label: "간식", unit: "번", max: true, decide: "end" },
  protein_each: { label: "단백질을 채운 끼니", unit: "끼", max: false, decide: "now" },
  kcal_band: { label: "열량", unit: "kcal", field: "calories", max: false, decide: "end" },
  macro_type: { label: "단백질 비율", unit: "%", max: false, decide: "end" },
};

/** 탄단지 유형 — 하루 열량에서 각각이 차지하는 비율(%) 범위. 값은 영양 전문가 확인 뒤 확정 (기획서 초안) */
export type MacroType = { code: number; label: string; c: [number, number]; p: [number, number]; f: [number, number]; recommend: boolean };
export const MACRO_TYPES: MacroType[] = [
  { code: 1, label: "균형", c: [50, 65], p: [15, 20], f: [20, 30], recommend: true },
  { code: 2, label: "고단백", c: [40, 50], p: [25, 35], f: [20, 30], recommend: true },
  { code: 3, label: "탄수 조금 줄이기", c: [40, 50], p: [20, 25], f: [25, 35], recommend: true },
  { code: 4, label: "저탄수", c: [30, 40], p: [25, 35], f: [30, 40], recommend: false },
  { code: 5, label: "저지방", c: [55, 65], p: [20, 25], f: [15, 20], recommend: false },
];
export const macroOf = (code: number) => MACRO_TYPES.find((m) => m.code === Math.round(code)) || null;

/** 열량 구간 — 하루 열량이 목표의 ±10% 안이면 해낸 날. 아래로 떨어진 날도 못 한 날이다 */
export const KCAL_BAND = 0.1;
export const kcalRange = (target: number) => [Math.round(target * (1 - KCAL_BAND)), Math.round(target * (1 + KCAL_BAND))] as const;

/** 끼니로 세는 최소 열량 */
export const MEAL_MIN_KCAL = 150;
const MAIN = ["breakfast", "lunch", "dinner"] as const;
const isSnack = (t: string | null) => t === "snack" || t === "supplement";

/** 끼니로 센 아침·점심·저녁 — 끼니 이름 → 그 끼니 기록 */
export function countedMeals(rows: DiaryRow[]) {
  const out = new Map<string, DiaryRow[]>();
  for (const m of MAIN) {
    const rs = rows.filter((r) => r.meal_type === m);
    if (!rs.length) continue;
    const known = rs.filter((r) => r.calories != null);
    const kcal = known.reduce((s, r) => s + (Number(r.calories) || 0), 0);
    if (!known.length || kcal >= MEAL_MIN_KCAL) out.set(m, rs);
  }
  return out;
}

const sum = (rows: DiaryRow[], f: keyof DiaryRow) => rows.reduce((s, r) => s + (Number(r[f]) || 0), 0);
const r1 = (v: number) => Math.round(v * 10) / 10;

/** 하루 열량에서 탄·단·지 비율(%) — 열량이 0이면 null */
export function macroSplit(rows: DiaryRow[]) {
  const c = sum(rows, "carbs_g") * 4, p = sum(rows, "protein_g") * 4, f = sum(rows, "fat_g") * 9;
  const total = c + p + f;
  if (total <= 0) return null;
  return { c: Math.round((c / total) * 100), p: Math.round((p / total) * 100), f: Math.round((f / total) * 100) };
}

/** '…이하' 규칙은 두 끼 이상 기록한 날만 해낸 날로 본다 (간식 하나만 적고 넘기지 않게) */
export const MIN_MEALS_FOR_MAX = 2;

/** 그날 값과 해냈는지. 기록이 없으면 { value: null, ok: false } */
export function judgeDay(metric: ChallengeMetric, target: number, rows: DiaryRow[]): { value: number | null; ok: boolean } {
  if (!rows.length) return { value: null, ok: false };
  const meals = countedMeals(rows);
  const n = meals.size;
  switch (metric) {
    case "record_any": return { value: 1, ok: true };
    case "meals_min": return { value: n, ok: n >= target };
    case "breakfast": { const v = meals.has("breakfast") ? 1 : 0; return { value: v, ok: v >= 1 }; }
    case "photo_meals": {
      const v = [...meals.values()].filter((rs) => rs.some((r) => r.source === "photo")).length;
      return { value: v, ok: v >= target };
    }
    case "protein_each": {
      // 아침·점심·저녁 세 끼 모두 단백질이 목표 이상
      const v = [...meals.values()].filter((rs) => sum(rs, "protein_g") >= target).length;
      return { value: v, ok: v >= MAIN.length };
    }
    case "snack_max": {
      const v = rows.filter((r) => isSnack(r.meal_type)).length;
      return { value: v, ok: v <= target && n >= MIN_MEALS_FOR_MAX };
    }
    case "kcal_band": {
      const v = Math.round(sum(rows, "calories"));
      const [lo, hi] = kcalRange(target);
      return { value: v, ok: n >= MAIN.length && v >= lo && v <= hi };
    }
    case "macro_type": {
      const t = macroOf(target);
      const s = macroSplit(rows);
      if (!t || !s) return { value: null, ok: false };
      const inR = (v: number, [a, b]: [number, number]) => v >= a && v <= b;
      return { value: s.p, ok: n >= MIN_MEALS_FOR_MAX && inR(s.c, t.c) && inR(s.p, t.p) && inR(s.f, t.f) };
    }
    default: {
      const meta = METRIC_META[metric];
      const v = r1(sum(rows, meta.field!));
      if (meta.max) return { value: v, ok: v <= target && n >= MIN_MEALS_FOR_MAX };
      return { value: v, ok: v >= target };
    }
  }
}

/** 그날 값 (예전 이름 — 판정은 judgeDay) */
export function dayValue(metric: ChallengeMetric, rows: DiaryRow[], target = 0): number | null {
  return judgeDay(metric, target, rows).value;
}

export type RunProgress = {
  started_on: string;
  ends_on: string;
  finished: boolean;
  done_count: number;
  /** 성공 기준 — 이 날 수를 채우면 해낸 챌린지 (늦게 들어오면 줄어든다) */
  goal: number;
  reached: boolean;
  days: { date: string; state: DayState; value: number | null }[];
  today_value: number | null;
  /** 열량 구간: 구간의 70% 미만인 날이 어제까지 3일 이어졌으면 true (구간 바꾸기·쉬기를 권한다) */
  low_streak: boolean;
};

/**
 * 한 번 도전한 기간의 날마다 상태.
 * from: 기간 첫날(묶음 시작일). startedOn 이 그보다 늦으면(늦게 들어옴) 그 앞 날은 'before' — 못 한 날로 세지 않는다.
 * 오늘: 채우면 바로 아는 규칙은 해낸 날, 하루가 끝나야 아는 규칙('…이하'·구간·비율)은 '오늘'로 둔다.
 */
export function runProgress(metric: ChallengeMetric, target: number, days: number, startedOn: string, rows: DiaryRow[], today: string,
  opts: { from?: string; goal?: number | null } = {}): RunProgress {
  const from = opts.from && opts.from < startedOn ? opts.from : startedOn;
  const byDay = new Map<string, DiaryRow[]>();
  for (const r of rows) byDay.set(r.date, [...(byDay.get(r.date) || []), r]);
  const endsOn = addDays(from, days - 1);
  const now = METRIC_META[metric].decide === "now";
  const list = Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    const { value, ok } = judgeDay(metric, target, byDay.get(date) || []);
    let state: DayState;
    if (date < startedOn) state = "before";
    else if (date > today) state = "future";
    else if (date === today) state = now && ok ? "done" : "today";
    else state = ok ? "done" : "missed";
    return { date, state, value };
  });
  const counted = list.filter((d) => d.state !== "before").length;
  const goal = Math.max(1, Math.min(counted, opts.goal ?? Math.ceil(counted * 0.7)));
  const done = list.filter((d) => d.state === "done").length;
  let low_streak = false;
  if (metric === "kcal_band") {
    const past = list.filter((d) => d.date < today && d.state !== "before").slice(-3);
    low_streak = past.length === 3 && past.every((d) => d.value != null && d.value < target * 0.7);
  }
  return {
    started_on: startedOn,
    ends_on: endsOn,
    finished: today > endsOn,
    done_count: done,
    goal,
    reached: done >= goal,
    days: list,
    today_value: list.find((d) => d.date === today)?.value ?? null,
    low_streak,
  };
}

/** 숫자 + 단위 — "1,240mg", "2끼", "단백질 27%" */
export function metricValue(metric: ChallengeMetric, v: number) {
  if (metric === "macro_type") return `${Math.round(v)}%`;
  return `${Math.round(v).toLocaleString("ko-KR")}${METRIC_META[metric].unit}`;
}

/** 오늘 지금까지와 기준을 한 줄로 — 화면 '오늘' 줄 (내 것만 보인다) */
export function todayLine(metric: ChallengeMetric, target: number, v: number) {
  const m = METRIC_META[metric];
  if (metric === "kcal_band") { const [lo, hi] = kcalRange(target); return `열량 ${metricValue(metric, v)} · 내 구간 ${lo.toLocaleString("ko-KR")}~${hi.toLocaleString("ko-KR")}kcal`; }
  if (metric === "macro_type") { const t = macroOf(target); return `단백질 비율 ${Math.round(v)}%${t ? ` · ${t.label} ${t.p[0]}~${t.p[1]}%` : ""}`; }
  if (metric === "protein_each") return `단백질 ${target}g 넘긴 끼니 ${v}끼 · 세 끼 모두 채우기`;
  if (metric === "photo_meals") return `사진으로 기록한 끼니 ${v}끼 · 기준 ${target}끼 이상`;
  if (metric === "snack_max") return `간식 ${v}번 · 기준 ${target}번 이하`;
  return `${m.label} ${metricValue(metric, v)} · 기준 ${metricValue(metric, target)} ${m.max ? "이하" : "이상"}`;
}
