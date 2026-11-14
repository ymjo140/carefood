import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { rateLimit } from "@/lib/rate-limit";
import { todayKst } from "@/lib/day";
import { ensureNickname } from "@/lib/community-profile";
import { checkClaimsWith } from "@/lib/partner/claims";
import { loadClaimTerms } from "@/lib/partner/claims-server";
import { JOIN_MESSAGES, newCode, startDate, type StartChoice } from "@/lib/challenge-groups";
import { NOTE_MAX, checkSpec } from "@/lib/challenge-rules";

/**
 * POST /api/community/challenges/new { metric, target, days, goal, start, note?, nickname? } — 내 챌린지 만들기
 *   규칙은 목록(lib/challenge-rules)에서만, 제목·규칙 문장은 자동. 각오(30자)는 금지 표현 사전으로 검사.
 *   만들면 내 묶음이 열리고 만든 사람이 첫 참여자. 링크가 있는 사람만 볼 수 있다.
 *   한도: 하루 3개, 진행 중 5개 (DB 함수 challenge_user_create 가 같은 사람의 요청을 줄 세워 센다)
 *   응답 { challenge_id, group_id, code }
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const LIMIT_MESSAGES: Record<string, string> = {
  too_many: "오늘은 챌린지를 3개까지 만들 수 있어요. 내일 다시 만들어 주세요",
  too_many_active: "진행 중인 내가 만든 챌린지가 5개예요. 하나가 끝나면 만들 수 있어요",
};

export async function POST(request: NextRequest) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const body = await request.json().catch(() => ({}));
  const checked = checkSpec(body);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  const note = typeof body.note === "string" ? body.note.trim().replace(/\s+/g, " ") : "";
  if (note.length > NOTE_MAX) return NextResponse.json({ error: `각오는 ${NOTE_MAX}자까지 쓸 수 있어요` }, { status: 400 });
  const choice: StartChoice = body.start === "tomorrow" || body.start === "monday" ? body.start : "today";

  const sb = createServiceRoleClient() as Sb;
  const limited = await rateLimit(sb, request, actor, "challenge");
  if (limited) return limited;
  try {
    if (note) {
      const [claim] = checkClaimsWith(await loadClaimTerms(sb), note);
      if (claim) return NextResponse.json({ error: `"${claim.phrase}"는 쓸 수 없어요. ${claim.why}${claim.suggest ? ` · 대신 "${claim.suggest}"` : ""}` }, { status: 400 });
    }
    await ensureNickname(sb, actor, body.nickname);
    const today = todayKst();
    for (let i = 0; i < 3; i++) {
      const code = newCode();
      const { data, error } = await sb.rpc("challenge_user_create", {
        p_user: actor, p_metric: checked.spec.metric, p_target: checked.target, p_days: checked.days, p_goal: checked.goal,
        p_title: checked.title, p_rule: checked.rule, p_note: note, p_start: startDate(choice, today), p_today: today, p_code: code,
      });
      if (error) {
        if (/duplicate key|unique/i.test(error.message)) continue;
        throw new Error(error.message);
      }
      if (data.status !== "created") {
        return NextResponse.json({ error: LIMIT_MESSAGES[data.status] || JOIN_MESSAGES[data.status] || "만들지 못했어요" }, { status: 409 });
      }
      return NextResponse.json({ challenge_id: data.challenge_id, group_id: data.group_id, code: data.code, title: checked.title });
    }
    throw new Error("초대 코드를 만들지 못했어요. 다시 시도해 주세요");
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
