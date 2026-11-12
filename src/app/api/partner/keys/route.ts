import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPartnerContext } from "@/lib/partner/auth";
import { MAX_KEYS, newKey } from "@/lib/partner/api-auth";
import { limitRequest } from "@/lib/rate-limit";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const COLS = "id, name, key_prefix, created_at, last_used_at, revoked_at";

/** GET /api/partner/keys[?as=slug] — 내 API 키 (원문은 없다) */
export async function GET(req: NextRequest) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  const sb: Sb = createServiceRoleClient();
  const { data, error } = await sb.from("partner_api_keys").select(COLS).eq("partner_id", ctx.partner.id).is("revoked_at", null).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ keys: data || [], can_manage: ctx.role !== "editor", max: MAX_KEYS });
}

/** POST /api/partner/keys — {name} 키 만들기. 원문은 이 응답에서 한 번만 준다 (업체 관리자·케어푸드 관리자만) */
export async function POST(req: NextRequest) {
  const limited = await limitRequest(req, "upload");
  if (limited) return limited;
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  if (ctx.role === "editor") return NextResponse.json({ error: "업체 관리자 계정만 키를 만들 수 있어요" }, { status: 403 });
  const b = await req.json().catch(() => null);
  const name = String(b?.name || "").trim().slice(0, 40);
  if (!name) return NextResponse.json({ error: "어디에 쓰는 키인지 이름을 적어 주세요" }, { status: 400 });
  const sb: Sb = createServiceRoleClient();
  const { count, error: cErr } = await sb.from("partner_api_keys").select("id", { count: "exact", head: true }).eq("partner_id", ctx.partner.id).is("revoked_at", null);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if ((count || 0) >= MAX_KEYS) return NextResponse.json({ error: `키는 ${MAX_KEYS}개까지예요. 안 쓰는 키를 폐기해 주세요` }, { status: 400 });
  const k = newKey();
  const { data, error } = await sb.from("partner_api_keys").insert({ partner_id: ctx.partner.id, name, key_prefix: k.key_prefix, key_hash: k.key_hash, created_by: ctx.userId }).select(COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ key: k.key, info: data });
}

/** DELETE /api/partner/keys?id= — 키 폐기 (바로 못 쓰게 된다) */
export async function DELETE(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ctx = await getPartnerContext(sp.get("as"));
  if ("error" in ctx) return ctx.error;
  if (ctx.role === "editor") return NextResponse.json({ error: "업체 관리자 계정만 키를 폐기할 수 있어요" }, { status: 403 });
  const sb: Sb = createServiceRoleClient();
  const { error } = await sb.from("partner_api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", sp.get("id")).eq("partner_id", ctx.partner.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
