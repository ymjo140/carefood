import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * POST /api/profile — 사용자 프로필 저장 (upsert)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, concerns, sensitivity, allergies, tastes,
            age_group, gender, household, diet_type } = body;

    if (!user_id) {
      return NextResponse.json({ error: "user_id 필수" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("user_profiles")
      .upsert({
        user_id,
        concerns: concerns || [],
        conditions: body.conditions || [],
        allergies: allergies || [],
        sensitivity_digestive: sensitivity?.digestive || 2,
        sensitivity_additive: sensitivity?.additive || 2,
        taste_salty: tastes?.salty || 5,
        taste_sweet: tastes?.sweet || 5,
        taste_spicy: tastes?.spicy || 5,
        taste_fatty: tastes?.fatty || 5,
        age_group: age_group || null,
        gender: gender || null,
        household: household || null,
        diet_type: diet_type || null,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (error) {
      console.error("Profile save error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}

/**
 * GET /api/profile?user_id=xxx — 프로필 조회
 */
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("user_id");
  if (!userId) {
    return NextResponse.json({ error: "user_id 필수" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}
