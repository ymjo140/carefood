import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId } from "@/lib/actor-server";
import { addDays, todayKst } from "@/lib/day";
import { DIARY_COLS, type DiaryRow } from "@/lib/challenges";
import { MEMBER_COLS, memberRun, memberTarget, type ChallengeRow, type GroupRow, type MemberRow } from "@/lib/challenge-groups";
import { proofDays, proofKey } from "@/lib/challenge-proofs";
import { cohortsOf } from "@/lib/challenge-cohorts";
import { selectAll } from "@/lib/supabase/all";

/**
 * GET /api/community/challenges/[id] — 챌린지 상세 (/community/challenges/[id])
 *   규칙·인증 방법·표지 · 지금 하는 사람 수 · (참여했으면) 내 진행과 묶음 · 공식 챌린지는 기수(모집 중·진행 중)
 *   링크로만인 사람이 만든 챌린지는 참여한 사람만 연다 (초대는 /j/<code>)
 *   다른 사람의 기록은 보내지 않는다 — 인증 사진은 /proofs 에서 사진만.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Row = ChallengeRow & { kind: string; visibility: string; creator_id: string | null; note: string | null; cover_url: string | null; how_to: string | null };

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "챌린지를 찾지 못했어요" }, { status: 404 });
  const actor = await getActorId();
  const sb = createServiceRoleClient() as Sb;
  try {
    const today = todayKst();
    const [{ data: c, error }, { data: mine, error: mErr }, { count, error: nErr }] = await Promise.all([
      sb.from("community_challenges").select("id, slug, title, rule, metric, target, days, goal_days, is_active, proof, kind, visibility, creator_id, note, cover_url, how_to").eq("id", id).maybeSingle(),
      actor ? sb.from("community_challenge_members").select(`${MEMBER_COLS}, challenge_groups(*)`).eq("challenge_id", id).eq("user_id", actor).maybeSingle() : { data: null, error: null },
      sb.from("community_challenge_members").select("user_id", { count: "exact", head: true }).eq("challenge_id", id).gte("started_on", addDays(today, -60)),
    ]);
    if (error || mErr || nErr) throw new Error((error || mErr || nErr).message);
    const ch = c as Row | null;
    if (!ch || !ch.is_active) return NextResponse.json({ error: "챌린지를 찾지 못했어요" }, { status: 404 });
    const me = mine as (MemberRow & { challenge_groups: GroupRow | null }) | null;
    if (ch.kind === "user" && ch.visibility !== "public" && !me && ch.creator_id !== actor) {
      return NextResponse.json({ error: "초대 링크로 들어올 수 있는 챌린지예요" }, { status: 403 });
    }

    let run = null;
    if (me && actor) {
      const g = me.challenge_groups;
      const from = g?.start_on && g.start_on < me.started_on ? g.start_on : me.started_on;
      const [diary, pd] = await Promise.all([
        selectAll<DiaryRow>(() => sb.from("meal_diary").select(DIARY_COLS).eq("user_id", actor).gte("date", from).lte("date", today), "id"),
        proofDays(sb, [ch.id], [actor], from, today),
      ]);
      run = {
        ...memberRun(ch, g, me, diary, today, pd.get(proofKey(ch.id, actor))),
        group: g ? { id: g.id, code: g.code, start_on: g.start_on, member_count: g.member_count } : null,
      };
    }
    const cohorts = ch.kind === "official" ? await cohortsOf(sb, ch, today) : [];
    return NextResponse.json({
      challenge: {
        id: ch.id, title: ch.title, rule: ch.rule, metric: ch.metric, days: ch.days, kind: ch.kind,
        // 열량 구간은 사람마다 — 내 구간만
        target: ch.metric === "kcal_band" ? (me ? memberTarget(ch, me) : null) : Number(ch.target),
        proof: ch.proof === "none" ? "none" : "photo", note: ch.note, cover_url: ch.cover_url, how_to: ch.how_to,
        recent_count: count || 0,
      },
      me: run,
      cohorts,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
