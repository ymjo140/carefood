/**
 * 고객층(CRM) — 업체가 고른 조건으로 사람을 세고, 검수를 거쳐 오늘끼록이 대신 보낸다. 서버 전용.
 *
 * 지키는 것 (v3 7.5·8장, 11/13 결정)
 *   - 업체에는 조건·인원·합계만 준다. 인원·결과는 10명 미만이면 숫자를 주지 않는다.
 *   - 광고 수신 동의(ads)한 사람에게만 · 21~8시는 야간 동의(night)한 사람에게만
 *   - 고른 목표·입맛 조건을 쓰면 '맞춤 광고 대상 고르기' 동의(targeting)한 사람만 센다. 질환 관심은 조건에 없다.
 *   - 한 사람은 업체 광고를 7일에 2번, 같은 업체 것은 7일에 1번까지 · 한 업체는 7일에 2번 발송
 *   - 같은 조건의 10%는 비교용으로 보내지 않는다(비용 없음)
 *   - 발송비 = 실제로 보낸 사람 수 × 건당 단가. 검수 요청 때 충전금에서 잡아 두고 보낸 뒤 확정, 나머지는 돌려준다
 *   - 메시지 앞에 "(광고)"와 보낸 곳, 끝에 받지 않는 방법이 붙는다 (정보통신망법 제50조④)
 */
import { kstHour } from "@/lib/day";
import { checkClaimsWith, type ClaimHit, type ClaimTerm } from "./claims";
import { wants, SEGMENTS, type SegmentKey } from "./demand";
import { WEEK_MS } from "./quota";
import { selectAll, selectAllIn } from "@/lib/supabase/all";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export const MIN_PEOPLE = 10;
export const HOLDOUT_SHARE = 0.1;
export const PER_USER_WEEK = 2;
export const PER_PARTNER_USER_WEEK = 1;
export const PER_PARTNER_WEEK = 2;
export const RESULT_DAYS = 7;

/** 조건에 쓰는 목표 — 질환 관심(diabetes·blood_pressure·kidney)은 넣지 않는다 */
export const CRM_GOALS = [
  { key: "weight_loss", label: "체중 관리" },
  { key: "muscle", label: "근력·체력" },
  { key: "balanced", label: "균형 식단" },
  { key: "energy", label: "활력" },
  { key: "gut_health", label: "장 건강" },
  { key: "skin", label: "피부" },
] as const;
export type CrmGoal = (typeof CRM_GOALS)[number]["key"];

export const BEHAVIORS = [
  { key: "viewed", label: "내 제품을 본 사람" },
  { key: "saved", label: "내 제품을 담은 사람" },
  { key: "clicked", label: "내 구매 링크를 누른 사람" },
  { key: "never_seen", label: "아직 내 제품을 본 적 없는 사람" },
] as const;
export type Behavior = (typeof BEHAVIORS)[number]["key"];
export const BEHAVIOR_DAYS = [7, 30, 90] as const;

export const TEMPLATES = {
  new: { label: "신제품", title: "새 제품이 나왔어요", body: "{제품}이 새로 들어왔어요" },
  discount: { label: "할인", title: "할인 중이에요", body: "{제품}을 지금 할인해요" },
  restock: { label: "재입고", title: "다시 들어왔어요", body: "{제품}이 다시 들어왔어요" },
  groupbuy: { label: "공구 열림", title: "공구가 열렸어요", body: "{제품} 공구에 함께해요" },
} as const;
export type Template = keyof typeof TEMPLATES;

export type Conditions = {
  behavior?: { action: Behavior; days: (typeof BEHAVIOR_DAYS)[number] } | null;
  goals?: CrmGoal[];
  needs?: SegmentKey[];
};

/** 들어온 조건을 허용된 값만 남겨 정리한다 */
export function cleanConditions(raw: unknown): Conditions {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const b = r.behavior as { action?: unknown; days?: unknown } | null | undefined;
  const behavior = b && BEHAVIORS.some((x) => x.key === b.action) && BEHAVIOR_DAYS.includes(Number(b.days) as 7)
    ? { action: b.action as Behavior, days: Number(b.days) as (typeof BEHAVIOR_DAYS)[number] } : null;
  const goals = Array.isArray(r.goals) ? [...new Set(r.goals.filter((g): g is CrmGoal => CRM_GOALS.some((x) => x.key === g)))] : [];
  const needs = Array.isArray(r.needs) ? [...new Set(r.needs.filter((k): k is SegmentKey => SEGMENTS.some((s) => s.key === k)))] : [];
  return { behavior, goals, needs };
}

