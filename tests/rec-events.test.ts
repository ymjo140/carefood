/** 추천 반응 (lib/rec-events) — 넘김 −, 기록 +, 찜 + · 같은 날 같은 것은 한 번 · 기록하면 권한 것에 이어 붙임 */
import { describe, expect, it } from "vitest";
import { buildSignals, logRec, markRecorded, signalTerm } from "@/lib/rec-events";
import { pickScore } from "@/lib/next-picks";
import { fakeSb } from "./fake-sb";

describe("반응 → 점수", () => {
  it("넘김 −1 씩(최대 −2.5) · 기록 +0.5 씩(최대 +1) · 찜 +0.5", () => {
    const s = buildSignals([
      { item_key: "a", action: "skipped" }, { item_key: "a", action: "skipped" }, { item_key: "a", action: "skipped" },
      { item_key: "b", action: "recorded" }, { item_key: "b", action: "recorded" }, { item_key: "b", action: "recorded" },
      { item_key: "c", action: "shown" },
    ], ["b", "d"]);
    expect(signalTerm(s, "a")).toBe(-2.5);
    expect(signalTerm(s, "b")).toBe(1.5);
    expect(signalTerm(s, "c")).toBe(0);
    expect(signalTerm(s, "d")).toBe(0.5);
    expect(signalTerm(undefined, "a")).toBe(0);
  });
  it("두 번 넘긴 제품은 같은 조건의 다른 제품보다 뒤로", () => {
    const s = buildSignals([{ item_key: "x", action: "skipped" }, { item_key: "x", action: "skipped" }], []);
    const b = { kcal: 600, protein: 25, sodium: 700, signals: s };
    const r = { calories: 600, protein_g: 25, sodium_mg: 500 };
    expect(pickScore({ ...r, id: "x" }, b)).toBeLessThan(pickScore({ ...r, id: "y" }, b));
  });
});

describe("반응 남기기", () => {
  const ev = (o: object) => ({ user_id: "me", surface: "ai_fill" as const, item_key: "p1", meal: "lunch", day: "2026-11-21", action: "shown" as const, ...o });
  it("같은 날 같은 것은 한 번만", async () => {
    const sb = fakeSb({ rec_events: [] });
    await logRec(sb, [ev({}), ev({})]);
    await logRec(sb, [ev({})]);
    expect(sb.tables.rec_events.length).toBe(1);
  });
  it("기록하면 최근에 권한 것을 recorded 로 이어 붙이고, 권한 적 없으면 남기지 않는다", async () => {
    const sb = fakeSb({ rec_events: [{ ...ev({ surface: "next", item_key: "menu:김밥" }), created_at: "2026-11-21T00:00:00Z" }] });
    await markRecorded(sb, "me", ["", "menu:김밥"], "2026-11-21", "2026-11-18");
    expect(sb.tables.rec_events.map((r) => `${r.surface}:${r.action}`)).toEqual(["next:shown", "next:recorded"]);
    await markRecorded(sb, "me", ["menu:보쌈"], "2026-11-21", "2026-11-18");
    expect(sb.tables.rec_events.length).toBe(2);
  });
});
