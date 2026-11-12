/**
 * 입점 업체 화면·API 의 "누구인가" — 로그인한 계정이 partner_members 에 있으면 그 업체.
 * 관리자는 ?as=<slug> 로 어느 업체 화면이든 볼 수 있다 (검수·안내용).
 */
import { NextResponse } from "next/server";
import { getAdminUser, getAuthUser } from "@/lib/actor-server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Partner } from "./ingest";

export type PartnerContext = { userId: string; email: string | null; partner: Partner; role: "owner" | "editor" | "admin" };

export async function getPartnerContext(asSlug?: string | null): Promise<PartnerContext | { error: NextResponse; reason?: "login" | "not_member" }> {
  const user = await getAuthUser();
  if (!user) return { error: NextResponse.json({ error: "로그인이 필요해요", reason: "login" }, { status: 401 }), reason: "login" };
  const sb = createServiceRoleClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const cols = "id, slug, name, kind, status";
  if (asSlug) {
    if (!(await getAdminUser())) return { error: NextResponse.json({ error: "관리자만 다른 업체 화면을 볼 수 있어요" }, { status: 403 }) };
    const { data, error } = await sb.from("partners").select(cols).eq("slug", asSlug).maybeSingle();
    if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
    if (!data) return { error: NextResponse.json({ error: "업체를 찾지 못했어요" }, { status: 404 }) };
    return { userId: user.id, email: user.email ?? null, partner: data, role: "admin" };
  }
  const { data, error } = await sb.from("partner_members").select(`role, partners(${cols})`).eq("auth_user_id", user.id).limit(1).maybeSingle();
  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!data?.partners) return { error: NextResponse.json({ error: "입점 업체 계정이 아니에요", reason: "not_member" }, { status: 403 }), reason: "not_member" };
  if (data.partners.status === "paused") return { error: NextResponse.json({ error: "업체 계정이 멈춰 있어요. 케어푸드에 문의해 주세요", reason: "paused" }, { status: 403 }) };
  return { userId: user.id, email: user.email ?? null, partner: data.partners, role: data.role };
}
