import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { adminOnly } from "@/lib/actor-server";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 가입한 계정을 이메일로 찾는다 (관리 API 는 이메일로 바로 찾는 기능이 없어 페이지를 넘긴다) */
async function findUserByEmail(sb: Sb, email: string) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const u = data.users.find((x: { email?: string }) => x.email?.toLowerCase() === email);
    if (u) return u;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** POST /api/admin/partners/members — {partner_id, email, role?} 업체 담당자 연결 (먼저 오늘끼록에 가입해 있어야 한다) */
export async function POST(req: NextRequest) {
  const denied = await adminOnly(); if (denied) return denied;
  const b = await req.json().catch(() => null);
  const email = String(b?.email || "").trim().toLowerCase();
  if (!b?.partner_id || !email.includes("@")) return NextResponse.json({ error: "업체와 이메일을 적어 주세요" }, { status: 400 });
  const sb: Sb = createServiceRoleClient();
  let user;
  try { user = await findUserByEmail(sb, email); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  if (!user) return NextResponse.json({ error: "이 이메일로 가입한 계정이 없어요. 담당자가 먼저 오늘끼록에 가입해야 해요" }, { status: 404 });
  const { error } = await sb.from("partner_members").upsert({
    partner_id: b.partner_id, auth_user_id: user.id, email, role: b.role === "owner" ? "owner" : "editor",
  }, { onConflict: "partner_id,auth_user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/admin/partners/members?partner_id=&email= */
export async function DELETE(req: NextRequest) {
  const denied = await adminOnly(); if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const sb: Sb = createServiceRoleClient();
  const { error } = await sb.from("partner_members").delete().eq("partner_id", sp.get("partner_id")).eq("email", (sp.get("email") || "").toLowerCase());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
