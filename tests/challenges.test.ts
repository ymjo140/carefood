/** 챌린지 하루 판정 (lib/challenges.ts) — 150kcal 끼니 기준 · 새 규칙(사진·간식·끼니마다 단백질·열량 구간·탄단지) · 오늘/지난날 */
import { describe, expect, it } from "vitest";
import { countedMeals, judgeDay, kcalRange, macroSplit, runProgress, type DiaryRow } from "@/lib/challenges";
import { checkSpec, nearestTier } from "@/lib/challenge-rules";
import { planGroupAlerts } from "@/lib/challenge-alerts";
import type { ChallengeRow, MemberRow } from "@/lib/challenge-groups";

const D = "2026-11-16";
const row = (meal: string, over: Partial<DiaryRow> = {}): DiaryRow => ({
  date: D, meal_type: meal, calories: 500, protein_g: 25, sugar_g: 5, sodium_mg: 600, fiber_g: 5, carbs_g: 60, fat_g: 15, source: "manual", ...over,
});
const three = (over: Partial<DiaryRow> = {}) => [row("breakfast", over), row("lunch", over), row("dinner", over)];

describe("끼니로 세기 (150kcal)", () => {
  it("150kcal 미만 끼니는 세지 않는다", () => {
    expect(countedMeals([row("breakfast", { calories: 120 }), row("lunch")]).size).toBe(1);
  });
  it("한 끼를 여러 줄로 적으면 합계로 본다", () => {
    expect(countedMeals([row("breakfast", { calories: 90 }), row("breakfast", { calories: 80 })]).has("breakfast")).toBe(true);
  });
  it("열량을 모르는 기록만 있는 끼니는 센다", () => {
    expect(countedMeals([row("dinner", { calories: null })]).size).toBe(1);
  });
  it("간식은 끼니로 세지 않는다", () => {
    expect(countedMeals([row("snack", { calories: 800 })]).size).toBe(0);
  });
  it("세 끼 규칙: 작은 아침은 빠진다", () => {
    expect(judgeDay("meals_min", 3, [row("breakfast", { calories: 100 }), row("lunch"), row("dinner")]).ok).toBe(false);
    expect(judgeDay("meals_min", 3, three()).ok).toBe(true);
  });
});

describe("새 규칙", () => {
  it("사진과 함께 기록: 사진으로 찾은 기록이 있는 끼니만", () => {
    const rows = [row("breakfast", { source: "photo" }), row("lunch", { source: "photo" }), row("dinner")];
    expect(judgeDay("photo_meals", 2, rows)).toEqual({ value: 2, ok: true });
    expect(judgeDay("photo_meals", 3, rows).ok).toBe(false);
  });
  it("간식 줄이기: 횟수 이하 + 두 끼 이상 기록", () => {
    expect(judgeDay("snack_max", 1, [...three(), row("snack", { calories: 200 })]).ok).toBe(true);
    expect(judgeDay("snack_max", 1, [...three(), row("snack"), row("snack")]).ok).toBe(false);
    expect(judgeDay("snack_max", 1, [row("lunch")]).ok).toBe(false); // 한 끼만 적고 넘기지 않게
  });
  it("끼니마다 단백질: 세 끼 모두 목표 이상", () => {
    expect(judgeDay("protein_each", 20, three()).ok).toBe(true);
    expect(judgeDay("protein_each", 20, [row("breakfast", { protein_g: 8 }), row("lunch"), row("dinner")])).toEqual({ value: 2, ok: false });
  });
  it("열량 구간: 세 끼 + ±10% 안, 아래로 떨어져도 못 한 날", () => {
    expect(kcalRange(1900)).toEqual([1710, 2090]);
    expect(judgeDay("kcal_band", 1900, three({ calories: 620 })).ok).toBe(true); // 1,860
    expect(judgeDay("kcal_band", 1900, three({ calories: 400 })).ok).toBe(false); // 1,200 — 적게 먹은 날
    expect(judgeDay("kcal_band", 1900, three({ calories: 800 })).ok).toBe(false); // 2,400
    expect(judgeDay("kcal_band", 1900, [row("lunch", { calories: 950 }), row("dinner", { calories: 950 })]).ok).toBe(false); // 두 끼
  });
  it("탄단지 유형: 비율이 범위 안 + 두 끼 이상", () => {
    // 탄 60g·단 25g·지 15g → 240·100·135 kcal → 51·21·28%
    expect(macroSplit(three())).toEqual({ c: 51, p: 21, f: 28 });
    expect(judgeDay("macro_type", 1, three()).ok).toBe(false); // 균형은 단백질 15~20%
    expect(judgeDay("macro_type", 3, three()).ok).toBe(false); // 탄수 조금 줄이기는 탄수 40~50% — 51%
    // 탄 70g·단 20g·지 15g → 57·16·27% → 균형
    expect(judgeDay("macro_type", 1, three({ carbs_g: 70, protein_g: 20 })).ok).toBe(true);
    expect(judgeDay("macro_type", 1, [row("lunch", { carbs_g: 70, protein_g: 20 })]).ok).toBe(false); // 한 끼
  });
  it("'…이하' 규칙도 150kcal 끼니 기준으로 두 끼", () => {
    expect(judgeDay("sodium_max", 2000, [row("lunch"), row("snack", { calories: 300 })]).ok).toBe(false);
    expect(judgeDay("sodium_max", 2000, [row("lunch"), row("dinner")]).ok).toBe(true);
  });
});

