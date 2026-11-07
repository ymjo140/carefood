"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Button, Card, EmptyState, Field, Icon, Input, Notice, PageHeader, ProgressBar, Select, Sheet, SkeletonList, Tabs, Thumb, useToast,
} from "@/components/ui";
import { GROUP_BUY_ENABLED } from "@/lib/features";
import { checkedLabel } from "@/lib/prices";

/**
 * 공구 탭
 * - 잠금(GROUP_BUY_ENABLED 꺼짐, 지금): 관심만 모은다. 가격은 '지금 최저가'만 보여 주고 공구가를 약속하지 않는다.
 * - 열림(켜짐): 공구가·참여 인원·참여하기. 결제 흐름을 붙인 뒤에 켠다 (src/lib/features.ts)
 */
type GroupBuy = {
  id: string; product_id: string | null; product_name: string; title: string | null;
  target_count: number; current_count: number; target_price: number | null;
  status: string; expires_at: string | null; lowest_price: number | null; lowest_checked_at: string | null; image_url: string | null;
};
type View = "open" | "mine";

const OPEN = GROUP_BUY_ENABLED;
const WORD = OPEN ? { mark: "참여하기", marked: "참여했어요", done: "참여했어요", undo: "참여를 취소했어요", fail: "참여하지 못했어요" }
  : { mark: "관심 있어요", marked: "관심 표시함", done: "관심 표시했어요", undo: "관심을 거뒀어요", fail: "관심 표시하지 못했어요" };

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
      toast.show(`${marked ? "거두지 못했어요" : WORD.fail}. 다시 시도해 주세요`, { tone: "danger" });
    } finally { setBusy(null); }
  };

  // 비어 있을 땐 빈 화면의 '제안하기' 하나만 둔다
  const emptyOpen = view === "open" && state.status === "done" && state.items.length === 0;

  return (
    <>
      <PageHeader title="공구"
        actions={emptyOpen ? undefined : <Button variant="secondary" size="sm" icon="plus" onClick={() => setSuggestOpen(true)}>제안하기</Button>} />

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
            description="자주 사는 제품을 묶음으로 사고 싶다면 먼저 제안해 보세요"
            action={<Button variant="secondary" size="sm" icon="plus" onClick={() => setSuggestOpen(true)}>제안하기</Button>} />
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
            return (
              <li key={gb.id} className="flex flex-col gap-2.5 py-4 border-b border-line">
                <div className="flex gap-3">
                  <Thumb src={gb.image_url} size={56} />
                  <div className="min-w-0 flex flex-col gap-0.5">
                    {gb.product_id ? (
                      <Link href={`/products/${gb.product_id}`} className="text-body font-medium text-ink line-clamp-2 hover:underline">{gb.product_name}</Link>
                    ) : (
                      <p className="text-body font-medium text-ink line-clamp-2">{gb.product_name}</p>
                    )}
                    {OPEN && gb.target_price ? (
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
                <ProgressBar value={gb.current_count} max={gb.target_count} label={OPEN ? "참여 인원" : "관심 인원"} />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-label text-ink-2">
                    <span className="num font-bold text-ink">{gb.current_count}</span> / <span className="num">{gb.target_count}</span>명
                    {left != null && <> · {left === 0 ? "오늘 마감" : <><span className="num">{left}</span>일 남음</>}</>}
                  </p>
                  <Button size="sm" variant="secondary" aria-pressed={marked} loading={busy === gb.id} disabled={!!busy}
                    icon={marked ? "check" : undefined} onClick={() => toggle(gb)}>
                    {marked ? WORD.marked : WORD.mark}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <SuggestSheet open={suggestOpen} onClose={() => setSuggestOpen(false)}
        onDone={() => { setSuggestOpen(false); setView("open"); setAttempt((n) => n + 1); }} />
    </>
  );
}

/* ───── 제안하기 시트 ───── */
type Hit = { id: string; name: string };

function SuggestSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ status: "idle" | "loading" | "error" | "done"; items: Hit[] }>({ status: "idle", items: [] });
  const [picked, setPicked] = useState<Hit | null>(null);
  const [count, setCount] = useState("30");
  const [sending, setSending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits({ status: "idle", items: [] }); return; }
    timer.current = setTimeout(() => {
      setHits((h) => ({ ...h, status: "loading" }));
      fetch(`/api/products?q=${encodeURIComponent(q.trim())}&hasPrice=1&limit=5&sort=name`)
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          setHits({ status: "done", items: (d.products || []).map((p: Hit) => ({ id: p.id, name: p.name })) });
        })
        .catch(() => setHits({ status: "error", items: [] }));
    }, 300);
  }, []);

  const reset = () => { setQuery(""); setHits({ status: "idle", items: [] }); setPicked(null); setCount("30"); };

  const submit = async () => {
    if (!picked) return;
    setSending(true);
    try {
      const res = await fetch("/api/community/group-buy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: picked.id, product_name: picked.name, target_count: Number(count) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error);
      toast.show("공구를 제안했어요. 14일 동안 관심을 모아요");
      reset();
      onDone();
    } catch {
      toast.show("제안하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setSending(false); }
  };

  return (
    <Sheet open={open} onClose={() => { reset(); onClose(); }} title="공구 제안하기"
      description={GROUP_BUY_ENABLED ? "제품을 고르면 함께 살 사람을 모아요" : "판매가 열리기 전엔 관심만 모아요. 가격은 약속하지 않아요"}
      footer={
        <>
          <Button variant="secondary" block onClick={() => { reset(); onClose(); }}>취소</Button>
          <Button block disabled={!picked} loading={sending} onClick={submit}>제안하기</Button>
        </>
      }>
      <div className="flex flex-col gap-4">
        {picked ? (
          <div className="flex items-center justify-between gap-3 rounded-md bg-sunken px-3 py-2.5">
            <p className="text-label font-medium text-ink min-w-0 line-clamp-2">{picked.name}</p>
            <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>바꾸기</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Field label="어떤 제품을 함께 살까요">
              <Input value={query} placeholder="제품 이름 (예: 현미밥, 닭가슴살)" name="group_buy_product"
                onChange={(e) => { setQuery(e.target.value); search(e.target.value); }} />
            </Field>
            {hits.status === "loading" && <SkeletonList rows={2} thumb={false} />}
            {hits.status === "error" && <p className="text-caption text-danger">제품을 찾지 못했어요. 다시 입력해 주세요</p>}
            {hits.status === "done" && hits.items.length === 0 && <p className="text-caption text-ink-2">맞는 제품이 없어요. 다른 이름으로 찾아보세요</p>}
            {hits.status === "done" && hits.items.length > 0 && (
              <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
                {hits.items.map((h) => (
                  <li key={h.id}>
                    <button type="button" onClick={() => setPicked(h)}
                      className="press w-full min-h-11 px-3 py-2 text-left text-label text-ink flex items-center justify-between gap-2 hover:bg-sunken transition-colors">
                      <span className="min-w-0 line-clamp-1">{h.name}</span>
                      <Icon name="plus" size={16} className="text-ink-2 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <Field label="몇 명 모을까요">
          <Select value={count} name="group_buy_target" onChange={(e) => setCount(e.target.value)}>
            {["10", "20", "30", "50"].map((n) => <option key={n} value={n}>{n}명</option>)}
          </Select>
        </Field>
      </div>
    </Sheet>
  );
}
