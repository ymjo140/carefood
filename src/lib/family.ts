/**
 * 가족 연결 — 서버에서만 쓴다. (기획: claude/캐릭터-가족관리-기획.md)
 * 보는 사람(초대한 사람)은 확인받는 사람이 고른 것만 본다: 끼니 기록 여부 · 고른 제품 · 약 먹었는지 · 열량·영양 숫자.
 * 체중·건강 목표·먹은 음식 이름은 보내지 않는다. 캐릭터는 쓰지 않는다(사실만 글자로).
 */
import { NextResponse } from "next/server";
import { getActorId, getAuthUser } from "@/lib/actor-server";
import { addDays, todayKst } from "@/lib/day";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

// family-2026-11b: 먹은 음식·대신 기록하기 항목이 더해진 동의
export const FAMILY_CONSENT_VERSION = "family-2026-11b";
export const INVITE_DAYS = 7;
export const LABEL_MAX = 10;
export const MED_LABEL_MAX = 20;

export type Scopes = { meals: boolean; products: boolean; meds: boolean; numbers: boolean; foods: boolean; proxy: boolean };
/** 요청으로 더할 수 있는 항목 — 건강 관련 정보·기록 권한이라 확인받는 사람이 따로 켠다 (기본 꺼짐) */
export const ASKABLE = ["foods", "proxy"] as const;
export type Askable = (typeof ASKABLE)[number];
export type LinkKind = "family" | "friend";
export type LinkRow = {
  id: string; viewer_id: string; owner_id: string | null; label: string; code: string; status: "pending" | "active" | "ended"; kind?: LinkKind;
  share_meals: boolean; share_products: boolean; share_meds: boolean; share_numbers: boolean; alert_evening: boolean;
  alert_meds: boolean; allow_nudge: boolean; share_foods: boolean; share_proxy: boolean;
  consented_at: string | null; expires_at: string; created_at: string;
};
export const LINK_COLS = "id, viewer_id, owner_id, label, code, status, kind, share_meals, share_products, share_meds, share_numbers, alert_evening, alert_meds, allow_nudge, share_foods, share_proxy, consented_at, expires_at, created_at";

export const scopesOf = (l: LinkRow): Scopes => ({
  meals: l.share_meals, products: l.share_products, meds: l.share_meds, numbers: l.share_numbers, foods: !!l.share_foods, proxy: !!l.share_proxy,
});
export function cleanScopes(raw: unknown, base: Scopes = { meals: true, products: true, meds: false, numbers: false, foods: false, proxy: false }): Scopes {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const b = (k: keyof Scopes) => (typeof r[k] === "boolean" ? (r[k] as boolean) : base[k]);
  return { meals: b("meals"), products: b("products"), meds: b("meds"), numbers: b("numbers"), foods: b("foods"), proxy: b("proxy") };
}
/** 친구 — 서로 끼니 기록 여부(기본)와, 각자 켤 때만 먹은 음식·숫자. 고른 제품·약 체크·대신 기록하기는 친구에게 없다 */
export const FRIEND_NEVER = ["products", "meds", "proxy"] as const;
export const kindOf = (l: { kind?: string | null }): LinkKind => (l.kind === "friend" ? "friend" : "family");
export const kindWord = (k: LinkKind) => (k === "friend" ? "친구" : "가족");
/** 연결 종류에 맞게 — 친구 연결이면 친구에게 없는 항목은 늘 꺼진다 */
export function limitScopes(kind: LinkKind, s: Scopes): Scopes {
  return kind === "friend" ? { ...s, products: false, meds: false, proxy: false } : s;
}
/** 요청한 것 가운데 아직 꺼진 것만 (같은 걸 두 번 묻지 않게) · 친구에게는 먹은 음식만 물을 수 있다 */
export function askableOf(raw: unknown, s: Scopes, kind: LinkKind = "family"): Askable[] {
  const asks = Array.isArray(raw) ? raw : [];
  return ASKABLE.filter((k) => asks.includes(k) && !s[k] && !(kind === "friend" && k === "proxy"));
}
/** 답에서 켤 것 — 요청한 것 안에서만 (요청하지 않은 항목은 답으로 켤 수 없다) */
export function grantOf(raw: unknown, asks: string[]): Askable[] {
  const g = Array.isArray(raw) ? raw : [];
  return ASKABLE.filter((k) => asks.includes(k) && g.includes(k));
}

