import { describe, expect, it } from "vitest";
import { regramBlock, type Origin } from "@/lib/community-regram";

const o: Origin = { id: "p1", user_id: "author", is_active: true, hidden_by_reports: false, image_urls: ["https://x/a.jpg"], video_poster: null, regram_of: null };
const ok = { me: "me", allow: true, blocked: false };

describe("리그램 — 내 스토리에 올리기", () => {
  it("사진이 있는 남의 글이고 글쓴이가 허락했으면 올릴 수 있다", () => {
    expect(regramBlock(o, ok)).toBeNull();
    expect(regramBlock({ ...o, image_urls: [], video_poster: "https://x/p.jpg" }, ok)).toBeNull();
  });
  it("지운 글·가려진 글·없는 글은 볼 수 없다", () => {
    expect(regramBlock(null, ok)).toBe("볼 수 없는 글이에요");
    expect(regramBlock({ ...o, is_active: false }, ok)).toBe("볼 수 없는 글이에요");
    expect(regramBlock({ ...o, hidden_by_reports: true }, ok)).toBe("볼 수 없는 글이에요");
  });
  it("내 글 · 리그램한 글 · 사진 없는 글은 올리지 않는다", () => {
    expect(regramBlock({ ...o, user_id: "me" }, ok)).toMatch(/내 글/);
    expect(regramBlock({ ...o, regram_of: "p0" }, ok)).toMatch(/원본 글에서/);
    expect(regramBlock({ ...o, image_urls: [] }, ok)).toMatch(/사진이나 영상/);
  });
  it("글쓴이가 허락을 껐거나 차단 관계면 이유를 하나로만", () => {
    expect(regramBlock(o, { ...ok, allow: false })).toBe("스토리에 올릴 수 없는 글이에요");
    expect(regramBlock(o, { ...ok, blocked: true })).toBe("스토리에 올릴 수 없는 글이에요");
  });
});
