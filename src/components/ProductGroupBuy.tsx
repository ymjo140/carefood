"use client";

import { useEffect, useState } from "react";
import { Button, Icon, ListRow, SectionHeader, Skeleton } from "@/components/ui";
import GroupBuyComposer, { type GroupBuyProduct } from "@/components/community/GroupBuyComposer";

/**
 * 제품 상세의 공구 — 이 제품 공구가 모집 중이면 그 공구로, 없으면 이 제품으로 공구 만들기.
 * 네 상태: 불러오는 중(한 줄 자리) · 실패(다시 불러오기) · 모집 중 공구 있음 · 없음(만들기)
 */
type Open = { id: string; current_count: number | null; target_count: number };

export default function ProductGroupBuy({ product }: { product: GroupBuyProduct }) {
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; open: Open | null }>({ status: "loading", open: null });
  const [attempt, setAttempt] = useState(0);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    let alive = true;
    setState({ status: "loading", open: null }); // eslint-disable-line react-hooks/set-state-in-effect -- 다시 불러오기
    fetch(`/api/community/group-buy?status=recruiting&product_id=${product.id}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (alive) setState({ status: "done", open: (d.group_buys || [])[0] ?? null });
      })
      .catch(() => { if (alive) setState({ status: "error", open: null }); });
    return () => { alive = false; };
  }, [product.id, attempt]);

  return (
    <section className="mb-6" aria-label="공구">
      <SectionHeader title="공구" />
      {state.status === "loading" && <Skeleton className="h-16 w-full" />}
      {state.status === "error" && (
        <div className="flex items-center gap-2 text-label text-danger">
          공구를 확인하지 못했어요
          <Button size="sm" variant="ghost" icon="refresh" onClick={() => setAttempt((n) => n + 1)}>다시 불러오기</Button>
        </div>
      )}
      {state.status === "done" && state.open && (
        <ListRow href={`/group-buy/${state.open.id}`} className="border border-line"
          leading={<Icon name="users" size={22} className="text-ink-2" />}
          title={<><span className="num">{state.open.current_count || 0}</span>명이 이 제품 공구 알림을 받고 있어요</>}
          meta={<><span className="num">{state.open.target_count}</span>명이 모이면 판매처에 공구를 요청해요 · 함께하기</>} />
      )}
      {state.status === "done" && !state.open && (
        <ListRow onClick={() => setComposing(true)} className="border border-line"
          leading={<Icon name="users" size={22} className="text-ink-2" />}
          title="이 제품으로 공구 만들기"
          meta="자주 먹는다면 사진과 함께 올려 같이 살 사람을 모아 보세요" />
      )}
      <GroupBuyComposer open={composing} onClose={() => setComposing(false)} initialProduct={product} />
    </section>
  );
}
