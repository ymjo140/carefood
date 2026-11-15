/**
 * 구독 요금제 — 화면·서버·시험이 같이 쓰는 규칙 (DB 쓰기 없음). 서버 조회는 lib/subscription.ts.
 * 11/14 바뀜: 재료 캐릭터 1마리는 무료(기록 습관을 만드는 장치). 돈은 그 위의 기능에서 받는다.
 *  - 무료: 기록·챌린지·가족 + 캐릭터 1마리(같이 먹기·칭찬·자라기·끼니 알림).
 *  - 기본 구독: 기록 직후 숫자 체크 · 매 끼니 메뉴 추천 · 주간 리포트.
 *  - 플러스 구독: 기본 구독 + 캐릭터 3마리 · 성격 한 번 바꾸기 · 꾸미기 소품.
 *  - 매달 같은 날 자동 결제 (31일에 시작하면 짧은 달은 그달 마지막 날). 해지해도 남은 기간까지 쓴다.
 *  - 결제가 실패하면 3일 동안은 그대로 쓰고(다시 시도), 그 뒤엔 무료로.
 *  - 환불: 결제 후 7일 안에 해지하고 그 기간에 구독 기능을 한 번도 쓰지 않았으면 전액. 아니면 다음 결제부터 멈춤.
 *  - 구독을 열기 전(SUBSCRIPTION_ENABLED 꺼짐)에는 체험 기간 — 모든 기능을 쓸 수 있다.
 *    열면 구독하지 않은 사람은 저절로 무료가 된다 (결제는 본인이 구독하기를 눌러야만).
 * 가격은 부가세 포함. 바꾸면 DB subscription_plans 도 같이 (가격 인상은 기존 구독자에게 30일 전 안에 따로 동의를 받는다).
 * DB 요금제 코드는 그대로 둔다: basic=무료, kkirok=기본 구독, all=플러스 구독.
 */

export type PlanCode = "basic" | "kkirok" | "all";
/** check: 기록 직후 숫자 체크 · recs: 매 끼니 추천 · report: 주간 리포트 · closet: 꾸미기 · swap: 성격 바꾸기 */
export type Perk = "check" | "recs" | "report" | "closet" | "swap";
export type Plan = { code: PlanCode; name: string; price: number; slots: number; perks: Perk[]; about: string };

export const PLANS: Plan[] = [
  { code: "basic", name: "무료", price: 0, slots: 1, perks: [], about: "기록 · 챌린지 · 가족 · 캐릭터 1마리(하루 5번 이야기)" },
  { code: "kkirok", name: "기본 구독", price: 1900, slots: 1, perks: ["check", "recs", "report"], about: "캐릭터와 하루 50번 이야기 · 숫자 체크 · 매 끼니 메뉴 추천 · 주간 리포트" },
  { code: "all", name: "플러스 구독", price: 3900, slots: 3, perks: ["check", "recs", "report", "closet", "swap"], about: "기본 구독 + 캐릭터 3마리 · 성격 바꾸기 · 꾸미기" },
];
export const ALL_PERKS: Perk[] = ["check", "recs", "report", "closet", "swap"];
/** 체험 기간에 키울 수 있는 캐릭터 수 */
export const BETA_SLOTS = 30;
export const planOf = (code: string | null | undefined) => PLANS.find((p) => p.code === code) ?? PLANS[0];
/** 그 기능이 들어 있는 가장 싼 요금제 */
export const cheapestPlanFor = (perk: Perk) => PLANS.filter((p) => p.perks.includes(perk)).sort((a, b) => a.price - b.price)[0];

export const GRACE_DAYS = 3;
export const REFUND_DAYS = 7;

export type SubStatus = "active" | "canceled" | "past_due" | "expired";
export type SubRow = {
  id: string; user_id: string; plan_code: string; status: SubStatus; source: "pg" | "gift" | "admin";
  anchor_at: string; current_period_start: string; current_period_end: string; cancel_at_period_end: boolean;
};

export type Access = {
  /** beta: 구독을 열기 전 체험 기간 · store: 구독 중 */
  mode: "beta" | "store";
  plan: PlanCode;
  /** 지금 기간이 끝나는 시각 (없으면 null) */
  until: string | null;
  /** 다음 결제가 있나 (해지 예약·선물이면 false) */
  renews: boolean;
  /** 결제가 실패해 다시 시도하는 중 */
  retrying: boolean;
  /** 키울 수 있는 캐릭터 수 */
  slots: number;
  perks: Perk[];
};

const DAY = 86400e3;

