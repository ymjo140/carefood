/**
 * 공구 목록·상세·숏폼 줄이 같이 쓰는 덧붙이기 — 서버 전용.
 * - 지금 최저가 (가격 비교와 같은 뷰)
 * - 대표 사진: 진행자 사진 첫 장 → 없으면 제품 사진
 * - 진행자 이름, 진행자가 최근 30일 이 제품을 기록한 횟수 ("써 본 사람" 표시 — 지어낼 수 없는 숫자)
 * - 제품 영양 한 줄 (단백질·열량)
 */
import { addDays, todayKst } from "@/lib/day";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type GroupBuyRow = {
  id: string; creator_id: string; product_id: string | null; product_name: string; title: string | null;
  description: string | null; image_urls?: string[] | null; pack_size?: number | null; wishes?: string[] | null;
  target_count: number; current_count: number | null; target_price: number | null;
  status: string; expires_at: string | null; created_at: string;
};

export async function enrichGroupBuys(sb: Sb, list: GroupBuyRow[]) {
  const pids = [...new Set(list.map((g) => g.product_id).filter(Boolean))] as string[];
  const hosts = [...new Set(list.map((g) => g.creator_id))];
  const since = addDays(todayKst(), -30);

  const [prices, prods, names, diary] = await Promise.all([
    pids.length ? sb.from("v_all_prices").select("product_id, price, last_crawled_at, image_url").in("product_id", pids) : { data: [] },
    pids.length ? sb.from("products").select("id, image_url, protein_g, calories").in("id", pids) : { data: [] },
    hosts.length ? sb.from("community_profiles").select("actor_id, nickname").in("actor_id", hosts) : { data: [] },
    pids.length && hosts.length
      ? sb.from("meal_diary").select("user_id, product_id").in("user_id", hosts).in("product_id", pids).gte("date", since).limit(5000)
      : { data: [] },
  ]);
  for (const r of [prices, prods, names, diary]) if (r.error) throw new Error(r.error.message);

  const lowest = new Map<string, { price: number; checked: string | null; image: string | null }>();
  for (const p of (prices.data || []) as { product_id: string; price: number; last_crawled_at: string | null; image_url: string | null }[]) {
    const cur = lowest.get(p.product_id);
    if (!cur || p.price < cur.price) lowest.set(p.product_id, { price: p.price, checked: p.last_crawled_at, image: p.image_url || cur?.image || null });
  }
  const prod = new Map<string, { image_url: string | null; protein_g: number | null; calories: number | null }>(
    ((prods.data || []) as { id: string; image_url: string | null; protein_g: number | null; calories: number | null }[]).map((p) => [p.id, p]),
  );
  const nick = new Map<string, string>(((names.data || []) as { actor_id: string; nickname: string }[]).map((n) => [n.actor_id, n.nickname]));
  const records = new Map<string, number>();
  for (const d of (diary.data || []) as { user_id: string; product_id: string }[]) {
    const k = `${d.user_id}:${d.product_id}`;
    records.set(k, (records.get(k) || 0) + 1);
  }

  return list.map((g) => {
    const low = g.product_id ? lowest.get(g.product_id) : undefined;
    const p = g.product_id ? prod.get(g.product_id) : undefined;
    return {
      ...g,
      image_urls: g.image_urls || [],
      wishes: g.wishes || [],
      lowest_price: low?.price ?? null,
      lowest_checked_at: low?.checked ?? null,
      image_url: g.image_urls?.[0] || low?.image || p?.image_url || null,
      product_image: low?.image || p?.image_url || null,
      host_nickname: nick.get(g.creator_id) || "익명",
      host_records: g.product_id ? records.get(`${g.creator_id}:${g.product_id}`) || 0 : 0,
      protein_g: p?.protein_g ?? null,
      calories: p?.calories ?? null,
    };
  });
}
