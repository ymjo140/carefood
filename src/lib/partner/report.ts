/**
 * 입점 업체 성과 — 제품별 조회·클릭·기록·담기·즐겨찾기·맛 평가와, 본 사람들의 목표 분포. 서버 전용.
 * 개인 단위 정보는 내보내지 않는다. 목표 분포는 사람이 10명 이상일 때만, 10명 미만인 칸은 가린다. 질환 관련 값은 쓰지 않는다.
 */
import { cellFoods, type PlanGrid } from "@/lib/weekly-plan";
import { CRM_GOALS, goalsOf } from "./crm";
import { DISH_CATEGORY_LABELS, type DishCategory } from "@/types/database";
import { selectAll, selectAllIn, selectUpTo } from "@/lib/supabase/all";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
/** 이 수보다 적은 사람 수는 숫자를 주지 않는다 (누구인지 짐작할 수 없게) */
const MIN_PEOPLE = 10;
const GOAL_LABEL = new Map<string, string>(CRM_GOALS.map((g) => [g.key, g.label]));
/** 노출 자리 (lib/impressions.ts Placement) */
export const PLACEMENT_LABEL: Record<string, string> = {
  home_reco: "홈 · 맞춤 추천", home_cold: "홈 · 처음 온 사람 추천", onboarding_preview: "가입 직후 미리보기",
  product_list: "탐색 · 검색 목록", weekly_fill: "식단 리스트 채우기",
};
const MEAL_LABEL: Record<string, string> = { breakfast: "아침", lunch: "점심", dinner: "저녁", snack: "간식" };
/** 10명 이상인 칸만 비율로 — 나머지는 개수만 알린다 */
function shares(tally: Map<string, Set<string>>, base: number, label: (k: string) => string | undefined) {
  const rows = [...tally.entries()].map(([k, set]) => ({ key: k, label: label(k), n: set.size })).filter((r) => r.label);
  const shown = rows.filter((r) => r.n >= MIN_PEOPLE).sort((a, b) => b.n - a.n);
  return { rows: shown.map((r) => ({ key: r.key, label: r.label as string, share: Math.round((r.n / base) * 100) })), hidden: rows.length - shown.length };
}

/** id 150개씩 나눠 묻고, 묶음마다 1,000줄씩 끝까지 받는다 (PostgREST max-rows — lib/supabase/all.ts) */
function inChunks<T>(ids: string[], run: (part: string[]) => any, order: string | string[] = "id"): Promise<T[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  return selectAllIn<T>(ids, 150, run, order, 1_000_000);
}

const TASTE: Record<string, string> = { less_salty: "싱겁게 먹는 편", less_sweet: "덜 달게 먹는 편", spicy: "맵게 먹는 편", less_fatty: "담백하게 먹는 편" };

/** 사람들의 고른 목표·입맛 비율 (10명 미만 칸은 가림). 프로필이 10명 미만이면 null */
async function profileShares(sb: Sb, userIds: string[]) {
  type P = { user_id: string; goals: string[] | null; concerns: string[] | null; taste_salty: number | null; taste_sweet: number | null; taste_spicy: number | null; taste_fatty: number | null };
  const profs = await inChunks<P>(userIds, (p) => sb.from("user_profiles").select("user_id, goals, concerns, taste_salty, taste_sweet, taste_spicy, taste_fatty").in("user_id", p));
  if (profs.length < MIN_PEOPLE) return null;
  const goalTally = new Map<string, Set<string>>();
  const tasteTally = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, k: string, u: string) => { if (!m.has(k)) m.set(k, new Set()); m.get(k)!.add(u); };
  for (const pr of profs) {
    for (const g of goalsOf(pr)) if (GOAL_LABEL.has(g)) add(goalTally, g, pr.user_id);
    // 맛 단계 1~10 — 3 이하는 덜, 8 이상은 더 찾는 편
    if (pr.taste_salty !== null && pr.taste_salty <= 3) add(tasteTally, "less_salty", pr.user_id);
    if (pr.taste_sweet !== null && pr.taste_sweet <= 3) add(tasteTally, "less_sweet", pr.user_id);
    if (pr.taste_spicy !== null && pr.taste_spicy >= 8) add(tasteTally, "spicy", pr.user_id);
    if (pr.taste_fatty !== null && pr.taste_fatty <= 3) add(tasteTally, "less_fatty", pr.user_id);
  }
  return { n: profs.length, goals: shares(goalTally, profs.length, (k) => GOAL_LABEL.get(k)), tastes: shares(tasteTally, profs.length, (k) => TASTE[k]) };
}

export type CategoryShares = { label: string; people: number; goals: Record<string, number>; tastes: Record<string, number> };
/**
 * 같은 카테고리 평균 — 내 제품이 가장 많은 카테고리의 판매 중 제품(최대 2,000개)을 같은 기간에 본 사람들의 목표·입맛 비율.
 * 3,000명까지만 센다. 10명이 안 되면 null
 */
