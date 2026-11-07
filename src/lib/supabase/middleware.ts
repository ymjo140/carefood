import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ACTOR_COOKIE, ACTOR_ID_COOKIE, actorCookieOptions, actorIdCookieOptions, hasActorSecret, idPart, newActorId, signActor, verifyActor } from "@/lib/actor";

export async function updateSession(request: NextRequest) {
  // 기록 주인 쿠키가 없거나 서명이 틀리면 새로 발급 — 이 요청의 API 도 바로 쓰게 요청 쿠키에도 넣는다
  // (서명 키가 없는 환경에선 발급하지 않는다 — API 는 401, 사이트는 열린다)
  let minted: string | null = null;
  let current: string | null = null;
  if (hasActorSecret()) {
    current = await verifyActor(request.cookies.get(ACTOR_COOKIE)?.value);
    if (!current) {
      minted = await signActor(newActorId());
      request.cookies.set(ACTOR_COOKIE, minted);
    }
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 세션 갱신 (토큰 리프레시)
  await supabase.auth.getUser();

  if (minted) supabaseResponse.cookies.set(ACTOR_COOKIE, minted, actorCookieOptions);
  // 화면용 id 쿠키를 서명 쿠키와 맞춘다 (없거나 다르면)
  const id = minted ? idPart(minted) : current;
  if (id && request.cookies.get(ACTOR_ID_COOKIE)?.value !== id) supabaseResponse.cookies.set(ACTOR_ID_COOKIE, id, actorIdCookieOptions);
  return supabaseResponse;
}
