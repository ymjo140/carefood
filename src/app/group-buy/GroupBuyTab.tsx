"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Button, Card, EmptyState, LinkButton, Notice, PageHeader, ProgressBar, SkeletonList, Tabs, Thumb, useToast,
} from "@/components/ui";
import GroupBuyComposer from "@/components/community/GroupBuyComposer";
import { GROUP_BUY_ENABLED } from "@/lib/features";
import { bestOption, discountOf, groupBuyWords, readOffer, unitOf } from "@/lib/group-buy";
import { checkedLabel } from "@/lib/prices";

/**
 * 공구 탭
 * - 잠금(GROUP_BUY_ENABLED 꺼짐, 지금): 관심만 모은다. 가격은 '지금 최저가'만 보여 주고 공구가를 약속하지 않는다.
 * - 열림(켜짐): 공구가·참여 인원·참여하기. 결제 흐름을 붙인 뒤에 켠다 (src/lib/features.ts)
 * 만들기는 components/community/GroupBuyComposer (사진·영상·이야기·조건표)
 * 카드: 조건표가 있으면 가장 많이 깎은 구성의 할인율 · 1개 값 · D-day (인스타 공구 모음처럼). 알림 받기는 구성을 골라야 해서 공구 보기로 보낸다
 * ds-wiring-drop: group_buy_target — 목표 인원은 공구 만들기의 조건표에서 정한다
 */
type GroupBuy = {
  id: string; product_id: string | null; product_name: string; title: string | null;
  target_count: number; current_count: number; target_price: number | null;
  status: string; expires_at: string | null; lowest_price: number | null; lowest_checked_at: string | null; image_url: string | null;
  host_nickname: string; host_records: number; offer: unknown; lowest_unit_price: number | null;
};
type View = "open" | "mine";

const OPEN = GROUP_BUY_ENABLED;
const WORD = groupBuyWords(OPEN);

function daysLeft(expires: string | null) {
  if (!expires) return null;
  return Math.max(0, Math.ceil((Date.parse(expires) - Date.now()) / 86400e3));
}

