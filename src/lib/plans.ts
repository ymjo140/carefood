/**
 * 구독 요금제 — 화면·서버·시험이 같이 쓰는 규칙 (DB 쓰기 없음). 서버 조회는 lib/subscription.ts.
 *  - 기본(무료): 캐릭터 없이 글자로만.
 *  - 끼록이 플랜: 끼록이.  모든 캐릭터 플랜: 끼록이·람이·끼냥이.
 *  - 매달 같은 날 자동 결제 (31일에 시작하면 짧은 달은 그달 마지막 날). 해지해도 남은 기간까지 쓴다.
 *  - 결제가 실패하면 3일 동안은 그대로 쓰고(다시 시도), 그 뒤엔 기본으로.
 *  - 환불: 결제 후 7일 안에 해지하고 그 기간에 유료 캐릭터를 한 번도 쓰지 않았으면 전액. 아니면 다음 결제부터 멈춤.
 *  - 구독을 열기 전(SUBSCRIPTION_ENABLED 꺼짐)에는 체험 기간 — 모든 캐릭터를 쓸 수 있다.
 *    열면 구독하지 않은 사람은 저절로 기본이 된다 (결제는 본인이 구독하기를 눌러야만 — 무료에서 유료로 저절로 넘어가지 않는다).
 * 가격은 부가세 포함. 바꾸면 DB subscription_plans 도 같이 (가격 인상은 기존 구독자에게 30일 전 안에 따로 동의를 받는다).
 */
import type { MascotKind } from "@/components/ui/Mascot";

export type PlanCode = "basic" | "kkirok" | "all";
export type Plan = { code: PlanCode; name: string; price: number; characters: MascotKind[]; about: string };

export const PLANS: Plan[] = [
  { code: "basic", name: "기본", price: 0, characters: [], about: "캐릭터 없이 글자로만" },
  { code: "kkirok", name: "끼록이 플랜", price: 1900, characters: ["kkirok"], about: "끼록이와 같이 기록해요" },
  { code: "all", name: "모든 캐릭터 플랜", price: 3900, characters: ["kkirok", "rami", "kkinyang"], about: "끼록이·람이·끼냥이 중 골라요" },
];
export const ALL_KINDS: MascotKind[] = ["kkirok", "rami", "kkinyang"];
export const planOf = (code: string | null | undefined) => PLANS.find((p) => p.code === code) ?? PLANS[0];
/** 그 캐릭터를 쓸 수 있는 가장 싼 요금제 */
export const cheapestPlanFor = (kind: MascotKind) => PLANS.filter((p) => p.characters.includes(kind)).sort((a, b) => a.price - b.price)[0];

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
  characters: MascotKind[];
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
  if (!enabled) return { mode: "beta", ...base, characters: [...ALL_KINDS] };
  return { mode: "store", ...base, characters: [...plan.characters] };
}

/** 고른 캐릭터를 지금 쓸 수 있으면 그대로, 아니면 '캐릭터 없이' (구독이 끝나면 저절로 기본) */
export function effectiveKind(pref: MascotKind | "none", a: Pick<Access, "characters">): MascotKind | "none" {
  return pref !== "none" && a.characters.includes(pref) ? pref : "none";
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

/** 해지할 때 환불 — 결제 후 7일 안 + 그 기간에 유료 캐릭터를 쓰지 않았으면 전액, 아니면 없음(남은 기간까지 쓰고 멈춤) */
export function refundOnCancel(o: { paidAt: string; now: Date; usedPaidCharacter: boolean }): "full" | "none" {
  const within = o.now.getTime() - new Date(o.paidAt).getTime() < REFUND_DAYS * DAY;
  return within && !o.usedPaidCharacter ? "full" : "none";
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
