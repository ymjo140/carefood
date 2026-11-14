"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Badge, Button, Card, EmptyState, Field, Input, LinkTabs, ADMIN_TABS, Page, PageHeader, Sheet, SkeletonList, Tabs, Thumb, timeAgo, useToast,
} from "@/components/ui";
import { giftLabel, offerRows, readOffer, shippingLabel, wishLabel } from "@/lib/group-buy";

/**
 * 관리자 · 공구 — 관심이 목표 인원에 닿은 공구를 판매처에 요청하고 표시한다.
 * 앱은 "30명이 모이면 판매처에 공구를 요청해요"라고 말하므로, 닿은 공구는 여기서 빠짐없이 처리한다.
 * 요청했어요를 누르면 알림 받는 사람에게 소식이 간다.
 */
type View = "reached" | "open";
type GB = {
  id: string; product_id: string | null; product_name: string; image_url: string | null; host_nickname: string; host_records: number;
  current_count: number | null; target_count: number; pack_size: number | null; wishes: string[]; comment_count: number; like_count: number;
  lowest_price: number | null; expires_at: string | null; reached_at: string | null; requested_at: string | null; request_note: string | null;
  offer: unknown; lowest_unit_price: number | null; demand: { option: number; people: number; sets: number }[];
};

export default function AdminGroupBuysPage() {
  const toast = useToast();
  const [view, setView] = useState<View>("reached");
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; items: GB[]; error?: string }>({ status: "loading", items: [] });
  const [attempt, setAttempt] = useState(0);
  const [target, setTarget] = useState<GB | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const n = ++seq.current;
    setState((s) => ({ ...s, status: "loading" })); // eslint-disable-line react-hooks/set-state-in-effect -- 보기를 바꿀 때마다 다시 불러온다
    fetch(`/api/admin/group-buys?view=${view}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error);
        if (n === seq.current) setState({ status: "done", items: d.group_buys || [] });
      })
      .catch((e) => { if (n === seq.current) setState({ status: "error", items: [], error: (e as Error).message }); });
  }, [view, attempt]);

  const request = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/group-buys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: target.id, note }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error);
      setState((s) => ({ ...s, items: s.items.map((g) => (g.id === target.id ? { ...g, requested_at: d.requested_at, request_note: note.trim() || null } : g)) }));
      toast.show("요청했다고 표시했어요. 알림 받는 사람에게 소식이 가요");
      setTarget(null); setNote("");
    } catch (e) {
      toast.show(e instanceof Error && e.message ? e.message : "표시하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(false); }
  };

  return (
    <Page width="wide">
      <LinkTabs items={ADMIN_TABS} current="/admin/group-buys" label="관리자 메뉴" className="mb-6" />
      <PageHeader title="공구" description="목표 인원이 모인 공구를 판매처에 요청하고 표시해요" />
      <Tabs label="공구 보기" className="mb-4" value={view} onChange={setView}
        items={[{ value: "reached", label: "목표에 닿음" }, { value: "open", label: "모으는 중" }]} />

      {state.status === "loading" && <SkeletonList rows={3} />}
      {state.status === "error" && (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-label text-ink">공구를 불러오지 못했어요{state.error ? ` (${state.error})` : ""}</p>
          <Button variant="secondary" size="sm" icon="refresh" onClick={() => setAttempt((n) => n + 1)}>다시 불러오기</Button>
        </Card>
      )}
      {state.status === "done" && state.items.length === 0 && (
        <EmptyState title={view === "reached" ? "목표 인원에 닿은 공구가 없어요" : "지금 관심을 모으는 공구가 없어요"}
          description={view === "reached" ? "모이면 여기에 나와요. 알림 받는 사람이 목표에 닿은 순간이 기록돼요" : "사용자가 커뮤니티에서 공구를 만들면 여기에 나와요"}
          action={view === "reached" ? <Button size="sm" variant="secondary" onClick={() => setView("open")}>모으는 중 보기</Button> : undefined} />
      )}
      {state.status === "done" && state.items.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2">
          {state.items.map((g) => {
            const offer = readOffer(g.offer);
            const wish = offer ? null : wishLabel(g.wishes);
            const count = g.current_count || 0;
            return (
              <li key={g.id}>
                <Card className="flex flex-col gap-3 h-full">
                  <div className="flex gap-3">
                    <Thumb src={g.image_url} size={56} />
                    <div className="min-w-0 flex flex-col gap-0.5">
                      <Link href={`/group-buy/${g.id}`} className="text-body font-medium text-ink line-clamp-2 hover:underline">{g.product_name}</Link>
                      <p className="text-caption text-ink-2">
                        {g.host_nickname}{g.host_records > 0 && <> · 최근 30일 <span className="num">{g.host_records}</span>번 기록</>}
                      </p>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-label">
                    <div><dt className="text-caption text-ink-2">알림 받는 사람</dt><dd className="text-ink"><span className="num font-bold">{count}</span> / <span className="num">{g.target_count}</span>명</dd></div>
                    <div><dt className="text-caption text-ink-2">모두 합친 양</dt><dd className="text-ink">{offer
                      ? <><span className="num font-bold">{offerRows(offer, null).reduce((n, r, i) => n + (g.demand.find((x) => x.option === i)?.sets ?? 0) * offer.options[i].packs, 0).toLocaleString("ko-KR")}</span>개</>
                      : g.pack_size ? <><span className="num font-bold">{(count * g.pack_size).toLocaleString("ko-KR")}</span>팩 <span className="text-ink-2">(사람당 <span className="num">{g.pack_size}</span>)</span></> : "정하지 않음"}</dd></div>
                    <div><dt className="text-caption text-ink-2">지금 최저</dt><dd className="text-ink">{g.lowest_price != null ? <><span className="num">{g.lowest_price.toLocaleString("ko-KR")}</span>원</> : "가격 없음"}</dd></div>
                    <div><dt className="text-caption text-ink-2">질문 · 좋아요</dt><dd className="text-ink"><span className="num">{g.comment_count}</span> · <span className="num">{g.like_count}</span></dd></div>
                  </dl>
                  {wish && <p className="text-label text-ink-2">바라는 것: <span className="text-ink">{wish}</span></p>}
                  {offer && (
                    <div className="flex flex-col gap-1.5 text-label">
                      <p className="text-caption text-ink-2">진행자 조건 · {shippingLabel(offer.shipping)}{giftLabel(offer.gift) ? ` · ${giftLabel(offer.gift)}` : ""}{offer.per_person_max ? ` · 1인 최대 ${offer.per_person_max}세트` : ""}</p>
                      <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
                        {offerRows(offer, g.lowest_unit_price).map((r, i) => {
                          const d = g.demand.find((x) => x.option === i);
                          return (
                            <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                              <span className="min-w-0 text-ink">{r.title} <span className="num">{r.price.toLocaleString("ko-KR")}</span>원{r.pct != null && r.pct > 0 && <span className="text-brand-ink"> · <span className="num">{r.pct}</span>%</span>}</span>
                              <span className="shrink-0 whitespace-nowrap text-ink-2"><span className="num font-bold text-ink">{d?.people ?? 0}</span>명 · <span className="num font-bold text-ink">{d?.sets ?? 0}</span>세트</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-3">
                    <p className="text-caption text-ink-2">
                      {g.reached_at ? <>목표에 닿음 · {timeAgo(g.reached_at)}</> : g.expires_at ? <>마감 {new Date(g.expires_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</> : null}
                    </p>
                    {g.reached_at && (g.requested_at
                      ? <Badge tone="positive">요청함 · {timeAgo(g.requested_at)}</Badge>
                      : <Button size="sm" onClick={() => { setTarget(g); setNote(""); }}>요청했어요 표시하기</Button>)}
                  </div>
                  {g.request_note && <p className="text-caption text-ink-2">메모: {g.request_note}</p>}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={!!target} onClose={() => setTarget(null)} title="판매처에 요청했어요" size="sm"
        description={target ? `${target.product_name} — 알림 받는 ${target.current_count || 0}명에게 "판매처에 공구를 요청했어요" 소식이 가요` : undefined}
        footer={<><Button variant="secondary" block onClick={() => setTarget(null)}>취소</Button><Button block loading={busy} onClick={request}>표시하기</Button></>}>
        <Field label="메모 (선택)" hint="어느 판매처에 언제 요청했는지 — 관리자만 봐요">
          <Input value={note} maxLength={200} name="request_note" onChange={(e) => setNote(e.target.value)} placeholder="예: 11/15 브랜드 담당자에게 메일" />
        </Field>
      </Sheet>
    </Page>
  );
}
