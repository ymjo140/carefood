/**
 * 몰 가격 다루기 — 상세·식단 리스트·장보기 목록이 같은 규칙을 쓴다
 *
 * - 확인한 지 PRICE_HIDE_DAYS 일이 넘은 가격은 보이지 않는다 (지금 값과 다를 가능성이 커서)
 * - 화면에는 언제 확인한 가격인지 함께 적는다
 */
export type PriceRow = {
  platform: string;
  price: number;
  url: string;
  image_url?: string | null;
  last_crawled_at?: string | null;
  /** 판매처 상품명에서 읽은 묶음 개수 — 못 읽으면 null(낱개로 본다). v_all_prices (20261112_price_pack_count) */
  pack_count?: number | null;
  /** 묶음을 개수로 나눈 한 개 값 */
  unit_price?: number | null;
  /** 입점 업체 가격이면 업체명, 수수료 링크 여부 */
  seller_name?: string | null;
  is_partner?: boolean | null;
};

/** 한 개(한 끼) 값 — 묶음이면 개수로 나눈 값 */
export function unitPrice(r: Pick<PriceRow, "price" | "unit_price">): number {
  return r.unit_price || r.price;
}

/** "12개 묶음 · 개당 2,858원" — 낱개면 null */
export function packLabel(r: Pick<PriceRow, "price" | "pack_count" | "unit_price">): string | null {
  const n = Number(r.pack_count) || 1;
  if (n <= 1) return null;
  return `${n}개 묶음 · 개당 ${unitPrice(r).toLocaleString("ko-KR")}원`;
}

export const PRICE_HIDE_DAYS = 60;

const DAY = 864e5;

export function priceAgeDays(row: Pick<PriceRow, "last_crawled_at">, now = Date.now()) {
  if (!row.last_crawled_at) return null;
  const t = Date.parse(row.last_crawled_at);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / DAY)) : null;
}

/** 0 원·빈 링크·오래된 가격을 빼고 싼 순으로 — 같은 몰이 여러 줄이면 가장 싼 것 하나 */
export function usablePrices<T extends PriceRow>(rows: T[] | null | undefined, now = Date.now()): T[] {
  const best = new Map<string, T>();
  for (const r of rows || []) {
    if (!r || !(r.price > 0) || !r.url) continue;
    const age = priceAgeDays(r, now);
    if (age != null && age > PRICE_HIDE_DAYS) continue;
    const cur = best.get(r.platform);
    if (!cur || r.price < cur.price) best.set(r.platform, r);
  }
  return [...best.values()].sort((a, b) => a.price - b.price);
}

/** "11월 5일 확인" — 가장 오래된 가격 기준 (한 화면에 날짜 하나) */
export function checkedLabel(rows: Pick<PriceRow, "last_crawled_at">[]) {
  const ts = rows.map((r) => (r.last_crawled_at ? Date.parse(r.last_crawled_at) : NaN)).filter(Number.isFinite);
  if (ts.length === 0) return null;
  const d = new Date(Math.min(...ts) + 9 * 3600e3); // KST
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 확인한 가격`;
}

/** 100g(ml) 당 가격 — 총중량을 알 때만 */
export function pricePer100(price: number, totalGrams: number | null | undefined) {
  if (!(price > 0) || !totalGrams || !(totalGrams > 0)) return null;
  return Math.round((price / totalGrams) * 100);
}
