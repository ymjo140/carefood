"use client";

import { useState } from "react";
import { Button, Card, Estimate, SectionHeader, useToast } from "@/components/ui";

export type InterestItem = { id: string; product_name: string; target_count: number; current_count: number };

/**
 * 관심 제품 — 공동구매(판매·결제·배송)를 열기 전까지는 '관심 표시'만 모은다.
 * 모인 관심 수는 어떤 제품을 들여올지(공구·ODM) 정할 때 쓴다. 가격·할인은 약속하지 않는다.
 */
export function InterestList({ items }: { items: InterestItem[] }) {
  const toast = useToast();
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(items.map((i) => [i.id, i.current_count])));
  const [mine, setMine] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const mark = async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch("/api/community/group-buy/join", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ group_buy_id: id }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setCounts((c) => ({ ...c, [id]: d.current_count ?? (c[id] || 0) + 1 }));
        setMine((m) => ({ ...m, [id]: true }));
        toast.show("관심 표시했어요");
      } else if (d.already) {
        setMine((m) => ({ ...m, [id]: true }));
      } else {
        toast.show("관심 표시하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
      }
    } catch {
      toast.show("관심 표시하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(null); }
  };

  return (
    <Card>
      <SectionHeader title="함께 관심 모으는 제품" />
      <ul className="flex flex-col divide-y divide-line">
        {items.map((gb) => (
          <li key={gb.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-label font-medium text-ink line-clamp-1">{gb.product_name}</p>
              <p className="text-caption text-ink-2"><span className="num">{counts[gb.id] ?? gb.current_count}</span>명 관심</p>
            </div>
            <Button size="sm" variant="secondary" disabled={mine[gb.id]} loading={busy === gb.id} onClick={() => mark(gb.id)}>
              {mine[gb.id] ? "관심 표시함" : "관심 있어요"}
            </Button>
          </li>
        ))}
      </ul>
      <Estimate className="mt-2">아직 판매·결제는 하지 않아요. 관심 수는 어떤 제품을 들여올지 정할 때 써요</Estimate>
    </Card>
  );
}
