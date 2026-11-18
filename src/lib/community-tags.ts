/**
 * 사람 태그 · 원본 출처 — 서버 전용 (규칙 함수 tagRule 은 시험에서도 쓴다)
 *   · 서로 팔로우하지 않아도 태그할 수 있다(인플루언서 포함) — 받는 사람의 설정 안에서만
 *       tag_allow: all(누구나) · following(받는 사람이 팔로우한 사람만) · none(아무도)
 *       tag_review: auto(바로 보임) · manual(받는 사람이 승인해야 보임 — pending)
 *       '이 사람 태그 받지 않기'(community_tag_mutes) · 어느 쪽이든 차단했으면 태그할 수 없다
 *   · 태그할 수 없는 이유는 쓰는 사람에게 하나로만 알린다('태그를 받지 않는 사람이에요') — 받지 않기·차단을 드러내지 않는다
 *   · 원본 출처: 따라 한 글이 가리키는 원래 글. 원본 글쓴이에게 소식이 간다(태그 받지 않기면 가지 않음)
 *   · 리그램(내 글을 스토리에 올림)도 소식으로 — lib/community-regram
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export const TAG_MAX = 10;
export type TagAllow = "all" | "following" | "none";
export type TagReview = "auto" | "manual";
export const isTagAllow = (v: unknown): v is TagAllow => v === "all" || v === "following" || v === "none";
export const isTagReview = (v: unknown): v is TagReview => v === "auto" || v === "manual";
export const ACTOR_RE = /^[A-Za-z0-9_-]{3,64}$/;
export const CANT_TAG = "태그를 받지 않는 사람이에요";

/** 이 사람이 나를 태그할 수 있나 — 결과는 보일 상태(shown·pending) 또는 못 함 */
export function tagRule(x: {
  self: boolean; exists: boolean; blocked: boolean; muted: boolean; allow: TagAllow; review: TagReview; followsTagger: boolean;
}): { ok: true; status: "shown" | "pending" } | { ok: false } {
  if (x.self || !x.exists || x.blocked || x.muted) return { ok: false };
  if (x.allow === "none") return { ok: false };
  if (x.allow === "following" && !x.followsTagger) return { ok: false };
  return { ok: true, status: x.review === "manual" ? "pending" : "shown" };
}

type Profile = { actor_id: string; nickname: string; tag_allow: string | null; tag_review: string | null };

/** 태그 후보들을 한 번에 판단 — tagger 가 ids 를 태그할 때 */
export async function judgeTags(sb: Sb, tagger: string, ids: string[]) {
  const want = [...new Set(ids.filter((i) => ACTOR_RE.test(i)))].slice(0, 40);
  if (!want.length) return new Map<string, { nickname: string | null; rule: ReturnType<typeof tagRule> }>();
  const [{ data: profs, error: pErr }, { data: blocks, error: bErr }, { data: mutes, error: mErr }, { data: follows, error: fErr }] = await Promise.all([
    sb.from("community_profiles").select("actor_id, nickname, tag_allow, tag_review").in("actor_id", want),
    sb.from("community_blocks").select("blocker_id, blocked_id")
      .or(`and(blocker_id.eq.${tagger},blocked_id.in.(${want.join(",")})),and(blocked_id.eq.${tagger},blocker_id.in.(${want.join(",")}))`),
    sb.from("community_tag_mutes").select("actor_id").eq("muted_id", tagger).in("actor_id", want),
    sb.from("community_follows").select("follower_id").eq("following_id", tagger).in("follower_id", want),
  ]);
  for (const e of [pErr, bErr, mErr, fErr]) if (e) throw new Error(e.message);
  const prof = new Map(((profs || []) as Profile[]).map((p) => [p.actor_id, p]));
  const blocked = new Set(((blocks || []) as { blocker_id: string; blocked_id: string }[]).map((b) => (b.blocker_id === tagger ? b.blocked_id : b.blocker_id)));
  const muted = new Set(((mutes || []) as { actor_id: string }[]).map((m) => m.actor_id));
  const followsMe = new Set(((follows || []) as { follower_id: string }[]).map((f) => f.follower_id));
  const out = new Map<string, { nickname: string | null; rule: ReturnType<typeof tagRule> }>();
  for (const id of want) {
    const p = prof.get(id);
    out.set(id, {
      nickname: p?.nickname ?? null,
      rule: tagRule({
        self: id === tagger, exists: !!p, blocked: blocked.has(id), muted: muted.has(id),
        allow: isTagAllow(p?.tag_allow) ? p!.tag_allow as TagAllow : "all", review: isTagReview(p?.tag_review) ? p!.tag_review as TagReview : "auto",
        followsTagger: followsMe.has(id),
      }),
    });
  }
  return out;
}

