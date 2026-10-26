import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/community/feed — 식단 피드
 * POST /api/community/feed — 식단 공유
 */

export async function GET(request: NextRequest) {
  await connection();
  const { searchParams } = request.nextUrl;
  const concern = searchParams.get("concern");
  const dietType = searchParams.get("diet_type");
  const page = Number(searchParams.get("page") || 1);
  const limit = 10;
  const userId = searchParams.get("user_id");

  const supabase = createServiceRoleClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  let query = sb
    .from("shared_meal_plans")
    .select("*", { count: "exact" })
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (concern) query = query.contains("author_concerns", [concern]);
  if (dietType) query = query.eq("author_diet_type", dietType);

  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data: plans, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 현재 유저의 좋아요 여부
  let likedPlanIds = new Set<string>();
  if (userId && plans?.length > 0) {
    const planIds = plans.map((p: { id: string }) => p.id);
    const { data: likes } = await sb
      .from("meal_plan_likes")
      .select("plan_id")
      .eq("user_id", userId)
      .in("plan_id", planIds);
    if (likes) likedPlanIds = new Set(likes.map((l: { plan_id: string }) => l.plan_id));
  }

  const result = (plans || []).map((p: { id: string }) => ({
    ...p,
    is_liked: likedPlanIds.has(p.id),
  }));

  return NextResponse.json({
    plans: result,
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, title, description, days, summary } = body;

    if (!user_id || !title || !days) {
      return NextResponse.json({ error: "user_id, title, days 필수" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    // 작성자 프로필
    const { data: profile } = await sb
      .from("user_profiles")
      .select("age_group, gender, concerns, diet_type")
      .eq("user_id", user_id)
      .maybeSingle();

    const { data: plan, error } = await sb
      .from("shared_meal_plans")
      .insert({
        user_id,
        title,
        description: description || null,
        days,
        summary: summary || null,
        author_age_group: profile?.age_group || null,
        author_gender: profile?.gender || null,
        author_concerns: profile?.concerns || [],
        author_diet_type: profile?.diet_type || null,
        author_display_name: body.display_name || "익명",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ plan });
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}
