"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { linkActorToAccount, resetActor } from "@/lib/actor-server";

/** 로그인 뒤 돌아갈 곳 — 이 사이트 안의 경로만 */
function safePath(p: string | null | undefined) {
  if (!p || !p.startsWith("/") || p.startsWith("//") || /[\\\u0000-\u001f]|%5c|%2f%2f/i.test(p)) return "/";
  try {
    const u = new URL(p, "https://carefood.local");
    return u.origin === "https://carefood.local" ? u.pathname + u.search + u.hash : "/";
  } catch { return "/"; }
}

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
    return { error: "이메일과 비밀번호를 입력해 주세요." };
  }
  if (password.length < 6) {
    return { error: "비밀번호는 6자 이상으로 정해 주세요." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    if (error.message.includes("already registered")) {
      return { error: "이미 가입된 이메일이에요." };
    }
    return { error: error.message };
  }
  // 이메일 확인 없이 바로 로그인된 경우: 이 기기의 기록을 새 계정에 묶는다
  if (data.session && data.user) {
    try { await linkActorToAccount(data.user.id); } catch (e) { console.error(e); return { error: "가입은 됐지만 기록을 계정에 잇지 못했어요. 다시 로그인해 주세요." }; }
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
    return { error: "이메일과 비밀번호를 입력해 주세요." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "이메일 또는 비밀번호가 맞지 않아요." };
  }

  // 이 기기의 기록을 계정에 묶는다 (다른 기기에서 로그인해도 같은 기록)
  try { await linkActorToAccount(data.user.id); } catch (e) { console.error(e); return { error: "로그인은 됐지만 기록을 불러오지 못했어요. 다시 시도해 주세요." }; }

  // returnTo 파라미터가 있으면 그쪽으로, 없으면 홈
  redirect(safePath(formData.get("returnTo") as string));
}

/**
 * 로그아웃
 */
export async function logout() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  // 이 기기는 새 익명 기록으로 — 다음 사람이 계정 기록을 보지 않게
  await resetActor();
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
    return { error: "로그인이 필요해요." };
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
    return { error: "프로필을 저장하지 못했어요." };
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

/**
 * 비밀번호 재설정 메일 — 가입한 이메일인지 아닌지는 알려 주지 않는다 (가입 여부를 캐내지 못하게)
 * 메일의 링크 → /auth/callback (세션) → /auth/reset 에서 새 비밀번호
 * Supabase 인증 설정의 Redirect URL 목록에 /auth/callback 이 있어야 한다
 */
export async function requestPasswordReset(
  prevState: { error: string | null; sent?: boolean },
  formData: FormData,
): Promise<{ error: string | null; sent?: boolean }> {
  const email = String(formData.get("email") || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "이메일을 확인해 주세요" };
  // 메일 링크는 늘 운영 주소로 — Vercel 의 다른 주소(…-projects.vercel.app)에서 요청하면 그 주소가 Supabase 허용 목록에 없어
  // Supabase 가 기본 주소(홈)로 보내 재설정 화면이 열리지 않았다
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  const origin = /localhost|127\.0\.0\.1/.test(host) ? `http://${host}` : (process.env.NEXT_PUBLIC_SITE_URL || "https://carefood-iota.vercel.app");
  // 메일 링크를 다른 기기(휴대폰 메일 앱 등)에서 열어도 되게 implicit 흐름 — PKCE 는 요청한 브라우저의 쿠키가 있어야
  // 코드를 바꿀 수 있어서, PC 에서 요청하고 휴대폰에서 누르면 '재설정 창이 안 열림'이 됐다.
  // 토큰은 주소의 # 뒤로 오고(서버로 가지 않음) /auth/reset 화면이 받아 세션으로 바꾼다.
  const supabase = createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/auth/reset` });
  if (error && /rate|limit|seconds/i.test(error.message)) return { error: "메일을 너무 자주 보냈어요. 잠시 뒤 다시 시도해 주세요" };
  if (error) console.error("비밀번호 재설정 메일:", error.message);
  return { error: null, sent: true };
}

/** 새 비밀번호 저장 — 메일 링크로 들어와 세션이 있을 때만 */
export async function updatePassword(
  prevState: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (password.length < 6) return { error: "비밀번호는 6자 이상으로 정해 주세요" };
  if (password !== confirm) return { error: "두 비밀번호가 달라요" };
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "링크가 만료됐어요. 비밀번호 찾기를 다시 해 주세요" };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "비밀번호를 바꾸지 못했어요. 다시 시도해 주세요" };
  redirect("/me");
}