export function isEmptyConditions(c: Conditions) {
  return !c.behavior && !c.goals?.length && !c.needs?.length;
}

/** 사람이 읽는 조건 요약 — "체중 관리 목표 · 단백질 많은 한 끼를 찾는 · 30일 안에 내 제품을 본 사람" */
export function describeConditions(c: Conditions): string {
  const parts: string[] = [];
  if (c.goals?.length) parts.push(`${c.goals.map((g) => CRM_GOALS.find((x) => x.key === g)?.label).filter(Boolean).join("·")} 목표`);
  if (c.needs?.length) parts.push(`${c.needs.map((k) => SEGMENTS.find((s) => s.key === k)?.label).filter(Boolean).join("·")}를 찾는`);
  if (c.behavior) {
    const label = BEHAVIORS.find((x) => x.key === c.behavior!.action)!.label;
    parts.push(c.behavior.action === "never_seen" ? label : `${c.behavior.days}일 안에 ${label}`);
  }
  return parts.length ? parts.join(" · ") : "광고를 받기로 한 모든 사람";
}

/** 21시~8시(한국 시간)에 보내는지 */
export function isNight(at: number) {
  const h = kstHour(at);
  return h >= 21 || h < 8;
}

/** 10명 미만은 숫자를 주지 않는다 */
export const masked = (n: number) => (n >= MIN_PEOPLE ? n : null);

/** 표가 아직 없으면(마이그레이션 전) true — 화면은 '준비 중'으로 보인다 */
export function notReady(e: { code?: string; message?: string } | null | undefined) {
  return !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|Could not find the table/i.test(e.message || ""));
}

/** id 300개씩 나눠 묻고, 묶음마다 1,000줄씩 끝까지 받는다 (PostgREST max-rows — lib/supabase/all.ts) */
function chunked<T>(ids: string[], run: (part: string[]) => any, order: string | string[] = "id"): Promise<T[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  return selectAllIn<T>(ids, 300, run, order);
}

async function partnerProductIds(sb: Sb, partnerId: string): Promise<string[]> {
  const data = await selectAll<{ product_id: string }>(() => sb.from("partner_items").select("product_id").eq("partner_id", partnerId).not("product_id", "is", null), "id");
  return [...new Set(data.map((r) => r.product_id))];
}

/** 최근 행동으로 고른 사람 */
async function behaviorSet(sb: Sb, partnerId: string, b: NonNullable<Conditions["behavior"]>): Promise<Set<string>> {
  const days = b.action === "never_seen" ? 90 : b.days;
  const since = new Date(Date.now() - days * 86400e3).toISOString();
  const sinceDay = new Date(Date.now() + 9 * 3600e3 - days * 86400e3).toISOString().slice(0, 10);
  const ids = await partnerProductIds(sb, partnerId);
  const out = new Set<string>();
  if (!ids.length) return out;
  type Row = { user_id: string | null };
  const add = (rows: Row[]) => { for (const r of rows) if (r.user_id) out.add(r.user_id); };
  if (b.action === "viewed" || b.action === "never_seen") {
    add(await chunked<Row>(ids, (p) => sb.from("user_interactions").select("user_id").eq("action", "view").in("product_id", p).gte("created_at", since)));
  } else if (b.action === "saved") {
    const [f, d] = await Promise.all([
      chunked<Row>(ids, (p) => sb.from("user_favorites").select("user_id").in("product_id", p).gte("created_at", since)),
      chunked<Row>(ids, (p) => sb.from("meal_diary").select("user_id").in("product_id", p).gte("date", sinceDay)),
    ]);
    add(f); add(d);
  } else if (b.action === "clicked") {
    add(await selectAll<Row>(() => sb.from("product_clicks").select("user_id").eq("partner_id", partnerId).gte("created_at", since), "id", 500_000));
  }
  return out;
}

