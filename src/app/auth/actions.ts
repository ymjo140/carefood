"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * 이메일/비밀번호 회원가입
 * Server Action — useActionState 호환 (prevState, formData)
 */
export async function signup(
  prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "이메일과 비밀번호를 입력해주세요." };
  }
  if (password.length < 6) {
    return { error: "비밀번호는 6자 이상이어야 합니다." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    if (error.message.includes("already registered")) {
      return { error: "이미 가입된 이메일입니다." };
    }
    return { error: error.message };
  }

  // 가입 후 바로 로그인 처리 (이메일 인증 비활성화 시)
  redirect("/");
}

/**
 * 이메일/비밀번호 로그인
 */
export async function login(
  prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "이메일과 비밀번호를 입력해주세요." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  // returnTo 파라미터가 있으면 그쪽으로, 없으면 홈
  const returnTo = formData.get("returnTo") as string;
  redirect(returnTo || "/");
}

/**
 * 로그아웃
 */
export async function logout() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/");
}

/**
 * 온보딩 프로필을 Supabase에 저장
 * 로그인 상태일 때만 호출됨
 */
export async function saveProfile(profileJson: string): Promise<{ error: string | null }> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "로그인이 필요합니다." };
  }

  const profile = JSON.parse(profileJson);

  // users 테이블에 persona, orderer_relation 업데이트
  // as any: persona, orderer_relation은 마이그레이션으로 추가된 컬럼 (수동 타입에 미반영)
  const { error: userErr } = await (supabase
    .from("users") as any)
    .upsert({
      id: user.id,
      email: user.email,
      persona: profile.persona,
      orderer_relation: profile.ordererRelation,
    }, { onConflict: "id" });

  if (userErr) {
    console.error("Failed to save user profile:", userErr);
    return { error: "프로필 저장에 실패했습니다." };
  }

  // user_health_profiles 업데이트
  const { error: healthErr } = await (supabase
    .from("user_health_profiles") as any)
    .upsert({
      user_id: user.id,
      conditions: profile.conditions || [],
      allergies: profile.allergies || [],
      pregnancy_stage: profile.pregnancyStage || null,
      health_goal: profile.healthGoal || null,
    }, { onConflict: "user_id" });

  if (healthErr) {
    console.error("Failed to save health profile:", healthErr);
  }

  // user_taste_profiles 업데이트
  const { error: tasteErr } = await (supabase
    .from("user_taste_profiles") as any)
    .upsert({
      user_id: user.id,
      salty_level: profile.tastes?.salty || 3,
      sweet_level: profile.tastes?.sweet || 3,
      spicy_level: profile.tastes?.spicy || 3,
      fatty_level: profile.tastes?.fatty || 3,
    }, { onConflict: "user_id" });

  if (tasteErr) {
    console.error("Failed to save taste profile:", tasteErr);
  }

  return { error: null };
}