describe("오늘과 지난날", () => {
  it("채우면 아는 규칙은 오늘 바로 해낸 날, 구간은 하루가 끝나야", () => {
    const today = D;
    const a = runProgress("meals_min", 3, 7, "2026-11-16", three(), today);
    expect(a.days[0].state).toBe("done");
    const b = runProgress("kcal_band", 1900, 7, "2026-11-16", three({ calories: 620 }), today);
    expect(b.days[0].state).toBe("today");
    const c = runProgress("kcal_band", 1900, 7, "2026-11-16", three({ calories: 620 }), "2026-11-17");
    expect(c.days[0].state).toBe("done");
  });
  it("열량 구간 70% 미만이 3일 이어지면 알린다", () => {
    const low = (date: string) => three({ date, calories: 300 });
    const rows = [...low("2026-11-16"), ...low("2026-11-17"), ...low("2026-11-18")];
    expect(runProgress("kcal_band", 1900, 7, "2026-11-16", rows, "2026-11-19").low_streak).toBe(true);
    expect(runProgress("kcal_band", 1900, 7, "2026-11-16", rows, "2026-11-18").low_streak).toBe(false);
  });
});

describe("만들기 검사", () => {
  it("열량은 1,200kcal 아래로 만들 수 없다", () => {
    expect("error" in checkSpec({ metric: "kcal_band", target: 1000, days: 7 })).toBe(true);
    const ok = checkSpec({ metric: "kcal_band", target: 1930, days: 30 });
    expect("error" in ok ? null : [ok.target, ok.title]).toEqual([1950, "30일 열량 구간 지키기"]);
  });
  it("열량 구간 제목·규칙에 숫자가 들어가지 않는다 (숫자는 나만)", () => {
    const ok = checkSpec({ metric: "kcal_band", target: 1700, days: 7 });
    expect("error" in ok ? "" : ok.title + ok.rule).not.toMatch(/\d{3,}/);
  });
  it("탄단지 유형은 1~5만", () => {
    expect("error" in checkSpec({ metric: "macro_type", target: 9, days: 7 })).toBe(true);
    const ok = checkSpec({ metric: "macro_type", target: 2, days: 14 });
    expect("error" in ok ? "" : ok.title).toBe("14일 탄단지 고단백 지키기");
  });
  it("내 목표에 가장 가까운 구간", () => {
    expect(nearestTier(1950)).toBe(1900);
    expect(nearestTier(2000)).toBe(1900);
    expect(nearestTier(null)).toBe(1900);
    expect(nearestTier(2600)).toBe(2500);
  });
});


