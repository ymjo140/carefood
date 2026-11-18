import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { CANT_TAG, judgeTags } from "@/lib/community-tags";

/**
 * GET /api/community/people?q=이름 — 글에 태그할 사람 찾기 (커뮤니티 이름 앞부분 · 8명)
 *   → { people: [{ id, nickname, can_tag, reason?, pending? }] }
 *   서로 팔로우하지 않아도 찾는다. 태그할 수 있는지는 받는 사람 설정으로 판단하고, 못 하는 이유는 하나로만('태그를 받지 않는 사람이에요').
 *   pending: 받는 사람이 승인해야 글에 보인다. 나를 차단한 사람·내가 차단한 사람은 목록에서 뺀다.
 */
export async function GET(request: NextRequest) {
  await connection();
  const me = await getActorId();
  if (!me) return noActor();
  const q = (request.nextUrl.searchParams.get("q") || "").trim().toLowerCase().replace(/[%_,()\\]/g, "").slice(0, 20);
  if (!q) return NextResponse.json({ people: [] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  try {
    const { data, error } = await sb.from("community_profiles").select("actor_id, nickname").ilike("nickname_key", `${q}%`).neq("actor_id", me).order("nickname_key").limit(12);
    if (error) throw new Error(error.message);
    const rows = (data || []) as { actor_id: string; nickname: string }[];
    const judged = await judgeTags(sb, me, rows.map((r) => r.actor_id));
    const { data: bl, error: bErr } = rows.length
      ? await sb.from("community_blocks").select("blocker_id, blocked_id").or(`blocker_id.eq.${me},blocked_id.eq.${me}`)
      : { data: [], error: null };
    if (bErr) throw new Error(bErr.message);
    const hide = new Set(((bl || []) as { blocker_id: string; blocked_id: string }[]).map((b) => (b.blocker_id === me ? b.blocked_id : b.blocker_id)));
    const people = rows.filter((r) => !hide.has(r.actor_id)).slice(0, 8).map((r) => {
      const rule = judged.get(r.actor_id)?.rule;
      return rule?.ok
        ? { id: r.actor_id, nickname: r.nickname, can_tag: true, pending: rule.status === "pending" }
        : { id: r.actor_id, nickname: r.nickname, can_tag: false, reason: CANT_TAG };
    });
    return NextResponse.json({ people });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
