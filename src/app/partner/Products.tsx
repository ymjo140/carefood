"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Chip, ChipRow, EmptyState, Icon, ListRow, SkeletonList, timeAgo } from "@/components/ui";
import { REVIEW_LABELS } from "@/lib/partner/schema";
import { ProductSheet } from "./ProductSheet";

type Claim = { phrase: string; why: string; suggest?: string };
type Item = {
  id: string; partner_sku: string; status: "pending" | "approved" | "rejected" | "discontinued"; review_reasons: string[];
  warnings: string[]; reject_note: string | null; product_id: string | null; updated_at: string; name: string;
  claims: Claim[]; dropped: string | null; price_age: number | null;
};
export type ProductFilter = "all" | "pending" | "approved" | "rejected" | "discontinued";
const STATUS_LABEL: Record<Item["status"], string> = { pending: "검수 중", approved: "반영", rejected: "반려", discontinued: "판매 종료" };
const STATUS_TONE = { pending: "neutral", approved: "positive", rejected: "danger", discontinued: "neutral" } as const;
export const isProductFilter = (v: unknown): v is ProductFilter => typeof v === "string" && ["all", "pending", "approved", "rejected", "discontinued"].includes(v);

/**
 * 제품 > 제품 정보 — 올린 제품의 검수 상태·반려 이유·표현 점검·가격 확인일. 누르면 제품 시트에서 바로 고친다.
 * 상태는 칩으로 거른다(보기 줄 아래 세 번째 탭 줄을 두지 않으려고). 상태를 빨리 바꾸면 마지막 요청만 목록을 바꾼다.
 */
export function ProductInfo({ qs, isDemo = false, counts, initialFilter, onChanged, toUpload }: {
  qs: string; isDemo?: boolean; counts: Record<string, number>; initialFilter?: ProductFilter; onChanged: () => void; toUpload: () => void;
}) {
  const [filter, setFilter] = useState<ProductFilter>(initialFilter || "all");
  const [items, setItems] = useState<{ status: "loading" | "error" | "done"; data?: Item[]; error?: string }>({ status: "loading" });
  const [open, setOpen] = useState<string | null>(null);
  const seq = useRef(0);
  const load = useCallback(async (f: ProductFilter) => {
    const my = ++seq.current;
    try {
      const r = await fetch(`/api/partner/items?${qs}${f === "all" ? "" : `&status=${f}`}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (my === seq.current) setItems({ status: "done", data: d.items });
    } catch (e) { if (my === seq.current) setItems({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);
  useEffect(() => { load(filter); }, [load, filter]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다
  const pick = (f: ProductFilter) => { setItems({ status: "loading" }); setFilter(f); };

  const chips: { value: ProductFilter; label: string; count?: number }[] = [
    { value: "all", label: "전체" },
    { value: "pending", label: "검수 중", count: counts.pending || 0 },
    { value: "approved", label: "반영", count: counts.approved || 0 },
    { value: "rejected", label: "반려", count: counts.rejected || 0 },
    { value: "discontinued", label: "판매 종료", count: counts.discontinued || 0 },
  ];
  return (
    <section>
      <ChipRow className="mb-3">
        {chips.map((c) => (
          <Chip key={c.value} selected={filter === c.value} onClick={() => pick(c.value)}>
            {c.label}{c.count !== undefined && <span className="num ml-1">{c.count}</span>}
          </Chip>
        ))}
      </ChipRow>
      {items.status === "loading" ? <SkeletonList rows={4} thumb={false} />
        : items.status === "error" ? (
          <EmptyState title="제품 목록을 불러오지 못했어요" description={items.error}
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setItems({ status: "loading" }); load(filter); }}>다시 불러오기</Button>} />
        ) : !items.data?.length ? (
          <EmptyState title={filter === "all" ? "아직 올린 제품이 없어요" : `${STATUS_LABEL[filter as Item["status"]]} 제품이 없어요`}
            description={filter === "all" ? "엑셀로 올리거나 설정 > 연동에서 피드를 연결해 주세요" : undefined}
            action={filter === "all" ? <Button size="sm" variant="secondary" onClick={toUpload}>제품 올리기</Button> : undefined} />
        ) : (
          <Card padding="none" className="divide-y divide-line">
            {items.data.map((it) => (
              <ListRow key={it.id} onClick={() => setOpen(it.id)}
                title={it.name}
                meta={
                  <span className="flex flex-col gap-0.5">
                    <span><span className="num">{it.partner_sku}</span> · {timeAgo(it.updated_at)}{it.price_age !== null && it.price_age >= 50 ? <> · 가격 확인 <span className="num">{it.price_age}</span>일 전</> : null}</span>
                    {it.status === "pending" && it.review_reasons.length > 0 && <span>{it.review_reasons.map((r) => REVIEW_LABELS[r] || r).join(" · ")}</span>}
                    {it.reject_note && <span className="text-danger">반려 이유: {it.reject_note}</span>}
                    {it.dropped && <span className="inline-flex items-center gap-1 text-ink"><Icon name="alert" size={14} className="text-danger" />추천에서 빠짐 · {it.dropped}</span>}
                    {it.claims.map((c) => (
                      <span key={c.phrase} className="inline-flex items-start gap-1 text-ink">
                        <Icon name="alert" size={14} className="text-ink-2 shrink-0 mt-0.5" />
                        <span>&lsquo;{c.phrase}&rsquo; — {c.why}{c.suggest ? ` · 바꿀 말: ${c.suggest}` : ""}</span>
                      </span>
                    ))}
                  </span>
                }
                trailing={<Badge tone={STATUS_TONE[it.status]}>{STATUS_LABEL[it.status]}</Badge>}
              />
            ))}
          </Card>
        )}
      <ProductSheet qs={qs} isDemo={isDemo} id={open} onClose={() => setOpen(null)} onSaved={() => { onChanged(); load(filter); }} />
      <p className="text-caption text-ink-2 mt-3">
        제품을 누르면 상태·이유·판매처별 가격을 보고 바로 고칠 수 있어요. 표현 점검은 상품명·소개·강조 문구에서 질병·효능으로 읽힐 수 있는 말을 먼저 알려 드리는 안내예요. 법적 판단은 아니고, 근거를 달면 검수에서 통과될 수 있어요
      </p>
    </section>
  );
}