/**
 * 고객층 목표 조건에 쓰는 그 사람의 목표.
 * goals(고른 목표 그대로)가 있으면 그것만. 2026-11-14 전에 저장된 프로필은 goals 가 없어 concerns 에서 되짚는데,
 * concerns 의 energy 는 근육·균형만 고른 사람에게도 채워 넣은 값이라 빼고, 근육·균형은 되짚을 수 없어 맞추지 않는다
 * (프로필을 다시 저장하면 goals 가 생긴다).
 */
export function goalsOf(p: { goals: string[] | null; concerns: string[] | null }): string[] {
  if (Array.isArray(p.goals)) return p.goals;
  return (p.concerns || []).filter((g) => g !== "energy").map((g) => (g === "weight" ? "weight_loss" : g));
}

export type Audience = {
  /** 동의한 사람 중 조건에 맞는 사람 (상한·야간 거르기 전) */
  matched: number;
  /** 이번 주 상한에 걸려 빠진 사람 */
  capped: number;
  /** 야간 발송이라 빠진 사람 */
  night_excluded: number;
  /** 지금 보낼 수 있는 사람 (비교용 포함) */
  eligible: string[];
};

/**
 * 조건에 맞고, 지금 보낼 수 있는 사람. 개인 목록은 이 모듈 밖(업체 응답)으로 내보내지 않는다.
 * excludeCampaign: 보내는 중인 발송 자신은 상한 계산에서 뺀다
 */
export async function buildAudience(sb: Sb, partnerId: string, c: Conditions, sendAt: number, excludeCampaign?: string): Promise<Audience> {
  const needsTargeting = !!(c.goals?.length || c.needs?.length);
  const night = isNight(sendAt);
  const cons = await selectAll<{ user_id: string; night: boolean; targeting: boolean }>(() => sb.from("marketing_consents").select("user_id, night, targeting").eq("ads", true), "user_id", 1_000_000);
  let people = cons
    .filter((r) => !needsTargeting || r.targeting);

  if (needsTargeting && people.length) {
    type P = { user_id: string; goals: string[] | null; concerns: string[] | null; diet_type: string | null; taste_salty: number | null; taste_sweet: number | null };
    const profs = await chunked<P>(people.map((p) => p.user_id), (part) => sb.from("user_profiles").select("user_id, goals, concerns, diet_type, taste_salty, taste_sweet").in("user_id", part));
    const ok = new Set<string>();
    for (const p of profs) {
      if (c.goals?.length && !c.goals.some((g) => goalsOf(p).includes(g))) continue;
      if (c.needs?.length) {
        const w = wants({ concerns: p.concerns, diet_type: p.diet_type, taste_salty: p.taste_salty, taste_sweet: p.taste_sweet });
        if (!c.needs.some((k) => w.includes(k))) continue;
      }
      ok.add(p.user_id);
    }
    people = people.filter((p) => ok.has(p.user_id));
  }

  if (c.behavior && people.length) {
    const seen = await behaviorSet(sb, partnerId, c.behavior);
    people = people.filter((p) => (c.behavior!.action === "never_seen" ? !seen.has(p.user_id) : seen.has(p.user_id)));
  }
  const matched = people.length;

  // 야간이면 야간 동의자만
  let night_excluded = 0;
  if (night) { const before = people.length; people = people.filter((p) => p.night); night_excluded = before - people.length; }

  // 7일 상한 — 받은 기록(비교용은 받은 게 아니다)
  let capped = 0;
  if (people.length) {
    const since = new Date(sendAt - WEEK_MS).toISOString();
    type R = { user_id: string; campaign_id: string; partner_campaigns: { partner_id: string } | null };
    const recent = await chunked<R>(people.map((p) => p.user_id), (part) =>
      sb.from("campaign_recipients").select("user_id, campaign_id, partner_campaigns(partner_id)").in("user_id", part).eq("holdout", false).gte("sent_at", since), ["campaign_id", "user_id"]);
    const total = new Map<string, number>(), mine = new Map<string, number>();
    for (const r of recent) {
      if (r.campaign_id === excludeCampaign) continue;
      total.set(r.user_id, (total.get(r.user_id) || 0) + 1);
      if (r.partner_campaigns?.partner_id === partnerId) mine.set(r.user_id, (mine.get(r.user_id) || 0) + 1);
    }
    const before = people.length;
    people = people.filter((p) => (total.get(p.user_id) || 0) < PER_USER_WEEK && (mine.get(p.user_id) || 0) < PER_PARTNER_USER_WEEK);
    capped = before - people.length;
  }
  return { matched, capped, night_excluded, eligible: people.map((p) => p.user_id) };
}

