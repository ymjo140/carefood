/**
 * 협업 — 수요에 맞는 제품을 알릴 사람을 커뮤니티에서 찾는다 (v3 10.5). 서버 전용.
 *  · 후보는 "협업 제안 받기"를 스스로 켠 사람뿐 (creator_profiles.is_open). 업체에 보이는 것: 닉네임 · 자기소개 · 고른 주제 ·
 *    최근 90일 글 수·받은 좋아요·답글·팔로워 수. 건강 목표·연락처·user_id 는 주지 않는다 (업체마다 다른 가명 번호로 고른다).
 *  · 제안 → 그 사람이 앱에서 받거나 거절 (조건부 update). 받으면 전용 코드가 생기고, 다른 사람이 쿠폰함에 그 코드를 넣으면
 *    업체 쿠폰을 받는다. 그 쿠폰으로 산 주문을 협업 판매로 센다.
 *  · 협업 중인 사람이 그 업체 제품을 붙여 쓴 글에는 맨 앞에 "협찬 · 업체"가 저절로 붙는다 (추천·보증 심사지침).
 */
import { createHash, randomBytes } from "node:crypto";
import { COUPON_COLS, couponText, type Coupon } from "./coupons";
import { checkClaimsWith } from "./claims";
import { loadClaimTerms } from "./claims-server";
import { COMMUNITY_TOPICS } from "@/lib/community-topics";
import { DEMO_USER_PREFIX } from "./demo-ids";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const DAY = 86400e3;
export const PROPOSALS_PER_WEEK = 30;

import { TOPIC_OF_SEGMENT } from "./collab-topics";
export { TOPIC_OF_SEGMENT };
export const CREATOR_TOPICS = COMMUNITY_TOPICS;

export const creatorCode = (partnerId: string, userId: string) =>
  createHash("sha256").update(`creator:${partnerId}:${userId}`).digest("hex").slice(0, 8).toUpperCase();

export type Candidate = {
  code: string; nickname: string; intro: string | null; topics: string[]; posts: number; likes: number; comments: number;
  followers: number; match: boolean; collab: string | null;
};

async function chunk<T>(ids: string[], q: (part: string[]) => Promise<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await q(ids.slice(i, i + 300));
    if (error) throw new Error(error.message);
    out.push(...(data || []));
  }
  return out;
}

