import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { ACTOR_RE } from "@/lib/community-tags";

/**
 * POST /api/community/tags/mute { id: 사람, mute: true | false } — '이 사람 태그 받지 않기' / 다시 받기
 *   받지 않기: 그 사람은 앞으로 나를 태그할 수 없고(상대에게는 '태그를 받지 않는 사람'으로만), 승인 기다리던 그 사람 태그는 지운다.
 *   이미 글에 보이는 태그는 그대로 — 지우려면 그 태그에서 '태그 지우기'.
 */
export async function POST(request: NextRequest) {
  const me = await getActorId();
  if (!me) return noActor();
  const { id, mute } = await request.json().catch(() => ({}));
  if (typeof id !== "string" || !ACTOR_RE.test(id) || id === me) return NextResponse.json({ error: "사람을 골라 주세요" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  if (mute === false) {
    const { error } = await sb.from("community_tag_mutes").delete().eq("actor_id", me).eq("muted_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, muted: false });
  }
  const { error } = await sb.from("community_tag_mutes").upsert({ actor_id: me, muted_id: id }, { onConflict: "actor_id,muted_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { error: rErr } = await sb.from("community_post_people").update({ status: "removed", answered_at: new Date().toISOString() })
    .eq("tagged_id", me).eq("tagger_id", id).eq("status", "pending");
  if (rErr) return NextResponse.json({ error: `받지 않기로 했지만 기다리던 태그를 지우지 못했어요. 다시 시도해 주세요 (${rErr.message})` }, { status: 500 });
  return NextResponse.json({ ok: true, muted: true });
}