/** 비교용 10%를 뺀 실제 받을 인원 */
export const sendableOf = (eligible: number) => eligible - Math.round(eligible * HOLDOUT_SHARE);

/** 업체에 보여 줄 인원 미리보기 — 숫자는 10명 미만이면 null */
export function previewOf(a: Audience, unitPrice: number | null) {
  const send = sendableOf(a.eligible.length);
  const ok = a.eligible.length >= MIN_PEOPLE;
  return {
    matched: masked(a.matched),
    capped: a.capped >= MIN_PEOPLE ? a.capped : a.capped > 0 ? -1 : 0, // -1 = "10명 미만"
    night_excluded: masked(a.night_excluded),
    eligible: masked(a.eligible.length),
    send: ok ? send : null,
    holdout: ok ? a.eligible.length - send : null,
    cost: ok && unitPrice !== null ? send * unitPrice : null,
    enough: ok,
  };
}

/** 메시지 문구 점검 — 길이·표현 */
export function checkMessage(title: string, body: string, terms?: ClaimTerm[] | null): { error?: string; hits: ClaimHit[] } {
  if (!title.trim() || title.length > 30) return { error: "제목은 1~30자로 적어 주세요", hits: [] };
  if (!body.trim() || body.length > 120) return { error: "본문은 1~120자로 적어 주세요", hits: [] };
  if (/\(광고\)|수신\s*거부/.test(title + body)) return { error: "(광고) 표시와 받지 않는 방법은 오늘끼록이 붙여요. 문구에서 빼 주세요", hits: [] };
  return { hits: checkClaimsWith(terms, title, body) };
}

/** 실제로 나가는 모양 — 알림함·이 기기 알림이 같이 쓴다 */
export function adText(partnerName: string, title: string, body: string) {
  return {
    title: `(광고) ${partnerName} · ${title}`,
    body: `${body}\n받지 않으려면 마이 > 알림 설정에서 끌 수 있어요`,
  };
}

/** 충전금 잔액 (확정된 것만) + 확인을 기다리는 충전 */
export async function creditBalance(sb: Sb, partnerId: string) {
  const data = await selectAll<{ amount: number; status: string; kind: string }>(() => sb.from("partner_credit_ledger").select("amount, status, kind").eq("partner_id", partnerId), "id");
  let balance = 0, pending = 0;
  for (const r of data) {
    if (r.status === "confirmed") balance += r.amount;
    else if (r.status === "requested" && r.kind === "topup") pending += r.amount;
  }
  return { balance, pending };
}

/**
 * 이 업체의 살아 있는 발송(검수 중·예약·보내는 중·보냄) 중 보낼 시각이 from 이후인 것들의 시각(ms).
 * 한도는 fitsWeekly(booked, 보낼 시각, PER_PARTNER_WEEK) 로 보낼 시각 기준으로 센다
 */
export async function bookedTimes(sb: Sb, partnerId: string, from: number, until?: number): Promise<number[]> {
  let q = sb.from("partner_campaigns").select("send_at")
    .eq("partner_id", partnerId).in("status", ["review", "scheduled", "sending", "sent"]).gt("send_at", new Date(from).toISOString());
  if (until !== undefined) q = q.lt("send_at", new Date(until).toISOString());
  const { data, error } = await q.limit(500);
  if (error) throw error;
  return ((data || []) as { send_at: string }[]).map((r) => Date.parse(r.send_at));
}

export type CampaignResult = {
  sent: number | null; opened: number | null; clicked: number | null; click_rate: number | null;
  holdout_click_rate: number | null; purchases: number | null; purchase_amount: number | null; final: boolean;
};

/**
 * 발송 결과 — 받은 사람(비교용 제외)과 비교용의 7일 반응. 사람 단위는 내보내지 않고, 10명 미만 묶음은 가린다.
 * 클릭 = 이 업체 구매 링크 클릭 · 구매 = 그 클릭 번호로 업체가 보고한 구매확정
 */
