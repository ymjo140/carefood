/** 재료 캐릭터 (lib/buddy.ts · lib/buddy-lines.ts) — 30종 × 성격 8 · 보자기 규칙 · 자라기 · 문장 은행의 선 */
import { describe, expect, it } from "vitest";
import {
  INGREDIENTS, PERSONALITIES, buddyName, josa, pickIngredient, pickPersonality, seasonOfMonth, stageOf, wrapKey,
} from "@/lib/buddy";
import { BANK, SITUATIONS, buddyLine, situationOf } from "@/lib/buddy-lines";

const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };

describe("재료 30종 × 성격 8", () => {
  it("재료 30 · 성격 8 · 이름 240가지가 모두 다르다", () => {
    expect(INGREDIENTS).toHaveLength(30);
    expect(new Set(INGREDIENTS.map((i) => i.key)).size).toBe(30);
    expect(PERSONALITIES).toHaveLength(8);
    const names = new Set(INGREDIENTS.flatMap((i) => PERSONALITIES.map((p) => buddyName(i.key, p.key))));
    expect(names.size).toBe(240);
    expect(buddyName("sweetpotato", "picky")).toBe("까다로운 고구마");
  });
  it("제철 4종은 계절마다 하나씩, 드문 재료 2종", () => {
    const seasons = INGREDIENTS.filter((i) => i.rarity === "season").map((i) => i.season).sort();
    expect(seasons).toEqual(["autumn", "spring", "summer", "winter"]);
    expect(INGREDIENTS.filter((i) => i.rarity === "rare").map((i) => i.name).sort()).toEqual(["노른자", "무화과"]);
  });
});

describe("보자기에서 나오는 재료", () => {
  it("처음 보자기는 보통 재료만 (제철·드문 재료 없음)", () => {
    for (let k = 0; k < 100; k++) {
      const key = pickIngredient("start", 12, seq(k / 100));
      expect(INGREDIENTS.find((i) => i.key === key)?.rarity).toBe("common");
    }
  });
  it("시즌 보자기는 그 계절 제철 재료", () => {
    expect(pickIngredient("season", 12, Math.random)).toBe("tangerine");
    expect(pickIngredient("season", 1, Math.random)).toBe("tangerine");
    expect(pickIngredient("season", 4, Math.random)).toBe("strawberry");
    expect(pickIngredient("season", 7, Math.random)).toBe("peach");
    expect(pickIngredient("season", 10, Math.random)).toBe("chestnut");
    expect(seasonOfMonth(2)).toBe("winter");
  });
  it("연속 30일 보자기는 40% 확률로 드문 재료", () => {
    expect(["yolk", "fig"]).toContain(pickIngredient("streak", 5, seq(0.1, 0.9)));
    expect(INGREDIENTS.find((i) => i.key === pickIngredient("streak", 5, seq(0.5, 0.3)))?.rarity).toBe("common");
  });
  it("성격은 8가지 중 하나", () => {
    expect(pickPersonality(seq(0))).toBe("kind");
    expect(pickPersonality(seq(0.99))).toBe("odd");
  });
  it("보자기 열쇠는 같은 보자기를 두 번 주지 않게", () => {
    expect(wrapKey.start()).toBe("start");
    expect(wrapKey.streak("2026-12-14")).toBe("streak:2026-12-14");
    expect(wrapKey.season("2026-12")).toBe("season:2026-12");
  });
});

describe("자라기 — 같이 기록한 날 수로만", () => {
  it("새싹 0 → 꼬마 7 → 어른 30 → 으뜸 100", () => {
    expect(stageOf(0)).toMatchObject({ key: "sprout", next: { name: "꼬마", left: 7 } });
    expect(stageOf(7).key).toBe("kid");
    expect(stageOf(29)).toMatchObject({ key: "kid", next: { name: "어른", left: 1 } });
    expect(stageOf(100)).toMatchObject({ key: "best", next: null });
  });
});

describe("문장 은행의 선", () => {
  const BANNED = ["진단", "처방", "치료", "혈당", "살 빠", "살빠", "살쪄", "살찌", "뚱뚱", "다이어트", "건강에 좋", "몸에 좋", "몸에 나쁘", "많이 먹", "폭식", "과식", "효능", "예방", "체중", "몸무게", "칼로리 폭탄", "나쁜 음식"];
  const all = Object.values(BANK).flatMap((s) => Object.values(s).flat());
  it("성격 8 × 상황 11 × 2문장이 모두 있다", () => {
    for (const p of PERSONALITIES) for (const s of SITUATIONS) {
      expect(BANK[p.key][s]).toHaveLength(2);
      for (const t of BANK[p.key][s]) expect(t.trim().length).toBeGreaterThan(4);
    }
    expect(all).toHaveLength(176);
  });
  it("효능·진단·몸무게·먹은 양을 탓하는 말이 없다", () => {
    for (const t of all) for (const w of BANNED) expect(t, `"${t}" 에 "${w}"`).not.toContain(w);
  });
  it("이름 빈칸 바로 뒤에 조사를 붙이지 않는다 (받침에 따라 바뀌어서)", () => {
    for (const t of all) expect(t, t).not.toMatch(/\{(name|me|food)\}(이|가|은|는|을|를|와|과|예요|이에요|라|이라)/);
  });
  it("모든 조합에서 빈칸이 다 채워진다", () => {
    for (const i of INGREDIENTS) for (const p of PERSONALITIES) for (const s of SITUATIONS) {
      const t = buddyLine(i.key, p.key, s, { food: "김치찌개", days: 5, seed: 7 });
      expect(t, t).not.toMatch(/[{}]/);
    }
    expect(buddyLine("tofu", "kind", "logged", { food: null, days: 1, seed: 1 })).not.toContain("null");
  });
  it("같은 날·같은 상황이면 같은 문장", () => {
    const a = buddyLine("tofu", "chatty", "logged", { food: "두부조림", days: 3, seed: 42 });
    expect(buddyLine("tofu", "chatty", "logged", { food: "두부조림", days: 3, seed: 42 })).toBe(a);
  });
});

describe("지금 무슨 말을 하나", () => {
  const base = { mood: "wait" as const, welcomeBack: false, todayRecords: 0, streak: 0, hatchedToday: false };
  it("오늘 처음 만났으면 인사, 돌아왔으면 반가워하기", () => {
    expect(situationOf({ ...base, hatchedToday: true })).toBe("hello");
    expect(situationOf({ ...base, mood: "logged", todayRecords: 1, welcomeBack: true })).toBe("back");
  });
  it("기록했는데 이어 간 날이 마디면 축하, 아니면 기록 칭찬", () => {
    expect(situationOf({ ...base, mood: "logged", todayRecords: 1, streak: 7 })).toBe("milestone");
    expect(situationOf({ ...base, mood: "logged", todayRecords: 1, streak: 8 })).toBe("logged");
  });
  it("나머지 표정은 그대로", () => {
    expect(situationOf({ ...base, mood: "sulk" })).toBe("sulk");
    expect(situationOf({ ...base, mood: "done", todayRecords: 3 })).toBe("done");
  });
});

describe("받침 조사", () => {
  it("고구마가 · 단호박이 · 플러스 구독이면", () => {
    expect("고구마" + josa("고구마", "이", "가")).toBe("고구마가");
    expect("단호박" + josa("단호박", "이", "가")).toBe("단호박이");
    expect(josa("플러스 구독", "이면", "면")).toBe("이면");
  });
});