/** 가족 연결은 로그인한 계정만 — 기록 주인 id 를 돌려준다 */
export async function accountActor(): Promise<{ actor: string } | { res: NextResponse }> {
  const [user, actor] = await Promise.all([getAuthUser(), getActorId()]);
  if (!user) return { res: NextResponse.json({ error: "로그인이 필요해요", login: true }, { status: 401 }) };
  if (!actor) return { res: NextResponse.json({ error: "접속 정보를 확인하지 못했어요. 페이지를 새로 고쳐 주세요" }, { status: 401 }) };
  return { actor };
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
export function inviteCode() {
  const b = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join("");
}
export const INVITE_RE = /^[A-Za-z0-9]{10}$/;

export const MEALS = ["breakfast", "lunch", "dinner"] as const;
export type FamilyMeal = (typeof MEALS)[number];
export const MEAL_LABEL: Record<FamilyMeal, string> = { breakfast: "아침", lunch: "점심", dinner: "저녁" };
export const isFamilyMeal = (v: unknown): v is FamilyMeal => typeof v === "string" && (MEALS as readonly string[]).includes(v);

/** 가족 하루 보기로 볼 수 있는 날 — 오늘부터 6일 전까지 (주간 보기와 같은 폭) */
export const FAMILY_DAYS = 7;
export function familyDayOk(day: string, today = todayKst()) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= today && day >= addDays(today, -(FAMILY_DAYS - 1));
}

/** 콕 찌르기를 보내도 되는지 — 안 되면 이유(화면 문구), 되면 null
 *  밤 10시~아침 8시는 보내지 않는다(푸시와 같은 조용한 시간). 이미 기록한 끼니·이미 콕 한 끼니는 다시 보내지 않는다 */
export const NUDGE_QUIET = { from: 22, to: 8 };
export function nudgeBlock(x: { allow: boolean; shareMeals: boolean; recorded: boolean; already: boolean; hourKst: number }): string | null {
  if (!x.shareMeals) return "끼니 기록 여부를 보여 주는 가족에게만 보낼 수 있어요";
  if (!x.allow) return "이 가족은 콕 찌르기를 받지 않기로 했어요";
  if (x.hourKst >= NUDGE_QUIET.from || x.hourKst < NUDGE_QUIET.to) return "밤 10시부터 아침 8시까지는 보내지 않아요";
  if (x.recorded) return "이미 기록한 끼니예요";
  if (x.already) return "이 끼니는 오늘 이미 콕 찔렀어요";
  return null;
}
const kst = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(11, 16);

export type FamilyFood = { name: string; amount: string | null; kcal: number | null; by: string | null };
export type FamilyPlanned = { names: string[]; kcal: number | null; from: string | null; note: string | null };
export type FamilyToday = {
  date: string;
  /** foods: 먹은 음식(share_foods) · planned: 그 끼니에 담아 둔 예정(share_foods 또는 share_proxy) — 켜지 않았으면 null */
  meals: { meal: (typeof MEALS)[number]; at: string | null; foods: FamilyFood[] | null; planned: FamilyPlanned | null }[] | null;
  products: { name: string; fact: string; day: string }[] | null;
  product_summary: { total: number; low_sodium: number; protein15: number } | null;
  meds: { id: string; label: string; remind_at: string | null; checked_at: string | null; checked_by: string | null }[] | null;
  numbers: { kcal: number; protein_g: number; sodium_mg: number } | null;
};

