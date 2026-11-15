/** 캐릭터 대화 추천 — 우리 DB 후보에서 고르기 (lib/chat-recs.ts) */
import { describe, expect, it } from "vitest";
import { focusOf, isRecAsk, mealOfText, rankRecs, recLine, type Cand } from "@/lib/chat-recs";
import { ruleReply, systemPrompt, type ChatCtx } from "@/lib/buddy-chat";

const C = (kind: "menu" | "product", name: string, kcal: number, p: number, sugar: number | null, na: number, maker: string | null = null): Cand =>
  ({ kind, id: name, name, maker, image: null, category: null, calories: kcal, protein_g: p, carbs_g: 40, sugar_g: sugar, sodium_mg: na });
const CANDS: Cand[] = [
  C("menu", "닭가슴살 샐러드", 320, 28, 3, 450),
  C("menu", "떡볶이", 480, 8, 18, 1300),
  C("menu", "쌀밥", 310, 5, 0, 5),
  C("product", "연어 포케", 420, 24, 2, 610, "A식단"),
  C("product", "불고기 도시락", 560, 26, 14, 980, "B식단"),
  C("product", "두부 스테이크", 380, 22, 4, 520, "A식단"),
  C("product", "곤약 비빔밥", 300, 10, 1, 700, "C식단"),
  C("product", "땅콩 단백질바", 210, 15, 6, 120, "D"),
];
const b = { meal: "dinner" as const, kcal: 650, protein: 25, sodium: 900, avoid: [] as string[] };

describe("무엇을 물었나", () => {
  it("추천을 묻는 말과 초점·끼니", () => {
    expect(isRecAsk("혈당 관리에 좋은 음식 알려줘")).toBe(true);
    expect(isRecAsk("다음 끼니 뭐 먹을까요?")).toBe(true);
    expect(isRecAsk("오늘 어땠어요?")).toBe(false);
    expect(focusOf("혈당 관리에 좋은 음식 알려줘").key).toBe("sugar");
    expect(focusOf("짜지 않은 거 추천해 줘").key).toBe("sodium");
    expect(focusOf("운동 끝나고 뭐 먹지").key).toBe("protein");
    expect(focusOf("살 빼려고 하는데 저녁 추천").key).toBe("light");
    expect(focusOf("진짜 배고파 뭐 먹지").key).toBe("budget");
    expect(mealOfText("점심 추천")).toBe("lunch");
  });
});

