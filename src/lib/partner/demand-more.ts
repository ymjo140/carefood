/**
 * 수요 탭의 나머지 세 영역 — 끼니 · 가격대 · 공구 수요 (v3 7.4). 서버 전용.
 * 끼니: 내 제품과 같은 카테고리를 사람들이 어느 끼니에 기록하는지 (사람 기준, 10명 미만 칸은 가림).
 * 가격대: 앱에서 파는 같은 카테고리 제품의 1개당 가격 범위와 내 제품 위치 (판매량이 아니라 올라온 가격).
 * 공구: 내 제품에 연결된 공구의 인원·바라는 가격. 질환 관련 목표는 쓰지 않는다.
 */
import { DISH_CATEGORY_LABELS, type DishCategory } from "@/types/database";
import { selectAll, selectUpTo } from "@/lib/supabase/all";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const MIN_PEOPLE = 10;
const DAY = 86400e3;
const MEALS = [
  { key: "breakfast", label: "아침" }, { key: "lunch", label: "점심" }, { key: "dinner", label: "저녁" }, { key: "snack", label: "간식" },
] as const;
const GB_GOAL: Record<string, string> = { weight: "체중 관리", weight_loss: "체중 관리", gut_health: "장 건강", energy: "활력", skin: "피부", muscle: "근력·체력", balanced: "균형 식단" };

async function chunks<T>(ids: string[], size: number, run: (part: string[]) => Promise<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += size) {
    const { data, error } = await run(ids.slice(i, i + size));
    if (error) throw new Error(error.message);
    out.push(...(data || []));
  }
  return out;
}
const label = (c: string) => DISH_CATEGORY_LABELS[c as DishCategory] || "기타";
const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)))];

export type MealRow = { category: string; label: string; people: number | null; meals: { key: string; label: string; share: number | null }[] };
export type PriceRow = { product_id: string; name: string; category: string; label: string; price: number | null; low: number; mid: number; high: number; count: number; rank: number | null };
export type GroupBuyRow = { id: string; title: string; current: number; target: number; original_price: number | null; target_price: number | null; discount: number | null; goal: string | null; status: string; expires_at: string | null };