async function categoryShares(sb: Sb, myIds: string[], since: string, until: string): Promise<CategoryShares | null> {
  const mine = await inChunks<{ dish_category: string | null }>(myIds.slice(0, 600), (p) => sb.from("products").select("dish_category").in("id", p));
  const count = new Map<string, number>();
  for (const r of mine) if (r.dish_category) count.set(r.dish_category, (count.get(r.dish_category) || 0) + 1);
  const cat = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!cat) return null;
  // 같은 종류 제품 2,000개까지 · 본 기록 20,000줄까지 표본 (사람 3,000명이면 충분하다)
  const peers = await selectUpTo<{ id: string }>(() => sb.from("products").select("id").eq("is_purchasable", true).eq("dish_category", cat), "id", 2000);
  const views: { user_id: string | null }[] = [];
  for (let i = 0; i < peers.length && views.length < 20000; i += 150) {
    const part = peers.slice(i, i + 150).map((p) => p.id);
    views.push(...(await selectUpTo<{ user_id: string | null }>(() => sb.from("user_interactions").select("user_id").eq("action", "view").in("product_id", part).gte("created_at", since).lt("created_at", until), "id", 20000 - views.length)));
  }
  const people = [...new Set(views.map((v) => v.user_id).filter(Boolean) as string[])].slice(0, 3000);
  if (people.length < MIN_PEOPLE) return null;
  const sh = await profileShares(sb, people);
  if (!sh) return null;
  return {
    label: DISH_CATEGORY_LABELS[cat as DishCategory] || "같은 카테고리", people: Math.floor(sh.n / 10) * 10,
    goals: Object.fromEntries(sh.goals.rows.map((r) => [r.key, r.share])), tastes: Object.fromEntries(sh.tastes.rows.map((r) => [r.key, r.share])),
  };
}

export type ReportItem = { product_id: string; partner_sku: string; name: string };

/** 셀 기간 — from 이상 to 미만 (ms) */
export type Range = { from: number; to: number };
const kstDay = (ms: number) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);

/**
 * range 가 숫자면 지금부터 그 일수만큼 거슬러 간다. totalsOnly 면 합계만 (지난 기간 비교용 — 맛 평가·본 사람들은 세지 않는다)
 */
