import { describe, expect, it } from "vitest";
import { tagRule } from "@/lib/community-tags";

const base = { self: false, exists: true, blocked: false, muted: false, allow: "all" as const, review: "auto" as const, followsTagger: false };

describe("사람 태그 규칙", () => {
  it("서로 팔로우하지 않아도 누구나 태그할 수 있다 (기본)", () => {
    expect(tagRule(base)).toEqual({ ok: true, status: "shown" });
  });
  it("승인한 것만 보이기면 기다림(pending)", () => {
    expect(tagRule({ ...base, review: "manual" })).toEqual({ ok: true, status: "pending" });
  });
  it("내가 팔로우한 사람만 — 받는 사람이 태그한 사람을 팔로우해야", () => {
    expect(tagRule({ ...base, allow: "following" })).toEqual({ ok: false });
    expect(tagRule({ ...base, allow: "following", followsTagger: true })).toEqual({ ok: true, status: "shown" });
  });
  it("아무도 · 받지 않기 · 차단 · 나 자신 · 없는 사람은 태그할 수 없다", () => {
    for (const x of [{ allow: "none" as const }, { muted: true }, { blocked: true }, { self: true }, { exists: false }]) {
      expect(tagRule({ ...base, ...x })).toEqual({ ok: false });
    }
  });
});
