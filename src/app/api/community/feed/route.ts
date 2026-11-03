import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/community/feed — 식단 피드
 * POST /api/community/feed — 새 글 작성
 */

export async function GET(request: NextRequest) {
  await connection();
  const { searchParams } = request.nextUrl;
  const tab = searchParams.get("tab") || "recommend";
  const concern = searchParams.get("concern");
  const page = Number(searchParams.get("page") || 1);
  const limit = 20;
  const userId = searchParams.get("user_id");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  let query = sb
    .from("community_feed")
    .select("*", { count: "exact" })
    .eq("is_active", true);

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
  } else if (tab === "concern" && concern) {
    // 관심사 탭
    query = query.contains("author_concerns", [concern]);
    query = query.order("created_at", { ascending: false });
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
      sb.from("community_feed_comments").select("id, post_id, author_nickname, content, created_at")
        .in("post_id", postIds).order("created_at", { ascending: false }).limit(50)
        .then(({ data }: { data: { post_id: string }[] | null }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const map: Record<string, any[]> = {};
          for (const c of data || []) {
            if (!map[c.post_id]) map[c.post_id] = [];
            if (map[c.post_id]!.length < 2) map[c.post_id]!.push(c);
          }
          commentMap = map;
        })
    );

    await Promise.all(promises);
  }

  // 추천탭: 인기도 기반 재정렬
  let result = (posts || []).map((p: { id: string }) => ({
    ...p,
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, post_type, content, meal_type, meal_data, product_ids, tags,
            author_nickname, author_age_group, author_concerns, author_goals } = body;

    if (!user_id) return NextResponse.json({ error: "user_id 필수" }, { status: 400 });
    if (!content && !meal_data) return NextResponse.json({ error: "내용 또는 식단 데이터 필수" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;

    const { data, error } = await sb
      .from("community_feed")
      .insert({
        user_id,
        post_type: post_type || "daily",
        content: content || null,
        meal_type: meal_type || null,
        meal_data: meal_data || null,
        product_ids: product_ids || null,
        tags: tags || [],
        author_nickname: author_nickname || "익명",
        author_age_group: author_age_group || null,
        author_concerns: author_concerns || [],
        author_goals: author_goals || [],
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ post: data });
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}
