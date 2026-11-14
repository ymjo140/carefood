"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, EmptyState, Field, RatingStars, SectionHeader, Select, SkeletonList, timeAgo } from "@/components/ui";
import type { PartnerReview, ReviewSummary } from "@/lib/partner/reviews";

type Load = { status: "loading" | "error" | "done"; products: ReviewSummary[]; reviews: PartnerReview[]; total: number; error?: string };

/**
 * 제품 > 리뷰 — 앱에서 내 제품에 남긴 리뷰. 제품별 별점·다시 살 사람 비율, 최근 리뷰 50개.
 * 쓴 사람의 연령·성별·관심사·건강 상태는 오지 않고, 내 고객이면 가명 번호만 붙는다.
 */
export function Reviews({ qs }: { qs: string }) {
  const [item, setItem] = useState("");
  const [state, setState] = useState<Load>({ status: "loading", products: [], reviews: [], total: 0 });
  const seq = useRef(0);

  const load = useCallback(async (it: string) => {
    const my = ++seq.current; // 제품을 빨리 바꾸면 마지막 응답만
    try {
      const r = await fetch(`/api/partner/reviews?${qs}${it ? `&item=${it}` : ""}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (my === seq.current) setState({ status: "done", products: d.products, reviews: d.reviews, total: d.total });
    } catch (e) { if (my === seq.current) setState((s) => ({ ...s, status: "error", error: (e as Error).message || "불러오지 못했어요" })); }
  }, [qs]);
  useEffect(() => { load(item); }, [load, item]);

  if (state.status === "loading" && state.products.length === 0) return <SkeletonList rows={4} thumb={false} />;
  if (state.status === "error") {
    return <EmptyState title="리뷰를 불러오지 못했어요" description={state.error}
      action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState((s) => ({ ...s, status: "loading" })); load(item); }}>다시 불러오기</Button>} />;
  }
  if (state.products.length === 0) {
    return <EmptyState title="앱에 반영된 제품이 없어요" description="검수를 통과한 제품에 앱 사용자가 리뷰를 남기면 여기 모여요" />;
  }
  const reviewed = state.products.filter((p) => p.count > 0);
  if (reviewed.length === 0) {
    return <EmptyState title="아직 리뷰가 없어요" description="앱에서 내 제품을 먹어 본 사람이 별점과 한 줄을 남기면 여기 모여요" />;
  }

  return (
    <section className="flex flex-col gap-8">
      <div>
        <SectionHeader title="제품별 리뷰" />
        <Card className="mt-3">
          <ul className="flex flex-col divide-y divide-line">
            {reviewed.map((p) => (
              <li key={p.item_id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <span className="min-w-0">
                  <span className="block text-label text-ink truncate min-w-32">{p.name}</span>
                  <span className="text-caption text-ink-2">
                    리뷰 <span className="num">{p.count}</span>개{p.rebuy !== null && <> · 다시 살래요 <span className="num">{p.rebuy}%</span></>}
                  </span>
                </span>
                {p.avg !== null && (
                  <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                    <RatingStars value={p.avg} size={14} />
                    <span className="num text-label font-bold text-ink">{p.avg.toFixed(1)}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div>
        <SectionHeader title="최근 리뷰" action={<span className="text-caption text-ink-2"><span className="num">{state.total}</span>개 중 최근 <span className="num">{Math.min(50, state.total)}</span>개</span>} />
        <Field label="제품" className="mt-3 max-w-sm">
          <Select value={item} onChange={(e) => { setItem(e.target.value); setState((s) => ({ ...s, status: "loading" })); }}>
            <option value="">모든 제품</option>
            {reviewed.map((p) => <option key={p.item_id} value={p.item_id}>{p.name}</option>)}
          </Select>
        </Field>
        {state.status === "loading" ? <SkeletonList rows={3} thumb={false} className="mt-3" />
          : state.reviews.length === 0 ? <EmptyState className="mt-3" title="이 제품에는 아직 리뷰가 없어요" description="다른 제품을 골라 보세요" />
          : (
            <ul className="flex flex-col gap-3 mt-3">
              {state.reviews.map((r) => (
                <li key={r.id}>
                  <Card>
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 min-w-0">
                        <RatingStars value={r.rating} size={14} />
                        {r.would_rebuy !== null && <span className="text-caption text-ink-2 whitespace-nowrap">{r.would_rebuy ? "다시 살래요" : "다시 사지 않을래요"}</span>}
                      </span>
                      <span className="text-caption text-ink-3 whitespace-nowrap">{timeAgo(r.created_at)}</span>
                    </div>
                    <p className="text-caption text-ink-2 mt-1 truncate">{r.name}{r.customer && <> · 내 고객 <span className="num">{r.customer}</span></>}</p>
                    {r.comment ? <p className="text-body text-ink mt-2 whitespace-pre-line">{r.comment}</p>
                      : <p className="text-label text-ink-3 mt-2">별점만 남겼어요</p>}
                  </Card>
                </li>
              ))}
            </ul>
          )}
      </div>
    </section>
  );
}