/** 지금 쓸 수 있는 구독인가 — 기간 안(결제 실패는 3일 더) */
export function liveSub(s: SubRow | null | undefined, now: Date): SubRow | null {
  if (!s || s.status === "expired") return null;
  const end = new Date(s.current_period_end).getTime() + (s.status === "past_due" ? GRACE_DAYS * DAY : 0);
  return end > now.getTime() ? s : null;
}

export function accessOf(sub: SubRow | null | undefined, now: Date, enabled: boolean): Access {
  const s = liveSub(sub, now);
  const plan = s ? planOf(s.plan_code) : PLANS[0];
  const base = {
    plan: plan.code, until: s?.current_period_end ?? null,
    renews: !!s && s.source === "pg" && !s.cancel_at_period_end && s.status !== "canceled", retrying: s?.status === "past_due",
  };
  if (!enabled) return { mode: "beta", ...base, slots: BETA_SLOTS, perks: [...ALL_PERKS] };
  return { mode: "store", ...base, slots: plan.slots, perks: [...plan.perks] };
}

export const hasPerk = (a: Pick<Access, "perks">, perk: Perk) => a.perks.includes(perk);

/**
 * 캐릭터와 하루에 이야기할 수 있는 횟수 (내가 보낸 말 기준, 한국 시간 자정에 다시) — AI 답에 돈이 들어서 한도를 둔다.
 * 체험 기간 30 · 무료 5 · 구독(기본·플러스) 50. 기록에 반응하는 말·처음 인사는 세지 않는다.
 */
export const CHAT_LIMIT = { beta: 30, free: 5, paid: 50 } as const;
export function chatLimit(a: Pick<Access, "mode" | "plan">) {
  if (a.mode === "beta") return CHAT_LIMIT.beta;
  return a.plan === "basic" ? CHAT_LIMIT.free : CHAT_LIMIT.paid;
}

/**
 * 결제일 n번째 달 — 첫 결제 시각(anchor)에서 n달 뒤, 같은 날·같은 시각 (한국 시간 기준, 없는 날이면 그달 마지막 날).
 * 매번 anchor 에서 세므로 1월 31일 → 2월 28일 → 3월 31일 (28일로 밀리지 않는다).
 */
export function addMonthsKst(anchorIso: string, n: number): string {
  const k = new Date(new Date(anchorIso).getTime() + 9 * 3600e3);
  const y = k.getUTCFullYear(), m = k.getUTCMonth() + n, d = k.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const t = Date.UTC(y, m, Math.min(d, last), k.getUTCHours(), k.getUTCMinutes(), k.getUTCSeconds(), k.getUTCMilliseconds());
  return new Date(t - 9 * 3600e3).toISOString();
}

/** 지금 기간 다음 기간 (갱신할 때) — anchor 에서 몇 번째 달인지 세서 다음 달 끝까지 */
export function nextPeriod(s: Pick<SubRow, "anchor_at" | "current_period_end">): { start: string; end: string } {
  let n = 1;
  while (addMonthsKst(s.anchor_at, n) <= s.current_period_end && n < 1200) n++;
  return { start: s.current_period_end, end: addMonthsKst(s.anchor_at, n) };
}

/** 해지할 때 환불 — 결제 후 7일 안 + 그 기간에 구독 기능을 쓰지 않았으면 전액, 아니면 없음(남은 기간까지 쓰고 멈춤) */
export function refundOnCancel(o: { paidAt: string; now: Date; usedPerk: boolean }): "full" | "none" {
  const within = o.now.getTime() - new Date(o.paidAt).getTime() < REFUND_DAYS * DAY;
  return within && !o.usedPerk ? "full" : "none";
}

/** 요금제 바꾸기 — 올리면 바로(남은 날만큼 차액), 내리면 다음 결제일부터 */
export function changeTiming(from: PlanCode, to: PlanCode): "now" | "next" | "same" {
  const a = planOf(from).price, b = planOf(to).price;
  return a === b ? "same" : b > a ? "now" : "next";
}

/** 올릴 때 이번 기간 남은 날만큼의 차액 (원, 10원 단위 버림) */
export function upgradeCharge(o: { from: PlanCode; to: PlanCode; periodStart: string; periodEnd: string; now: Date }): number {
  const diff = planOf(o.to).price - planOf(o.from).price;
  if (diff <= 0) return 0;
  const s = new Date(o.periodStart).getTime(), e = new Date(o.periodEnd).getTime();
  const left = Math.max(0, Math.min(1, (e - o.now.getTime()) / (e - s)));
  return Math.floor((diff * left) / 10) * 10;
}

export const won = (v: number) => `${v.toLocaleString("ko-KR")}원`;
