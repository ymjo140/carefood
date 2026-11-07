import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthUser, needLogin } from "@/lib/actor-server";

/**
 * 가족 프로필 API
 * GET: 가족 목록 조회
 * POST: 가족 추가
 * PATCH: 가족 수정
 * DELETE: 가족 삭제
 * 로그인한 계정 기준 — 사용자는 요청 값이 아니라 로그인 세션으로 확인한다
 */

export async function GET(request: NextRequest) {
  try {
    const userId = (await getAuthUser())?.id;
    if (!userId) return needLogin();

    const supabase = createServiceRoleClient();
    const { data, error } = await (supabase
      .from("family_profiles") as any)
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profiles: data || [] });
  } catch (err) {
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId: _ignored, user_id: _ignored2, ...profileData } = body; void _ignored; void _ignored2;
    const userId = (await getAuthUser())?.id;
    if (!userId) return needLogin();
    if (!profileData.nickname) {
      return NextResponse.json({ error: "nickname 필요" }, { status: 400 });
    }

    // BMI 자동 계산
    if (profileData.height_cm && profileData.weight_kg) {
      const h = profileData.height_cm / 100;
      profileData.bmi = Math.round((profileData.weight_kg / (h * h)) * 10) / 10;
    }

    // 질환 자동 감지
    const conditions: string[] = [];
    if (profileData.fasting_glucose && profileData.fasting_glucose >= 126) conditions.push("diabetes");
    if (profileData.bp_systolic && profileData.bp_systolic >= 140) conditions.push("hypertension");
    if (profileData.ldl && profileData.ldl >= 160) conditions.push("hyperlipidemia");
    profileData.conditions = conditions;

    const supabase = createServiceRoleClient();
    const { data, error } = await (supabase
      .from("family_profiles") as any)
      .insert({ user_id: userId, ...profileData })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profile: data });
  } catch (err) {
    return NextResponse.json({ error: "추가 실패" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, userId: _ignored, user_id: _ignored2, ...updates } = body; void _ignored; void _ignored2;
    const userId = (await getAuthUser())?.id;
    if (!userId) return needLogin();
    if (!id) return NextResponse.json({ error: "id 필요" }, { status: 400 });

    if (updates.height_cm && updates.weight_kg) {
      const h = updates.height_cm / 100;
      updates.bmi = Math.round((updates.weight_kg / (h * h)) * 10) / 10;
    }

    const conditions: string[] = [];
    if (updates.fasting_glucose && updates.fasting_glucose >= 126) conditions.push("diabetes");
    if (updates.bp_systolic && updates.bp_systolic >= 140) conditions.push("hypertension");
    if (updates.ldl && updates.ldl >= 160) conditions.push("hyperlipidemia");
    updates.conditions = conditions;
    updates.updated_at = new Date().toISOString();

    const supabase = createServiceRoleClient();
    const { data, error } = await (supabase
      .from("family_profiles") as any)
      .update(updates)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profile: data });
  } catch (err) {
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    const userId = (await getAuthUser())?.id;
    if (!userId) return needLogin();
    if (!id) return NextResponse.json({ error: "id 필요" }, { status: 400 });

    const supabase = createServiceRoleClient();
    const { error } = await (supabase
      .from("family_profiles") as any)
      .update({ is_active: false })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