/** 협업 제안을 받기로 한 사람들 — 고른 주제가 먼저, 그다음 반응이 많은 순 */
export async function listCandidates(sb: Sb, partnerId: string, topic: string | null, isDemo = false) {
  const { data: open, error } = await sb.from("creator_profiles").select("user_id, intro, topics").eq("is_open", true).limit(2000);
  if (error) throw new Error(error.message);
  // 예시 사람(demo-)은 테스트 업체에만 보인다
  const people = ((open || []) as { user_id: string; intro: string | null; topics: string[] }[]).filter((p) => isDemo || !p.user_id.startsWith(DEMO_USER_PREFIX));
  if (people.length === 0) return [];
  const ids = people.map((p) => p.user_id);
  const since = new Date(Date.now() - 90 * DAY).toISOString();
  const [names, posts, follows, collabs] = await Promise.all([
    chunk<{ actor_id: string; nickname: string }>(ids, (p) => sb.from("community_profiles").select("actor_id, nickname").in("actor_id", p)),
    chunk<{ user_id: string; like_count: number; comment_count: number; tags: string[] | null }>(ids, (p) =>
      sb.from("community_feed").select("user_id, like_count, comment_count, tags").in("user_id", p).gte("created_at", since).limit(20000)),
    chunk<{ following_id: string }>(ids, (p) => sb.from("community_follows").select("following_id").in("following_id", p).limit(50000)),
    sb.from("partner_collabs").select("user_id, status").eq("partner_id", partnerId).in("status", ["proposed", "accepted"]).limit(2000)
      .then((r: { data: { user_id: string; status: string }[] | null; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data || []; }),
  ]);
  const nick = new Map(names.map((n) => [n.actor_id, n.nickname]));
  const stat = new Map<string, { posts: number; likes: number; comments: number; tags: Map<string, number> }>();
  for (const p of posts) {
    const s = stat.get(p.user_id) || stat.set(p.user_id, { posts: 0, likes: 0, comments: 0, tags: new Map() }).get(p.user_id)!;
    s.posts++; s.likes += p.like_count || 0; s.comments += p.comment_count || 0;
    for (const t of p.tags || []) s.tags.set(t, (s.tags.get(t) || 0) + 1);
  }
  const fol = new Map<string, number>();
  for (const f of follows) fol.set(f.following_id, (fol.get(f.following_id) || 0) + 1);
  const coll = new Map<string, string>((collabs as { user_id: string; status: string }[]).map((c) => [c.user_id, c.status]));
  const out: Candidate[] = people.filter((p) => nick.has(p.user_id)).map((p) => {
    const s = stat.get(p.user_id) || { posts: 0, likes: 0, comments: 0, tags: new Map<string, number>() };
    // 고른 주제 + 글에 많이 단 주제
    const topics = [...new Set([...(p.topics || []), ...[...s.tags].sort((a, b) => b[1] - a[1]).map(([t]) => t)])].filter((t) => (CREATOR_TOPICS as readonly string[]).includes(t)).slice(0, 4);
    return {
      code: creatorCode(partnerId, p.user_id), nickname: nick.get(p.user_id)!, intro: p.intro, topics,
      posts: s.posts, likes: s.likes, comments: s.comments, followers: fol.get(p.user_id) || 0,
      match: !!topic && topics.includes(topic), collab: coll.get(p.user_id) || null,
    };
  });
  return out.sort((a, b) => Number(b.match) - Number(a.match) || (b.likes + b.comments * 2 + b.followers * 3) - (a.likes + a.comments * 2 + a.followers * 3)).slice(0, 100);
}

/** 가명 번호 → 사람 (협업 제안 받기를 켠 사람 중에서만) */
async function resolveCreator(sb: Sb, partnerId: string, code: string): Promise<string | null> {
  const { data, error } = await sb.from("creator_profiles").select("user_id").eq("is_open", true).limit(2000);
  if (error) throw new Error(error.message);
  const { data: pa, error: pErr } = await sb.from("partners").select("is_demo").eq("id", partnerId).single();
  if (pErr) throw new Error(pErr.message);
  return ((data || []) as { user_id: string }[]).filter((p) => pa.is_demo || !p.user_id.startsWith(DEMO_USER_PREFIX)).find((p) => creatorCode(partnerId, p.user_id) === code)?.user_id || null;
}

export type ProposeInput = { code: string; title: string; offer: string; product_name?: string | null; coupon_id?: string | null };

/** 제안 보내기 — 문구 점검(금지 표현), 일주일 30건까지, 같은 사람에게 답을 기다리는 제안은 하나 */
export async function propose(sb: Sb, partner: { id: string }, input: ProposeInput, userId: string): Promise<{ ok: true; id: string } | { ok: false; status: number; message: string }> {
  const title = input.title.trim(), offer = input.offer.trim(), product = (input.product_name || "").trim() || null;
  if (title.length < 2 || title.length > 30) return { ok: false, status: 400, message: "제목은 2~30자로 적어 주세요" };
  if (offer.length < 5 || offer.length > 300) return { ok: false, status: 400, message: "제안 내용은 5~300자로 적어 주세요 (보내는 제품·조건·대가)" };
  const hits = checkClaimsWith(await loadClaimTerms(sb), title, offer, product || "");
  if (hits.length) return { ok: false, status: 400, message: `쓸 수 없는 표현이 있어요: ${hits.map((h) => h.phrase).join(", ")}` };
  const { count, error: cErr } = await sb.from("partner_collabs").select("id", { count: "exact", head: true }).eq("partner_id", partner.id).gte("created_at", new Date(Date.now() - 7 * DAY).toISOString());
  if (cErr) throw new Error(cErr.message);
  if ((count || 0) >= PROPOSALS_PER_WEEK) return { ok: false, status: 429, message: `제안은 일주일에 ${PROPOSALS_PER_WEEK}건까지 보낼 수 있어요` };
  let coupon_id: string | null = null;
  if (input.coupon_id) {
    const { data, error } = await sb.from("partner_coupons").select("id").eq("id", input.coupon_id).eq("partner_id", partner.id).eq("status", "active").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { ok: false, status: 400, message: "쓸 수 있는 내 쿠폰이 아니에요" };
    coupon_id = data.id;
  }
  const user = await resolveCreator(sb, partner.id, input.code);
  if (!user) return { ok: false, status: 404, message: "그 사람은 지금 협업 제안을 받지 않아요" };
  const { data, error } = await sb.from("partner_collabs").insert({ partner_id: partner.id, user_id: user, title, offer, product_name: product, coupon_id, created_by: userId }).select("id").single();
  if (error) {
    if (error.code === "23505") return { ok: false, status: 409, message: "이미 이 사람에게 답을 기다리는 제안이 있어요" };
    throw new Error(error.message);
  }
  return { ok: true, id: data.id };
}

/** 업체 화면 — 보낸 제안과 협업 판매 (코드로 받은 쿠폰 수, 그 쿠폰으로 산 주문 수·상품 금액) */
export async function partnerCollabs(sb: Sb, partnerId: string) {
  const { data, error } = await sb.from("partner_collabs").select("id, user_id, title, offer, product_name, coupon_id, code, status, reply, created_at, decided_at, partner_coupons(name, kind, value, max_discount, min_order)")
    .eq("partner_id", partnerId).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  type R = { id: string; user_id: string; title: string; offer: string; product_name: string | null; coupon_id: string | null; code: string | null; status: string; reply: string | null; created_at: string; decided_at: string | null; partner_coupons: Pick<Coupon, "name" | "kind" | "value" | "max_discount" | "min_order"> | null };
  const rows = (data || []) as R[];
  const ids = rows.map((r) => r.id);
  const grants = ids.length ? await chunk<{ collab_id: string; status: string; used_order_id: string | null }>(ids, (p) => sb.from("coupon_grants").select("collab_id, status, used_order_id").in("collab_id", p).limit(20000)) : [];
  const orderIds = [...new Set(grants.map((g) => g.used_order_id).filter((x): x is string => !!x))];
  const lines = orderIds.length ? await chunk<{ order_id: string; unit_price: number | null; quantity: number | null; fulfil_status: string }>(orderIds, (p) =>
    sb.from("order_items").select("order_id, unit_price, quantity, fulfil_status").eq("partner_id", partnerId).in("order_id", p)) : [];
  const amount = new Map<string, number>();
  for (const l of lines) if (l.fulfil_status !== "canceled") amount.set(l.order_id, (amount.get(l.order_id) || 0) + (l.unit_price || 0) * (l.quantity || 1));
  const names = await chunk<{ actor_id: string; nickname: string }>([...new Set(rows.map((r) => r.user_id))], (p) => sb.from("community_profiles").select("actor_id, nickname").in("actor_id", p));
  const nick = new Map(names.map((n) => [n.actor_id, n.nickname]));
  return rows.map((r) => {
    const gs = grants.filter((g) => g.collab_id === r.id);
    const used = gs.filter((g) => g.status === "used" && g.used_order_id);
    return {
      id: r.id, nickname: nick.get(r.user_id) || "커뮤니티 사용자", title: r.title, offer: r.offer, product_name: r.product_name,
      coupon: r.partner_coupons ? `${r.partner_coupons.name} — ${couponText(r.partner_coupons)}` : null,
      code: r.status === "accepted" || r.status === "ended" ? r.code : null, status: r.status, reply: r.reply, created_at: r.created_at, decided_at: r.decided_at,
      redeemed: gs.length, orders: used.length, sales: used.reduce((s, g) => s + (amount.get(g.used_order_id!) || 0), 0),
    };
  });
}

/** 업체가 거둬들이기(답 전) · 끝내기(받은 뒤) */
export async function partnerCloseCollab(sb: Sb, partnerId: string, id: string, action: "cancel" | "end") {
  const [from, to] = action === "cancel" ? ["proposed", "canceled"] : ["accepted", "ended"];
  const { data, error } = await sb.from("partner_collabs").update({ status: to, ...(to === "ended" ? { ends_at: new Date().toISOString() } : { decided_at: new Date().toISOString() }) })
    .eq("id", id).eq("partner_id", partnerId).eq("status", from).select("id");
  if (error) throw new Error(error.message);
  return !!data?.length;
}

/** 사용자 — 내가 받은 제안 */
export async function myCollabs(sb: Sb, userId: string) {
  const { data, error } = await sb.from("partner_collabs").select("id, title, offer, product_name, code, status, reply, created_at, decided_at, partners(name), partner_coupons(name, kind, value, max_discount, min_order)")
    .eq("user_id", userId).neq("status", "canceled").order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  type R = { id: string; title: string; offer: string; product_name: string | null; code: string | null; status: string; reply: string | null; created_at: string; decided_at: string | null; partners: { name: string } | null; partner_coupons: Pick<Coupon, "name" | "kind" | "value" | "max_discount" | "min_order"> | null };
  return ((data || []) as R[]).map((r) => ({
    id: r.id, partner: r.partners?.name || "입점 업체", title: r.title, offer: r.offer, product_name: r.product_name, code: r.code, status: r.status, reply: r.reply,
    created_at: r.created_at, coupon: r.partner_coupons ? `${r.partner_coupons.name} — ${couponText(r.partner_coupons)}` : null,
  }));
}

/** 사용자 — 받기·거절 (답을 기다리는 것만). 받으면 전용 코드를 만든다 */
export async function answerCollab(sb: Sb, userId: string, id: string, accept: boolean, reply: string) {
  const patch: Record<string, unknown> = { status: accept ? "accepted" : "declined", decided_at: new Date().toISOString(), reply: reply.slice(0, 200) || null };
  for (let i = 0; i < 5; i++) {
    if (accept) patch.code = `CF${randomBytes(4).toString("hex").toUpperCase().slice(0, 6)}`;
    const { data, error } = await sb.from("partner_collabs").update(patch).eq("id", id).eq("user_id", userId).eq("status", "proposed").select("id, code");
    if (error) { if (error.code === "23505" && accept) continue; throw new Error(error.message); }
    return data?.[0] ? { ok: true as const, code: data[0].code as string | null } : { ok: false as const };
  }
  throw new Error("코드를 만들지 못했어요");
}

/** 사용자 — 협업 코드 넣기 → 그 업체 쿠폰 받기 (자기 코드는 못 쓴다, 같은 쿠폰을 이미 가졌으면 그대로) */
export async function redeemCode(sb: Sb, userId: string, raw: string) {
  const code = raw.trim().toUpperCase();
  if (!/^CF[0-9A-F]{6}$/.test(code)) return { ok: false as const, message: "코드를 다시 확인해 주세요 (CF로 시작하는 8자리)" };
  const { data: c, error } = await sb.from("partner_collabs").select(`id, user_id, partner_id, status, partners(name), partner_coupons(${COUPON_COLS})`).eq("code", code).maybeSingle();
  if (error) throw new Error(error.message);
  if (!c || c.status !== "accepted") return { ok: false as const, message: "지금 쓸 수 있는 코드가 아니에요" };
  if (c.user_id === userId) return { ok: false as const, message: "내 협업 코드는 내가 쓸 수 없어요" };
  const coupon = c.partner_coupons as Coupon | null;
  if (!coupon) return { ok: false as const, message: "이 코드로 받을 쿠폰이 없어요" };
  if (coupon.status !== "active") return { ok: false as const, message: "이 코드에 걸린 쿠폰이 끝났어요" };
  const now = Date.now();
  const { data: have, error: hErr } = await sb.from("coupon_grants").select("id").eq("coupon_id", coupon.id).eq("user_id", userId).eq("status", "active").gt("expires_at", new Date(now).toISOString()).limit(1);
  if (hErr) throw new Error(hErr.message);
  if (have?.length) return { ok: true as const, partner: c.partners?.name || "입점 업체", name: coupon.name, already: true };
  const { error: xErr } = await sb.from("coupon_grants").update({ status: "revoked" }).eq("coupon_id", coupon.id).eq("user_id", userId).eq("status", "active").lte("expires_at", new Date(now).toISOString());
  if (xErr) throw new Error(xErr.message);
  const { error: iErr } = await sb.from("coupon_grants").insert({
    coupon_id: coupon.id, partner_id: c.partner_id, user_id: userId, source: "influencer", collab_id: c.id,
    expires_at: new Date(now + coupon.valid_days * DAY).toISOString(), notified: false,
  });
  if (iErr && iErr.code !== "23505") throw new Error(iErr.message);
  return { ok: true as const, partner: c.partners?.name || "입점 업체", name: coupon.name, already: !!iErr };
}

/** 글 쓸 때 — 협업 중인 업체의 제품을 붙였으면 협찬 표시 값 */
export async function sponsorFor(sb: Sb, userId: string, productIds: string[]) {
  if (productIds.length === 0) return null;
  const { data: cs, error } = await sb.from("partner_collabs").select("id, partner_id, partners(name)").eq("user_id", userId).eq("status", "accepted").limit(50);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return null;
    throw new Error(error.message);
  }
  if (!cs?.length) return null;
  const { data: offers, error: oErr } = await sb.from("partner_items").select("partner_id").in("product_id", productIds).in("partner_id", cs.map((c: { partner_id: string }) => c.partner_id)).limit(10);
  if (oErr) throw new Error(oErr.message);
  const hit = cs.find((c: { partner_id: string }) => (offers || []).some((o: { partner_id: string }) => o.partner_id === c.partner_id));
  return hit ? { partner_id: hit.partner_id, partner_name: hit.partners?.name || "입점 업체", collab_id: hit.id } : null;
}

/** 알림함 — 답을 기다리는 협업 제안 (30일) */
export async function collabNotifications(sb: Sb, actor: string) {
  const { data, error } = await sb.from("partner_collabs").select("id, title, created_at, partners(name)").eq("user_id", actor).eq("status", "proposed")
    .gte("created_at", new Date(Date.now() - 30 * DAY).toISOString()).order("created_at", { ascending: false }).limit(10);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || /does not exist|Could not find the table/i.test(error.message || "")) return [];
    throw new Error(error.message);
  }
  type R = { id: string; title: string; created_at: string; partners: { name: string } | null };
  return ((data || []) as R[]).map((r) => ({ id: `collab-${r.id}`, type: "collab" as const, at: r.created_at, who: r.partners?.name || "입점 업체", text: `협업을 제안했어요 — ${r.title}`, url: "/me/collab" }));
}
