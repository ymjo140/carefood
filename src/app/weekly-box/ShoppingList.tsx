"use client";

import { useEffect, useState } from "react";
import { Button, EmptyState, Icon, Notice, Price, Sheet, SkeletonList, Thumb, TextLink } from "@/components/ui";
import TrackableLink from "@/components/TrackableLink";
import { AFFILIATE_PLATFORMS, COUPANG_DISCLOSURE, platformLabel } from "@/lib/platforms";
import { checkedLabel } from "@/lib/prices";

type ShopPrice = { platform: string; price: number; url: string; last_crawled_at: string | null; pack_count?: number | null; seller_name?: string | null; is_partner?: boolean };
type ShopItem = { product_id: string; name: string; manufacturer: string | null; image_url: string | null; prices: ShopPrice[] };
type Load = { status: "loading" | "error" | "done"; items: ShopItem[]; error?: string };

/**
 * 장보기 목록 — 식단에 담은 제품을 '가장 싼 몰' 기준으로 묶어 몰마다 바로 간다.
 * 통합 주문(결제)이 열리기 전까지 식단 리스트의 주 행동.
 * counts: 제품 id → 이번 주 식단에 들어간 횟수
 */
export function ShoppingList({ open, onClose, counts }: { open: boolean; onClose: () => void; counts: Record<string, number> }) {
  const ids = Object.keys(counts).sort().join(",");
  const [load, setLoad] = useState<Load>({ status: "loading", items: [] });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open || !ids) return;
    let alive = true;
    setLoad({ status: "loading", items: [] }); // eslint-disable-line react-hooks/set-state-in-effect -- 열 때마다 새로 불러온다
    fetch(`/api/shopping-list?ids=${ids}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "불러오지 못했어요");
        if (alive) setLoad({ status: "done", items: d.items || [] });
      })
      .catch((e: Error) => { if (alive) setLoad({ status: "error", items: [], error: e.message }); });
    return () => { alive = false; };
  }, [open, ids, attempt]);

  const priced = load.items.filter((it) => it.prices.length > 0);
  const unpriced = load.items.filter((it) => it.prices.length === 0);
  const groups = new Map<string, ShopItem[]>();
  for (const it of priced) {
    const key = it.prices[0].platform;
    groups.set(key, [...(groups.get(key) || []), it]);
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const allPrices = priced.flatMap((it) => it.prices.slice(0, 1));
  const hasAffiliate = priced.some((it) => AFFILIATE_PLATFORMS.has(it.prices[0].platform));
  const hasPartner = priced.some((it) => it.prices[0].is_partner);
  const sellerOf = (platform: string, items: ShopItem[]) => items[0]?.prices[0].seller_name || platformLabel(platform);

  return (
    <Sheet open={open} onClose={onClose} size="lg" title="장보기 목록"
      description="담은 제품을 가장 싼 몰끼리 묶었어요. 몰마다 따로 사야 해요">
      {load.status === "loading" && <SkeletonList rows={4} />}

      {load.status === "error" && (
        <Notice tone="danger" title="장보기 목록을 불러오지 못했어요">
          <p>{load.error}</p>
          <Button size="sm" variant="secondary" className="mt-2" onClick={() => setAttempt((n) => n + 1)}>다시 불러오기</Button>
        </Notice>
      )}

      {load.status === "done" && priced.length === 0 && (
        <EmptyState title="가격을 찾은 제품이 없어요"
          description="담은 제품 중 지금 파는 곳을 확인한 제품이 없어요. 제품 페이지에서 다른 제품으로 바꿔 보세요" />
      )}

      {load.status === "done" && priced.length > 0 && (
        <div className="flex flex-col gap-6">
          {ordered.map(([platform, items]) => (
            <section key={platform} aria-label={`${sellerOf(platform, items)}에서 살 제품`}>
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <h3 className="text-body font-bold text-ink">{sellerOf(platform, items)} <span className="num text-ink-2 font-medium">{items.length}</span><span className="text-ink-2 font-medium">개</span></h3>
                <Price value={items.reduce((s, it) => s + it.prices[0].price, 0)} className="text-label" />
              </div>
              <ul className="flex flex-col divide-y divide-line border-y border-line">
                {items.map((it) => (
                  <li key={it.product_id} className="flex items-center gap-3 py-2.5">
                    <Thumb src={it.image_url} size={44} />
                    <div className="flex-1 min-w-0">
                      <a href={`/products/${it.product_id}`} className="block text-label font-medium text-ink line-clamp-1 hover:underline">{it.name}</a>
                      <p className="text-caption text-ink-2">
                        {(it.prices[0].pack_count || 1) > 1 && <><span className="num">{it.prices[0].pack_count}</span>개 묶음 · </>}
                        식단에 <span className="num">{counts[it.product_id] || 1}</span>번
                        {it.prices.length > 1 && <> · {platformLabel(it.prices[1].platform)} <span className="num">{it.prices[1].price.toLocaleString()}</span>원</>}
                      </p>
                    </div>
                    <TrackableLink href={it.prices[0].url} productId={it.product_id} platform={platform} placement="shopping_list" partner={!!it.prices[0].is_partner}
                      className="press shrink-0 inline-flex items-center gap-1 h-11 px-3 rounded-md border border-line text-label font-medium text-ink hover:bg-sunken transition-colors">
                      <Price value={it.prices[0].price} className="text-label" />
                      <Icon name="external" size={16} className="text-ink-3" />
                    </TrackableLink>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {unpriced.length > 0 && (
            <section aria-label="가격을 못 찾은 제품">
              <h3 className="text-label font-bold text-ink-2 mb-2">파는 곳을 못 찾은 제품</h3>
              <ul className="flex flex-col gap-1">
                {unpriced.map((it) => (
                  <li key={it.product_id}><TextLink href={`/products/${it.product_id}`}>{it.name}</TextLink></li>
                ))}
              </ul>
            </section>
          )}

          <div className="flex flex-col gap-1 text-caption text-ink-2">
            {checkedLabel(allPrices) && <p>{checkedLabel(allPrices)} · 몰에서 바뀌었을 수 있어요</p>}
            {hasAffiliate && <p>{COUPANG_DISCLOSURE}</p>}
            {hasPartner && <p>입점 업체 링크로 구매하면 오늘끼록이 판매 수수료를 받을 수 있어요</p>}
          </div>
        </div>
      )}
    </Sheet>
  );
}
