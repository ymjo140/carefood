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

  // 비밀번호 재설정은 코드 없이 # 뒤에 토큰을 싣고 온다(implicit) — 브라우저는 # 를 다음 주소로 넘겨 주므로 재설정 화면으로 보낸다
  if (!code && next === "/auth/reset") return NextResponse.redirect(`${origin}/auth/reset`);

  // 에러 시 로그인 페이지로
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
