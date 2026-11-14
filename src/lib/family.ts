/**
 * 가족 연결 — 서버에서만 쓴다. (기획: claude/캐릭터-가족관리-기획.md)
 * 보는 사람(초대한 사람)은 확인받는 사람이 고른 것만 본다: 끼니 기록 여부 · 고른 제품 · 약 먹었는지 · 열량·영양 숫자.
 * 체중·건강 목표·먹은 음식 이름은 보내지 않는다. 캐릭터는 쓰지 않는다(사실만 글자로).
 */
import { NextResponse } from "next/server";
import { getActorId, getAuthUser } from "@/lib/actor-server";
import { addDays, todayKst } from "@/lib/day";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export const FAMILY_CONSENT_VERSION = "family-2026-11";
export const INVITE_DAYS = 7;
export const LABEL_MAX = 10;
export const MED_LABEL_MAX = 20;

export type Scopes = { meals: boolean; products: boolean; meds: boolean; numbers: boolean };
export type LinkRow = {
  id: string; viewer_id: string; owner_id: string | null; label: string; code: string; status: "pending" | "active" | "ended";
  share_meals: boolean; share_products: boolean; share_meds: boolean; share_numbers: boolean; alert_evening: boolean;
  consented_at: string | null; expires_at: string; created_at: string;
};
export const LINK_COLS = "id, viewer_id, owner_id, label, code, status, share_meals, share_products, share_meds, share_numbers, alert_evening, consented_at, expires_at, created_at";

export const scopesOf = (l: LinkRow): Scopes => ({ meals: l.share_meals, products: l.share_products, meds: l.share_meds, numbers: l.share_numbers });
export function cleanScopes(raw: unknown, base: Scopes = { meals: true, products: true, meds: false, numbers: false }): Scopes {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const b = (k: keyof Scopes) => (typeof r[k] === "boolean" ? (r[k] as boolean) : base[k]);
  return { meals: b("meals"), products: b("products"), meds: b("meds"), numbers: b("numbers") };
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

const MEALS = ["breakfast", "lunch", "dinner"] as const;
const kst = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(11, 16);

export type FamilyToday = {
  date: string;
  meals: { meal: (typeof MEALS)[number]; at: string | null }[] | null;
  products: { name: string; fact: string; day: string }[] | null;
  product_summary: { total: number; low_sodium: number; protein15: number } | null;
  meds: { id: string; label: string; remind_at: string | null; checked_at: string | null }[] | null;
  numbers: { kcal: number; protein_g: number; sodium_mg: number } | null;
};

/** 보는 사람에게 보여 줄 오늘 — 고른 것만 채우고 나머지는 null (화면은 '보여 주기로 하지 않았어요') */
export async function familyToday(sb: Sb, l: LinkRow, today = todayKst()): Promise<FamilyToday> {
  const owner = l.owner_id!;
  const weekFrom = addDays(today, -6);
  const needDiary = l.share_meals || l.share_numbers;
  const [d, w, m, ml] = await Promise.all([
    needDiary ? sb.from("meal_diary").select("meal_type, calories, protein_g, sodium_mg, created_at").eq("user_id", owner).eq("date", today).limit(500) : { data: [], error: null },
    l.share_products ? sb.from("meal_diary").select("date, product_id, sodium_mg, protein_g, created_at, products(name)").eq("user_id", owner)
      .gte("date", weekFrom).lte("date", today).not("product_id", "is", null).order("created_at", { ascending: false }).limit(200) : { data: [], error: null },
    l.share_meds ? sb.from("med_checks").select("id, label, remind_at, sort").eq("user_id", owner).eq("is_active", true).order("sort").order("created_at") : { data: [], error: null },
    l.share_meds ? sb.from("med_check_log").select("item_id, checked_at").eq("user_id", owner).eq("day", today) : { data: [], error: null },
  ]);
  for (const r of [d, w, m, ml]) if (r.error) throw new Error(r.error.message);
  const rows = (d.data || []) as { meal_type: string; calories: number | null; protein_g: number | null; sodium_mg: number | null; created_at: string }[];
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
  const checks = new Map(((ml.data || []) as { item_id: string; checked_at: string }[]).map((c) => [c.item_id, c.checked_at]));
  const sum = (f: "calories" | "protein_g" | "sodium_mg") => Math.round(rows.reduce((s, r) => s + (Number(r[f]) || 0), 0));
  return {
    date: today,
    meals: l.share_meals ? MEALS.map((meal) => { const at = first(meal); return { meal, at: at ? kst(at) : null }; }) : null,
    products: l.share_products ? products.slice(0, 10) : null,
    product_summary: l.share_products ? { total: products.length, low_sodium: low, protein15: prot } : null,
    meds: l.share_meds ? ((m.data || []) as { id: string; label: string; remind_at: string | null }[]).map((x) => ({
      id: x.id, label: x.label, remind_at: x.remind_at ? x.remind_at.slice(0, 5) : null, checked_at: checks.has(x.id) ? kst(checks.get(x.id)!) : null,
    })) : null,
    numbers: l.share_numbers ? { kcal: sum("calories"), protein_g: sum("protein_g"), sodium_mg: sum("sodium_mg") } : null,
  };
}

export async function logLink(sb: Sb, linkId: string, actor: string, action: "invite" | "accept" | "scopes" | "end", scopes?: Scopes) {
  const { error } = await sb.from("family_link_log").insert({ link_id: linkId, actor, action, scopes: scopes ?? null, consent_version: action === "scopes" ? FAMILY_CONSENT_VERSION : null });
  if (error) throw new Error(error.message);
}

export async function nicknameOf(sb: Sb, actor: string) {
  const { data, error } = await sb.from("community_profiles").select("nickname").eq("actor_id", actor).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.nickname as string | undefined) || null;
}