export async function buildDemandMore(sb: Sb, pid: string): Promise<{ meals: MealRow[]; prices: PriceRow[]; group_buys: GroupBuyRow[] }> {
  const mine = await selectAll<{ product_id: string; name: string }>(() => sb.from("partner_items").select("product_id, data->>name").eq("partner_id", pid).eq("status", "approved").not("product_id", "is", null), "id");
  const ids = [...new Set(mine.map((m) => m.product_id))];
  if (!ids.length) return { meals: [], prices: [], group_buys: [] };

  const myProducts = await chunks<{ id: string; dish_category: string | null }>(ids, 150, (p) => sb.from("products").select("id, dish_category").in("id", p));
  const catOf = new Map(myProducts.map((p) => [p.id, p.dish_category || "other"]));
  const catCount = new Map<string, number>();
  for (const c of catOf.values()) catCount.set(c, (catCount.get(c) || 0) + 1);
  const cats = [...catCount.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 3);

  // ── 끼니: 지난 28일 식단 기록 중 내 카테고리 제품 ──
  const sinceDay = new Date(Date.now() + 9 * 3600e3 - 28 * DAY).toISOString().slice(0, 10);
  // 최근 기록부터 20,000줄 표본 (끼니 비율만 본다)
  const dRows = await selectUpTo<{ user_id: string; meal_type: string | null; product_id: string }>(() => sb.from("meal_diary").select("user_id, meal_type, product_id").gte("date", sinceDay).not("product_id", "is", null), "-id", 20000);
  const dCats = await chunks<{ id: string; dish_category: string | null }>([...new Set(dRows.map((r) => r.product_id))], 150,
    (p) => sb.from("products").select("id, dish_category").in("id", p).in("dish_category", cats));
  const dCatOf = new Map(dCats.map((p) => [p.id, p.dish_category || "other"]));
  const meals: MealRow[] = cats.map((c) => {
    const all = new Set<string>();
    const byMeal = new Map<string, Set<string>>();
    for (const r of dRows) {
      if (dCatOf.get(r.product_id) !== c || !r.meal_type) continue;
      all.add(r.user_id);
      if (!byMeal.has(r.meal_type)) byMeal.set(r.meal_type, new Set());
      byMeal.get(r.meal_type)!.add(r.user_id);
    }
    const enough = all.size >= MIN_PEOPLE;
    return {
      category: c, label: label(c), people: enough ? Math.floor(all.size / 10) * 10 : null,
      meals: MEALS.map((m) => {
        const k = byMeal.get(m.key)?.size || 0;
        return { key: m.key, label: m.label, share: enough && k >= MIN_PEOPLE ? Math.round((k / all.size) * 100) : null };
      }),
    };
  });

  // ── 가격대: 같은 카테고리의 판매 중 제품별 가장 싼 1개당 가격 ──
  const unit = (r: { price: number; unit_price: number | null }) => r.unit_price || r.price;
  type Price = { product_id: string; price: number; unit_price: number | null };
  const myPrices = await chunks<Price>(ids, 150, (p) => sb.from("v_all_prices").select("product_id, price, unit_price").in("product_id", p).eq("is_available", true));
  const myMin = new Map<string, number>();
  for (const r of myPrices) { const u = unit(r); if (u > 0 && (!myMin.has(r.product_id) || u < myMin.get(r.product_id)!)) myMin.set(r.product_id, u); }
  const ranges = new Map<string, number[]>();
  for (const c of cats) {
    const { data: peers, error: pErr } = await sb.from("products").select("id").eq("is_purchasable", true).eq("dish_category", c).limit(1500);
    if (pErr) throw new Error(pErr.message);
    const peerPrices = await chunks<Price>(((peers || []) as { id: string }[]).map((p) => p.id), 150,
      (p) => sb.from("v_all_prices").select("product_id, price, unit_price").in("product_id", p).eq("is_available", true));
    const min = new Map<string, number>();
    for (const r of peerPrices) { const u = unit(r); if (u > 0 && (!min.has(r.product_id) || u < min.get(r.product_id)!)) min.set(r.product_id, u); }
    ranges.set(c, [...min.values()].sort((a, b) => a - b));
  }
  const prices: PriceRow[] = mine.filter((m) => cats.includes(catOf.get(m.product_id) || "")).slice(0, 30).flatMap((m) => {
    const c = catOf.get(m.product_id)!;
    const r = ranges.get(c) || [];
    if (r.length < 5) return [];
    const price = myMin.get(m.product_id) ?? null;
    // 내 가격보다 싼 제품 비율 (0 = 가장 쌈)
    const rank = price === null ? null : Math.round((r.filter((v) => v < price).length / r.length) * 100);
    return [{ product_id: m.product_id, name: m.name, category: c, label: label(c), price, low: quantile(r, 0.25), mid: quantile(r, 0.5), high: quantile(r, 0.75), count: r.length, rank }];
  });

  // ── 공구 ──
  const gb = await chunks<{ id: string; title: string; current_count: number; target_count: number; original_price: number | null; target_price: number | null; discount_rate: number | null; concern: string | null; status: string; expires_at: string | null }>(
    ids, 150, (p) => sb.from("group_buys").select("id, title, current_count, target_count, original_price, target_price, discount_rate, concern, status, expires_at").in("product_id", p).in("status", ["recruiting", "achieved"]).limit(100));
  // 마감이 지났는데 아직 recruiting 인 공구는 끝난 것으로 보고 뺀다 (공구 목록 API 와 같은 기준)
  const now = Date.now();
  const group_buys: GroupBuyRow[] = gb.filter((g) => g.status !== "recruiting" || !g.expires_at || Date.parse(g.expires_at) > now).map((g) => ({
    id: g.id, title: g.title, current: g.current_count, target: g.target_count, original_price: g.original_price, target_price: g.target_price,
    discount: g.discount_rate !== null ? Math.round(g.discount_rate <= 1 ? g.discount_rate * 100 : g.discount_rate) : null,
    goal: (g.concern && GB_GOAL[g.concern]) || null, status: g.status, expires_at: g.expires_at,
  })).sort((a, b) => b.current - a.current);

  return { meals, prices, group_buys };
}