/** 보는 사람에게 보여 줄 오늘 — 고른 것만 채우고 나머지는 null (화면은 '보여 주기로 하지 않았어요') */
export async function familyToday(sb: Sb, l: LinkRow, today = todayKst()): Promise<FamilyToday> {
  const owner = l.owner_id!;
  const weekFrom = addDays(today, -6);
  const needDiary = l.share_meals || l.share_numbers || l.share_foods;
  const needPlan = l.share_meals && (l.share_foods || l.share_proxy);
  const [d, w, m, ml, pl] = await Promise.all([
    needDiary ? sb.from("meal_diary").select(`meal_type, calories, protein_g, sodium_mg, created_at${l.share_foods ? ", food_name, serving_g, serving_multiplier, recorded_name" : ""}`)
      .eq("user_id", owner).eq("date", today).order("created_at").limit(500) : { data: [], error: null },
    l.share_products ? sb.from("meal_diary").select("date, product_id, sodium_mg, protein_g, created_at, products(name)").eq("user_id", owner)
      .gte("date", weekFrom).lte("date", today).not("product_id", "is", null).order("created_at", { ascending: false }).limit(200) : { data: [], error: null },
    l.share_meds ? sb.from("med_checks").select("id, label, remind_at, sort").eq("user_id", owner).eq("is_active", true).order("sort").order("created_at") : { data: [], error: null },
    l.share_meds ? sb.from("med_check_log").select("item_id, checked_at, checked_name").eq("user_id", owner).eq("day", today) : { data: [], error: null },
    needPlan ? sb.from("planned_meals").select("meal, foods, plan_title, sent_name, note").eq("user_id", owner).eq("date", today) : { data: [], error: null },
  ]);
  for (const r of [d, w, m, ml, pl]) if (r.error) throw new Error(r.error.message);
  const rows = (d.data || []) as { meal_type: string; calories: number | null; protein_g: number | null; sodium_mg: number | null; created_at: string;
    food_name?: string; serving_g?: number | null; serving_multiplier?: number | null; recorded_name?: string | null }[];
  const plans = new Map(((pl.data || []) as { meal: string; foods: { name?: string; calories?: number }[]; plan_title: string | null; sent_name: string | null; note: string | null }[])
    .map((p) => [p.meal, p]));
  const foodsOf = (meal: string): FamilyFood[] => rows.filter((r) => r.meal_type === meal).map((r) => ({
    name: String(r.food_name || "음식"),
    amount: r.serving_multiplier && Number(r.serving_multiplier) !== 1 ? `${Number(r.serving_multiplier)}인분` : r.serving_g ? `${Math.round(Number(r.serving_g))}g` : null,
    kcal: l.share_numbers && r.calories != null ? Math.round(Number(r.calories)) : null,
    by: r.recorded_name || null,
  }));
  const plannedOf = (meal: string): FamilyPlanned | null => {
    const p = plans.get(meal);
    if (!p || !Array.isArray(p.foods) || !p.foods.length) return null;
    return {
      names: p.foods.map((f) => String(f.name || "음식")).slice(0, 12),
      kcal: l.share_numbers ? Math.round(p.foods.reduce((s, f) => s + (Number(f.calories) || 0), 0)) : null,
      from: p.sent_name || null, note: p.note || null,
    };
  };
  const first = (meal: string) => rows.filter((r) => r.meal_type === meal).map((r) => r.created_at).sort()[0] ?? null;

  // 기록한 양 기준 성분 (기록 줄의 값)
  const seen = new Set<string>();
  const products: NonNullable<FamilyToday["products"]> = [];
  let low = 0, prot = 0;
  for (const r of (w.data || []) as { date: string; product_id: string; sodium_mg: number | null; protein_g: number | null; products: { name: string } | null }[]) {
    if (!r.products || seen.has(r.product_id)) continue;
    seen.add(r.product_id);
    const na = r.sodium_mg != null ? Math.round(Number(r.sodium_mg)) : null;
    const pr = r.protein_g != null ? Math.round(Number(r.protein_g)) : null;
    if (na != null && na <= 600) low++;
    if (pr != null && pr >= 15) prot++;
    products.push({ name: r.products.name, fact: [na != null ? `나트륨 ${na.toLocaleString("ko-KR")}mg` : null, pr != null ? `단백질 ${pr}g` : null].filter(Boolean).join(" · "), day: r.date });
  }
  const checks = new Map(((ml.data || []) as { item_id: string; checked_at: string; checked_name: string | null }[]).map((c) => [c.item_id, c]));
  const sum = (f: "calories" | "protein_g" | "sodium_mg") => Math.round(rows.reduce((s, r) => s + (Number(r[f]) || 0), 0));
  return {
    date: today,
    meals: l.share_meals ? MEALS.map((meal) => {
      const at = first(meal);
      return { meal, at: at ? kst(at) : null, foods: l.share_foods ? foodsOf(meal) : null, planned: needPlan ? plannedOf(meal) : null };
    }) : null,
    products: l.share_products ? products.slice(0, 10) : null,
    product_summary: l.share_products ? { total: products.length, low_sodium: low, protein15: prot } : null,
    meds: l.share_meds ? ((m.data || []) as { id: string; label: string; remind_at: string | null }[]).map((x) => ({
      id: x.id, label: x.label, remind_at: x.remind_at ? x.remind_at.slice(0, 5) : null,
      checked_at: checks.has(x.id) ? kst(checks.get(x.id)!.checked_at) : null, checked_by: checks.get(x.id)?.checked_name || null,
    })) : null,
    numbers: l.share_numbers ? { kcal: sum("calories"), protein_g: sum("protein_g"), sodium_mg: sum("sodium_mg") } : null,
  };
}

export async function logLink(sb: Sb, linkId: string, actor: string, action: "invite" | "accept" | "scopes" | "end" | "request" | "answer", scopes?: Scopes) {
  const { error } = await sb.from("family_link_log").insert({ link_id: linkId, actor, action, scopes: scopes ?? null, consent_version: action === "scopes" ? FAMILY_CONSENT_VERSION : null });
  if (error) throw new Error(error.message);
}

