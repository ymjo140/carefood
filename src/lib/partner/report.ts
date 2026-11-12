/**
 * 입점 업체 성과 — 제품별 조회·클릭·기록·담기·즐겨찾기·맛 평가와, 본 사람들의 목표 분포. 서버 전용.
 * 개인 단위 정보는 내보내지 않는다. 목표 분포는 사람이 10명 이상일 때만, 10명 미만인 칸은 가린다. 질환 관련 값은 쓰지 않는다.
 */
import { cellFoods, type PlanGrid } from "@/lib/weekly-plan";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
/** 이 수보다 적은 사람 수는 숫자를 주지 않는다 (누구인지 짐작할 수 없게) */
const MIN_PEOPLE = 10;
const GOAL_LABELS: Record<string, string> = {
  gut_health: "장 건강", skin: "피부", weight: "체중 관리", weight_loss: "체중 관리", energy: "활력", balanced: "균형 식단", muscle: "근력",
};

async function inChunks<T>(ids: string[], run: (part: string[]) => Promise<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await run(ids.slice(i, i + 150));
    if (error) throw new Error(error.message);
    out.push(...(data || []));
  }
  return out;
}

export type ReportItem = { product_id: string; partner_sku: string; name: string };

export async function buildReport(sb: Sb, items: ReportItem[], days: number) {
  const since = new Date(Date.now() - days * 86400e3).toISOString();
  const sinceDay = new Date(Date.now() + 9 * 3600e3 - days * 86400e3).toISOString().slice(0, 10);
  const ids: string[] = [...new Set(items.map((i) => i.product_id))];
  if (ids.length === 0) return { days, products: [], totals: null, audience: null };

  type Ev = { product_id: string; user_id: string | null };
  const [views, clicks, diary, favs, reviews, imps, plans] = await Promise.all([
    inChunks<Ev>(ids, (p) => sb.from("user_interactions").select("product_id, user_id").eq("action", "view").in("product_id", p).gte("created_at", since).limit(50000)),
    inChunks<Ev>(ids, (p) => sb.from("product_clicks").select("product_id, user_id").in("product_id", p).gte("created_at", since).limit(50000)),
    inChunks<Ev>(ids, (p) => sb.from("meal_diary").select("product_id, user_id").in("product_id", p).gte("date", sinceDay).limit(50000)),
    inChunks<Ev>(ids, (p) => sb.from("user_favorites").select("product_id, user_id").in("product_id", p).gte("created_at", since).limit(50000)),
    inChunks<{ product_id: string; rating: number | null }>(ids, (p) => sb.from("product_reviews").select("product_id, rating").in("product_id", p).limit(50000)),
    inChunks<{ product_id: string; count: number }>(ids, (p) => sb.from("product_impressions").select("product_id, count").in("product_id", p).gte("day", sinceDay).limit(50000)),
    sb.from("saved_meal_plans").select("user_id, grid").eq("is_active", true).gte("updated_at", since).limit(2000),
  ]);
  if (plans.error) throw new Error(plans.error.message);

  const idSet = new Set(ids);
  const blank = () => ({ impressions: 0, views: 0, clicks: 0, diary: 0, favorites: 0, plans: 0, rating_sum: 0, rating_n: 0 });
  const by = new Map<string, ReturnType<typeof blank>>(ids.map((id) => [id, blank()]));
  const people = new Set<string>();
  const count = (rows: Ev[], key: "views" | "clicks" | "diary" | "favorites") => {
    for (const r of rows) { const b = by.get(r.product_id); if (b) { b[key]++; if (r.user_id) people.add(r.user_id); } }
  };
  count(views, "views"); count(clicks, "clicks"); count(diary, "diary"); count(favs, "favorites");
  for (const r of imps) { const b = by.get(r.product_id); if (b) b.impressions += r.count; }
  for (const r of reviews) { const b = by.get(r.product_id); if (b && r.rating) { b.rating_sum += r.rating; b.rating_n++; } }
  for (const pl of (plans.data || []) as { user_id: string | null; grid: PlanGrid | null }[]) {
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
  }).sort((a, b) => (b.views + b.clicks * 3 + b.diary * 2) - (a.views + a.clicks * 3 + a.diary * 2)).slice(0, 100);
  const totals = products.reduce((t, p) => ({
    impressions: t.impressions + p.impressions, views: t.views + p.views, clicks: t.clicks + p.clicks, diary: t.diary + p.diary, favorites: t.favorites + p.favorites, plans: t.plans + p.plans,
  }), { impressions: 0, views: 0, clicks: 0, diary: 0, favorites: 0, plans: 0 });

  // 본·누른·기록한 사람들의 목표 — 10명 이상일 때만, 칸도 10명 이상만
  let audience: { people: number; goals: { label: string; share: number }[]; hidden: number } | { people: null } = { people: null };
  if (people.size >= MIN_PEOPLE) {
    const profs = await inChunks<{ concerns: string[] | null }>([...people], (p) => sb.from("user_profiles").select("concerns").in("user_id", p));
    const tally = new Map<string, number>();
    for (const pr of profs) for (const label of new Set((pr.concerns || []).map((c) => GOAL_LABELS[c]).filter(Boolean))) tally.set(label, (tally.get(label) || 0) + 1);
    const shown = [...tally.entries()].filter(([, n]) => n >= MIN_PEOPLE).sort((a, b) => b[1] - a[1]);
    audience = profs.length >= MIN_PEOPLE
      ? { people: Math.floor(profs.length / 10) * 10, goals: shown.map(([label, n]) => ({ label, share: Math.round((n / profs.length) * 100) })), hidden: tally.size - shown.length }
      : { people: null };
  }
  return { days, products, totals, audience };
}
