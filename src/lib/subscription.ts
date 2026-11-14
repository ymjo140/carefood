/**
 * 구독 조회 (서버) — 규칙은 lib/plans.ts. 구독은 로그인한 계정만 (익명 아이디는 기기를 바꾸면 사라져서).
 * 결제(토스 빌링)·갱신·해지 API 는 SUBSCRIPTION_ENABLED 를 켤 때 같이 붙인다 (claude/캐릭터-가족관리-기획.md).
 */
import { SUBSCRIPTION_ENABLED } from "@/lib/features";
import { accessOf, liveSub, type Access, type SubRow } from "@/lib/plans";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
export const SUB_COLS = "id, user_id, plan_code, status, source, anchor_at, current_period_start, current_period_end, cancel_at_period_end";

export async function loadAccess(sb: Sb, actor: string, now = new Date()): Promise<Access> {
  if (!SUBSCRIPTION_ENABLED) return accessOf(null, now, false);
  const { data, error } = await sb.from("plan_subscriptions").select(SUB_COLS).eq("user_id", actor).neq("status", "expired").maybeSingle();
  if (error) throw new Error(error.message);
  return accessOf(data as SubRow | null, now, true);
}

/** 여러 사람 한 번에 (알림 보내기 전) — 구독을 열기 전이면 조회하지 않는다 */
export async function loadAccessMany(sb: Sb, users: string[], now = new Date()): Promise<Map<string, Access>> {
  const out = new Map<string, Access>();
  if (!SUBSCRIPTION_ENABLED) { for (const u of users) out.set(u, accessOf(null, now, false)); return out; }
  const byUser = new Map<string, SubRow>();
  for (let i = 0; i < users.length; i += 200) {
    const { data, error } = await sb.from("plan_subscriptions").select(SUB_COLS).in("user_id", users.slice(i, i + 200)).neq("status", "expired");
    if (error) throw new Error(error.message);
    for (const s of (data || []) as SubRow[]) if (liveSub(s, now)) byUser.set(s.user_id, s);
  }
  for (const u of users) out.set(u, accessOf(byUser.get(u), now, true));
  return out;
}