export function GroupBuyTab() {
  const toast = useToast();
  const [view, setView] = useState<View>("open");
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; items: GroupBuy[]; mine: string[] }>({ status: "loading", items: [], mine: [] });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);

  // 마이페이지 '관심 표시한 공구'에서 들어오면 내 관심부터
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "mine") setView("mine"); // eslint-disable-line react-hooks/set-state-in-effect -- 주소는 화면을 그린 뒤에 읽는다
  }, []);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, status: "loading" })); // eslint-disable-line react-hooks/set-state-in-effect -- 보기를 바꿀 때마다 다시 불러온다
    fetch(view === "mine" ? "/api/community/group-buy?mine=1" : "/api/community/group-buy?status=recruiting")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (alive) setState({ status: "done", items: d.group_buys || [], mine: d.mine_ids || [] });
      })
      .catch(() => { if (alive) setState((s) => ({ ...s, status: "error" })); });
    return () => { alive = false; };
  }, [view, attempt]);

  const toggle = async (gb: GroupBuy) => {
    const marked = state.mine.includes(gb.id);
    setBusy(gb.id);
    try {
      const res = await fetch("/api/community/group-buy/join", {
        method: marked ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ group_buy_id: gb.id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok && !d.already) throw new Error(d.error);
      setState((s) => ({
        ...s,
        items: s.items.map((x) => (x.id === gb.id && typeof d.current_count === "number" ? { ...x, current_count: d.current_count } : x)),
        mine: marked ? s.mine.filter((id) => id !== gb.id) : [...s.mine, gb.id],
      }));
      toast.show(marked ? WORD.undo : WORD.done);
    } catch {
      toast.show(`${marked ? WORD.undoFail : WORD.fail}. 다시 시도해 주세요`, { tone: "danger" });
    } finally { setBusy(null); }
  };

  // 비어 있을 땐 빈 화면의 '공구 만들기' 하나만 둔다
  const emptyOpen = view === "open" && state.status === "done" && state.items.length === 0;

  return (
    <>
      <PageHeader title="공구"
        actions={emptyOpen ? undefined : <Button variant="secondary" size="sm" icon="plus" onClick={() => setSuggestOpen(true)}>공구 만들기</Button>} />

      {!OPEN && (
        <Notice icon="lock" className="mb-4">
          지금은 관심만 모아요. 판매는 준비가 끝나면 열려요. 열리면 이 화면에서 바로 참여할 수 있어요
        </Notice>
      )}

      <Tabs label="공구 보기" className="mb-2" value={view} onChange={setView}
        items={[{ value: "open", label: OPEN ? "진행 중" : "관심 모으는 중" }, { value: "mine", label: OPEN ? "내 참여" : "내 관심" }]} />

      {state.status === "loading" && <SkeletonList rows={3} className="mt-4" />}

      {state.status === "error" && (
        <Card className="mt-4 flex flex-col items-start gap-3">
          <p className="text-label text-ink">공구 목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요</p>
          <Button variant="secondary" size="sm" icon="refresh" onClick={() => setAttempt((n) => n + 1)}>다시 불러오기</Button>
        </Card>
      )}

      {state.status === "done" && state.items.length === 0 && (
        view === "open" ? (
          <EmptyState className="mt-4" title="지금 관심을 모으는 공구가 없어요"
            description="자주 먹는 제품을 사진과 함께 올려 함께 살 사람을 모아 보세요"
            action={<Button variant="secondary" size="sm" icon="plus" onClick={() => setSuggestOpen(true)}>공구 만들기</Button>} />
        ) : (
          <EmptyState className="mt-4" title={OPEN ? "아직 참여한 공구가 없어요" : "아직 관심 표시한 공구가 없어요"}
            description="관심 모으는 공구에서 마음에 드는 걸 골라 보세요"
            action={<Button variant="secondary" size="sm" onClick={() => setView("open")}>{OPEN ? "진행 중 보기" : "관심 모으는 중 보기"}</Button>} />
        )
      )}

      {state.status === "done" && state.items.length > 0 && (
        <ul className="flex flex-col">
          {state.items.map((gb) => {
            const marked = state.mine.includes(gb.id);
            const left = daysLeft(gb.expires_at);
            const checked = gb.lowest_checked_at ? checkedLabel([{ last_crawled_at: gb.lowest_checked_at }])?.replace("확인한 가격", "확인") : null;
            const saving = gb.target_price && gb.lowest_price && gb.lowest_price > gb.target_price
              ? Math.round((1 - gb.target_price / gb.lowest_price) * 100) : null;
            const offer = readOffer(gb.offer);
            const best = bestOption(offer);
            const pct = best ? discountOf(best, gb.lowest_unit_price) : null;
            return (
              <li key={gb.id} className="flex flex-col gap-2.5 py-4 border-b border-line">
                <div className="flex gap-3">
                  <Thumb src={gb.image_url} size={56} />
                  <div className="min-w-0 flex flex-col gap-0.5">
                    <Link href={`/group-buy/${gb.id}`} className="text-body font-medium text-ink line-clamp-2 hover:underline">{gb.product_name}</Link>
                    <p className="text-caption text-ink-2">
                      {gb.host_nickname}{gb.host_records > 0 && <> · 최근 30일 <span className="num">{gb.host_records}</span>번 기록</>}
                    </p>
                    {best ? (
                      <p className="text-label text-ink">
                        {pct != null && pct > 0 && <span className="num font-bold text-brand-ink">{pct}% </span>}
                        <span className="num font-bold">{best.price.toLocaleString("ko-KR")}</span>원
                        <span className="text-caption text-ink-2"> · {best.packs}개 묶음 · 1개 <span className="num">{unitOf(best).toLocaleString("ko-KR")}</span>원 · 진행자 희망가</span>
                      </p>
                    ) : OPEN && gb.target_price ? (
                      <p className="text-label text-ink">
                        공구가 <span className="num font-bold">{gb.target_price.toLocaleString("ko-KR")}</span>원
                        {saving != null && <span className="text-caption text-ink-2"> · 지금 최저보다 <span className="num">{saving}</span>% 싸요</span>}
                      </p>
                    ) : gb.lowest_price ? (
                      <p className="text-caption text-ink-2">
                        지금 최저 <span className="num">{gb.lowest_price.toLocaleString("ko-KR")}</span>원{checked && ` · ${checked}`}
                      </p>
                    ) : (
                      <p className="text-caption text-ink-2">아직 가격 정보가 없어요</p>
                    )}
                  </div>
                </div>
                <ProgressBar value={gb.current_count} max={gb.target_count} label={OPEN ? "참여 인원" : "알림 받는 사람"} />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-label text-ink-2">
                    <span className="num font-bold text-ink">{gb.current_count}</span> / <span className="num">{gb.target_count}</span>명
                    {left != null && <> · {left === 0 ? "오늘 마감" : <>D-<span className="num">{left}</span></>}</>}
                  </p>
                  {offer ? (
                    // 구성·수량을 골라야 해서 공구 보기에서 받는다
                    <LinkButton href={`/group-buy/${gb.id}`} size="sm" variant="secondary" icon={marked ? "check" : undefined}>
                      {marked ? WORD.marked : "구성 고르기"}
                    </LinkButton>
                  ) : (
                    <Button size="sm" variant="secondary" aria-pressed={marked} loading={busy === gb.id} disabled={!!busy}
                      icon={marked ? "check" : undefined} onClick={() => toggle(gb)}>
                      {marked ? WORD.marked : WORD.mark}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <GroupBuyComposer open={suggestOpen} onClose={() => setSuggestOpen(false)} />
    </>
  );
}
