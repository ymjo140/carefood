import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { isTopic } from "@/lib/community-topics";
import { viewerFilters } from "@/lib/community-safety";


/**
 * GET /api/community/feed — 식단 피드
 *   ?tab=recommend(기본)|following|topic(&topic=모임 이름)|mine   ?id= 글 하나
 * POST /api/community/feed — 새 글 작성
 *
 * 작성자의 건강 관심사·목표·나이대는 응답에 넣지 않는다 (민감정보 — 예전 글에 남아 있어도 보이지 않게).
 * 글에 붙은 제품(product_ids)은 이름을 같이 돌려준다 → products: [{ id, name }]
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
    return NextResponse.json({ post: { ...publicPost(post), products, is_mine: isMine, is_liked: isLiked, is_following: isFollowing } });
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
  } else {
    // 추천 탭: 인기 + 최신 가중
    query = query.order("created_at", { ascending: false });
  }

  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data: posts, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 좋아요 상태 + 댓글 미리보기 병렬 로드
  const postIds = (posts || []).map((p: { id: string }) => p.id);
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
  const names = await productNames(sb, posts || []);
  const result = (posts || []).map((p: { id: string; user_id: string; product_ids?: string[] | null }) => ({
    ...publicPost(p),
    products: (p.product_ids || []).filter((id) => names.has(id)).map((id) => ({ id, name: names.get(id) })),
    is_mine: !!userId && p.user_id === userId,
    is_liked: likedIds.has(p.id),
    is_bookmarked: bookmarkedIds.has(p.id),
    preview_comments: commentMap[p.id] || [],
  }));

  if (tab === "recommend") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result.sort((a: any, b: any) => {
      const scoreA = (a.like_count || 0) * 2 + (a.copy_count || 0) * 3 + (a.comment_count || 0);
      const scoreB = (b.like_count || 0) * 2 + (b.copy_count || 0) * 3 + (b.comment_count || 0);
      // 최신 글에 약간의 부스트
      const ageA = (Date.now() - new Date(a.created_at).getTime()) / (3600 * 1000);
      const ageB = (Date.now() - new Date(b.created_at).getTime()) / (3600 * 1000);
      const finalA = scoreA / Math.max(1, Math.log2(ageA + 2));
      const finalB = scoreB / Math.max(1, Math.log2(ageB + 2));
      return finalB - finalA;
    });
  }

  return NextResponse.json({
    posts: result,
    total: count || 0,
    page,
    hasMore: from + limit < (count || 0),
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
    const imgPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/community/`;
    const image_url = typeof body.image_url === "string" && body.image_url.startsWith(imgPrefix) && !body.image_url.includes("..") ? body.image_url.slice(0, 400) : null;
    if (!content && !meal_data && !image_url) return NextResponse.json({ error: "내용이나 식단·사진을 넣어 주세요" }, { status: 400 });
    const product_ids = Array.isArray(body.product_ids) ? body.product_ids.filter((id: unknown) => typeof id === "string" && UUID.test(id)).slice(0, 3) : [];
    const tags = isTopic(topic) ? [topic] : [];
    const author_nickname = typeof body.author_nickname === "string" && body.author_nickname.trim() ? body.author_nickname.trim().slice(0, 20) : "익명";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;

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
        tags,
        author_nickname,
        // 건강 관심사·목표·나이대는 글에 붙이지 않는다 (마이페이지에서 나만 본다)
        author_age_group: null,
        author_concerns: [],
        author_goals: [],
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ post: publicPost(data) });
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
  const { data, error } = await sb.from("community_feed").update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", actor).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "내 글만 지울 수 있어요" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
