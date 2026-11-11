/**
 * 글의 좋아요·답글 수 — 서버에서만 쓴다.
 * +1/−1 로 올리고 내리면, 빠르게 두 번 누를 때(같은 사람 좋아요가 중복으로 거절돼도 +1 이 두 번)처럼
 * 실제 기록과 숫자가 어긋난다. 바뀔 때마다 실제 기록을 세어 그 수로 맞춘다.
 */
type Col = "like_count" | "comment_count";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncCount(sb: any, postId: string, col: Col): Promise<number> {
  const q = col === "like_count"
    ? sb.from("community_feed_likes").select("id", { count: "exact", head: true }).eq("post_id", postId)
    : sb.from("community_feed_comments").select("id", { count: "exact", head: true }).eq("post_id", postId).eq("is_active", true);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  const n = count || 0;
  const { error: uErr } = await sb.from("community_feed").update({ [col]: n }).eq("id", postId);
  if (uErr) throw new Error(uErr.message);
  return n;
}
