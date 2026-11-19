import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { rateLimit } from "@/lib/rate-limit";
import { ensureNickname } from "@/lib/community-profile";
import { blockedBetween, regramAllowed, regramBlock, type Origin } from "@/lib/community-regram";
import { userPusher } from "@/lib/push";

/**
 * POST /api/community/regram { post_id, note? } — 다른 사람 글을 내 스토리에 올리기 (리그램)
 *   사진·영상이 있는 글만 · 원본 글쓴이가 허락했을 때만 · 어느 쪽이든 차단이면 안 됨 · 한 글에 한 번(unique)
 *   리그램 글은 스토리 줄에만 나오고 피드 목록에는 나오지 않는다. 사진·식단은 원본을 읽는다(복사하지 않음).
 *   원본 글쓴이에게 푸시('○○ 님이 내 글을 스토리에 올렸어요') + 알림함. 내리려면 내 스토리에서 '스토리에서 내리기'(글 지우기)
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const me = await getActorId();
  if (!me) return noActor();
  const body = await request.json().catch(() => ({}));
  if (typeof body.post_id !== "string" || !UUID.test(body.post_id)) return NextResponse.json({ error: "올릴 글을 골라 주세요" }, { status: 400 });
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().replace(/\s+/g, " ").slice(0, 80) : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  try {
    const limited = await rateLimit(sb, request, me, "post");
    if (limited) return limited;
    const { data: o, error } = await sb.from("community_feed").select("id, user_id, is_active, hidden_by_reports, image_urls, video_poster, regram_of").eq("id", body.post_id).maybeSingle();
    if (error) throw new Error(error.message);
    const origin = o as Origin | null;
    const [allow, blocked] = origin ? await Promise.all([regramAllowed(sb, [origin.user_id]), blockedBetween(sb, me, origin.user_id)]) : [new Map(), false];
    const why = regramBlock(origin, { me, allow: origin ? allow.get(origin.user_id) !== false : false, blocked });
    if (why) return NextResponse.json({ error: why }, { status: why === "볼 수 없는 글이에요" ? 404 : 400 });

    const nickname = await ensureNickname(sb, me);
    const { data, error: iErr } = await sb.from("community_feed").insert({
      user_id: me, post_type: "daily", content: note, regram_of: origin!.id, author_nickname: nickname, tags: [], image_urls: [],
      author_age_group: null, author_concerns: [], author_goals: [],
    }).select("id").single();
    if (iErr) {
      if (iErr.code === "23505") return NextResponse.json({ error: "이미 내 스토리에 올린 글이에요" }, { status: 409 });
      throw new Error(iErr.message);
    }
    const push = userPusher(sb);
    if (push) {
      try { await push(origin!.user_id, { title: "스토리", body: `${nickname} 님이 내 글을 스토리에 올렸어요`, url: `/stories?at=regram-${data.id}`, tag: `regram-${data.id}` }); }
      catch (e) { console.error("리그램 푸시를 보내지 못했어요:", (e as Error).message); } // ds-allow: 알림함에는 들어갔다 — 푸시만 빠짐
    }
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
