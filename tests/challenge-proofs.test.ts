/** 챌린지 사진 인증 (lib/challenge-proofs · lib/challenges runProgress) · 글 공개 범위 (lib/community-visibility) · 사진 지문 (lib/photo-meta) */
import { describe, expect, it } from "vitest";
import { dayEndMs, photoFitsDay, proofDayNow, PROOF_GRACE_MS } from "@/lib/challenge-proofs";
import { runProgress, type DiaryRow } from "@/lib/challenges";
import { canSee, visibleOr } from "@/lib/community-visibility";
import { cropBox, hamming } from "@/lib/photo-meta";

const kst = (s: string) => Date.parse(`${s}+09:00`);

describe("사진이 그날 인증이 되는지", () => {
  it("그날 올린 사진은 된다", () => {
    expect(photoFitsDay({ created_at: new Date(kst("2026-11-19T12:00:00")).toISOString(), taken_at: null }, "2026-11-19", kst("2026-11-19T12:01:00"))).toBeNull();
  });
  it("밤 12시 직전에 올린 사진은 0시 지나 10분 안 글까지 그날 것", () => {
    const up = { created_at: new Date(kst("2026-11-19T23:58:00")).toISOString(), taken_at: null };
    expect(photoFitsDay(up, "2026-11-19", kst("2026-11-20T00:09:00"))).toBeNull();
    expect(photoFitsDay(up, "2026-11-19", dayEndMs("2026-11-19") + PROOF_GRACE_MS)).toBe("late");
  });
  it("다음 날 올린 사진으로 어제를 인증할 수 없다 (늦은 인증 없음)", () => {
    const up = { created_at: new Date(kst("2026-11-20T00:01:00")).toISOString(), taken_at: null };
    expect(photoFitsDay(up, "2026-11-19", kst("2026-11-20T00:02:00"))).toBe("late");
  });
  it("찍은 시각이 다른 날이면 안 된다", () => {
    const up = { created_at: new Date(kst("2026-11-19T09:00:00")).toISOString(), taken_at: new Date(kst("2026-11-18T20:00:00")).toISOString() };
    expect(photoFitsDay(up, "2026-11-19", kst("2026-11-19T09:01:00"))).toBe("other_day");
  });
  it("인증 날짜로 고를 수 있는 날 — 0시 10분까지는 어제도", () => {
    expect(proofDayNow(kst("2026-11-20T00:05:00"))).toEqual(["2026-11-20", "2026-11-19"]);
    expect(proofDayNow(kst("2026-11-20T00:11:00"))).toEqual(["2026-11-20"]);
  });
});

describe("사진 인증 챌린지의 날짜 상태", () => {
  const D = "2026-11-16";
  const meal = (date: string, m: string): DiaryRow => ({ date, meal_type: m, calories: 500, protein_g: 25, sugar_g: 5, sodium_mg: 600 });
  const rows = ["2026-11-16", "2026-11-17", "2026-11-18"].flatMap((d) => [meal(d, "breakfast"), meal(d, "lunch"), meal(d, "dinner")]);
  it("기준을 채워도 사진이 없으면 photo_needed — 해낸 날로 세지 않는다", () => {
    const r = runProgress("meals_min", 3, 7, D, rows, "2026-11-18", { proofs: new Set(["2026-11-16"]) });
    expect(r.days.slice(0, 3).map((d) => d.state)).toEqual(["done", "photo_needed", "photo_needed"]);
    expect(r.done_count).toBe(1);
  });
  it("사진 인증이 없는 챌린지(proofs null)는 기록만으로", () => {
    const r = runProgress("meals_min", 3, 7, D, rows, "2026-11-18", { proofs: null });
    expect(r.done_count).toBe(3);
  });
  it("사진만 있고 기준을 못 채우면 못 한 날", () => {
    const r = runProgress("meals_min", 3, 7, D, [meal(D, "lunch")], "2026-11-17", { proofs: new Set([D]) });
    expect(r.days[0].state).toBe("missed");
  });
});

describe("글 공개 범위", () => {
  const post = { id: "11111111-1111-4111-8111-111111111111", user_id: "author", visibility: "followers" };
  const none = { viewer: null, following: new Set<string>(), tagged: new Set<string>() };
  it("전체 공개는 누구나", () => {
    expect(canSee({ ...post, visibility: "public" }, none)).toBe(true);
  });
  it("팔로워만은 글쓴이·팔로워·태그된 사람만", () => {
    expect(canSee(post, none)).toBe(false);
    expect(canSee(post, { viewer: "author", following: new Set(), tagged: new Set() })).toBe(true);
    expect(canSee(post, { viewer: "fan", following: new Set(["author"]), tagged: new Set() })).toBe(true);
    expect(canSee(post, { viewer: "friend", following: new Set(), tagged: new Set([post.id]) })).toBe(true);
    expect(canSee(post, { viewer: "stranger", following: new Set(), tagged: new Set() })).toBe(false);
  });
  it("목록 조건 — 이상한 id 는 넣지 않는다", () => {
    expect(visibleOr(none)).toBe("visibility.eq.public");
    expect(visibleOr({ viewer: "me", following: new Set(["a", "b,c"]), tagged: new Set(["x"]) })).toBe("visibility.eq.public,user_id.in.(me,a)");
  });
});

describe("사진 지문·자르기", () => {
  it("해시 거리", () => {
    expect(hamming("ffffffffffffffff", "ffffffffffffffff")).toBe(0);
    expect(hamming("ffffffffffffffff", "fffffffffffffffe")).toBe(1);
    expect(hamming("bad", "ffffffffffffffff")).toBe(64);
  });
  it("자르기 사각형 — 범위 밖·너무 작은 값은 자르지 않는다", () => {
    expect(cropBox({ x: 0, y: 0.1, w: 1, h: 0.8 }, 1000, 1250)).toEqual({ left: 0, top: 125, width: 1000, height: 1000 });
    expect(cropBox({ x: 0.5, y: 0, w: 0.6, h: 1 }, 1000, 1000)).toBeNull();
    expect(cropBox({ x: 0, y: 0, w: 0.01, h: 1 }, 1000, 1000)).toBeNull();
    expect(cropBox(null, 1000, 1000)).toBeNull();
  });
});

describe("작게 보기 사진 주소", () => {
  it("우리 저장소 webp 만 .t.webp 로 바꾸고, 다른 주소는 그대로", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    const { thumbOf, thumbPath } = await import("@/lib/community-images");
    const base = "https://x.supabase.co/storage/v1/object/public/community/a/202611/u.webp";
    expect(thumbOf(base)).toBe(base.replace(/\.webp$/, ".t.webp"));
    expect(thumbOf(base.replace(/\.webp$/, ".t.webp"))).toBe(base.replace(/\.webp$/, ".t.webp"));
    expect(thumbOf("https://other.com/a.webp")).toBe("https://other.com/a.webp");
    expect(thumbOf(null)).toBeNull();
    expect(thumbPath("a/202611/u.webp")).toBe("a/202611/u.t.webp");
  });
});