export async function campaignResult(sb: Sb, partnerId: string, c: { id: string; sent_at: string | null }): Promise<CampaignResult> {
  const empty = { sent: null, opened: null, clicked: null, click_rate: null, holdout_click_rate: null, purchases: null, purchase_amount: null, final: false };
  if (!c.sent_at) return empty;
  const rows = await selectAll<{ user_id: string; holdout: boolean; opened_at: string | null }>(() => sb.from("campaign_recipients").select("user_id, holdout, opened_at").eq("campaign_id", c.id), "user_id", 1_000_000);
  const sentIds = rows.filter((r) => !r.holdout).map((r) => r.user_id);
  const holdIds = rows.filter((r) => r.holdout).map((r) => r.user_id);
  const from = c.sent_at, until = new Date(Date.parse(c.sent_at) + RESULT_DAYS * 86400e3).toISOString();
  type Click = { user_id: string; click_id: string | null };
  const clicksOf = (ids: string[]) => chunked<Click>(ids, (p) =>
    sb.from("product_clicks").select("user_id, click_id").eq("partner_id", partnerId).in("user_id", p).gte("created_at", from).lt("created_at", until));
  const [cs, ch] = await Promise.all([sentIds.length ? clicksOf(sentIds) : [], holdIds.length ? clicksOf(holdIds) : []]);
  const clickers = new Set(cs.map((x) => x.user_id)), holdClickers = new Set(ch.map((x) => x.user_id));
  const clickIds = cs.map((x) => x.click_id).filter((x): x is string => !!x);
  let purchases = 0, amount = 0;
  if (clickIds.length) {
    const conv = await chunked<{ amount: number; status: string }>(clickIds, (p) =>
      sb.from("partner_conversions").select("amount, status").eq("partner_id", partnerId).in("click_id", p));
    for (const v of conv) if (v.status === "confirmed") { purchases++; amount += v.amount; }
  }
  const opened = rows.filter((r) => !r.holdout && r.opened_at).length;
  const rate = (n: number, of: number) => (of >= MIN_PEOPLE ? Math.round((n / of) * 1000) / 10 : null);
  const final = Date.now() > Date.parse(until); // 7일이 지나면 확정
  return {
    sent: masked(sentIds.length), opened: sentIds.length >= MIN_PEOPLE ? opened : null, clicked: sentIds.length >= MIN_PEOPLE ? clickers.size : null,
    click_rate: rate(clickers.size, sentIds.length), holdout_click_rate: rate(holdClickers.size, holdIds.length),
    purchases: sentIds.length >= MIN_PEOPLE ? purchases : null, purchase_amount: sentIds.length >= MIN_PEOPLE ? amount : null, final,
  };
}

/**
 * 발송비 정산 — 잡아 둔 금액을 돌려놓고 실제 발송분을 차감한다. 업체 줄을 잠근 채 DB 함수 하나로 한다
 * (따로 적으면 그 사이에 다른 요청이 돌려놓은 돈을 다시 잡아 잔액이 음수가 될 수 있다). 한 발송은 한 번만 정산된다.
 */
async function settle(sb: Sb, c: { id: string; partner_id: string; held_amount: number }, charge: number, releaseNote: string, chargeNote: string | null) {
  const { error } = await sb.rpc("partner_credit_settle", {
    p_partner: c.partner_id, p_campaign: c.id, p_release: Math.max(0, c.held_amount), p_charge: charge,
    p_release_note: releaseNote, p_charge_note: chargeNote,
  });
  if (error) throw new Error(error.message);
}

/** 잡아 둔 발송비를 모두 돌려준다 (반려·취소·못 보냄) */
export async function releaseHold(sb: Sb, c: { id: string; partner_id: string; held_amount: number }, note: string) {
  if (c.held_amount > 0) await settle(sb, c, 0, note, null);
}

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

type DueCampaign = {
  id: string; partner_id: string; conditions: Conditions; title: string; body: string; product_id: string | null;
  send_at: string; unit_price: number; held_amount: number; partners: { name: string } | null;
};

