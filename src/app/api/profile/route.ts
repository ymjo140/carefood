import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { DISEASE_GOAL_KEYS, cleanGoals } from "@/lib/profile-sync";

/**
 * POST /api/profile — 사용자 프로필 저장 (upsert). 건강 목표는 질환 관심(당·혈압·신장)을 빼고 goals 에, 질환 관심은 conditions 에만.
 *   body.saved_at(이 기기에서 저장한 시각)이 서버 것보다 옛것이면 덮지 않는다(409) — 다른 기기에서 고친 새 값을 지키려고.
 * POST { action: "fill_goals", goals } — 서버 goals 가 비어 있을 때(11/14 전에 온보딩해 저장된 적 없음)만 채운다. SessionSync 가 부른다.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { concerns, sensitivity, allergies, tastes,
            age_group, gender, household, diet_type } = body;
    const user_id = await getActorId();
    if (!user_id) return noActor();

    const supabase = createServiceRoleClient();
    const goals = cleanGoals(body.goals).filter((g) => !DISEASE_GOAL_KEYS.includes(g));

    if (body.action === "fill_goals") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("user_profiles")
        .update({ goals }).eq("user_id", user_id).is("goals", null).select("user_id");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, filled: (data || []).length });
    }

    // 저장 시각 = 이 기기에서 저장한 시각 (이 기기·서버가 같은 값을 갖게 — 다시 맞추기를 되풀이하지 않게). 시계가 1분 넘게 앞서면 서버 시각
    const now = Date.now();
    const clientAt = typeof body.saved_at === "string" ? Date.parse(body.saved_at) : NaN;
    const savedAt = new Date(Number.isFinite(clientAt) && clientAt <= now + 60_000 ? clientAt : now).toISOString();
    // 이 기기 것이 서버 것보다 옛것이면 덮지 않는다
    if (typeof body.saved_at === "string") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cur, error: cErr } = await (supabase as any).from("user_profiles").select("updated_at").eq("user_id", user_id).maybeSingle();
      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
      if (cur?.updated_at && Date.parse(cur.updated_at) - Date.parse(body.saved_at) > 1000) {
        return NextResponse.json({ error: "다른 곳에서 더 최근에 저장한 프로필이 있어요", stale: true }, { status: 409 });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("user_profiles")
      .upsert({
        user_id,
        concerns: concerns || [],
        // 고른 목표 그대로 (질환 관심은 conditions 에만) — 업체 고객층의 목표 조건이 이 값을 본다
        ...(Array.isArray(body.goals) ? { goals } : {}),
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
        updated_at: savedAt,
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
