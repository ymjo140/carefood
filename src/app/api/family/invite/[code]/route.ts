import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, getAuthUser } from "@/lib/actor-server";
import { FAMILY_CONSENT_VERSION, INVITE_RE, accountActor, cleanScopes, nicknameOf } from "@/lib/family";

/**
 * GET  /api/family/invite/[code] — 초대받은 사람이 보는 것: 초대한 사람 닉네임 · 상태 (pending | self | used | expired | missing) · 로그인했는지
 * POST /api/family/invite/[code] { scopes } — 보여 줄 것을 골라 동의하고 연결 (로그인한 계정만, DB 함수가 줄을 잠그고 한 번에)
 *   처음 오는 사람(설정이 없음)은 간단 모드(큰 글자 · 캐릭터 없이)로 시작한다.
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const MESSAGES: Record<string, string> = {
  missing: "초대 링크를 찾지 못했어요",
  expired: "초대 링크가 지났어요. 새 링크를 받아 주세요",
  used: "이미 다른 분이 받은 초대예요. 새 링크를 받아 주세요",
  self: "내가 보낸 초대는 내가 받을 수 없어요",
  exists: "이미 연결된 가족이에요",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  await connection();
  const { code } = await params;
  if (!INVITE_RE.test(code)) return NextResponse.json({ status: "missing" }, { status: 404 });
  const sb = createServiceRoleClient() as Sb;
  try {
    const { data: l, error } = await sb.from("family_links").select("viewer_id, status, expires_at").eq("code", code).maybeSingle();
    if (error) throw new Error(error.message);
    if (!l) return NextResponse.json({ status: "missing" }, { status: 404 });
    const [user, actor] = await Promise.all([getAuthUser(), getActorId()]);
    // 내가 보낸 초대를 내가 열면 동의 화면 대신 '가족에게 보내 주세요'
    const status = l.status === "pending" ? (Date.parse(l.expires_at) < Date.now() ? "expired" : user && actor === l.viewer_id ? "self" : "pending") : "used";
    return NextResponse.json({ status, from: await nicknameOf(sb, l.viewer_id), logged_in: !!user });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!INVITE_RE.test(code)) return NextResponse.json({ error: MESSAGES.missing }, { status: 404 });
  const who = await accountActor();
  if ("res" in who) return who.res;
  const body = await request.json().catch(() => ({}));
  if (body.agree !== true) return NextResponse.json({ error: "건강에 관한 정보를 보여 주려면 동의가 필요해요" }, { status: 400 });
  const s = cleanScopes(body.scopes);
  if (!s.meals && !s.products && !s.meds && !s.numbers) return NextResponse.json({ error: "보여 줄 것을 하나 이상 골라 주세요" }, { status: 400 });
  const sb = createServiceRoleClient() as Sb;
  try {
    const { data, error } = await sb.rpc("family_link_accept", {
      p_code: code, p_owner: who.actor, p_meals: s.meals, p_products: s.products, p_meds: s.meds, p_numbers: s.numbers, p_version: FAMILY_CONSENT_VERSION,
    });
    if (error) throw new Error(error.message);
    if (data.status !== "accepted") return NextResponse.json({ error: MESSAGES[data.status] || "연결하지 못했어요" }, { status: data.status === "missing" ? 404 : 409 });
    // 처음 오는 분은 간단 모드로 (설정이 이미 있으면 그대로 둔다)
    const { error: pErr } = await sb.from("notification_prefs").upsert({ user_id: who.actor, simple_mode: true, mascot: "none" }, { onConflict: "user_id", ignoreDuplicates: true });
    if (pErr) console.error("간단 모드를 켜지 못했어요:", pErr.message); // ds-allow: 연결은 됐다 — 설정에서 직접 켤 수 있다
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
