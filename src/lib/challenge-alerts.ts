/**
 * 챌린지 같이 하기 알림 — /api/push/run 이 30분마다 부른다 (서버 전용).
 *  - 다 같이 해냈어요: 묶음(2명 이상) 전원이 그날을 해냈을 때 모두에게 한 번.
 *      채우면 바로 아는 규칙은 그날 안에, 하루가 끝나야 아는 규칙('…이하'·구간·비율)은 다음 날 아침 8~12시에 '어제'로.
 *  - 오늘 나만 남았어요: 저녁 7시대, 나머지가 다 해냈는데 한 사람만 남았을 때 그 사람에게만 (하루 한 번, 이름은 다른 사람에게 알리지 않는다).
 *      하루가 끝나야 아는 규칙은 '해냈는지' 대신 '오늘 기록이 있는지'로 본다 — "오늘 나만 기록이 없어요".
 * 숫자(열량·성분)는 알림에 넣지 않는다.
 */
import { addDays } from "@/lib/day";
import { METRIC_META, judgeDay, type DiaryRow } from "@/lib/challenges";
import { MEMBER_COLS, diaryOf, memberTarget, type ChallengeRow, type GroupRow, type MemberRow } from "@/lib/challenge-groups";
import type { PushPayload } from "@/lib/push";
import { selectAllIn } from "@/lib/supabase/all";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
export type GroupAlert = { user: string; key: string; payload: PushPayload };

export const ALONE_HOUR = 19;

/** 계획만 — 보낼 알림 목록 (시험할 수 있게 DB 와 떼어 둔다) */
export function planGroupAlerts(opts: {
  groups: Pick<GroupRow, "id" | "challenge_id" | "start_on">[];
  challenges: Map<string, ChallengeRow>;
  members: MemberRow[];
  diary: Map<string, DiaryRow[]>;
  today: string;
  hour: number;
}): GroupAlert[] {
  const { groups, challenges, members, diary, today, hour } = opts;
  const yesterday = addDays(today, -1);
  const out: GroupAlert[] = [];
  for (const g of groups) {
    const c = challenges.get(g.challenge_id);
    if (!c?.is_active) continue;
    const ends = addDays(g.start_on, c.days - 1);
    const now = METRIC_META[c.metric].decide === "now";
    const ms = members.filter((m) => m.group_id === g.id);
    const rowsOf = (m: MemberRow, day: string) => (diary.get(m.user_id) || []).filter((r) => r.date === day);
    const url = `/community/challenges/g/${g.id}`;

    // ── 다 같이 해냈어요 ──
    const day = now ? today : yesterday;
    const sendAll = now ? true : hour >= 8 && hour < 12;
    if (sendAll && day >= g.start_on && day <= ends) {
      const counted = ms.filter((m) => m.started_on <= day);
      if (counted.length >= 2 && counted.every((m) => judgeDay(c.metric, memberTarget(c, m), rowsOf(m, day)).ok)) {
        const when = day === today ? "오늘" : "어제";
        for (const m of counted) {
          out.push({ user: m.user_id, key: `all:${g.id}:${day}`, payload: {
            title: `${when} ${counted.length}명 모두 해냈어요`, body: `${c.title} — 같이 하는 사람 모두 ${when}을 채웠어요`, url, tag: "challenge",
          } });
        }
      }
    }

    // ── 오늘 나만 남았어요 ──
    if (hour === ALONE_HOUR && today >= g.start_on && today <= ends) {
      const counted = ms.filter((m) => m.started_on <= today);
      if (counted.length >= 2) {
        const left = counted.filter((m) => {
          const rows = rowsOf(m, today);
          return now ? !judgeDay(c.metric, memberTarget(c, m), rows).ok : rows.length === 0;
        });
        if (left.length === 1) {
          const rest = counted.length - 1;
          out.push({ user: left[0].user_id, key: `alone:${today}`, payload: now
            ? { title: "오늘 나만 남았어요", body: `${c.title} — 나머지 ${rest}명은 오늘 해냈어요. 채우면 다 같이 해내요`, url, tag: "challenge" }
            : { title: "오늘 나만 기록이 없어요", body: `${c.title} — 나머지 ${rest}명은 오늘 기록했어요. 한 끼부터 적어 볼까요?`, url: "/diary", tag: "challenge" } });
        }
      }
    }
  }
  return out;
}

/** DB 에서 읽어 계획을 만든다 — 2명 이상인 묶음 중 오늘이나 어제가 기간 안인 것 */
export async function loadGroupAlerts(sb: Sb, today: string, hour: number): Promise<GroupAlert[]> {
  const yesterday = addDays(today, -1);
  const { data: gs, error } = await sb.from("challenge_groups").select("id, challenge_id, start_on, member_count")
    .gte("member_count", 2).lte("start_on", today).gte("start_on", addDays(today, -31)).limit(5000);
  if (error) throw new Error(error.message);
  const groups = (gs || []) as (Pick<GroupRow, "id" | "challenge_id" | "start_on" | "member_count">)[];
  if (!groups.length) return [];
  const cids = [...new Set(groups.map((g) => g.challenge_id))];
  const cs = await selectAllIn<ChallengeRow>(cids, 200, (p) => sb.from("community_challenges")
    .select("id, slug, title, rule, metric, target, days, goal_days, is_active").in("id", p), "id");
  const challenges = new Map(cs.map((c) => [c.id, c]));
  const live = groups.filter((g) => { const c = challenges.get(g.challenge_id); return c && addDays(g.start_on, c.days - 1) >= yesterday; });
  if (!live.length) return [];
  const members = await selectAllIn<MemberRow>(live.map((g) => g.id), 200, (p) => sb.from("community_challenge_members")
    .select(MEMBER_COLS).in("group_id", p), ["challenge_id", "user_id"], 1_000_000);
  const diary = await diaryOf(sb, [...new Set(members.map((m) => m.user_id))], yesterday, today);
  return planGroupAlerts({ groups: live, challenges, members, diary, today, hour });
}
