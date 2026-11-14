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


/**
 * GET /api/community/feed — 식단 피드
 *   ?tab=recommend(기본)|following|topic(&topic=모임 이름)|mine|user(&user_id=, &only=plan)   ?id= 글 하나
 * POST /api/community/feed — 새 글 작성
 *
 * 작성자의 건강 관심사·목표·나이대는 응답에 넣지 않는다 (민감정보 — 예전 글에 남아 있어도 보이지 않게).
 * 글에 붙은 제품(product_ids)은 이름을 같이 돌려준다 → products: [{ id, name }]
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
    // 신고가 모여 가려진 글·차단한 사람의 글은 (글쓴이 본인 말고는) 열지 않는다
    if (!isMine) {
      if (post.hidden_by_reports) return NextResponse.json({ error: "신고가 모여 가려진 글이에요", reason: "reported" }, { status: 404 });
      const f = await viewerFilters(sb, userId);
      if (f.blocked.has(post.user_id)) return NextResponse.json({ error: "차단한 사람의 글이에요", reason: "blocked" }, { status: 404 });
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
    let polled;
    try { [polled] = await withPolls(sb, [publicPost(post) as { id: string; poll?: unknown }], userId); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
    return NextResponse.json({ post: { ...polled, products, is_mine: isMine, is_liked: isLiked, is_following: isFollowing } });
  }

  /* ── 피드 목록 모드 ── */
  const tab = searchParams.get("tab") || "recommend";
  const topic = searchParams.get("topic");
  const page = Number(searchParams.get("page") || 1);
  const limit = 20;

  let query = sb
    .from("community_feed")
    .select("*", { count: "exact" })
    .eq("is_active", true);

  // 보는 사람 기준으로 거르기 — 신고로 가려진 글(내 글 보기 빼고), 차단한 사람의 글, 숨긴 글
  let filters: Awaited<ReturnType<typeof viewerFilters>>;
  try { filters = await viewerFilters(sb, userId); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  const safeIds = (set: Set<string>) => [...set].filter((v) => /^[A-Za-z0-9_-]{1,64}$/.test(v));
  if (tab !== "mine") {
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
  const recommend = !["following", "topic", "mine", "user"].includes(tab) || (tab === "topic" && !isTopic(topic));
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

  let polled;
  try { polled = await withPolls(sb, result, userId); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }

  return NextResponse.json({
    posts: polled,
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { post_type, meal_type, topic } = body;
    const user_id = await getActorId();
    if (!user_id) return noActor();

    const content = typeof body.content === "string" ? body.content.trim().slice(0, 1000) : "";
    if (body.meal_data && JSON.stringify(body.meal_data).length > 60_000) return NextResponse.json({ error: "식단이 너무 커요" }, { status: 400 });
    const meal_data = cleanMealData(body.meal_data);
    // 사진은 우리 저장소(/api/community/upload 가 올린 것)만 받는다
    const imgPrefix = imagePrefix();
    // 내가 올린 사진만 (내 폴더) — 남의 사진 주소를 붙였다가 글을 지워 그 사진이 지워지는 일을 막는다
    const okImg = (u: unknown): u is string => typeof u === "string" && u.startsWith(`${imgPrefix}${user_id}/`) && !u.includes("..") && u.length <= 400;
    const image_urls = [...new Set((Array.isArray(body.image_urls) ? body.image_urls : [body.image_url]).filter(okImg))].slice(0, 4) as string[];
    const image_url = image_urls[0] ?? null; // 한 장 칸은 첫 장 (예전 화면 호환)
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;
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

    const { data, error } = await sb
      .from("community_feed")
      .insert({
        user_id,
        post_type: post_type === "meal" && meal_data ? "meal" : "daily",
        content: content || null,
        meal_type: ["breakfast", "lunch", "dinner", "snack"].includes(meal_type) ? meal_type : null,
        meal_data: meal_data || null,
        product_ids: product_ids.length ? product_ids : null,
        image_url,
        image_urls,
        ...(video || {}),
        poll,
        tags,
        cert,
        author_nickname,
        sponsor,
        // 건강 관심사·목표·나이대는 글에 붙이지 않는다 (마이페이지에서 나만 본다)
        author_age_group: null,
        author_concerns: [],
        author_goals: [],
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const [polled] = await withPolls(sb, [publicPost(data) as { id: string; poll?: unknown }], user_id);
    return NextResponse.json({ post: polled });
  } catch {
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
  // 사진 파일도 지운다 (남겨 두지 않음)
  const [imgErr, vidErr] = await Promise.all([removeImages(sb, [before.image_url, ...(before.image_urls || []), before.video_poster], actor), removeVideos(sb, [before.video_url])]);
  if (imgErr) console.error("사진 파일을 지우지 못했어요:", imgErr);
  if (vidErr) console.error("영상 파일을 지우지 못했어요:", vidErr);
  return NextResponse.json({ ok: true });
}