/**
 * 보낼 때가 된 예약 발송을 보낸다 (/api/push/run 이 30분마다 부른다).
 * 사람은 보내는 순간 다시 센다 — 그새 동의를 끈 사람·상한에 걸린 사람은 빠진다.
 * push: 이 기기 알림을 보내는 함수 (사람별 기기 목록을 받아 보낸다). 없으면 알림함에만 넣는다.
 */
export async function runDueCampaigns(sb: Sb, push?: (userId: string, payload: { title: string; body: string; url: string; tag: string }) => Promise<boolean>) {
  const now = Date.now();
  const { data: due, error } = await sb.from("partner_campaigns")
    .select("id, partner_id, conditions, title, body, product_id, send_at, unit_price, held_amount, partners(name)")
    .eq("status", "scheduled").lte("send_at", new Date(now).toISOString()).order("send_at").limit(20);
  if (error) { if (notReady(error)) return { sent: 0, campaigns: 0 }; throw new Error(error.message); }
  let total = 0, n = 0;
  for (const c of (due || []) as DueCampaign[]) {
    // 먼저 sending 으로 바꿔서 두 번 실행돼도 한 번만 보낸다
    const { data: claimed, error: cErr } = await sb.from("partner_campaigns").update({ status: "sending" }).eq("id", c.id).eq("status", "scheduled").select("id");
    if (cErr) throw new Error(cErr.message);
    if (!claimed?.length) continue;
    try {
      const a = await buildAudience(sb, c.partner_id, cleanConditions(c.conditions), now, c.id);
      if (a.eligible.length < MIN_PEOPLE) {
        await releaseHold(sb, c, "받을 수 있는 사람이 10명 미만이 되어 보내지 않음");
        await sb.from("partner_campaigns").update({ status: "canceled", reject_note: "보낼 때 받을 수 있는 사람이 10명 미만이 되어 보내지 않았어요. 발송비는 돌려드렸어요", sent_count: 0, holdout_count: 0, charged_amount: 0 }).eq("id", c.id);
        continue;
      }
      const mixed = shuffle(a.eligible);
      const holdN = Math.round(mixed.length * HOLDOUT_SHARE);
      const hold = new Set(mixed.slice(0, holdN));
      // 잡아 둔 금액을 넘지 않게 보낼 인원을 맞춘다 (요청 뒤에 사람이 늘었을 수 있다)
      const cap = c.unit_price > 0 ? Math.floor(c.held_amount / c.unit_price) : Infinity;
      const send = mixed.slice(holdN, holdN + Math.min(mixed.length - holdN, cap));
      const sentAt = new Date().toISOString();
      const rows = [...[...hold].map((u) => ({ campaign_id: c.id, user_id: u, holdout: true, sent_at: sentAt })),
        ...send.map((u) => ({ campaign_id: c.id, user_id: u, holdout: false, sent_at: sentAt }))];
      for (let i = 0; i < rows.length; i += 500) {
        const { error: iErr } = await sb.from("campaign_recipients").insert(rows.slice(i, i + 500));
        if (iErr) throw new Error(iErr.message);
      }
      const charged = send.length * c.unit_price;
      await settle(sb, c, charged, "발송비 확정 전 돌려놓음", `발송 ${send.length}명 × ${c.unit_price}원`);
      await sb.from("partner_campaigns").update({ status: "sent", sent_at: sentAt, sent_count: send.length, holdout_count: hold.size, charged_amount: charged }).eq("id", c.id);
      total += send.length; n++;

      // 이 기기 알림은 덤 — 알림함에는 이미 들어갔다
      if (push) {
        const t = adText(c.partners?.name || "입점 업체", c.title, c.body);
        const pushed: string[] = [];
        for (const u of send) if (await push(u, { ...t, url: `/c/${c.id}`, tag: `ad-${c.id}` })) pushed.push(u);
        for (let i = 0; i < pushed.length; i += 300) {
          await sb.from("campaign_recipients").update({ pushed: true }).eq("campaign_id", c.id).in("user_id", pushed.slice(i, i + 300));
        }
      }
    } catch (e) {
      // 보내다 멈추면 검수 대기로 돌리지 않고 멈춘 상태로 둔다 — 관리자가 확인한다 (두 번 보내지 않게)
      console.error("고객층 발송 실패:", c.id, (e as Error).message);
    }
  }
  return { sent: total, campaigns: n };
}

export { SEGMENTS };