export type PersonTag = { id: string; nickname: string };
export type SourceView = { id: string; nickname: string | null; gone: boolean };

/** 글마다 보이는 태그(shown) 와 원본 출처 — 보는 사람이 차단한 사람은 빼고, 원본이 가려졌으면 gone */
export async function tagsAndSources(sb: Sb, posts: { id: string; source_post_id?: string | null }[], blocked: Set<string>) {
  const ids = posts.map((p) => p.id);
  const srcIds = [...new Set(posts.map((p) => p.source_post_id).filter((s): s is string => !!s))];
  const people = new Map<string, PersonTag[]>();
  const sources = new Map<string, SourceView>();
  if (!ids.length) return { people, sources };
  const [{ data: tags, error: tErr }, srcRes] = await Promise.all([
    sb.from("community_post_people").select("post_id, tagged_id, created_at").in("post_id", ids).eq("status", "shown").order("created_at", { ascending: true }).limit(ids.length * TAG_MAX),
    srcIds.length ? sb.from("community_feed").select("id, user_id, author_nickname, is_active, hidden_by_reports").in("id", srcIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (tErr) throw new Error(tErr.message);
  if (srcRes.error) throw new Error(srcRes.error.message);
  const tagRows = ((tags || []) as { post_id: string; tagged_id: string }[]).filter((t) => !blocked.has(t.tagged_id));
  const who = [...new Set(tagRows.map((t) => t.tagged_id))];
  const names = new Map<string, string>();
  if (who.length) {
    const { data: profs, error } = await sb.from("community_profiles").select("actor_id, nickname").in("actor_id", who);
    if (error) throw new Error(error.message);
    for (const p of (profs || []) as { actor_id: string; nickname: string }[]) names.set(p.actor_id, p.nickname);
  }
  for (const t of tagRows) {
    const n = names.get(t.tagged_id);
    if (!n) continue;
    const list = people.get(t.post_id) || [];
    list.push({ id: t.tagged_id, nickname: n });
    people.set(t.post_id, list);
  }
  for (const s of (srcRes.data || []) as { id: string; user_id: string; author_nickname: string | null; is_active: boolean; hidden_by_reports: boolean }[]) {
    const gone = !s.is_active || s.hidden_by_reports || blocked.has(s.user_id);
    sources.set(s.id, { id: s.id, nickname: gone ? null : s.author_nickname, gone });
  }
  for (const id of srcIds) if (!sources.has(id)) sources.set(id, { id, nickname: null, gone: true });
  return { people, sources };
}

/** 내 소식 — 나를 태그함(바로 보임·승인 기다림) · 내 글을 따라 한 글. 차단·받지 않기 한 사람 것은 뺀다 */
export type TagNotification = {
  id: string; type: "tag" | "tag_pending" | "source" | "regram"; at: string; who: string; post_id: string; post_excerpt?: string; url?: string;
};
export async function tagNotifications(sb: Sb, actor: string, blocked: Set<string>): Promise<TagNotification[]> {
  const since = new Date(Date.now() - 30 * 86400e3).toISOString();
  const [{ data: tags, error: tErr }, { data: mutes, error: mErr }, { data: mine, error: pErr }] = await Promise.all([
    sb.from("community_post_people").select("id, post_id, tagger_id, status, created_at").eq("tagged_id", actor).in("status", ["shown", "pending"])
      .gte("created_at", since).order("created_at", { ascending: false }).limit(30),
    sb.from("community_tag_mutes").select("muted_id").eq("actor_id", actor),
    sb.from("community_feed").select("id").eq("user_id", actor).eq("is_active", true).order("created_at", { ascending: false }).limit(200),
  ]);
  for (const e of [tErr, mErr, pErr]) if (e) throw new Error(e.message);
  const muted = new Set(((mutes || []) as { muted_id: string }[]).map((m) => m.muted_id));
  const myIds = ((mine || []) as { id: string }[]).map((p) => p.id);
  const { data: follows, error: sErr } = myIds.length
    ? await sb.from("community_feed").select("id, user_id, author_nickname, content, created_at").in("source_post_id", myIds).neq("user_id", actor)
        .eq("is_active", true).eq("hidden_by_reports", false).gte("created_at", since).order("created_at", { ascending: false }).limit(20)
    : { data: [], error: null };
  if (sErr) throw new Error(sErr.message);
  // 내 글을 스토리에 올린 사람 (리그램)
  const { data: regrams, error: rgErr } = myIds.length
    ? await sb.from("community_feed").select("id, user_id, author_nickname, regram_of, created_at").in("regram_of", myIds).neq("user_id", actor)
        .eq("is_active", true).gte("created_at", since).order("created_at", { ascending: false }).limit(20)
    : { data: [], error: null };
  if (rgErr) throw new Error(rgErr.message);

  const tagRows = ((tags || []) as { id: string; post_id: string; tagger_id: string; status: string; created_at: string }[])
    .filter((t) => !blocked.has(t.tagger_id) && !muted.has(t.tagger_id));
  const postIds = [...new Set(tagRows.map((t) => t.post_id))];
  const posts = new Map<string, { author_nickname: string | null; content: string | null; is_active: boolean; hidden_by_reports: boolean }>();
  if (postIds.length) {
    const { data, error } = await sb.from("community_feed").select("id, author_nickname, content, is_active, hidden_by_reports").in("id", postIds);
    if (error) throw new Error(error.message);
    for (const p of (data || []) as { id: string; author_nickname: string | null; content: string | null; is_active: boolean; hidden_by_reports: boolean }[]) posts.set(p.id, p);
  }
  const items: TagNotification[] = [];
  for (const t of tagRows) {
    const p = posts.get(t.post_id);
    if (!p || !p.is_active || p.hidden_by_reports) continue;
    items.push({
      id: `tag-${t.id}`, type: t.status === "pending" ? "tag_pending" : "tag", at: t.created_at, who: p.author_nickname || "누군가",
      post_id: t.post_id, post_excerpt: (p.content || "식단 공유").slice(0, 30), url: t.status === "pending" ? "/community/tags" : undefined,
    });
  }
  for (const f of (follows || []) as { id: string; user_id: string; author_nickname: string | null; content: string | null; created_at: string }[]) {
    if (blocked.has(f.user_id) || muted.has(f.user_id)) continue;
    items.push({ id: `src-${f.id}`, type: "source", at: f.created_at, who: f.author_nickname || "누군가", post_id: f.id, post_excerpt: (f.content || "식단 공유").slice(0, 30) });
  }
  for (const g of (regrams || []) as { id: string; user_id: string; author_nickname: string | null; regram_of: string; created_at: string }[]) {
    if (blocked.has(g.user_id)) continue;
    items.push({ id: `rg-${g.id}`, type: "regram", at: g.created_at, who: g.author_nickname || "누군가", post_id: g.regram_of, url: `/stories?at=regram-${g.id}` });
  }
  return items;
}
