import { viewerFilters } from "@/lib/community-safety";

/**
 * 내 소식 — 따로 저장하지 않고 커뮤니티 기록에서 만든다 (알림 화면 · 웹 푸시가 같이 쓴다)
 *   - 내 글에 남긴 답글 (다른 사람) · 내 답글에 달린 답글 · 내 글의 좋아요(글마다 묶음) · 나를 팔로우함
 *   - 공구: 내가 만든 공구에 온 질문 · 내 질문에 달린 답 · 내가 알림 받는 공구(만든 것 포함)가 목표 인원에 닿음 · 판매처에 요청함
 *   차단한 사람의 소식은 뺀다. 실패하면 throw.
 */
export type NotificationItem = {
  id: string; type: "comment" | "reply" | "like" | "follow" | "gb_question" | "gb_answer" | "gb_reached" | "gb_requested"; at: string; who: string;
  count?: number; text?: string; post_id?: string; post_excerpt?: string; user_id?: string;
  /** 글이 아닌 곳으로 가는 소식 (공구) */
  url?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildNotifications(sb: any, actor: string): Promise<NotificationItem[]> {
  const blocked = (await viewerFilters(sb, actor)).blocked;

  const { data: posts, error: pErr } = await sb.from("community_feed").select("id, content, meal_type, post_type")
    .eq("user_id", actor).eq("is_active", true).order("created_at", { ascending: false }).limit(200);
  if (pErr) throw new Error(pErr.message);
  const postIds = (posts || []).map((p: { id: string }) => p.id);
  const excerpt = new Map<string, string>(
    (posts || []).map((p: { id: string; content: string | null; post_type: string }) => [p.id, (p.content || (p.post_type === "meal" ? "식단 공유" : "글")).slice(0, 30)]),
  );

  const { data: myComments, error: mcErr } = await sb.from("community_feed_comments").select("id")
    .eq("user_id", actor).eq("is_active", true).order("created_at", { ascending: false }).limit(200);
  if (mcErr) throw new Error(mcErr.message);
  const myCommentIds = (myComments || []).map((c: { id: string }) => c.id);

  const [cRes, rRes, lRes, fRes] = await Promise.all([
    postIds.length
      ? sb.from("community_feed_comments").select("id, post_id, user_id, author_nickname, content, created_at")
          .in("post_id", postIds).neq("user_id", actor).eq("is_active", true).order("created_at", { ascending: false }).limit(30)
      : { data: [] },
    myCommentIds.length
      ? sb.from("community_feed_comments").select("id, post_id, user_id, author_nickname, content, created_at")
          .in("parent_id", myCommentIds).neq("user_id", actor).eq("is_active", true).order("created_at", { ascending: false }).limit(30)
      : { data: [] },
    postIds.length
      ? sb.from("community_feed_likes").select("post_id, user_id, created_at")
          .in("post_id", postIds).neq("user_id", actor).order("created_at", { ascending: false }).limit(200)
      : { data: [] },
    sb.from("community_follows").select("id, follower_id, created_at").eq("following_id", actor).order("created_at", { ascending: false }).limit(20),
  ]);
  for (const r of [cRes, rRes, lRes, fRes]) if (r.error) throw new Error(r.error.message);

  const items: NotificationItem[] = [];
  const seenComment = new Set<string>();
  for (const c of rRes.data || []) {
    if (blocked.has(c.user_id)) continue;
    seenComment.add(c.id);
    items.push({ id: `r-${c.id}`, type: "reply", at: c.created_at, who: c.author_nickname || "누군가", text: String(c.content || "").slice(0, 60), post_id: c.post_id });
  }
  for (const c of cRes.data || []) {
    if (blocked.has(c.user_id) || seenComment.has(c.id)) continue;
    items.push({ id: `c-${c.id}`, type: "comment", at: c.created_at, who: c.author_nickname || "누군가", text: String(c.content || "").slice(0, 60), post_id: c.post_id, post_excerpt: excerpt.get(c.post_id) });
  }
  // 좋아요는 글마다 하나로 묶는다 (가장 최근 시각 + 사람 수)
  const likeBy = new Map<string, { at: string; count: number }>();
  for (const l of lRes.data || []) {
    if (blocked.has(l.user_id)) continue;
    const cur = likeBy.get(l.post_id);
    if (cur) cur.count += 1; else likeBy.set(l.post_id, { at: l.created_at, count: 1 });
  }
  for (const [post_id, v] of likeBy) items.push({ id: `l-${post_id}-${v.count}`, type: "like", at: v.at, who: "", count: v.count, post_id, post_excerpt: excerpt.get(post_id) });

  // 팔로우한 사람 이름 — 그 사람이 마지막으로 쓴 글·댓글의 이름
  const followers = (fRes.data || []) as { id: string; follower_id: string; created_at: string }[];
  const names = new Map<string, string>();
  if (followers.length) {
    const ids = followers.map((f) => f.follower_id);
    const [fp, fc] = await Promise.all([
      sb.from("community_feed").select("user_id, author_nickname, created_at").in("user_id", ids).order("created_at", { ascending: false }).limit(100),
      sb.from("community_feed_comments").select("user_id, author_nickname, created_at").in("user_id", ids).order("created_at", { ascending: false }).limit(100),
    ]);
    for (const r of [...(fp.data || []), ...(fc.data || [])]) if (r.author_nickname && !names.has(r.user_id)) names.set(r.user_id, r.author_nickname);
  }
  for (const f of followers.filter((x) => !blocked.has(x.follower_id))) items.push({ id: `f-${f.id}`, type: "follow", at: f.created_at, who: names.get(f.follower_id) || "누군가", user_id: names.has(f.follower_id) ? f.follower_id : undefined });

  items.push(...(await groupBuyNotifications(sb, actor, blocked)));

  items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return items;
}

/** 공구 소식 — 최근 30일. 차단한 사람의 질문·답은 뺀다 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function groupBuyNotifications(sb: any, actor: string, blocked: Set<string>): Promise<NotificationItem[]> {
  const since = new Date(Date.now() - 30 * 86400e3).toISOString();
  const [hosted, joined, myQ] = await Promise.all([
    sb.from("group_buys").select("id, product_name").eq("creator_id", actor).gte("created_at", new Date(Date.now() - 90 * 86400e3).toISOString()).limit(50),
    sb.from("group_buy_participants").select("group_buy_id").eq("user_id", actor).limit(200),
    sb.from("group_buy_comments").select("id").eq("user_id", actor).is("parent_id", null).eq("is_active", true).gte("created_at", since).limit(100),
  ]);
  for (const r of [hosted, joined, myQ]) if (r.error) throw new Error(r.error.message);
  const hostedIds = ((hosted.data || []) as { id: string }[]).map((g) => g.id);
  const joinedIds = ((joined.data || []) as { group_buy_id: string }[]).map((p) => p.group_buy_id);
  const myQIds = ((myQ.data || []) as { id: string }[]).map((c) => c.id);

  const [qs, ans, reached] = await Promise.all([
    hostedIds.length
      ? sb.from("group_buy_comments").select("id, group_buy_id, user_id, author_nickname, content, created_at")
          .in("group_buy_id", hostedIds).is("parent_id", null).neq("user_id", actor).eq("is_active", true).gte("created_at", since)
          .order("created_at", { ascending: false }).limit(30)
      : { data: [] },
    myQIds.length
      ? sb.from("group_buy_comments").select("id, group_buy_id, user_id, author_nickname, content, created_at")
          .in("parent_id", myQIds).neq("user_id", actor).eq("is_active", true).order("created_at", { ascending: false }).limit(30)
      : { data: [] },
    joinedIds.length
      ? sb.from("group_buys").select("id, product_name, target_count, reached_at, requested_at").in("id", joinedIds.slice(0, 200)).gte("reached_at", since)
      : { data: [] },
  ]);
  for (const r of [qs, ans, reached]) if (r.error) throw new Error(r.error.message);

  // 공구 이름 (질문·답에 붙일)
  const gbIds = [...new Set([...(qs.data || []), ...(ans.data || [])].map((c: { group_buy_id: string }) => c.group_buy_id))];
  const names = new Map<string, string>(((hosted.data || []) as { id: string; product_name: string }[]).map((g) => [g.id, g.product_name]));
  const missing = gbIds.filter((id) => !names.has(id));
  if (missing.length) {
    const { data, error } = await sb.from("group_buys").select("id, product_name").in("id", missing);
    if (error) throw new Error(error.message);
    for (const g of (data || []) as { id: string; product_name: string }[]) names.set(g.id, g.product_name);
  }

  type C = { id: string; group_buy_id: string; user_id: string; author_nickname: string | null; content: string; created_at: string };
  const out: NotificationItem[] = [];
  for (const c of (qs.data || []) as C[]) {
    if (blocked.has(c.user_id)) continue;
    out.push({ id: `gq-${c.id}`, type: "gb_question", at: c.created_at, who: c.author_nickname || "누군가", text: c.content.slice(0, 60), post_excerpt: names.get(c.group_buy_id), url: `/group-buy/${c.group_buy_id}` });
  }
  for (const c of (ans.data || []) as C[]) {
    if (blocked.has(c.user_id)) continue;
    out.push({ id: `ga-${c.id}`, type: "gb_answer", at: c.created_at, who: c.author_nickname || "누군가", text: c.content.slice(0, 60), post_excerpt: names.get(c.group_buy_id), url: `/group-buy/${c.group_buy_id}` });
  }
  for (const g of (reached.data || []) as { id: string; product_name: string; target_count: number; reached_at: string; requested_at: string | null }[]) {
    out.push({ id: `gr-${g.id}`, type: "gb_reached", at: g.reached_at, who: "", count: g.target_count, post_excerpt: g.product_name, url: `/group-buy/${g.id}` });
    if (g.requested_at) out.push({ id: `gq2-${g.id}`, type: "gb_requested", at: g.requested_at, who: "", post_excerpt: g.product_name, url: `/group-buy/${g.id}` });
  }
  return out;
}

/**
 * 업체 광고(고객층 발송) — 알림함에만 더한다. 커뮤니티 웹 푸시(buildNotifications)와 섞지 않는다.
 * 받은 것만(비교용 제외), 최근 30일. 표가 없으면(마이그레이션 전) 빈 목록.
 */
export type AdNotification = { id: string; type: "ad"; at: string; who: string; text: string; url: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function adNotifications(sb: any, actor: string): Promise<AdNotification[]> {
  const { data, error } = await sb.from("campaign_recipients")
    .select("campaign_id, sent_at, partner_campaigns(title, body, partners(name))")
    .eq("user_id", actor).eq("holdout", false).gte("sent_at", new Date(Date.now() - 30 * 86400e3).toISOString())
    .order("sent_at", { ascending: false }).limit(20);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || /does not exist|Could not find the table/i.test(error.message || "")) return [];
    throw new Error(error.message);
  }
  type Row = { campaign_id: string; sent_at: string; partner_campaigns: { title: string; body: string; partners: { name: string } | null } | null };
  return ((data || []) as Row[]).filter((r) => r.partner_campaigns).map((r) => ({
    id: `ad-${r.campaign_id}`, type: "ad" as const, at: r.sent_at,
    who: r.partner_campaigns!.partners?.name || "입점 업체",
    text: `${r.partner_campaigns!.title} — ${r.partner_campaigns!.body}`,
    url: `/c/${r.campaign_id}`,
  }));
}
