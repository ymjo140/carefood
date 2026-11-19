import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId } from "@/lib/actor-server";
import { viewerFilters } from "@/lib/community-safety";
import { audienceOf, canSee } from "@/lib/community-visibility";
import { thumbOf } from "@/lib/community-images";

/**
 * GET /api/community/challenges/[id]/proofs?before=<created_at> — 챌린지 인증 사진 (새것부터 24장)
 *   photo: 작게 보기(400px), full: 원래 사진 — 작게 보기가 없던 예전 사진은 화면이 full 로 돌아간다
 *   사진·닉네임·날짜만 — 숫자·순위·몇 번째 인증인지는 없다(사람끼리 비교하지 않는다).
 *   보는 사람이 볼 수 없는 글(팔로워만·차단·숨김·신고로 가려짐·지운 글)의 사진은 뺀다.
 *   next: 다음 쪽을 부를 before 값 (없으면 끝)
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 24;
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

type Row = {
  id: string; user_id: string; day: string; post_id: string; created_at: string;
  community_uploads: { url: string; taken_at: string | null } | null;
  community_feed: { id: string; user_id: string; visibility: string; is_active: boolean; hidden_by_reports: boolean; author_nickname: string | null } | null;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "챌린지를 찾지 못했어요" }, { status: 404 });
  const before = req.nextUrl.searchParams.get("before");
  const viewer = await getActorId();
  const sb = createServiceRoleClient() as Sb;
  try {
    const [f, a] = await Promise.all([viewerFilters(sb, viewer), audienceOf(sb, viewer)]);
    const items: { id: string; photo: string; full: string; post_id: string; day: string; nickname: string; album: boolean; mine: boolean }[] = [];
    let cursor = before && !Number.isNaN(Date.parse(before)) ? before : null;
    let next: string | null = null;
    // 가려서 빠지는 것이 있으니 몇 번까지 더 읽어 한 쪽을 채운다
    for (let round = 0; round < 4 && items.length < PAGE; round++) {
      let q = sb.from("challenge_proofs")
        .select("id, user_id, day, post_id, created_at, community_uploads(url, taken_at), community_feed(id, user_id, visibility, is_active, hidden_by_reports, author_nickname)")
        .eq("challenge_id", id).eq("status", "ok").order("created_at", { ascending: false }).limit(PAGE * 2);
      if (cursor) q = q.lt("created_at", cursor);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const rows = (data || []) as Row[];
      for (const r of rows) {
        const p = r.community_feed;
        if (!p || !p.is_active || !r.community_uploads?.url) continue;
        const mine = !!viewer && r.user_id === viewer;
        if (!mine && (p.hidden_by_reports || f.blocked.has(r.user_id) || f.hidden.has(p.id) || !canSee(p, a))) continue;
        items.push({ id: r.id, photo: thumbOf(r.community_uploads.url)!, full: r.community_uploads.url, post_id: r.post_id, day: r.day, nickname: p.author_nickname || "익명", album: !r.community_uploads.taken_at, mine });
        if (items.length >= PAGE) { next = r.created_at; break; }
      }
      if (items.length >= PAGE) break;
      if (rows.length < PAGE * 2) { next = null; break; }
      cursor = rows[rows.length - 1].created_at;
      next = cursor;
    }
    return NextResponse.json({ items, next });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
