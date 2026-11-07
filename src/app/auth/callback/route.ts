import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { linkActorToAccount } from "@/lib/actor-server";

/**
 * Supabase Auth 이메일 확인 콜백
 * /auth/callback?code=xxx
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") || "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // 이 기기의 기록을 계정에 묶는다
      try { await linkActorToAccount(data.user.id); } catch (e) { console.error(e); } // ds-allow: 연결 실패해도 로그인은 진행, 다음 로그인에 다시 묶음
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // 에러 시 로그인 페이지로
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
