import { NextRequest, NextResponse } from "next/server";
import { KAKAO_STATE_COOKIE, authorizeUrl, kakaoKey, safeNext } from "@/lib/kakao";

/**
 * GET /auth/kakao?next=/경로 — 카카오 로그인 시작.
 * 위조 요청을 막는 무작위 state 를 쿠키(10분)에 두고 카카오 인가 화면으로 보낸다. 돌아올 곳(next)도 같이 담는다.
 * 돌아오는 주소는 지금 주소 기준 /auth/kakao/callback — 카카오 앱의 REST API 키에 등록돼 있어야 한다.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  if (!kakaoKey()) return NextResponse.redirect(`${origin}/login?error=kakao_off${next !== "/" ? `&returnTo=${encodeURIComponent(next)}` : ""}`);
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  const res = NextResponse.redirect(authorizeUrl(`${origin}/auth/kakao/callback`, state));
  res.cookies.set(KAKAO_STATE_COOKIE, `${state}.${encodeURIComponent(next)}`, {
    httpOnly: true, secure: origin.startsWith("https"), sameSite: "lax", path: "/auth/kakao", maxAge: 600,
  });
  return res;
}
