import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { CREATOR_TOPICS } from "@/lib/partner/collabs";
import { notReady } from "@/lib/partner/crm";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * GET /api/me/creator — 내 "협업 제안 받기" 설정 (+ 커뮤니티 닉네임이 있는지)
 * PUT /api/me/creator — {is_open, intro, topics[]} 켜면 입점 업체가 닉네임·자기소개·주제·글·반응·팔로워 수를 보고 제안할 수 있다
 */
export async function GET() {
  await connection();
  const actor = await getActorId();
  if (!actor) return noActor();
  const sb = createServiceRoleClient() as Sb;
  const [p, n] = await Promise.all([
    sb.from("creator_profiles").select("is_open, intro, topics, opened_at").eq("user_id", actor).maybeSingle(),
    sb.from("community_profiles").select("nickname").eq("actor_id", actor).maybeSingle(),
  ]);
  if (p.error) return notReady(p.error) ? NextResponse.json({ ready: false }) : NextResponse.json({ error: "설정을 불러오지 못했어요" }, { status: 500 });
  if (n.error) return NextResponse.json({ error: "설정을 불러오지 못했어요" }, { status: 500 });
  return NextResponse.json({ ready: true, topics: CREATOR_TOPICS, nickname: n.data?.nickname || null, profile: p.data || { is_open: false, intro: null, topics: [], opened_at: null } });
}

export async function PUT(req: NextRequest) {
  await connection();
  const actor = await getActorId();
  if (!actor) return noActor();
  const b = await req.json().catch(() => ({}));
  const sb = createServiceRoleClient() as Sb;
  const { data: nick, error: nErr } = await sb.from("community_profiles").select("nickname").eq("actor_id", actor).maybeSingle();
  if (nErr) return NextResponse.json({ error: "저장하지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  if (b?.is_open === true && !nick) return NextResponse.json({ error: "커뮤니티에 글을 한 번 올려 닉네임을 정한 뒤 켤 수 있어요" }, { status: 400 });
  const intro = String(b?.intro || "").trim().slice(0, 100) || null;
  const topics = (Array.isArray(b?.topics) ? b.topics : []).filter((t: unknown) => (CREATOR_TOPICS as readonly string[]).includes(String(t))).slice(0, 4);
  const now = new Date().toISOString();
  const { data: prev, error: pErr } = await sb.from("creator_profiles").select("opened_at, is_open").eq("user_id", actor).maybeSingle();
  if (pErr) return NextResponse.json({ error: "저장하지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  const open = b?.is_open === true;
  const { error } = await sb.from("creator_profiles").upsert({
    user_id: actor, is_open: open, intro, topics, updated_at: now, opened_at: open ? (prev?.is_open ? prev.opened_at : now) : prev?.opened_at ?? null,
  }, { onConflict: "user_id" });
  if (error) {
    console.error("협업 설정을 저장하지 못했어요:", error.message);
    return NextResponse.json({ error: "저장하지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
