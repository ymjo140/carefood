/** 캐릭터와 이야기하기 (lib/buddy-chat.ts · lib/buddy-ai.ts toMessages · lib/plans.ts chatLimit) */
import { describe, expect, it } from "vitest";
import { CRISIS_REPLY, MAX_REPLY, cleanReply, intentOf, nextSlot, riskOf, ruleReply, systemPrompt, type ChatCtx } from "@/lib/buddy-chat";
import { toMessages } from "@/lib/buddy-ai";
import { chatLimit } from "@/lib/plans";

const ctx: ChatCtx = {
  ingredient: "sweetpotato", personality: "picky", today: "2026-11-15", hour: 12,
  meals: [{ meal: "breakfast", food: "그릭요거트볼" }, { meal: "lunch", food: "김치찌개" }],
  totals: { kcal: 996, protein: 38, sodium: 1820 }, goals: { kcal: 1900, protein: 76, sodium: 2000 },
  streak: 3, days: 5, stage: "새싹",
  next: { meal: "dinner", menus: [{ name: "치킨 샐러드", facts: "단백질 28g · 나트륨 520mg · 380kcal" }] },
  check: true,
};

describe("위험한 말 거르기", () => {
  it("위기 말은 crisis, 먹기 장애가 의심되는 말은 eating, 보통 말은 null", () => {
    expect(riskOf("요즘 죽고 싶어")).toBe("crisis");
    expect(riskOf("먹고 토했어")).toBe("eating");
    expect(riskOf("오늘 하루 종일 굶었어")).toBe("eating");
    expect(riskOf("점심에 김밥 먹었어")).toBeNull();
    expect(CRISIS_REPLY).toContain("109");
  });
  it("조심할 때 규칙 답에는 숫자가 없다", () => {
    expect(ruleReply("남은 열량 알려 줘요", ctx, true)).not.toMatch(/\d/);
  });
});

describe("AI 답 다듬기", () => {
  it("효능·몸 평가·구매 권유가 있으면 버린다", () => {
    for (const bad of ["혈당 관리에 좋아요", "살찌는 음식이에요", "다이어트에 딱이에요", "이 제품 구매해 보세요", "많이 먹었네요"]) expect(cleanReply(bad)).toBeNull();
  });
  it("이모지를 지우고 길면 문장 끝에서 자른다", () => {
    expect(cleanReply("맛있다! 😋 고마워요")).toBe("맛있다! 고마워요");
    const long = "흠, 김밥이네요. ".repeat(40);
    const got = cleanReply(long)!;
    expect(got.length).toBeLessThanOrEqual(MAX_REPLY);
    expect(got.endsWith(".")).toBe(true);
  });
});

describe("AI 에게 주는 설정", () => {
  it("캐릭터 이름·성격·오늘 기록·숫자·메뉴 후보가 들어가고, 알레르기·건강 관심사는 없다", () => {
    const s = systemPrompt(ctx);
    expect(s).toContain("까다로운 고구마");
    expect(s).toContain("점심 김치찌개");
    expect(s).toContain("단백질 38g");
    expect(s).toContain("치킨 샐러드");
    expect(s.split("지킬 것")[0]).not.toMatch(/알레르기|질환|관심사/);
  });
  it("조심할 때는 숫자를 넣지 않는다", () => {
    const s = systemPrompt(ctx, true);
    expect(s).not.toContain("1,820mg");
    expect(s).toContain("조심할 때");
  });
});

describe("AI 없이 답하기", () => {
  it("말 뜻 가르기", () => {
    expect(intentOf("다음 끼니 뭐 먹을까요?")).toBe("menu");
    expect(intentOf("남은 열량 알려 줘요")).toBe("numbers");
    expect(intentOf("칭찬해 줘요")).toBe("praise");
    expect(intentOf("오늘 어땠어요?")).toBe("today");
    expect(intentOf("라면 먹었어")).toBe("ate");
    expect(intentOf("혈당 관리에 좋은 음식 알려줘")).toBe("medical");
    expect(ruleReply("살쪄서 고민이야", ctx)).toContain("의사나 약사");
  });
  it("메뉴는 후보에서 숫자와 함께, 숫자는 체크 줄로", () => {
    expect(ruleReply("다음 끼니 뭐 먹을까요?", ctx)).toBe("저녁은 치킨 샐러드 어때요? 단백질 28g · 나트륨 520mg · 380kcal");
    expect(ruleReply("남은 열량 알려 줘요", ctx)).toContain("단백질 38g");
    expect(ruleReply("오늘 어땠어요?", ctx)).toContain("오늘 2끼");
  });
  it("메뉴가 없으면 권하지 않는다고 말한다", () => {
    expect(ruleReply("뭐 먹을까요?", { ...ctx, next: { meal: "dinner", menus: [] } })).toContain("권할 메뉴가 없어요");
  });
});

describe("다음 끼니 · 대화 순서 · 하루 한도", () => {
  it("시각과 이미 적은 끼니로 다음 끼니", () => {
    expect(nextSlot(8, new Set())).toEqual({ meal: "breakfast", mainLeft: 3 });
    expect(nextSlot(8, new Set(["breakfast"]))).toEqual({ meal: "lunch", mainLeft: 2 });
    expect(nextSlot(16, new Set(["lunch"]))).toEqual({ meal: "dinner", mainLeft: 1 });
    expect(nextSlot(22, new Set())).toEqual({ meal: "snack", mainLeft: 1 });
  });
  it("AI 에 보낼 대화는 내 말로 시작하고 번갈아 간다", () => {
    expect(toMessages([
      { role: "buddy", text: "안녕" }, { role: "me", text: "a" }, { role: "me", text: "b" }, { role: "buddy", text: "c" }, { role: "me", text: "d" },
    ])).toEqual([{ role: "user", content: "a\nb" }, { role: "assistant", content: "c" }, { role: "user", content: "d" }]);
  });
  it("체험 기간 30 · 무료 5 · 구독 50", () => {
    expect(chatLimit({ mode: "beta", plan: "basic" })).toBe(30);
    expect(chatLimit({ mode: "store", plan: "basic" })).toBe(5);
    expect(chatLimit({ mode: "store", plan: "kkirok" })).toBe(50);
  });
});
