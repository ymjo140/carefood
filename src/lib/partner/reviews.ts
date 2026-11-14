/**
 * 업체 화면 제품 > 리뷰 — 내 제품에 달린 앱 리뷰(product_reviews). 서버 전용.
 *  · 업체에 주는 것: 별점·다시 살지·남긴 말·쓴 날·제품 이름. 쓴 사람이 내 고객이면 가명 번호(업체마다 다름)만.
 *  · 주지 않는 것: 쓴 사람의 연령대·성별·관심사·건강 상태(reviewer_* 칸), 닉네임, 내 고객이 아닌 사람의 어떤 표시도.
 *  · 리뷰 글은 제품 화면에 공개된 글이라 그대로 보여 준다.
 */
import { customerCode } from "./customers";
import { selectAll, selectAllIn } from "@/lib/supabase/all";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type ReviewSummary = { item_id: string; name: string; count: number; avg: number | null; rebuy: number | null; last_at: string | null };
export type PartnerReview = { id: string; item_id: string; name: string; rating: number; would_rebuy: boolean | null; comment: string | null; created_at: string; customer: string | null };

/** 내 제품별 요약(리뷰 많은 순) + 최근 리뷰(item 을 주면 그 제품만) */
export async function partnerReviews(sb: Sb, partnerId: string, opt: { item?: string | null; limit?: number } = {}): Promise<{ products: ReviewSummary[]; reviews: PartnerReview[]; total: number }> {
  const list = await selectAll<{ id: string; product_id: string; name: string }>(() => sb.from("partner_items").select("id, product_id, data->>name").eq("partner_id", partnerId).not("product_id", "is", null), "id");
  if (list.length === 0) return { products: [], reviews: [], total: 0 };
  const itemOf = new Map(list.map((i) => [i.product_id, i]));
  type R = { id: string; product_id: string; user_id: string; rating: number; would_rebuy: boolean | null; comment: string | null; created_at: string };
  const rows = await selectAllIn<R>([...itemOf.keys()], 200, (ids) => sb.from("product_reviews").select("id, product_id, user_id, rating, would_rebuy, comment, created_at").in("product_id", ids), "id");

  const by = new Map<string, R[]>();
  for (const r of rows) (by.get(r.product_id) || by.set(r.product_id, []).get(r.product_id)!).push(r);
  const products: ReviewSummary[] = list.map((i) => {
    const rs = by.get(i.product_id) || [];
    const said = rs.filter((r) => r.would_rebuy !== null);
    return {
      item_id: i.id, name: i.name || "제품", count: rs.length,
      avg: rs.length ? Math.round((rs.reduce((s, r) => s + r.rating, 0) / rs.length) * 10) / 10 : null,
      rebuy: said.length ? Math.round((said.filter((r) => r.would_rebuy).length / said.length) * 100) : null,
      last_at: rs.length ? rs.map((r) => r.created_at).sort().pop()! : null,
    };
  }).sort((a, b) => b.count - a.count || (b.last_at || "").localeCompare(a.last_at || ""));

  const pick = opt.item ? rows.filter((r) => itemOf.get(r.product_id)?.id === opt.item) : rows;
  const recent = [...pick].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, opt.limit ?? 50);
  // 쓴 사람이 내 고객인가 — 이 업체에 결제한 주문이 있는 사람만 가명 번호로
  const writers = [...new Set(recent.map((r) => r.user_id))];
  const bought = new Set<string>();
  if (writers.length) {
    const os = await selectAllIn<{ orders: { user_id: string } }>(writers, 200, (ids) => sb.from("order_items").select("id, orders!inner(user_id)")
      .eq("partner_id", partnerId).not("orders.paid_at", "is", null).in("orders.user_id", ids), "id");
    for (const o of os) bought.add(o.orders.user_id);
  }
  const reviews: PartnerReview[] = recent.map((r) => {
    const it = itemOf.get(r.product_id)!;
    return {
      id: r.id, item_id: it.id, name: it.name || "제품", rating: r.rating, would_rebuy: r.would_rebuy, comment: r.comment?.trim() || null, created_at: r.created_at,
      customer: bought.has(r.user_id) ? customerCode(partnerId, r.user_id) : null,
    };
  });
  return { products, reviews, total: pick.length };
}
