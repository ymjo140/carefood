import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACTOR_COOKIE, actorCookieOptions, newActorId, signActor, verifyActor } from "@/lib/actor";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";

/** 지금 요청의 기록 주인 id (proxy 가 발급한 서명 쿠키). 없거나 서명이 틀리면 null */
export async function getActorId(): Promise<string | null> {
  const c = await cookies();
  return verifyActor(c.get(ACTOR_COOKIE)?.value);
}

/** 쿠키가 없을 때 API 가 돌려주는 응답 — 페이지를 다시 열면 proxy 가 새로 발급한다 */
export function noActor() {
  return NextResponse.json({ error: "접속 정보를 확인하지 못했어요. 페이지를 새로 고쳐 주세요" }, { status: 401 });
}

async function setActorCookie(id: string) {
  const c = await cookies();
  c.set(ACTOR_COOKIE, await signActor(id), actorCookieOptions);
}

/**
 * 로그인 직후: 이 기기의 기록을 계정에 묶는다.
 * - 계정에 이미 묶인 id 가 있으면 이 기기의 기록을 그쪽으로 옮기고 쿠키를 그 id 로 바꾼다 (다른 기기에서도 같은 기록)
 * - 처음이면 지금 기기 id 를 계정에 묶는다
 */
export async function linkActorToAccount(authUserId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const current = await getActorId();
  const { data: link, error } = await sb.from("account_links").select("actor_id").eq("auth_user_id", authUserId).maybeSingle();
  if (error) throw new Error(`계정 연결을 확인하지 못했어요: ${error.message}`);

  if (link?.actor_id) {
    if (current && current !== link.actor_id) {
      const { error: mErr } = await sb.rpc("merge_actor", { from_id: current, to_id: link.actor_id });
      if (mErr) throw new Error(`기록을 계정으로 옮기지 못했어요: ${mErr.message}`);
    }
    await setActorCookie(link.actor_id);
    return link.actor_id as string;
  }

  let actor = current || newActorId();
  const { error: insErr } = await sb.from("account_links").insert({ auth_user_id: authUserId, actor_id: actor });
  if (insErr) {
    // 이 기기 id 가 이미 다른 계정에 묶여 있으면(같은 기기에서 다른 계정) 새 id 로 시작한다
    actor = newActorId();
    const { error: again } = await sb.from("account_links").insert({ auth_user_id: authUserId, actor_id: actor });
    if (again) throw new Error(`계정을 연결하지 못했어요: ${again.message}`);
  }
  await setActorCookie(actor);
  return actor;
}

/** 로그아웃: 이 기기는 새 익명 id 로 — 다음 사람이 계정 기록을 보지 않게 */
export async function resetActor() {
  await setActorCookie(newActorId());
}

/** 로그인한 계정 (가족 관리처럼 계정이 있어야 하는 기능) */
export async function getAuthUser() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export function needLogin() {
  return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });
}

/** 관리자: ADMIN_EMAILS(쉼표로 구분) 에 있는 이메일이거나 app_metadata.role = admin */
export async function getAdminUser() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const allow = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const isAdmin = (user.email && allow.includes(user.email.toLowerCase())) || user.app_metadata?.role === "admin";
  return isAdmin ? user : null;
}

/** 관리자 API 첫 줄: const denied = await adminOnly(); if (denied) return denied; */
export async function adminOnly() {
  const user = await getAdminUser();
  return user ? null : NextResponse.json({ error: "관리자만 볼 수 있어요" }, { status: 403 });
}
