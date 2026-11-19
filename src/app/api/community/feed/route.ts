import { NextRequest, NextResponse } from "next/server";
import { cardFor, cardIdOk, certOf } from "@/lib/share-card-server";
import { sponsorFor } from "@/lib/partner/collabs";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { isTopic } from "@/lib/community-topics";
import { viewerFilters } from "@/lib/community-safety";
import { imagePrefix, removeImages } from "@/lib/community-images";
import { ownVideo, removeVideos } from "@/lib/community-video";
import { cleanPoll, withPolls } from "@/lib/community-poll";
import { rateLimit } from "@/lib/rate-limit";
import { ensureNickname } from "@/lib/community-profile";
import { ACTOR_RE, CANT_TAG, TAG_MAX, judgeTags, tagsAndSources } from "@/lib/community-tags";
import { togetherCounts } from "@/lib/community-regram";
import { userPusher } from "@/lib/push";
import { audienceOf, canSee, isVisibility, visibleOr } from "@/lib/community-visibility";
import { attachProofs, proofDayNow, type UploadRow } from "@/lib/challenge-proofs";
import { kstDay, todayKst } from "@/lib/day";


/**
 * GET /api/community/feed — 식단 피드
 *   ?tab=recommend(기본)|following|topic(&topic=모임 이름)|mine|user(&user_id=, &only=plan)|credits(&user_id=)   ?id= 글 하나
 *   credits: 그 사람 글을 따라 한 글(원본 출처) + 그 사람을 태그한 글(보이는 것) — 프로필 '따라 한 인증'
 *   리그램(regram_of)은 스토리 줄에만 — 목록에는 나오지 않는다
 *   together: 사진 글에서 두 사람이 서로 태그한 횟수 { nickname, nth } (같이 먹기 N번째)
 * POST /api/community/feed — 새 글 작성
 *
 * 작성자의 건강 관심사·목표·나이대는 응답에 넣지 않는다 (민감정보 — 예전 글에 남아 있어도 보이지 않게).
 * 글에 붙은 제품(product_ids)은 이름을 같이 돌려준다 → products: [{ id, name }]
 * 태그된 사람(보이는 것만) → people: [{ id, nickname }] · 원본 출처 → source: { id, nickname, gone } (lib/community-tags)
 * POST 는 people: [actor id] (10명까지, 받는 사람 설정 안에서만 — 못 한 사람은 dropped 로) · source_post_id 를 받는다
 *   upload_ids: /api/community/upload 가 돌려준 id (6장까지, 순서대로) · diary_ids: 연결할 식단 기록(영양값은 서버가 기록에서 복사)
 *   client_key: 같은 글을 두 번 보내도 하나만(다시 보내면 처음 글을 돌려준다) · visibility: public|followers · show_kcal
 *   challenge_ids: 이 글의 사진으로 인증할 챌린지 → proofs: { added, skipped } (lib/challenge-proofs)
 * 팔로워만(followers) 글은 글쓴이·팔로워·태그된 사람에게만 보인다 (lib/community-visibility)
 * 투표가 붙은 글은 poll 이 결과 모양 → { options, counts, total, my_choice, closes_at, closed }
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function publicPost({ author_concerns, author_goals, author_age_group, ...rest }: Record<string, any>) {
  void author_concerns; void author_goals; void author_age_group;
  return rest;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function productNames(sb: any, posts: { product_ids?: string[] | null }[]) {
  const ids = [...new Set(posts.flatMap((p) => p.product_ids || []))].slice(0, 200);
  if (!ids.length) return new Map<string, string>();
  const { data } = await sb.from("products").select("id, name").in("id", ids);
  return new Map<string, string>((data || []).map((p: { id: string; name: string }) => [p.id, p.name]));
}

/** 추천 탭이 줄 세우는 최근 글 수 */
const RECOMMEND_WINDOW = 300;

