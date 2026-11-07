import { NextResponse } from "next/server";
import { connection } from "next/server";
import { getAdminUser, getAuthUser } from "@/lib/actor-server";

/** GET /api/me — 마이페이지 머리: 로그인한 이메일과 관리자 여부 (관리자 판단은 서버가 한다) */
export async function GET() {
  await connection();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ email: null, is_admin: false });
  const admin = await getAdminUser();
  return NextResponse.json({ email: user.email ?? null, is_admin: !!admin });
}
