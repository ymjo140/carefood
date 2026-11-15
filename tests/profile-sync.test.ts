/** 이 기기 프로필 ↔ 서버 프로필 맞추기 (lib/profile-sync.ts) · 건강 목표로 추천 기준 정하기 (lib/chat-recs.ts) */
import { describe, expect, it } from "vitest";
import { cleanGoals, profileSyncAction } from "@/lib/profile-sync";
import { profileFocus } from "@/lib/chat-recs";

describe("프로필 맞추기", () => {
  const local = { goals: ["weight_loss", "diabetes"], saved_at: "2026-11-10T01:00:00.000Z" };
  it("이 기기에 온보딩 결과가 없으면 아무것도 안 한다", () => {
    expect(profileSyncAction(null, null, false)).toBe("none");
    expect(profileSyncAction({}, null, false)).toBe("none");
  });
  it("서버에 프로필이 없으면 통째로 올린다 (온보딩 때 쿠키가 없었던 경우)", () => {
    expect(profileSyncAction(local, null, false)).toBe("full");
  });
  it("서버 goals 가 비어 있으면(11/14 전 온보딩) 목표만 채운다", () => {
    expect(profileSyncAction({ goals: ["muscle"] }, { goals: null, updated_at: "2026-11-10T01:00:00.000Z" }, true)).toBe("fill_goals");
  });
  it("이 기기가 더 새것이면 통째로, 서버가 새것이거나 같으면 그대로", () => {
    expect(profileSyncAction(local, { goals: [], updated_at: "2026-11-09T00:00:00.000Z" }, true)).toBe("full");
    expect(profileSyncAction(local, { goals: ["balanced"], updated_at: "2026-11-12T00:00:00.000Z" }, true)).toBe("none");
    expect(profileSyncAction(local, { goals: ["weight_loss"], updated_at: local.saved_at }, true)).toBe("none");
  });
  it("모르는 목표는 버린다", () => {
    expect(cleanGoals(["weight_loss", "x", 3, "weight_loss", "kidney"])).toEqual(["weight_loss", "kidney"]);
  });
});

describe("건강 목표 → 추천 기준", () => {
  it("질환 체크가 먼저, 그다음 고른 목표, 식단 유형, 관심사", () => {
    expect(profileFocus({ goals: ["weight_loss"], conditions: ["diabetes"] })).toBe("sugar");
    expect(profileFocus({ goals: ["weight_loss"] })).toBe("light");
    expect(profileFocus({ goals: ["muscle"], diet_type: "diet" })).toBe("protein");
    expect(profileFocus({ goals: ["balanced"], diet_type: "exercise" })).toBe("protein");
    expect(profileFocus({ goals: ["skin"] })).toBeNull();
  });
});
