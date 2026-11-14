/**
 * 챌린지 같이 하기(묶음) — 서버에서만 쓴다.
 * 묶음 = 같은 챌린지를 같은 날 시작하는 사람들. 혼자 참여도 1명 묶음이라 누구의 참여든 초대 코드(/j/<code>)가 있다.
 * 들어가기·열기·나가기·응원은 DB 함수(challenge_group_*)가 줄을 잠그고 한 번에 한다.
 */
import { addDays, todayKst, weekday } from "@/lib/day";
import { runProgress, type ChallengeMetric, type DiaryRow, type RunProgress } from "@/lib/challenges";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
/** 8자 코드 (헷갈리는 0·O·1·l·I 뺌) */
export function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join("");
}
export const CODE_RE = /^[A-Za-z0-9]{8}$/;

export type StartChoice = "today" | "tomorrow" | "monday";
export function startDate(choice: StartChoice, today = todayKst()) {
  if (choice === "tomorrow") return addDays(today, 1);
  if (choice === "monday") { const w = weekday(today); return addDays(today, ((8 - w) % 7) || 7); }
  return today;
}

export const JOIN_MESSAGES: Record<string, string> = {
  closed: "이 묶음은 남은 날이 3일보다 적어 더 들어갈 수 없어요",
  full: "자리가 꽉 찼어요",
  blocked: "이 묶음에는 들어갈 수 없어요",
  missing: "묶음을 찾지 못했어요",
  bad_start: "시작일은 오늘부터 2주 안으로 골라 주세요",
  too_many: "오늘은 묶음을 더 열 수 없어요. 내일 다시 해 주세요",
};

/** 묶음 열기 — 코드가 겹치면 새로 뽑아 세 번까지 */
export async function openGroup(sb: Sb, challengeId: string, actor: string, start: string) {
  const today = todayKst();
  for (let i = 0; i < 3; i++) {
    const code = newCode();
    const { data, error } = await sb.rpc("challenge_group_open", { p_challenge: challengeId, p_user: actor, p_start: start, p_today: today, p_code: code });
    if (error) {
      if (/duplicate key|unique/i.test(error.message)) continue;
      throw new Error(error.message);
    }
    return data as { status: string; group_id?: string; code?: string };
  }
  throw new Error("초대 코드를 만들지 못했어요. 다시 시도해 주세요");
}

export type GroupRow = { id: string; challenge_id: string; host_id: string; code: string; start_on: string; max_members: number; member_count: number; created_at: string };
export type ChallengeRow = { id: string; slug: string; title: string; rule: string; metric: ChallengeMetric; target: number; days: number; goal_days: number | null; is_active: boolean };
export type MemberRow = { challenge_id: string; user_id: string; started_on: string; joined_on: string | null; goal_days_eff: number | null; group_id: string | null; finished_runs: number; show_values: boolean };

/** 묶음의 기간 */
export function groupPeriod(g: Pick<GroupRow, "start_on">, c: Pick<ChallengeRow, "days">) {
  return { start_on: g.start_on, ends_on: addDays(g.start_on, c.days - 1) };
}

/** 한 사람의 진행 — 묶음 시작일부터, 늦게 들어왔으면 앞 날은 'before' */
export function memberRun(c: ChallengeRow, g: Pick<GroupRow, "start_on"> | null, m: MemberRow, diary: DiaryRow[], today = todayKst()): RunProgress {
  return runProgress(c.metric, Number(c.target), c.days, m.started_on, diary.filter((d) => d.date >= m.started_on), today,
    { from: g?.start_on, goal: m.goal_days_eff });
}

/** 여러 사람의 기간 안 식단 기록 (진행표용) */
export async function diaryOf(sb: Sb, users: string[], from: string, to: string) {
  if (!users.length) return new Map<string, DiaryRow[]>();
  const { data, error } = await sb.from("meal_diary").select("user_id, date, meal_type, calories, protein_g, sugar_g, sodium_mg")
    .in("user_id", users).gte("date", from).lte("date", to).limit(20000);
  if (error) throw new Error(error.message);
  const by = new Map<string, DiaryRow[]>();
  for (const r of (data || []) as (DiaryRow & { user_id: string })[]) by.set(r.user_id, [...(by.get(r.user_id) || []), r]);
  return by;
}

export async function nicknames(sb: Sb, users: string[]) {
  if (!users.length) return new Map<string, string>();
  const { data, error } = await sb.from("community_profiles").select("actor_id, nickname").in("actor_id", users);
  if (error) throw new Error(error.message);
  return new Map<string, string>(((data || []) as { actor_id: string; nickname: string }[]).map((r) => [r.actor_id, r.nickname]));
}
