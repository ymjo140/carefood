/** 가족 연결 (lib/family.ts · lib/family-alerts.ts) — 보여 줄 것 정리 · 약 알림 시간 */
import { describe, expect, it } from "vitest";
import { cleanScopes, familyDayOk, nudgeBlock } from "@/lib/family";
import { kstMinutes, planMedAlerts, planViewerMedAlerts } from "@/lib/family-alerts";

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

describe("가족 하루 보기 날짜", () => {
  it("오늘부터 6일 전까지만", () => {
    expect(familyDayOk("2026-11-18", "2026-11-18")).toBe(true);
    expect(familyDayOk("2026-11-12", "2026-11-18")).toBe(true);
    expect(familyDayOk("2026-11-11", "2026-11-18")).toBe(false);
    expect(familyDayOk("2026-11-19", "2026-11-18")).toBe(false);
    expect(familyDayOk("2026-11-1", "2026-11-18")).toBe(false);
  });
});

describe("콕 찌르기", () => {
  const ok = { allow: true, shareMeals: true, recorded: false, already: false, hourKst: 12 };
  it("보낼 수 있을 때만 null", () => {
    expect(nudgeBlock(ok)).toBeNull();
    expect(nudgeBlock({ ...ok, shareMeals: false })).toMatch(/기록 여부/);
    expect(nudgeBlock({ ...ok, allow: false })).toMatch(/받지 않기로/);
    expect(nudgeBlock({ ...ok, recorded: true })).toMatch(/이미 기록/);
    expect(nudgeBlock({ ...ok, already: true })).toMatch(/이미 콕/);
  });
  it("밤 10시~아침 8시는 보내지 않는다", () => {
    expect(nudgeBlock({ ...ok, hourKst: 22 })).toMatch(/밤 10시/);
    expect(nudgeBlock({ ...ok, hourKst: 7 })).toMatch(/밤 10시/);
    expect(nudgeBlock({ ...ok, hourKst: 8 })).toBeNull();
    expect(nudgeBlock({ ...ok, hourKst: 21 })).toBeNull();
  });
});

describe("가족 약 체크 알림(보는 사람)", () => {
  const links = [{ id: "L1", viewer_id: "kid", owner_id: "mom", label: "엄마" }];
  const items = [
    { id: "a", user_id: "mom", label: "아침 약", remind_at: "08:00:00" },
    { id: "b", user_id: "other", label: "약", remind_at: "08:00:00" },
  ];
  it("정한 시각에서 1~2시간 사이, 체크 전, 내 가족 것만", () => {
    expect(planViewerMedAlerts(links, items, new Set(), "2026-11-20", 9 * 60 + 10).map((a) => [a.user, a.key])).toEqual([["kid", "fammed:L1:a:2026-11-20"]]);
    expect(planViewerMedAlerts(links, items, new Set(["a"]), "2026-11-20", 9 * 60 + 10)).toEqual([]);
    expect(planViewerMedAlerts(links, items, new Set(), "2026-11-20", 8 * 60 + 50)).toEqual([]);
    expect(planViewerMedAlerts(links, items, new Set(), "2026-11-20", 10 * 60)).toEqual([]);
  });
  it("이름과 시각만 — 복용 안내 없음, 가족 하루 보기로", () => {
    const [a] = planViewerMedAlerts(links, items, new Set(), "2026-11-20", 9 * 60 + 30);
    expect(a.payload.body).toBe("엄마 · 아침 약 체크가 아직이에요");
    expect(a.payload.body).not.toMatch(/복용|용량|식후|식전/);
    expect(a.payload.url).toBe("/diary?who=L1");
  });
});
