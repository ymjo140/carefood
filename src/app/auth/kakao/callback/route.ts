import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { linkActorToAccount } from "@/lib/actor-server";
import { KAKAO_STATE_COOKIE, kakaoEmail, kakaoUserId, safeNext } from "@/lib/kakao";

/**
 * GET /auth/kakao/callback?code&state — 카카오가 돌려보내는 곳.
 * 1) state 쿠키와 맞는지 2) 코드로 카카오 회원번호 받기 3) 그 번호의 계정을 만들거나 찾기(app_metadata.provider = kakao)
 * 4) 서버에서 일회용 로그인 토큰을 만들어 바로 세션으로 바꾸기 5) 이 기기의 기록을 계정에 묶고 원래 화면으로.
 * 실패하면 /login?error=… 로 — 화면이 이유를 말한다.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const sp = request.nextUrl.searchParams;
  const raw = request.cookies.get(KAKAO_STATE_COOKIE)?.value || "";
  const dot = raw.indexOf(".");
  const saved = dot > 0 ? raw.slice(0, dot) : "";
  const next = safeNext(dot > 0 ? decodeURIComponent(raw.slice(dot + 1)) : "/");
  const fail = (why: string) => {
    const res = NextResponse.redirect(`${origin}/login?error=${why}${next !== "/" ? `&returnTo=${encodeURIComponent(next)}` : ""}`);
    res.cookies.delete({ name: KAKAO_STATE_COOKIE, path: "/auth/kakao" });
    return res;
  };

  if (sp.get("error")) return fail(sp.get("error") === "access_denied" ? "kakao_cancel" : "kakao");
  const code = sp.get("code");
  if (!code || !saved || sp.get("state") !== saved) return fail("kakao_state");

  let kakaoId: string;
  try {
    kakaoId = await kakaoUserId(code, `${origin}/auth/kakao/callback`);
  } catch (e) {
    console.error("[kakao] 토큰·회원 정보 실패", (e as Error).message);
    return fail("kakao");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createServiceRoleClient() as any;
  const email = kakaoEmail(kakaoId);
  const { error: cErr } = await admin.auth.admin.createUser({
    email, email_confirm: true, app_metadata: { provider: "kakao", providers: ["kakao"], kakao_id: kakaoId },
  });
  if (cErr && !/already|registered|exists/i.test(cErr.message)) {
    console.error("[kakao] 계정 만들기 실패", cErr.message);
    return fail("kakao");
  }
  const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (lErr || !link?.properties?.hashed_token || !link.user) {
    console.error("[kakao] 로그인 토큰 실패", lErr?.message);
    return fail("kakao");
  }
  // 누군가 이 주소로 미리 이메일 가입해 둔 계정이면 잇지 않는다
  if (link.user.app_metadata?.kakao_id !== kakaoId) {
    console.error("[kakao] 카카오가 아닌 계정과 주소가 겹침", link.user.id);
    return fail("kakao_conflict");
  }

  const supabase = await createServerSupabaseClient();
  const { data: session, error: vErr } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (vErr || !session.user) {
    console.error("[kakao] 세션 만들기 실패", vErr?.message);
    return fail("kakao");
  }
  try { await linkActorToAccount(session.user.id); } catch (e) { console.error(e); } // ds-allow: 연결 실패해도 로그인은 진행, 다음 로그인에 다시 묶음

  const res = NextResponse.redirect(`${origin}${next}`);
  res.cookies.delete({ name: KAKAO_STATE_COOKIE, path: "/auth/kakao" });
  return res;
}