export async function buildReport(sb: Sb, items: ReportItem[], range: Range | number, opts: { totalsOnly?: boolean } = {}) {
  const r = typeof range === "number" ? { from: Date.now() - range * 86400e3, to: Date.now() } : range;
  const days = Math.round((r.to - r.from) / 86400e3);
  const since = new Date(r.from).toISOString();
  const until = new Date(r.to).toISOString();
  const sinceDay = kstDay(r.from);
  const lastDay = kstDay(r.to - 1);
  const ids: string[] = [...new Set(items.map((i) => i.product_id))];
  if (ids.length === 0) return { days, products: [], totals: null, placements: [], audience: null };

  type Ev = { product_id: string; user_id: string | null };
  type Diary = Ev & { meal_type: string | null };
  const [views, clicks, diary, favs, reviews, imps, plans] = await Promise.all([
    inChunks<Ev>(ids, (p) => sb.from("user_interactions").select("product_id, user_id").eq("action", "view").in("product_id", p).gte("created_at", since).lt("created_at", until)),
    inChunks<Ev>(ids, (p) => sb.from("product_clicks").select("product_id, user_id").in("product_id", p).gte("created_at", since).lt("created_at", until)),
    inChunks<Diary>(ids, (p) => sb.from("meal_diary").select("product_id, user_id, meal_type").in("product_id", p).gte("date", sinceDay).lte("date", lastDay)),
    inChunks<Ev>(ids, (p) => sb.from("user_favorites").select("product_id, user_id").in("product_id", p).gte("created_at", since).lt("created_at", until)),
    opts.totalsOnly ? Promise.resolve([] as { product_id: string; rating: number | null }[])
      : inChunks<{ product_id: string; rating: number | null }>(ids, (p) => sb.from("product_reviews").select("product_id, rating").in("product_id", p)),
    inChunks<{ product_id: string; count: number; placement: string }>(ids, (p) => sb.from("product_impressions").select("product_id, count, placement").in("product_id", p).gte("day", sinceDay).lte("day", lastDay), ["product_id", "day", "placement"]),
    selectAll<{ user_id: string; grid: unknown }>(() => sb.from("saved_meal_plans").select("user_id, grid").eq("is_active", true).gte("updated_at", since).lt("updated_at", until), "id"),
  ]);

  const idSet = new Set(ids);
  const blank = () => ({ impressions: 0, views: 0, clicks: 0, diary: 0, favorites: 0, plans: 0, rating_sum: 0, rating_n: 0 });
  const by = new Map<string, ReturnType<typeof blank>>(ids.map((id) => [id, blank()]));
  const people = new Set<string>();
  const count = (rows: Ev[], key: "views" | "clicks" | "diary" | "favorites") => {
    for (const r of rows) { const b = by.get(r.product_id); if (b) { b[key]++; if (r.user_id) people.add(r.user_id); } }
  };
  count(views, "views"); count(clicks, "clicks"); count(diary, "diary"); count(favs, "favorites");
  const place = new Map<string, number>();
  for (const r of imps) {
    const b = by.get(r.product_id);
    if (b) { b.impressions += r.count; place.set(r.placement, (place.get(r.placement) || 0) + r.count); }
  }
  // 노출은 사람이 아니라 횟수라 가리지 않는다
  const placements = [...place.entries()].map(([key, count]) => ({ key, label: PLACEMENT_LABEL[key] || "그 밖의 자리", count })).sort((a, b) => b.count - a.count);
  for (const r of reviews) { const b = by.get(r.product_id); if (b && r.rating) { b.rating_sum += r.rating; b.rating_n++; } }
  for (const pl of plans as { user_id: string | null; grid: PlanGrid | null }[]) {
    for (const day of Object.values(pl.grid || {})) for (const cell of Object.values(day || {})) {
      for (const f of cellFoods(cell)) if (f.product_id && idSet.has(f.product_id)) { by.get(f.product_id)!.plans++; if (pl.user_id) people.add(pl.user_id); }
    }
  }

  const nameOf = new Map<string, { name: string; sku: string }>(items.map((i) => [i.product_id, { name: i.name, sku: i.partner_sku }]));
  const products = ids.map((id) => {
    const b = by.get(id)!;
    return {
      product_id: id, name: nameOf.get(id)?.name || "", sku: nameOf.get(id)?.sku || "",
      impressions: b.impressions, views: b.views, clicks: b.clicks, diary: b.diary, favorites: b.favorites, plans: b.plans,
      rating: b.rating_n ? Math.round((b.rating_sum / b.rating_n) * 10) / 10 : null, rating_n: b.rating_n,
    };
  }).sort((a, b) => (b.views + b.clicks * 3 + b.diary * 2) - (a.views + a.clicks * 3 + a.diary * 2));
  // 합계는 모든 제품으로 — 표에는 앞의 100개만 보낸다
  const totals = products.reduce((t, p) => ({
    impressions: t.impressions + p.impressions, views: t.views + p.views, clicks: t.clicks + p.clicks, diary: t.diary + p.diary, favorites: t.favorites + p.favorites, plans: t.plans + p.plans,
  }), { impressions: 0, views: 0, clicks: 0, diary: 0, favorites: 0, plans: 0 });

  // 본·누른·기록한 사람들의 목표·입맛·끼니 — 사람이 10명 이상일 때만, 칸도 10명 이상만 (질환 관심은 쓰지 않는다)
  type Audience = {
    people: number;
    goals: { key: string; label: string; share: number }[]; hidden: number;
    tastes: { key: string; label: string; share: number }[]; tastes_hidden: number;
    meals: { key: string; label: string; share: number }[]; meals_hidden: number; meal_people: number | null;
    category: CategoryShares | null; category_failed: boolean;
  };
  let audience: Audience | { people: null } = { people: null };
  if (!opts.totalsOnly && people.size >= MIN_PEOPLE) {
    const mine = await profileShares(sb, [...people]);
    if (mine) {
      // 끼니 — 내 제품을 식단 기록에 넣은 사람 기준
      const mealTally = new Map<string, Set<string>>();
      const diaryPeople = new Set<string>();
      for (const r of diary) if (r.user_id && r.meal_type) { diaryPeople.add(r.user_id); if (!mealTally.has(r.meal_type)) mealTally.set(r.meal_type, new Set()); mealTally.get(r.meal_type)!.add(r.user_id); }
      const m = diaryPeople.size >= MIN_PEOPLE ? shares(mealTally, diaryPeople.size, (k) => MEAL_LABEL[k]) : { rows: [], hidden: mealTally.size };
      audience = {
        people: Math.floor(mine.n / 10) * 10,
        goals: mine.goals.rows, hidden: mine.goals.hidden, tastes: mine.tastes.rows, tastes_hidden: mine.tastes.hidden,
        meals: m.rows, meals_hidden: m.hidden, meal_people: diaryPeople.size >= MIN_PEOPLE ? Math.floor(diaryPeople.size / 10) * 10 : null,
        ...(await categoryShares(sb, ids, since, until).then(
          (category) => ({ category, category_failed: false }),
          // 비교는 덤 — 못 세면 내 숫자는 그대로 보이고, 화면에 비교를 못 불러왔다고 알린다
          (e: Error) => { console.error("같은 카테고리 비교를 세지 못했어요:", e.message); return { category: null, category_failed: true }; },
        )),
      };
    }
  }
  return { days, products: products.slice(0, 100), totals, placements, audience };
}
