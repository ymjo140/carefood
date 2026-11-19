/**
 * 글 공개 범위 — 서버에서만 쓴다.
 *  - public(전체): 누구나
 *  - followers(팔로워만): 글쓴이 · 글쓴이를 팔로우하는 사람 · 글에 태그된 사람(보이는 태그)
 * 인스타의 '전체 / 친한 친구'처럼 글마다 고른다. 팔로워만 글은 리그램·스토리 공유·공유 링크가 되지 않는다.
 *
 * 목록 API 는 visibleOr() 를 PostgREST .or() 에 넣어 거르고, 한 글을 여는 API 는 canSee() 로 판단한다.
 */

export type Visibility = "public" | "followers";
export const VISIBILITIES: Visibility[] = ["public", "followers"];
export const VISIBILITY_LABEL: Record<Visibility, string> = { public: "전체 공개", followers: "팔로워만" };
export const isVisibility = (v: unknown): v is Visibility => v === "public" || v === "followers";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 보는 사람이 팔로우하는 사람들 + 태그된 글 — 팔로워만 글을 볼 수 있는 근거 */
export type Audience = { viewer: string | null; following: Set<string>; tagged: Set<string> };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function audienceOf(sb: any, viewer: string | null): Promise<Audience> {
  if (!viewer) return { viewer: null, following: new Set(), tagged: new Set() };
  const [f, t] = await Promise.all([
    sb.from("community_follows").select("following_id").eq("follower_id", viewer).limit(2000),
    sb.from("community_post_people").select("post_id").eq("tagged_id", viewer).eq("status", "shown").order("created_at", { ascending: false }).limit(300),
  ]);
  if (f.error) throw new Error(f.error.message);
  if (t.error) throw new Error(t.error.message);
  return {
    viewer,
    following: new Set<string>((f.data || []).map((r: { following_id: string }) => r.following_id)),
    tagged: new Set<string>((t.data || []).map((r: { post_id: string }) => r.post_id)),
  };
}

/** 한 글을 볼 수 있는지 */
export function canSee(post: { id: string; user_id: string; visibility?: string | null }, a: Audience): boolean {
  if ((post.visibility || "public") === "public") return true;
  if (!a.viewer) return false;
  return post.user_id === a.viewer || a.following.has(post.user_id) || a.tagged.has(post.id);
}

/** 목록 거르기 — query.or(visibleOr(a)) */
export function visibleOr(a: Audience): string {
  const parts = ["visibility.eq.public"];
  if (a.viewer) {
    const authors = [a.viewer, ...a.following].filter((v) => ID_RE.test(v));
    if (authors.length) parts.push(`user_id.in.(${authors.join(",")})`);
    const posts = [...a.tagged].filter((v) => UUID_RE.test(v));
    if (posts.length) parts.push(`id.in.(${posts.join(",")})`);
  }
  return parts.join(",");
}
