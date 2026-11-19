/**
 * 리그램 · 같이 먹기 — 서버 전용 (원본 판단 regramBlock 은 시험에서도 쓴다)
 *   · 리그램: 다른 사람 글을 내 스토리에 올린다(사진·영상이 있는 글만). 원본 글쓴이가 허락(allow_regram)했을 때만,
 *     어느 쪽이든 차단했으면 안 된다. 리그램은 스토리 줄에만 — 원본을 읽어 보여 주고, 원본이 사라지면 함께 사라진다.
 *   · 같이 먹기 N번째: 사진이 붙은 글에서 두 사람이 서로를 태그(보임)한 횟수 — 그 글까지 센다. 지운 글은 세지 않는다.
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type Origin = {
  id: string; user_id: string; is_active: boolean; hidden_by_reports: boolean; image_urls: string[] | null; video_poster: string | null; regram_of?: string | null; visibility?: string | null;
};

/** 이 글을 이 사람이 스토리에 올릴 수 없는 이유 — 없으면 null */
export function regramBlock(o: Origin | null, x: { me: string; allow: boolean; blocked: boolean }): string | null {
  if (!o || !o.is_active || o.hidden_by_reports) return "볼 수 없는 글이에요";
  if (o.user_id === x.me) return "내 글은 스토리에 올릴 수 없어요. 인증 카드로 나눠 주세요";
  if (o.regram_of) return "스토리에 올린 글은 다시 올릴 수 없어요. 원본 글에서 올려 주세요";
  if ((o.visibility || "public") !== "public") return "팔로워에게만 보이는 글은 스토리에 올릴 수 없어요";
  if (!(o.image_urls || []).length && !o.video_poster) return "사진이나 영상이 있는 글만 스토리에 올릴 수 있어요";
  if (x.blocked || !x.allow) return "스토리에 올릴 수 없는 글이에요";
  return null;
}

/** 두 사람이 서로 차단했는지 */
export async function blockedBetween(sb: Sb, a: string, b: string): Promise<boolean> {
  const { data, error } = await sb.from("community_blocks").select("blocker_id")
    .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`).limit(1);
  if (error) throw new Error(error.message);
  return !!data?.length;
}

/** 글쓴이들이 리그램을 허락했는지 (프로필이 없으면 기본 허락) */
export async function regramAllowed(sb: Sb, authors: string[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>(authors.map((a) => [a, true]));
  if (!authors.length) return out;
  const { data, error } = await sb.from("community_profiles").select("actor_id, allow_regram").in("actor_id", authors);
  if (error) throw new Error(error.message);
  for (const p of (data || []) as { actor_id: string; allow_regram: boolean | null }[]) out.set(p.actor_id, p.allow_regram !== false);
  return out;
}

/** 같이 먹기 N번째 — 사진이 붙은 글마다, 글쓴이와 처음 보이는 태그 한 사람 사이에서 이 글까지 몇 번째인지 */
export async function togetherCounts(
  sb: Sb,
  posts: { id: string; user_id: string; created_at: string; image_urls?: string[] | null; video_poster?: string | null }[],
  people: Map<string, { id: string; nickname: string }[]>,
): Promise<Map<string, { nickname: string; nth: number }>> {
  const out = new Map<string, { nickname: string; nth: number }>();
  const pairs = posts
    .filter((p) => ((p.image_urls || []).length > 0 || !!p.video_poster) && (people.get(p.id) || []).length > 0)
    .map((p) => ({ post: p, with: people.get(p.id)![0] }))
    .slice(0, 30);
  if (!pairs.length) return out;
  const ors = [...new Set(pairs.map(({ post, with: w }) => [post.user_id, w.id].sort().join("|")))].map((k) => {
    const [a, b] = k.split("|");
    return `and(tagger_id.eq.${a},tagged_id.eq.${b}),and(tagger_id.eq.${b},tagged_id.eq.${a})`;
  });
  const { data, error } = await sb.from("community_post_people")
    .select("tagger_id, tagged_id, created_at, community_feed!inner(is_active, image_urls, video_poster, created_at)")
    .eq("status", "shown").eq("community_feed.is_active", true).or(ors.join(",")).limit(2000);
  if (error) throw new Error(error.message);
  type Row = { tagger_id: string; tagged_id: string; community_feed: { image_urls: string[] | null; video_poster: string | null; created_at: string } };
  const rows = ((data || []) as Row[]).filter((r) => (r.community_feed.image_urls || []).length > 0 || !!r.community_feed.video_poster);
  for (const { post, with: w } of pairs) {
    const key = [post.user_id, w.id].sort().join("|");
    const nth = rows.filter((r) => [r.tagger_id, r.tagged_id].sort().join("|") === key && r.community_feed.created_at <= post.created_at).length;
    if (nth > 0) out.set(post.id, { nickname: w.nickname, nth });
  }
  return out;
}
