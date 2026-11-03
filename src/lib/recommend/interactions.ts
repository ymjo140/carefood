/**
 * 사용자 인터랙션 로더 — 피드백 루프 핵심
 * 조회/클릭/즐겨찾기 데이터를 추천 스코어링에 반영
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export type UserInteractions = {
  viewedIds: Set<string>;       // 최근 30일 조회한 제품 ID
  clickedIds: Set<string>;      // 최근 30일 가격 클릭한 제품 ID
  favoritedIds: Set<string>;    // 즐겨찾기한 제품 ID
  preferredCategories: Record<string, number>; // 선호 카테고리 (가중 카운트)
};

/**
 * 사용자의 최근 인터랙션 데이터를 로드한다.
 * scoring에서 개인화 보정에 사용.
 */
export async function loadUserInteractions(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserInteractions> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  // 인터랙션 + 즐겨찾기 병렬 로드
  const [interactionsRes, favoritesRes] = await Promise.all([
    supabase
      .from("user_interactions")
      .select("product_id, action")
      .eq("user_id", userId)
      .gte("created_at", thirtyDaysAgo)
      .limit(500),
    supabase
      .from("user_favorites")
      .select("product_id")
      .eq("user_id", userId)
      .limit(200),
  ]);

  const interactions: { product_id: string; action: string }[] =
    interactionsRes.data || [];
  const favorites: { product_id: string }[] =
    favoritesRes.data || [];

  const viewedIds = new Set<string>();
  const clickedIds = new Set<string>();

  for (const i of interactions) {
    if (!i.product_id) continue;
    if (i.action === "view") viewedIds.add(i.product_id);
    if (i.action === "click_price") clickedIds.add(i.product_id);
  }

  const favoritedIds = new Set<string>(favorites.map((f) => f.product_id));

  // 선호 카테고리 집계: click(×3) > view(×1)
  // 제품 카테고리 정보가 필요하므로, 조회/클릭한 제품 ID로 카테고리 조회
  const preferredCategories: Record<string, number> = {};
  const allIds = [...new Set([...viewedIds, ...clickedIds, ...favoritedIds])];

  if (allIds.length > 0) {
    const { data: products } = await supabase
      .from("products")
      .select("id, dish_category")
      .in("id", allIds.slice(0, 200));

    if (products) {
      for (const p of products as { id: string; dish_category: string | null }[]) {
        if (!p.dish_category) continue;
        let weight = 0;
        if (viewedIds.has(p.id)) weight += 1;
        if (clickedIds.has(p.id)) weight += 3;
        if (favoritedIds.has(p.id)) weight += 2;
        preferredCategories[p.dish_category] =
          (preferredCategories[p.dish_category] || 0) + weight;
      }
    }
  }

  return { viewedIds, clickedIds, favoritedIds, preferredCategories };
}
