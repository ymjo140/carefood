import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";

// 질환 관심 — lib/profile-options.ts 의 DISEASE_GOALS 와 같다 (그 파일은 브라우저 전용이라 여기서 불러오지 않는다)
const DISEASE_GOALS = ["diabetes", "blood_pressure", "kidney"];

/**
 * POST /api/profile — 사용자 프로필 저장 (upsert)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { concerns, sensitivity, allergies, tastes,
            age_group, gender, household, diet_type } = body;
    const user_id = await getActorId();
    if (!user_id) return noActor();

    const supabase = createServiceRoleClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("user_profiles")
      .upsert({
        user_id,
        concerns: concerns || [],
        // 고른 목표 그대로 (질환 관심은 conditions 에만) — 업체 고객층의 목표 조건이 이 값을 본다
        ...(Array.isArray(body.goals) ? { goals: body.goals.filter((g: unknown): g is string => typeof g === "string" && !DISEASE_GOALS.includes(g)).slice(0, 10) } : {}),
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
 * GET /api/profile — 내 프로필 조회 (사용자는 쿠키로)
 */
export async function GET(request: NextRequest) {
  const userId = await getActorId();
  if (!userId) return noActor();

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
