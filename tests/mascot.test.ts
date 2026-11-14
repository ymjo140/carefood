/** 캐릭터 표정 (lib/mascot.ts) — 몸은 그대로 · 적게 먹어도 칭찬 안 함 · 삐짐은 기록 안 한 날만 · 돌아오면 반가워함 */
import { describe, expect, it } from "vitest";
import { cleanPrefs, lineOf, moodOf, type MascotFacts } from "@/lib/mascot";

const base: MascotFacts = { todayRecords: 0, todayMeals: 0, todayKcal: 0, goalKcal: 2000, past: [{ records: 2, kcal: 1800 }, { records: 3, kcal: 1900 }, { records: 3, kcal: 2000 }], ever: true, doneToday: false, togetherToday: false, streak: 3 };
const on = { sulk: true, moods: true };

describe("표정 고르기", () => {
  it("기록 전에는 기다려요, 한 끼 적으면 기록했어요", () => {
    expect(moodOf(base, on).mood).toBe("wait");
    expect(moodOf({ ...base, todayRecords: 1, todayMeals: 1, todayKcal: 500 }, on).mood).toBe("logged");
  });
  it("해냄 > 배불러요, 다 같이 해냄이 가장 먼저", () => {
    const full = { ...base, todayRecords: 4, todayMeals: 3, todayKcal: 2400 };
    expect(moodOf(full, on).mood).toBe("full");
    expect(moodOf({ ...full, doneToday: true }, on).mood).toBe("done");
    expect(moodOf({ ...full, doneToday: true, togetherToday: true }, on).mood).toBe("together");
  });
  it("배불러요는 두 끼 이상 기록한 날만 · 끄면 기록했어요", () => {
    expect(moodOf({ ...base, todayRecords: 1, todayMeals: 1, todayKcal: 2600 }, on).mood).toBe("logged");
    expect(moodOf({ ...base, todayRecords: 3, todayMeals: 2, todayKcal: 2600 }, { sulk: true, moods: false }).mood).toBe("logged");
  });
  it("어제 기록이 없으면 삐지고, 3일 없으면 등 돌림, 한 끼 적으면 반가워함", () => {
    const one = { ...base, past: [{ records: 0, kcal: 0 }, ...base.past.slice(1)] };
    expect(moodOf(one, on).mood).toBe("sulk");
    const three = { ...base, past: [0, 0, 0].map(() => ({ records: 0, kcal: 0 })) };
    expect(moodOf(three, on).mood).toBe("away");
    const back = moodOf({ ...three, todayRecords: 1, todayMeals: 1, todayKcal: 400 }, on);
    expect(back).toEqual({ mood: "logged", welcomeBack: true });
    expect(lineOf("kkirok", back, { streak: 1, meals: 1 })).toContain("반가워요");
  });
  it("삐지기를 끄면 기다려요 · 처음 온 사람은 삐지지 않는다", () => {
    const one = { ...base, past: [{ records: 0, kcal: 0 }, ...base.past.slice(1)] };
    expect(moodOf(one, { sulk: false, moods: true }).mood).toBe("wait");
    expect(moodOf({ ...one, ever: false, past: [0, 0, 0].map(() => ({ records: 0, kcal: 0 })) }, on).mood).toBe("wait");
  });
  it("목표의 70% 미만이 3일이면 걱정 (적게 먹은 걸 칭찬하지 않음)", () => {
    const low = { ...base, past: [0, 0, 0].map(() => ({ records: 3, kcal: 1000 })) };
    expect(moodOf(low, on).mood).toBe("worried");
    expect(lineOf("rami", moodOf(low, on), { streak: 3, meals: 0 })).not.toMatch(/잘|대단/);
  });
  it("설정 정리 — 모르는 값은 그대로 둔다", () => {
    expect(cleanPrefs({ kind: "dog", sulk: "yes" })).toEqual({ kind: "kkirok", sulk: true, moods: true, simple: false });
    expect(cleanPrefs({ kind: "kkinyang", simple: true }).kind).toBe("kkinyang");
  });
});
