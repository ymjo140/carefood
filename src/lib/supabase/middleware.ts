import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ACTOR_COOKIE, actorCookieOptions, newActorId, signActor, verifyActor } from "@/lib/actor";

export async function updateSession(request: NextRequest) {
  // 기록 주인 쿠키가 없거나 서명이 틀리면 새로 발급 — 이 요청의 API 도 바로 쓰게 요청 쿠키에도 넣는다
  let minted: string | null = null;
  if (!(await verifyActor(request.cookies.get(ACTOR_COOKIE)?.value))) {
    minted = await signActor(newActorId());
    request.cookies.set(ACTOR_COOKIE, minted);
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
  return supabaseResponse;
}
