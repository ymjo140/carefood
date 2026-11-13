import { NextResponse } from "next/server";
import { connection } from "next/server";
import { getAdminUser, getAuthUser } from "@/lib/actor-server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/** GET /api/me — 마이페이지 머리: 로그인한 이메일 · 관리자 여부 · 입점 업체 담당자면 그 업체 이름 (판단은 서버가 한다) */
export async function GET() {
  await connection();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ email: null, is_admin: false, partner: null });
  const admin = await getAdminUser();
  const sb = createServiceRoleClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: m, error } = await sb.from("partner_members").select("partners(name)").eq("auth_user_id", user.id).limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ email: user.email ?? null, is_admin: !!admin, partner: m?.partners?.name ?? null });
}
