/**
 * 리뷰 기반 시그널 — 제품 평점·재구매율·맛 체감을 추천에 반영
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export type ProductReviewStats = {
  avgRating: number;       // 1~5
  reviewCount: number;
  rebuyRate: number;        // 0~1
  avgTasteSalty: number;    // 1~5 (데이터 없으면 0)
  avgTasteSweet: number;
  avgTasteSpicy: number;
  avgTasteFatty: number;
};

/**
 * 제품 ID 목록에 대한 리뷰 통계를 일괄 로드한다.
 * 리뷰가 없는 제품은 결과에 포함되지 않는다.
 */
export async function loadProductReviewStats(
  supabase: SupabaseClient,
  productIds: string[],
): Promise<Record<string, ProductReviewStats>> {
  if (productIds.length === 0) return {};

  // 청크 단위 쿼리 (Supabase IN 절 제한 대비)
  const chunkSize = 200;
  const result: Record<string, ProductReviewStats> = {};

  for (let i = 0; i < productIds.length; i += chunkSize) {
    const chunk = productIds.slice(i, i + chunkSize);
    const { data } = await supabase
      .from("product_reviews")
      .select("product_id, rating, would_rebuy, taste_salty_feel, taste_sweet_feel, taste_spicy_feel, taste_fatty_feel")
      .in("product_id", chunk);

    if (!data || data.length === 0) continue;

    // product_id별 그룹핑 + 집계
    const grouped: Record<string, typeof data> = {};
    for (const row of data) {
      const pid = row.product_id as string;
      if (!grouped[pid]) grouped[pid] = [];
      grouped[pid].push(row);
    }

    for (const [pid, rows] of Object.entries(grouped)) {
      const count = rows.length;
      const avgRating = rows.reduce((s: number, r: { rating: number }) => s + r.rating, 0) / count;
      const rebuyCount = rows.filter((r: { would_rebuy: boolean | null }) => r.would_rebuy === true).length;

      result[pid] = {
        avgRating: Math.round(avgRating * 10) / 10,
        reviewCount: count,
        rebuyRate: Math.round((rebuyCount / count) * 100) / 100,
        avgTasteSalty: avgField(rows, "taste_salty_feel"),
        avgTasteSweet: avgField(rows, "taste_sweet_feel"),
        avgTasteSpicy: avgField(rows, "taste_spicy_feel"),
        avgTasteFatty: avgField(rows, "taste_fatty_feel"),
      };
    }
  }

  return result;
}

function avgField(rows: Record<string, unknown>[], field: string): number {
  const valid = rows.filter(r => r[field] != null && (r[field] as number) > 0);
  if (valid.length === 0) return 0;
  return Math.round(valid.reduce((s, r) => s + (r[field] as number), 0) / valid.length * 10) / 10;
}