export async function nicknameOf(sb: Sb, actor: string) {
  const { data, error } = await sb.from("community_profiles").select("nickname").eq("actor_id", actor).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.nickname as string | undefined) || null;
}

export type NudgeNotification = { id: string; type: "nudge" | "family_request" | "family_answer"; at: string; who: string; text: string; url: string };
const ASK_TEXT: Record<string, string> = { foods: "먹은 음식", proxy: "대신 기록하기" };

/** 알림함 — 가족 소식: 나를 보는 가족이 지난 3일 안에 콕 찌른 것 · 기다리는 '보여 줄래요?' 요청 · (내가 보낸) 요청에 온 답 (표가 아직 없으면 빈 목록) */
export async function nudgeNotifications(sb: Sb, actor: string): Promise<NudgeNotification[]> {
  const [mine, owned] = await Promise.all([
    sb.from("family_links").select("id, label").eq("viewer_id", actor).eq("status", "active"),
    sb.from("family_links").select("id, viewer_id").eq("owner_id", actor).eq("status", "active"),
  ]);
  if (mine.error) throw new Error(mine.error.message);
  if (owned.error) throw new Error(owned.error.message);
  const out: NudgeNotification[] = [];
  const missing = (e: { code?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205");
  // 내가 보낸 요청에 온 답 (7일)
  const watching = (mine.data || []) as { id: string; label: string }[];
  if (watching.length) {
    const { data: ans, error: aErr } = await sb.from("family_requests").select("id, link_id, status, granted, answered_at").in("link_id", watching.map((w) => w.id))
      .neq("status", "pending").gte("answered_at", new Date(Date.now() - 7 * 86400e3).toISOString()).limit(20);
    if (aErr && !missing(aErr)) throw new Error(aErr.message);
    const labelOf = new Map(watching.map((w) => [w.id, w.label]));
    for (const a of (aErr ? [] : ans || []) as { id: string; link_id: string; status: string; granted: string[]; answered_at: string }[]) {
      out.push({ id: `famans-${a.id}`, type: "family_answer", at: a.answered_at, who: labelOf.get(a.link_id) || "가족",
        text: a.status === "accepted" ? `${a.granted.map((g) => ASK_TEXT[g] || g).join(" · ")} 보여 주기로 했어요` : "지금은 어려워요",
        url: a.status === "accepted" ? `/diary?who=${a.link_id}` : "/family" });
    }
  }
  const links = (owned.data || []) as { id: string; viewer_id: string }[];
  if (!links.length) return out;
  // 나에게 온, 아직 답하지 않은 요청
  const { data: reqs, error: rErr } = await sb.from("family_requests").select("id, link_id, asks, created_at").in("link_id", links.map((l) => l.id)).eq("status", "pending").limit(20);
  if (rErr && !missing(rErr)) throw new Error(rErr.message);
  const { data, error: nErr } = await sb.from("family_nudges").select("id, link_id, meal, created_at").in("link_id", links.map((l) => l.id))
    .gte("created_at", new Date(Date.now() - 3 * 86400e3).toISOString()).order("created_at", { ascending: false }).limit(20);
  if (nErr && !missing(nErr)) throw new Error(nErr.message);
  const viewerOf = new Map(links.map((l) => [l.id, l.viewer_id]));
  const ids = [...new Set(links.map((l) => l.viewer_id))];
  const { data: ps, error: pErr } = await sb.from("community_profiles").select("actor_id, nickname").in("actor_id", ids);
  if (pErr) throw new Error(pErr.message);
  const names = new Map(((ps || []) as { actor_id: string; nickname: string }[]).map((p) => [p.actor_id, p.nickname]));
  for (const r of (rErr ? [] : reqs || []) as { id: string; link_id: string; asks: string[]; created_at: string }[]) {
    out.push({ id: `famreq-${r.id}`, type: "family_request", at: r.created_at, who: names.get(viewerOf.get(r.link_id) || "") || "가족",
      text: r.asks.map((a) => ASK_TEXT[a] || a).join(" · "), url: `/family/request/${r.id}` });
  }
  for (const n of (data || []) as { id: number; link_id: string; meal: FamilyMeal; created_at: string }[]) {
    out.push({ id: `nudge-${n.id}`, type: "nudge", at: n.created_at, who: names.get(viewerOf.get(n.link_id) || "") || "가족", text: MEAL_LABEL[n.meal] || "끼니", url: "/diary" });
  }
  return out;
}