describe("같이 하기 알림 계획", () => {
  const ch = (metric: ChallengeRow["metric"], target = 3): ChallengeRow => ({ id: "c1", slug: "u-x", title: "7일 세 끼 기록하기", rule: "", metric, target, days: 7, goal_days: null, is_active: true });
  const mem = (user: string, over: Partial<MemberRow> = {}): MemberRow => ({ challenge_id: "c1", user_id: user, started_on: "2026-11-16", joined_on: null, goal_days_eff: null, group_id: "g1", finished_runs: 0, show_values: false, target_eff: null, ...over });
  const groups = [{ id: "g1", challenge_id: "c1", start_on: "2026-11-16" }];
  const rows = (date: string, over: Partial<DiaryRow> = {}) => three({ date, ...over });

  it("세 끼 규칙: 모두 해내면 그날 바로 모두에게", () => {
    const diary = new Map([["a", rows("2026-11-17")], ["b", rows("2026-11-17")]]);
    const out = planGroupAlerts({ groups, challenges: new Map([["c1", ch("meals_min")]]), members: [mem("a"), mem("b")], diary, today: "2026-11-17", hour: 15 });
    expect(out.map((o) => [o.user, o.key, o.payload.title])).toEqual([["a", "all:g1:2026-11-17", "오늘 2명 모두 해냈어요"], ["b", "all:g1:2026-11-17", "오늘 2명 모두 해냈어요"]]);
  });
  it("한 명이라도 못 하면 다 같이 알림은 없다 · 저녁 7시에 남은 한 명에게만", () => {
    const diary = new Map([["a", rows("2026-11-17")], ["b", rows("2026-11-17")], ["c", [row("lunch", { date: "2026-11-17" })]]]);
    const opts = { groups, challenges: new Map([["c1", ch("meals_min")]]), members: [mem("a"), mem("b"), mem("c")], diary, today: "2026-11-17" };
    expect(planGroupAlerts({ ...opts, hour: 18 })).toEqual([]);
    const at7 = planGroupAlerts({ ...opts, hour: 19 });
    expect(at7.map((o) => [o.user, o.key, o.payload.title])).toEqual([["c", "alone:2026-11-17", "오늘 나만 남았어요"]]);
    expect(at7[0].payload.body).not.toMatch(/kcal|mg/);
  });
  it("열량 구간: 사람마다 내 구간으로, 다 같이 알림은 다음 날 아침에 '어제'로", () => {
    const c = ch("kcal_band", 1900);
    // a 는 1,860kcal(1,900 구간 안), b 는 2,460kcal — b 의 구간이 2,300이면 해낸 날
    const diary = new Map([["a", rows("2026-11-16", { calories: 620 })], ["b", rows("2026-11-16", { calories: 820 })]]);
    const members = [mem("a", { target_eff: 1900 }), mem("b", { target_eff: 2300 })];
    const base = { groups, challenges: new Map([["c1", c]]), members, diary, today: "2026-11-17" };
    expect(planGroupAlerts({ ...base, hour: 15 })).toEqual([]);
    const morning = planGroupAlerts({ ...base, hour: 9 });
    expect(morning.map((o) => o.payload.title)).toEqual(["어제 2명 모두 해냈어요", "어제 2명 모두 해냈어요"]);
  });
  it("하루가 끝나야 아는 규칙의 저녁 7시는 '기록이 없는 사람'으로", () => {
    const diary = new Map([["a", [row("lunch", { date: "2026-11-17" })]], ["b", []]]);
    const out = planGroupAlerts({ groups, challenges: new Map([["c1", ch("sodium_max", 2000)]]), members: [mem("a"), mem("b")], diary, today: "2026-11-17", hour: 19 });
    expect(out.map((o) => [o.user, o.payload.title, o.payload.url])).toEqual([["b", "오늘 나만 기록이 없어요", "/diary"]]);
  });
  it("늦게 들어온 사람은 들어오기 전 날을 세지 않는다 · 혼자면 알림 없음", () => {
    const diary = new Map([["a", rows("2026-11-17")]]);
    const out = planGroupAlerts({ groups, challenges: new Map([["c1", ch("meals_min")]]), members: [mem("a"), mem("b", { started_on: "2026-11-18" })], diary, today: "2026-11-17", hour: 19 });
    expect(out).toEqual([]);
  });
});