describe("DB 후보에서 고르기", () => {
  it("당류: 5g 이하만, 메뉴 1 + 제품 2, 같은 제조사 한 번, 곁들이(쌀밥) 빼기", () => {
    const got = rankRecs(CANDS, "sugar", b, 1);
    expect(got).toHaveLength(3);
    expect(got.filter((p) => p.kind === "menu")).toHaveLength(1);
    for (const p of got) expect(p.facts.startsWith("당류")).toBe(true);
    expect(got.map((p) => p.name)).not.toContain("쌀밥");
    expect(got.map((p) => p.name)).not.toContain("떡볶이");
    const makers = got.filter((p) => p.kind === "product").map((p) => p.maker);
    expect(new Set(makers).size).toBe(makers.length);
    expect(got.find((p) => p.kind === "product")!.href).toMatch(/^\/products\//);
  });
  it("나트륨: 600mg 이하만, 나트륨이 맨 앞", () => {
    for (const p of rankRecs(CANDS, "sodium", b, 2)) expect(p.facts).toMatch(/^나트륨 [0-5]\d{2}mg|^나트륨 \d{1,2}mg/);
  });
  it("알레르기 단어가 든 이름은 뺀다", () => {
    for (let s = 0; s < 5; s++) expect(rankRecs(CANDS, "protein", { ...b, meal: "snack", kcal: 300, avoid: ["땅콩"] }, s).map((p) => p.name)).not.toContain("땅콩 단백질바");
  });
  it("맞는 게 없으면 없다고 말한다", () => {
    expect(recLine({ key: "sugar", reason: "당류가 적은 쪽으로 골랐어요" }, "dinner", [])).toContain("찾지 못했어요");
  });
});

describe("대화에 붙이기", () => {
  const ctx: ChatCtx = {
    ingredient: "sweetpotato", personality: "picky", today: "2026-11-15", hour: 12, meals: [],
    totals: { kcal: 0, protein: 0, sodium: 0 }, goals: { kcal: 1900, protein: 76, sodium: 2000 }, streak: 1, days: 1, stage: "새싹",
    next: null, check: true,
  };
  it("추천이 있으면 AI 없이도 이유 + 첫 번째 이름·숫자로 답한다 (동문서답 없음)", () => {
    const picks = rankRecs(CANDS, "sugar", b, 1);
    const reply = ruleReply("혈당 관리에 좋은 음식 알려줘", { ...ctx, recs: { focus: focusOf("혈당"), meal: "dinner", picks } });
    expect(reply.startsWith("당류가 적은 쪽으로 골랐어요. 저녁은 ")).toBe(true);
    expect(reply).toContain(picks[0].name);
    expect(reply).not.toMatch(/혈당|관리|좋아요/);
  });
  it("AI 에게 추천 목록을 주고, 목록 밖 음식을 지어내지 말라고 한다", () => {
    const picks = rankRecs(CANDS, "sugar", b, 1);
    const s = systemPrompt({ ...ctx, recs: { focus: focusOf("혈당"), meal: "dinner", picks } });
    expect(s).toContain("이번 추천(오늘끼록 DB에서 당류가 적은 쪽으로 고름");
    expect(s).toContain(picks[0].name);
    expect(s).toContain("목록에 없는 음식을 지어내지 않는다");
  });
});

import { avoidedNote, lastMealOf, profileFocus, repeatOf, type RecentMeal } from "@/lib/chat-recs";

describe("내 목표 · 겹침 · 입맛 · 채식", () => {
  const T = "2026-11-15";
  it("말에 초점이 없으면 내 목표(프로필)로 — 그것도 없으면 남은 양", () => {
    expect(profileFocus({ conditions: ["diabetes"] })).toBe("sugar");
    expect(profileFocus({ conditions: ["blood_pressure"] })).toBe("sodium");
    expect(profileFocus({ diet_type: "diet" })).toBe("light");
    expect(profileFocus({ diet_type: "exercise" })).toBe("protein");
    expect(focusOf("저녁 뭐 먹지", { conditions: ["diabetes"] }).reason).toBe("내 목표에 맞춰 당류가 적은 쪽으로 골랐어요");
    expect(focusOf("저녁 뭐 먹지", { diet_type: "normal" }).key).toBe("budget");
    // 말로 물은 게 먼저
    expect(focusOf("단백질 많은 저녁", { conditions: ["diabetes"] }).key).toBe("protein");
  });
  const recent: RecentMeal[] = [
    { date: "2026-11-13", meal: "lunch", food: "연어 덮밥", productId: null, at: "2026-11-13T03:00:00Z" },
    { date: "2026-11-12", meal: "dinner", food: "두부 스테이크", productId: null, at: "2026-11-12T10:00:00Z" },
    { date: "2026-11-15", meal: "breakfast", food: "닭가슴살 샐러드", productId: null, at: "2026-11-14T23:00:00Z" },
  ];
  it("바로 전 끼니는 늘 빼고, 점심·저녁은 3일 안의 같은 음식·같은 주재료를 뺀다 (사흘 전은 괜찮다)", () => {
    expect(lastMealOf(recent).map((r) => r.food)).toEqual(["닭가슴살 샐러드"]);
    expect(repeatOf(CANDS[0], recent, "snack", T)?.food).toBe("닭가슴살 샐러드"); // 바로 전 끼니와 같은 이름
    expect(repeatOf(CANDS[3], recent, "dinner", T)?.food).toBe("연어 덮밥"); // 연어 포케 ↔ 연어 덮밥 (주재료)
    expect(repeatOf(CANDS[5], recent, "dinner", T)).toBeNull(); // 두부 스테이크는 3일 전 — 괜찮다
    expect(repeatOf(CANDS[3], recent, "breakfast", T)).toBeNull(); // 아침은 3일 규칙 없음
    const got = rankRecs(CANDS, "sugar", b, 1, 3, { today: T, recent });
    expect(got.map((p) => p.name)).not.toContain("연어 포케");
    expect(got.map((p) => p.name)).not.toContain("닭가슴살 샐러드");
  });
  it("겹치지 않게 고른 걸 말할 때는 가장 가까운 점심·저녁 하나", () => {
    expect(avoidedNote(recent, "dinner", T)).toBe("그제 점심 연어 덮밥");
    expect(recLine({ key: "sugar", reason: "당류가 적은 쪽으로 골랐어요" }, "dinner", rankRecs(CANDS, "sugar", b, 1), "그제 점심 연어 덮밥"))
      .toMatch(/^당류가 적은 쪽으로, 그제 점심 연어 덮밥과 겹치지 않게 골랐어요\. 저녁은 /);
  });
  it("입맛이 가까운 쪽이 앞으로, 최근에 권한 것은 뒤로", () => {
    const tasted = CANDS.map((c) => c.name === "곤약 비빔밥" ? { ...c, taste: 100, tasteWhy: "짠맛·매운맛이 고른 입맛과 가까워요" } : { ...c, taste: 20 });
    const got = rankRecs(tasted, "budget", b, 0, 3);
    expect(got.map((p) => p.name)).toContain("곤약 비빔밥");
    expect(got.find((p) => p.name === "곤약 비빔밥")!.why).toContain("입맛");
    const first = rankRecs(CANDS, "budget", b, 0, 3).filter((p) => p.kind === "product")[0];
    const later = rankRecs(CANDS, "budget", b, 0, 3, { shown: [first.id] }).filter((p) => p.kind === "product");
    expect(later[0].id).not.toBe(first.id);
  });
  it("채식이면 고기·생선이 든 이름은 뺀다", () => {
    for (const p of rankRecs(CANDS, "budget", b, 0, 3, { vegetarian: true })) expect(p.name).not.toMatch(/닭|연어|불고기/);
  });
});