/** 추천 점수 — 반응(따라하기 3 · 좋아요 2 · 답글 1) + 1 을 글이 된 시간으로 나눈다. 반응이 없어도 새 글은 위로 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rankScore(p: any): number {
  const score = 1 + (p.like_count || 0) * 2 + (p.copy_count || 0) * 3 + (p.comment_count || 0);
  const ageH = (Date.now() - new Date(p.created_at).getTime()) / 3_600_000;
  return score / Math.max(1, Math.log2(ageH + 2));
}

export async function GET(request: NextRequest) {
  await connection();
  const { searchParams } = request.nextUrl;
  const userId = await getActorId();
  const postId = searchParams.get("id"); // 단일 게시글 조회

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  /* ── 단일 게시글 조회 모드 ── */
  if (postId) {
    const { data: post, error } = await sb
      .from("community_feed")
      .select("*")
      .eq("id", postId)
      .eq("is_active", true)
      .single();
    if (error || !post) return NextResponse.json({ error: "게시글 없음" }, { status: 404 });
    const isMine = !!userId && post.user_id === userId;
    let f: Awaited<ReturnType<typeof viewerFilters>>;
    try { f = await viewerFilters(sb, userId); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
    // 신고가 모여 가려진 글·차단한 사람의 글은 (글쓴이 본인 말고는) 열지 않는다
    if (!isMine) {
      if (post.hidden_by_reports) return NextResponse.json({ error: "신고가 모여 가려진 글이에요", reason: "reported" }, { status: 404 });
      if (f.blocked.has(post.user_id)) return NextResponse.json({ error: "차단한 사람의 글이에요", reason: "blocked" }, { status: 404 });
      let a;
      try { a = await audienceOf(sb, userId); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
      if (!canSee(post, a)) return NextResponse.json({ error: "팔로워에게만 보이는 글이에요", reason: "followers" }, { status: 404 });
    }

    let isLiked = false;
    let isFollowing = false;
    if (userId) {
      const [likeRes, followRes] = await Promise.all([
        sb.from("community_feed_likes").select("id").eq("post_id", postId).eq("user_id", userId).maybeSingle(),
        sb.from("community_follows").select("id").eq("follower_id", userId).eq("following_id", post.user_id).maybeSingle(),
      ]);
      isLiked = !!likeRes.data;
      isFollowing = !!followRes.data;
    }
    const names = await productNames(sb, [post]);
    const products = (post.product_ids || []).filter((id: string) => names.has(id)).map((id: string) => ({ id, name: names.get(id) }));
    let polled, ts, tg;
    try {
      [polled] = await withPolls(sb, [publicPost(post) as { id: string; poll?: unknown }], userId);
      ts = await tagsAndSources(sb, [post], f.blocked);
      tg = await togetherCounts(sb, [post], ts.people);
    } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
    return NextResponse.json({ post: {
      ...polled, products, is_mine: isMine, is_liked: isLiked, is_following: isFollowing,
      people: ts.people.get(post.id) || [], source: post.source_post_id ? ts.sources.get(post.source_post_id) ?? null : null,
      together: tg.get(post.id) ?? null,
    } });
  }

  /* ── 피드 목록 모드 ── */
  const tab = searchParams.get("tab") || "recommend";
  const topic = searchParams.get("topic");
  const page = Number(searchParams.get("page") || 1);
  const limit = 20;

  let query = sb
    .from("community_feed")
    .select("*", { count: "exact" })
    .eq("is_active", true)
    .is("regram_of", null);

  // 보는 사람 기준으로 거르기 — 신고로 가려진 글(내 글 보기 빼고), 차단한 사람의 글, 숨긴 글
  let filters: Awaited<ReturnType<typeof viewerFilters>>;
  try { filters = await viewerFilters(sb, userId); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  const safeIds = (set: Set<string>) => [...set].filter((v) => /^[A-Za-z0-9_-]{1,64}$/.test(v));
  if (tab !== "mine") {
    // 팔로워만 글 — 글쓴이·팔로워·태그된 사람에게만
    try { query = query.or(visibleOr(await audienceOf(sb, userId))); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
    query = query.eq("hidden_by_reports", false);
    const blocked = safeIds(filters.blocked);
    if (blocked.length) query = query.not("user_id", "in", `(${blocked.join(",")})`);
    const hidden = safeIds(filters.hidden);
    if (hidden.length) query = query.not("id", "in", `(${hidden.join(",")})`);
  }

  if (tab === "following" && userId) {
    // 팔로잉 탭: 팔로우한 사용자의 글만
    const { data: follows } = await sb
      .from("community_follows")
      .select("following_id")
      .eq("follower_id", userId);
    const followingIds = (follows || []).map((f: { following_id: string }) => f.following_id);
    if (followingIds.length > 0) {
      query = query.in("user_id", followingIds);
    } else {
      return NextResponse.json({ posts: [], total: 0, page, hasMore: false });
    }
    query = query.order("created_at", { ascending: false });
  } else if (tab === "topic" && isTopic(topic)) {
    // 모임 탭 — 글쓴이가 고른 모임
    query = query.contains("tags", [topic]);
    query = query.order("created_at", { ascending: false });
  } else if (tab === "credits") {
    // 프로필 '따라 한 인증' — 이 사람 글을 원본으로 단 글 + 이 사람을 태그한 글 (이 사람이 쓴 글은 빼고)
    const author = searchParams.get("user_id") || "";
    if (!ACTOR_RE.test(author) || filters.blocked.has(author)) return NextResponse.json({ posts: [], total: 0, page, hasMore: false });
    const [{ data: own, error: oErr }, { data: tagged, error: tErr }] = await Promise.all([
      sb.from("community_feed").select("id").eq("user_id", author).eq("is_active", true).is("regram_of", null).order("created_at", { ascending: false }).limit(300),
      sb.from("community_post_people").select("post_id").eq("tagged_id", author).eq("status", "shown").order("created_at", { ascending: false }).limit(300),
    ]);
    if (oErr || tErr) return NextResponse.json({ error: (oErr || tErr).message }, { status: 500 });
    const ownIds = ((own || []) as { id: string }[]).map((r) => r.id);
    const tagIds = ((tagged || []) as { post_id: string }[]).map((r) => r.post_id);
    const ors = [ownIds.length ? `source_post_id.in.(${ownIds.join(",")})` : "", tagIds.length ? `id.in.(${tagIds.join(",")})` : ""].filter(Boolean);
    if (!ors.length) return NextResponse.json({ posts: [], total: 0, page, hasMore: false });
    query = query.or(ors.join(",")).neq("user_id", author).order("created_at", { ascending: false });
  } else if (tab === "mine") {
    if (!userId) return NextResponse.json({ posts: [], total: 0, page, hasMore: false });
    query = query.eq("user_id", userId).order("created_at", { ascending: false });
  } else if (tab === "user") {
    // 작성자 프로필 — ?user_id= (&only=plan 이면 공유한 일주일 식단만)
    const author = searchParams.get("user_id") || "";
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(author) || filters.blocked.has(author)) return NextResponse.json({ posts: [], total: 0, page, hasMore: false });
    query = query.eq("user_id", author).order("created_at", { ascending: false });
    if (searchParams.get("only") === "plan") query = query.not("meal_data->plan", "is", null);
  } else {
    // 추천 탭: 최근 글 RECOMMEND_WINDOW 개를 모두 점수로 줄 세운 뒤 쪽을 나눈다
    //   (전에는 최신 20개를 받아 그 안에서만 다시 줄 세워, 2쪽의 더 인기 있는 글이 위로 못 왔다)
    query = query.order("created_at", { ascending: false });
  }

  const from = (page - 1) * limit;
  const recommend = !["following", "topic", "mine", "user", "credits"].includes(tab) || (tab === "topic" && !isTopic(topic));
  query = recommend ? query.range(0, RECOMMEND_WINDOW - 1) : query.range(from, from + limit - 1);

  const { data: fetched, count: fetchedCount, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let posts = fetched || [];
  let count = fetchedCount || 0;
  if (recommend) {
    const ranked = [...posts].sort((a, b) => rankScore(b) - rankScore(a));
    count = ranked.length;
    posts = ranked.slice(from, from + limit);
  }

  // 좋아요 상태 + 댓글 미리보기 병렬 로드
  const postIds = posts.map((p: { id: string }) => p.id);
  let likedIds = new Set<string>();
  let bookmarkedIds = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let commentMap: Record<string, any[]> = {};

  if (postIds.length > 0) {
    const promises: Promise<void>[] = [];

    // 좋아요
    if (userId) {
      promises.push(
        sb.from("community_feed_likes").select("post_id").eq("user_id", userId).in("post_id", postIds)
          .then(({ data }: { data: { post_id: string }[] | null }) => {
            likedIds = new Set((data || []).map(l => l.post_id));
          })
      );
      promises.push(
        sb.from("community_bookmarks").select("post_id").eq("user_id", userId).in("post_id", postIds)
          .then(({ data }: { data: { post_id: string }[] | null }) => {
            bookmarkedIds = new Set((data || []).map(b => b.post_id));
          })
      );
    }

    // 댓글 미리보기 (각 글당 최신 2개)
    promises.push(
      sb.from("community_feed_comments").select("id, post_id, user_id, author_nickname, content, created_at")
        .in("post_id", postIds).eq("is_active", true).eq("hidden_by_reports", false).order("created_at", { ascending: false }).limit(80)
        .then(({ data }: { data: { post_id: string; user_id: string }[] | null }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const map: Record<string, any[]> = {};
          for (const c of data || []) {
            if (filters.blocked.has(c.user_id)) continue;
            if (!map[c.post_id]) map[c.post_id] = [];
            if (map[c.post_id]!.length < 2) map[c.post_id]!.push(c);
          }
          commentMap = map;
        })
    );

    await Promise.all(promises);
  }

  // 추천탭: 인기도 기반 재정렬
  const names = await productNames(sb, posts);
  const result = posts.map((p: { id: string; user_id: string; product_ids?: string[] | null }) => ({
    ...publicPost(p),
    products: (p.product_ids || []).filter((id) => names.has(id)).map((id) => ({ id, name: names.get(id) })),
    is_mine: !!userId && p.user_id === userId,
    is_liked: likedIds.has(p.id),
    is_bookmarked: bookmarkedIds.has(p.id),
    preview_comments: commentMap[p.id] || [],
  }));

  let polled, ts, tg: Awaited<ReturnType<typeof togetherCounts>>;
  try {
    polled = await withPolls(sb, result, userId);
    ts = await tagsAndSources(sb, posts, filters.blocked);
    tg = await togetherCounts(sb, posts, ts.people);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  const withTags = polled.map((p: { id: string; source_post_id?: string | null }) => ({
    ...p, people: ts.people.get(p.id) || [], source: p.source_post_id ? ts.sources.get(p.source_post_id) ?? null : null,
    together: tg.get(p.id) ?? null,
  }));

  return NextResponse.json({
    posts: withTags,
    total: count,
    page,
    hasMore: from + limit < count,
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 글에 붙은 식단은 '따라하기'로 다른 사람의 식단 리스트에 그대로 복사된다 —
 * 아는 칸만 남기고, 링크는 https 만 받는다.
 */
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : undefined);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
function cleanCell(c: unknown) {
  if (!c || typeof c !== "object") return null;
  const o = c as Record<string, unknown>;
  const url = typeof o.url === "string" && /^https:\/\//.test(o.url) ? o.url.slice(0, 500) : null;
  return {
    product_id: typeof o.product_id === "string" && UUID.test(o.product_id) ? o.product_id : null,
    name: str(o.name, 80) ?? null,
    calories: num(o.calories), protein_g: num(o.protein_g), carbs_g: num(o.carbs_g), fat_g: num(o.fat_g), price: num(o.price),
    platform: str(o.platform, 20) ?? null,
    url,
    type: o.type === "eating_out" ? "eating_out" : "product",
    _foods: Array.isArray(o._foods) ? o._foods.slice(0, 20).map(cleanFood) : undefined,
  };
}
function cleanFood(f: unknown) {
  const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
  return { name: str(o.name, 80) ?? "음식", calories: num(o.calories), protein_g: num(o.protein_g), carbs_g: num(o.carbs_g), fat_g: num(o.fat_g) };
}
function cleanMealData(md: unknown) {
  if (!md || typeof md !== "object") return null;
  const o = md as Record<string, unknown>;
  const plan = o.plan as Record<string, unknown> | undefined;
  if (plan && typeof plan === "object") {
    const grid: Record<string, Record<string, unknown>> = {};
    const g = (plan.grid || {}) as Record<string, Record<string, unknown>>;
    for (const d of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) {
      grid[d] = {};
      for (const m of ["breakfast", "lunch", "dinner", "supplement"]) grid[d][m] = cleanCell(g?.[d]?.[m]);
    }
    const dayKcal = Array.isArray(plan.day_kcal) ? plan.day_kcal.slice(0, 7).map((v) => num(v) ?? null) : [];
    return { plan: { title: str(plan.title, 40) ?? "저장한 식단", grid, day_kcal: dayKcal, avg_kcal: num(plan.avg_kcal), avg_protein: num(plan.avg_protein), days: num(plan.days) } };
  }
  if (!Array.isArray(o.foods) || o.foods.length === 0) return null;
  const t = (o.total || {}) as Record<string, unknown>;
  return {
    foods: o.foods.slice(0, 30).map(cleanFood),
    total: { calories: num(t.calories) ?? 0, protein_g: num(t.protein_g) ?? 0, carbs_g: num(t.carbs_g) ?? 0, fat_g: num(t.fat_g) ?? 0 },
  };
}

const KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MEALS = ["breakfast", "lunch", "dinner", "snack"];

type DiaryPick = { id: string; date: string; meal_type: string; food_name: string; calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; image_url?: string | null };

/** 글에 붙인 식단 기록 → meal_data (숫자는 기록에서 — 보낸 숫자를 믿지 않는다) */
function mealFromDiary(rows: DiaryPick[]) {
  const r1 = (v: number | null) => Math.round((Number(v) || 0) * 10) / 10;
  const foods = rows.map((r) => ({ name: r.food_name.slice(0, 80), calories: r1(r.calories), protein_g: r1(r.protein_g), carbs_g: r1(r.carbs_g), fat_g: r1(r.fat_g) }));
  const sum = (k: "calories" | "protein_g" | "carbs_g" | "fat_g") => Math.round(foods.reduce((a, f) => a + (f[k] || 0), 0) * 10) / 10;
  return { foods, total: { calories: sum("calories"), protein_g: sum("protein_g"), carbs_g: sum("carbs_g"), fat_g: sum("fat_g") } };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function replayed(sb: any, user_id: string, client_key: string) {
  const { data, error } = await sb.from("community_feed").select("*").eq("user_id", user_id).eq("client_key", client_key).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { post_type, topic } = body;
    const user_id = await getActorId();
    if (!user_id) return noActor();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;
    // 다시 보낸 글 — 처음 올린 글을 그대로 돌려준다 (사진·인증을 두 번 붙이지 않는다)
    const client_key = typeof body.client_key === "string" && KEY_RE.test(body.client_key) ? body.client_key : null;
    if (client_key) {
      const prev = await replayed(sb, user_id, client_key);
      if (prev) {
        const [polled] = await withPolls(sb, [publicPost(prev) as { id: string; poll?: unknown }], user_id);
        return NextResponse.json({ post: { ...polled, people: [] }, replayed: true, dropped: [], dropped_reason: null, proofs: { added: [], skipped: [] } });
      }
    }

    const content = typeof body.content === "string" ? body.content.trim().slice(0, 1000) : "";
    if (body.meal_data && JSON.stringify(body.meal_data).length > 60_000) return NextResponse.json({ error: "식단이 너무 커요" }, { status: 400 });
    const visibility = isVisibility(body.visibility) ? body.visibility : "public";
    const show_kcal = body.show_kcal !== false;

    // 식단 기록 연결 — 내 기록만, 같은 날·같은 끼니만
    const diaryIds: string[] = Array.isArray(body.diary_ids) ? [...new Set(body.diary_ids.filter((v: unknown): v is string => typeof v === "string" && UUID.test(v)))].slice(0, 20) as string[] : [];
    let diary: DiaryPick[] = [];
    if (diaryIds.length) {
      const { data: d, error: dErr } = await sb.from("meal_diary").select("id, date, meal_type, food_name, calories, protein_g, carbs_g, fat_g, image_url").eq("user_id", user_id).in("id", diaryIds);
      if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });
      diary = ((d || []) as DiaryPick[]).sort((a, b) => diaryIds.indexOf(a.id) - diaryIds.indexOf(b.id));
      if (diary.length !== diaryIds.length) return NextResponse.json({ error: "내 식단 기록만 붙일 수 있어요" }, { status: 403 });
      if (new Set(diary.map((r) => `${r.date}:${r.meal_type}`)).size > 1) return NextResponse.json({ error: "한 끼니의 기록만 붙여 주세요" }, { status: 400 });
    }
    // 저장한 식단(plan)은 따라하기용 칸 그대로, 한 끼 음식은 기록에서만
    const sent = cleanMealData(body.meal_data);
    const meal_data = diary.length ? mealFromDiary(diary) : sent && "plan" in sent ? sent : null;
    const meal_type = diary[0]?.meal_type ?? (MEALS.includes(body.meal_type) ? body.meal_type : null);
    // 그 글의 날짜 — 기록이 있으면 기록 날짜, 아니면 보낸 날짜(오늘·0시 직후의 어제만), 없으면 오늘
    const now = Date.now();
    const day: string = diary[0]?.date ?? (typeof body.day === "string" && DAY_RE.test(body.day) && proofDayNow(now).includes(body.day) ? body.day : todayKst());

    // 사진 — upload_ids(새 글쓰기) 또는 image_urls(카드 그림 등 예전 방식). 내가 올린 것만
    const imgPrefix = imagePrefix();
    const okImg = (u: unknown): u is string => typeof u === "string" && u.startsWith(`${imgPrefix}${user_id}/`) && !u.includes("..") && u.length <= 400;
    const uploadIds: string[] = Array.isArray(body.upload_ids) ? [...new Set(body.upload_ids.filter((v: unknown): v is string => typeof v === "string" && UUID.test(v)))].slice(0, 6) as string[] : [];
    let uploads: (UploadRow & { width: number | null; height: number | null })[] = [];
    if (uploadIds.length) {
      const { data: u, error: uErr } = await sb.from("community_uploads").select("id, url, created_at, taken_at, phash, width, height, used_post_id").eq("user_id", user_id).in("id", uploadIds);
      if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
      const rows = (u || []) as (UploadRow & { width: number | null; height: number | null; used_post_id: string | null })[];
      if (rows.length !== uploadIds.length) return NextResponse.json({ error: "내가 올린 사진만 붙일 수 있어요" }, { status: 403 });
      if (rows.some((r) => r.used_post_id)) return NextResponse.json({ error: "이미 다른 글에 쓴 사진이에요. 사진을 다시 골라 주세요" }, { status: 409 });
      uploads = rows.sort((a, b) => uploadIds.indexOf(a.id) - uploadIds.indexOf(b.id));
    }
    const image_urls = uploads.length
      ? uploads.map((u) => u.url)
      : [...new Set((Array.isArray(body.image_urls) ? body.image_urls : [body.image_url]).filter(okImg))].slice(0, 6) as string[];
    const image_url = image_urls[0] ?? null; // 한 장 칸은 첫 장 (예전 화면 호환)
    const media = uploads.length ? uploads.map((u) => ({ upload_id: u.id, w: u.width, h: u.height, album: !u.taken_at })) : null;
    // 영상은 /api/community/video 가 다시 만든 이 사람의 것만 (표지 사진도 우리 저장소)
    const video = ownVideo(body.video?.url, user_id) && okImg(body.video?.poster)
      ? { video_url: body.video.url as string, video_poster: body.video.poster as string, video_seconds: Math.min(30, Math.max(0, Number(body.video.seconds) || 0)) }
      : null;
    if (!content && !meal_data && !image_url && !video) return NextResponse.json({ error: "내용이나 식단·사진·영상을 넣어 주세요" }, { status: 400 });
    // 투표 — 질문(내용)이 있어야 하고 선택지는 2~4개
    const poll = body.poll ? cleanPoll(body.poll) : null;
    if (body.poll && !poll) return NextResponse.json({ error: "선택지를 서로 다르게 2개 이상 적어 주세요" }, { status: 400 });
    if (poll && !content) return NextResponse.json({ error: "투표 질문을 내용에 적어 주세요" }, { status: 400 });
    const product_ids = Array.isArray(body.product_ids) ? body.product_ids.filter((id: unknown) => typeof id === "string" && UUID.test(id)).slice(0, 3) : [];
    const tags = isTopic(topic) ? [topic] : [];
    const challengeIds: string[] = Array.isArray(body.challenge_ids) ? body.challenge_ids.filter((v: unknown): v is string => typeof v === "string" && UUID.test(v)).slice(0, 5) : [];

    const limited = await rateLimit(sb, request, user_id, "post");
    if (limited) return limited;
    // 이름은 서버에 둔 이 사람의 이름 (보낸 이름은 처음 한 번만 — lib/community-profile.ts)
    const author_nickname = await ensureNickname(sb, user_id, body.author_nickname);
    // 인증(챌린지·연속 기록·하루 기록) 스토리 — 카드 그림을 붙이고, 숫자는 서버가 다시 계산한 것만 둔다
    let cert = null;
    if (body.cert) {
      const ck = String(body.cert.kind || ""), cid = String(body.cert.id || "");
      if (!["challenge", "streak", "day"].includes(ck) || !cardIdOk(ck, cid)) return NextResponse.json({ error: "인증할 것을 골라 주세요" }, { status: 400 });
      if (!image_url) return NextResponse.json({ error: "인증 카드 그림을 붙여 주세요" }, { status: 400 });
      const r = await cardFor(sb, user_id, ck, cid);
      if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
      cert = certOf(r.card);
    }
    // 협업 중인 업체의 제품을 붙였으면 글 맨 앞에 "협찬 · 업체" (추천·보증 심사지침 — lib/partner/collabs.ts)
    const sponsor = await sponsorFor(sb, user_id, product_ids);

    // 원본 출처 — 보이는 글만 (지워짐·신고로 가려짐·팔로워만 글·어느 쪽이든 차단이면 붙이지 않는다)
    let source_post_id: string | null = null;
    if (typeof body.source_post_id === "string" && UUID.test(body.source_post_id)) {
      const { data: src, error: sErr } = await sb.from("community_feed").select("id, user_id, is_active, hidden_by_reports, visibility").eq("id", body.source_post_id).maybeSingle();
      if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
      if (!src || !src.is_active || src.hidden_by_reports || (src.visibility === "followers" && src.user_id !== user_id)) return NextResponse.json({ error: "원본 글을 볼 수 없어요. 원본을 빼고 올려 주세요" }, { status: 400 });
      if (src.user_id !== user_id) {
        const { data: bl, error: blErr } = await sb.from("community_blocks").select("blocker_id")
          .or(`and(blocker_id.eq.${user_id},blocked_id.eq.${src.user_id}),and(blocker_id.eq.${src.user_id},blocked_id.eq.${user_id})`).limit(1);
        if (blErr) return NextResponse.json({ error: blErr.message }, { status: 500 });
        if (bl?.length) return NextResponse.json({ error: "원본 글을 볼 수 없어요. 원본을 빼고 올려 주세요" }, { status: 400 });
      }
      source_post_id = src.id;
    }
    // 사람 태그 — 받는 사람 설정으로 판단 (못 하는 사람은 빼고 알린다)
    const wanted: string[] = Array.isArray(body.people) ? body.people.filter((v: unknown): v is string => typeof v === "string").slice(0, TAG_MAX) : [];
    let judged: Awaited<ReturnType<typeof judgeTags>> = new Map();
    if (wanted.length) {
      try { judged = await judgeTags(sb, user_id, wanted); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
    }

    const { data, error } = await sb
      .from("community_feed")
      .insert({
        user_id,
        post_type: meal_data ? "meal" : "daily",
        content: content || null,
        meal_type,
        meal_data: meal_data || null,
        product_ids: product_ids.length ? product_ids : null,
        image_url,
        image_urls,
        media,
        ...(video || {}),
        poll,
        tags,
        cert,
        author_nickname,
        sponsor,
        source_post_id,
        client_key,
        visibility,
        show_kcal,
        day,
        diary_ids: diary.map((r) => r.id),
        // 건강 관심사·목표·나이대는 글에 붙이지 않는다 (마이페이지에서 나만 본다)
        author_age_group: null,
        author_concerns: [],
        author_goals: [],
      })
      .select()
      .single();

    if (error) {
      // 같은 client_key 가 동시에 두 번 들어온 경우 — 먼저 들어간 글을 돌려준다
      if (client_key && /duplicate key|unique/i.test(error.message)) {
        const prev = await replayed(sb, user_id, client_key);
        if (prev) return NextResponse.json({ post: { ...publicPost(prev), people: [] }, replayed: true, dropped: [], dropped_reason: null, proofs: { added: [], skipped: [] } });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 사진을 이 글에 묶는다 — 아직 안 쓴 것만(조건부). 다른 요청이 먼저 가져갔으면 글을 거두고 알린다
    if (uploads.length) {
      const { data: claimed, error: cErr } = await sb.from("community_uploads").update({ used_post_id: data.id })
        .eq("user_id", user_id).in("id", uploads.map((u) => u.id)).is("used_post_id", null).select("id");
      if (cErr || (claimed || []).length !== uploads.length) {
        const { error: rbErr } = await sb.from("community_feed").update({ is_active: false }).eq("id", data.id);
        if (rbErr) console.error("[feed] 사진 묶기 실패 뒤 글 거두기", rbErr.message);
        if (claimed?.length) {
          const { error: ubErr } = await sb.from("community_uploads").update({ used_post_id: null }).eq("used_post_id", data.id);
          if (ubErr) console.error("[feed] 사진 묶음 풀기", ubErr.message);
        }
        return NextResponse.json({ error: cErr ? cErr.message : "이미 다른 글에 쓴 사진이에요. 사진을 다시 골라 주세요" }, { status: cErr ? 500 : 409 });
      }
    }
    // 식단 기록에 사진이 없으면 첫 장을 붙인다 (식단 화면에서 같이 보인다)
    if (diary.length && image_url) {
      const ids = diary.filter((r) => !r.image_url).map((r) => r.id);
      if (ids.length) {
        const { error: diErr } = await sb.from("meal_diary").update({ image_url }).in("id", ids).eq("user_id", user_id).is("image_url", null);
        if (diErr) console.error("[feed] 식단 기록에 사진 붙이기", diErr.message); // ds-allow: 덤 — 글은 올라갔다
      }
    }

    // 챌린지 인증 — 글은 올라갔다. 인증이 안 된 것은 이유와 함께 돌려준다
    let proofs: Awaited<ReturnType<typeof attachProofs>> = { added: [], skipped: [] };
    if (challengeIds.length) {
      try { proofs = await attachProofs(sb, user_id, { id: data.id, day, meal_type }, uploads, challengeIds, now); }
      catch (e) {
        console.error("[feed] 챌린지 인증", (e as Error).message);
        proofs = { added: [], skipped: challengeIds.map((id) => ({ challenge_id: id, title: "챌린지", reason: "인증을 붙이지 못했어요. 글 상세에서 다시 시도해 주세요" })) };
      }
    }

    const ok = [...judged].filter(([, j]) => j.rule.ok) as [string, { nickname: string | null; rule: { ok: true; status: "shown" | "pending" } }][];
    const dropped = [...judged].filter(([, j]) => !j.rule.ok).map(([, j]) => j.nickname || "알 수 없는 사람");
    let people: { id: string; nickname: string }[] = [];
    if (ok.length) {
      const { error: tErr } = await sb.from("community_post_people").insert(ok.map(([id, j]) => ({ post_id: data.id, tagger_id: user_id, tagged_id: id, status: j.rule.status })));
      if (tErr) {
        // 글은 올라갔다 — 태그만 빠졌으니 쓴 사람에게 알린다
        console.error("사람 태그를 붙이지 못했어요:", tErr.message);
        dropped.push(...ok.map(([, j]) => j.nickname || "알 수 없는 사람"));
      } else {
        people = ok.filter(([, j]) => j.rule.status === "shown").map(([id, j]) => ({ id, nickname: j.nickname || "" }));
        const push = userPusher(sb);
        if (push) {
          for (const [id, j] of ok) {
            try {
              await push(id, j.rule.status === "pending"
                ? { title: "태그 승인", body: `${author_nickname} 님이 나를 글에 태그했어요. 승인하면 글에 보여요`, url: "/community/tags", tag: `tag-${data.id}` }
                : { title: "태그", body: `${author_nickname} 님이 나를 글에 태그했어요`, url: `/community/${data.id}`, tag: `tag-${data.id}` });
            } catch (e) { console.error("태그 푸시를 보내지 못했어요:", (e as Error).message); } // ds-allow: 알림함에는 들어갔다 — 푸시만 빠짐
          }
        }
      }
    }
    const [polled] = await withPolls(sb, [publicPost(data) as { id: string; poll?: unknown }], user_id);
    return NextResponse.json({ post: { ...polled, people }, dropped, dropped_reason: dropped.length ? CANT_TAG : null, proofs });
  } catch (e) {
    console.error("[feed] POST", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}

/** DELETE /api/community/feed?id= — 내 글 지우기 (보이지 않게만 하고 기록은 남긴다) */
export async function DELETE(request: NextRequest) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !UUID.test(id)) return NextResponse.json({ error: "id 필수" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { data: before, error: bErr } = await sb.from("community_feed").select("image_url, image_urls, video_url, video_poster").eq("id", id).eq("user_id", actor).maybeSingle();
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
  if (!before) return NextResponse.json({ error: "내 글만 지울 수 있어요" }, { status: 403 });
  const { error } = await sb.from("community_feed").update({ is_active: false, image_url: null, image_urls: [], video_url: null, video_poster: null, updated_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", actor);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // 이 글로 한 챌린지 인증도 지운다 (그날은 다시 '사진 필요'가 된다)
  const { error: pErr } = await sb.from("challenge_proofs").delete().eq("post_id", id);
  if (pErr) return NextResponse.json({ error: `글은 지웠지만 인증을 지우지 못했어요: ${pErr.message}` }, { status: 500 });
  const { error: uErr } = await sb.from("community_uploads").delete().eq("used_post_id", id).eq("user_id", actor);
  if (uErr) console.error("사진 기록을 지우지 못했어요:", uErr.message);
  // 사진 파일도 지운다 (남겨 두지 않음)
  const [imgErr, vidErr] = await Promise.all([removeImages(sb, [before.image_url, ...(before.image_urls || []), before.video_poster], actor), removeVideos(sb, [before.video_url])]);
  if (imgErr) console.error("사진 파일을 지우지 못했어요:", imgErr);
  if (vidErr) console.error("영상 파일을 지우지 못했어요:", vidErr);
  return NextResponse.json({ ok: true });
}
