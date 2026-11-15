/** 영양제 챙기기 (lib/supplements.ts) · 캐릭터 대화에 붙이기 (lib/buddy-chat.ts) */
import { describe, expect, it } from "vitest";
import { dueNow, suppNames, takenFromText, type Supp } from "@/lib/supplements";
import { ruleReply, systemPrompt, type ChatCtx } from "@/lib/buddy-chat";

const S: Supp[] = [
  { id: "a", name: "비타민D", timing: "morning", taken: false },
  { id: "b", name: "오메가3", timing: "evening", taken: false },
  { id: "c", name: "유산균", timing: "any", taken: true },
];

describe("영양제 챙기기", () => {
  it("때가 지났는데 안 먹은 것만 (아침 10시 · 아무 때나 12시 · 저녁 20시)", () => {
    expect(dueNow(S, 9).map((s) => s.id)).toEqual([]);
    expect(dueNow(S, 11).map((s) => s.id)).toEqual(["a"]);
    expect(dueNow(S, 21).map((s) => s.id)).toEqual(["a", "b"]);
  });
  it("이름을 말하면 그것만, '영양제'면 때가 지난 것(없으면 남은 것 전부), 먹었다는 말이 없으면 체크하지 않는다", () => {
    expect(takenFromText("오메가3 먹었어", S, 11).map((s) => s.id)).toEqual(["b"]);
    expect(takenFromText("영양제 먹었어요", S, 11).map((s) => s.id)).toEqual(["a"]);
    expect(takenFromText("영양제 챙겼어", S, 8).map((s) => s.id)).toEqual(["a", "b"]);
    expect(takenFromText("영양제 뭐 먹을까", S, 11)).toEqual([]);
    expect(takenFromText("김밥 먹었어", S, 11)).toEqual([]);
    expect(suppNames(S.slice(0, 2))).toBe("비타민D·오메가3");
  });
  const ctx: ChatCtx = {
    ingredient: "tofu", personality: "kind", today: "2026-11-15", hour: 11, meals: [],
    totals: { kcal: 0, protein: 0, sodium: 0 }, goals: { kcal: 1900, protein: 76, sodium: 2000 }, streak: 1, days: 1, stage: "새싹",
    next: null, check: true, supps: S,
  };
  it("AI 에게는 먹었는지만 — 효과·양은 말하지 않게", () => {
    const s = systemPrompt({ ...ctx, suppJust: "비타민D" });
    expect(s).toContain("비타민D(아침) 아직");
    expect(s).toContain("유산균(아무 때나) 오늘 먹음");
    expect(s).toContain("효과·먹는 양·같이 먹는 법·끊기는 말하지 않는다");
    expect(s).toContain("방금 이 말로 비타민D를 오늘 먹은 것으로 체크했다");
  });
  it("AI 없이도 체크했다고 답한다", () => {
    expect(ruleReply("영양제 먹었어요", { ...ctx, suppJust: "비타민D" })).toBe("비타민D 오늘 먹은 걸로 체크했어요. 챙겨 줘서 고마워요");
  });
});
