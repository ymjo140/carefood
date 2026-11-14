/** 가족 연결 (lib/family.ts · lib/family-alerts.ts) — 보여 줄 것 정리 · 약 알림 시간 */
import { describe, expect, it } from "vitest";
import { cleanScopes } from "@/lib/family";
import { kstMinutes, planMedAlerts } from "@/lib/family-alerts";

describe("보여 줄 것", () => {
  it("기본은 숫자 꺼짐 · 모르는 값은 기본값", () => {
    expect(cleanScopes(undefined)).toEqual({ meals: true, products: true, meds: false, numbers: false });
    expect(cleanScopes({ numbers: "yes", meds: true })).toEqual({ meals: true, products: true, meds: true, numbers: false });
  });
});

describe("약 먹을 시간 알림", () => {
  const items = [
    { id: "a", user_id: "u1", label: "아침 약", remind_at: "08:00:00" },
    { id: "b", user_id: "u1", label: "저녁 약", remind_at: "19:00:00" },
    { id: "c", user_id: "u2", label: "영양제", remind_at: null },
  ];
  it("정한 시각부터 1시간 안, 체크 전만", () => {
    expect(planMedAlerts(items, new Set(), "2026-11-20", 8 * 60 + 10).map((a) => a.key)).toEqual(["med:a:2026-11-20"]);
    expect(planMedAlerts(items, new Set(["a"]), "2026-11-20", 8 * 60 + 10)).toEqual([]);
    expect(planMedAlerts(items, new Set(), "2026-11-20", 9 * 60)).toEqual([]);
    expect(planMedAlerts(items, new Set(), "2026-11-20", 7 * 60 + 59)).toEqual([]);
  });
  it("알림 문구에 복용 안내가 없다", () => {
    const [a] = planMedAlerts(items, new Set(), "2026-11-20", 19 * 60 + 30);
    expect(a.payload.title).toBe("저녁 약 먹을 시간이에요");
    expect(a.payload.body).not.toMatch(/복용|용량|식후|식전/);
  });
  it("한국 시각(분)", () => {
    expect(kstMinutes(Date.parse("2026-11-20T00:30:00Z"))).toBe(9 * 60 + 30);
  });
});
