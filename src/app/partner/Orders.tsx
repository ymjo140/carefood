"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, CardActions, Checkbox, EmptyState, Field, Input, Notice, Select, SectionHeader, Sheet, SkeletonList, Tabs, FilePick, timeAgo, useToast } from "@/components/ui";
import { CARRIERS, FULFIL_LABEL, deliverableAt, formatPhone, type Fulfil } from "@/lib/order-status";
import type { PartnerOrder } from "@/lib/partner/orders";
import { downloadFile } from "@/lib/download";

export type OrderFilter = "new" | "accepted" | "shipped" | "done";
type Filter = OrderFilter;
type TrackingResult = { rows: number; shipped: number; unchanged: number; skipped: number; errors: { row: number; order: string | null; message: string }[]; blocked: boolean };
type Counts = { new: number; accepted: number; shipped: number; cancel_requests: number; late: number; deliver_pending: number };
const DAY: Record<string, string> = { mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일" };
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const TONE: Record<Fulfil, "neutral" | "positive" | "danger" | "brand"> = { new: "brand", accepted: "neutral", shipped: "neutral", delivered: "positive", canceled: "danger" };

/**
 * 주문 — 앱에서 들어온 주문을 접수하고 발송 처리한다 (결제가 끝난 주문만 온다).
 * 상태는 서버에서 거르고 건수도 서버가 센다. 처리할 주문은 오래된 것부터, 끝난 주문은 50건씩 더 보기. 관리자 보기는 읽기 전용
 */
export function Orders({ qs, initialFilter }: { qs: string; initialFilter?: OrderFilter }) {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>(initialFilter || "new");
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data: PartnerOrder[]; counts?: Counts; readOnly?: boolean; hasMore?: boolean; page?: number; error?: string }>({ status: "loading", data: [] });
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [shipping, setShipping] = useState<PartnerOrder | null>(null);
  const [canceling, setCanceling] = useState<PartnerOrder | null>(null);
  const [carrier, setCarrier] = useState("cj");
  const [tracking, setTracking] = useState("");
  const [reason, setReason] = useState("");
  const seq = useRef(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [upOpen, setUpOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [upBusy, setUpBusy] = useState(false);
  const [upResult, setUpResult] = useState<TrackingResult | null>(null);

  const load = useCallback(async (f: Filter, page = 0) => {
    const my = ++seq.current; // 상태를 빨리 바꾸면 마지막 응답만
    try {
      const r = await fetch(`/api/partner/orders?${qs}&status=${f}&page=${page}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (my !== seq.current) return;
      setState((s) => ({ status: "done", data: page > 0 ? [...s.data, ...d.orders] : d.orders, counts: d.counts, readOnly: d.read_only, hasMore: d.has_more, page }));
      if (page === 0) setSel((cur) => { const ids = new Set((d.orders as PartnerOrder[]).map((o) => o.order_id)); return new Set([...cur].filter((id) => ids.has(id))); }); // 사라진 주문은 고른 것에서 뺀다
    } catch (e) { if (my === seq.current) setState((s) => page > 0 ? s : { status: "error", data: [], error: (e as Error).message || "불러오지 못했어요" }); if (page > 0) toast.show("더 불러오지 못했어요. 다시 시도해 주세요", { tone: "danger" }); }
    finally { if (my === seq.current) setMore(false); }
  }, [qs, toast]);
  useEffect(() => { load(filter); }, [load, filter]);
  const pick = (f: Filter) => { setState((s) => ({ ...s, status: "loading", data: [] })); setSel(new Set()); setFilter(f); }; // 건수는 그대로 두고 목록만 다시

  // 고른 새 주문 한꺼번에 접수 — 주문마다 따로 처리돼 일부만 실패할 수 있다
  const acceptSelected = async () => {
    const ids = [...sel];
    setBulkBusy(true);
    try {
      const r = await fetch(`/api/partner/orders/bulk?${qs}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "accept", order_ids: ids }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error);
      const n = (d.accepted || 0) + (d.unchanged || 0);
      if (d.failed?.length) toast.show(`${n}건을 접수했어요. ${d.failed.length}건은 접수하지 못했어요 — ${d.failed[0].message}`, { tone: "danger" });
      else toast.show(`${n}건을 접수했어요`);
      setSel(new Set());
      await load(filter);
    } catch (e) {
      toast.show(`접수하지 못했어요. ${(e as Error).message || "다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setBulkBusy(false); }
  };

  const exportShip = async () => {
    setExporting(true);
    try { await downloadFile(`/api/partner/orders/export?${qs}`, "케어푸드_출고목록.xlsx"); }
    catch (e) { toast.show(`출고 목록을 내려받지 못했어요. ${(e as Error).message || "다시 시도해 주세요"}`, { tone: "danger" }); }
    finally { setExporting(false); }
  };

  const uploadTracking = async () => {
    if (!file) return;
    setUpBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/partner/orders/tracking?${qs}`, { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error);
      setUpResult(d);
      setFile(null);
      if (d.blocked) toast.show("고칠 줄이 있어 아무것도 바꾸지 않았어요. 아래 줄을 고쳐 다시 올려 주세요", { tone: "danger" });
      else {
        toast.show(d.errors.length ? `${d.shipped}건을 발송 처리했어요. ${d.errors.length}건은 처리하지 못했어요` : `${d.shipped}건을 발송 처리했어요`, d.errors.length ? { tone: "danger" } : undefined);
        await load(filter); // 발송된 주문이 목록·건수에서 바로 빠지게
      }
    } catch (e) {
      toast.show(`송장을 올리지 못했어요. ${(e as Error).message || "다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setUpBusy(false); }
  };

  const send = async (o: PartnerOrder, body: Record<string, unknown>, doneMsg: string, failWhat: string) => {
    setBusy(o.order_id);
    try {
      const r = await fetch(`/api/partner/orders?${qs}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_id: o.order_id, ...body }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error);
      toast.show(doneMsg);
      setShipping(null); setCanceling(null); setTracking(""); setReason("");
      await load(filter);
    } catch (e) {
      toast.show(`${failWhat}하지 못했어요. ${(e as Error).message || "다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setBusy(null); }
  };

  const c = state.counts;
  const requests = c?.cancel_requests || 0;
  const shown = state.data;
  const ro = !!state.readOnly;
  const pickable = shown.filter((o) => o.status === "new");
  const canPick = !ro && filter === "new" && pickable.length > 1;

  return (
    <section>
      <SectionHeader title="주문" action={
        <span className="flex flex-wrap justify-end gap-1">
          <Button variant="ghost" size="sm" loading={exporting} disabled={!!c && c.new + c.accepted === 0} onClick={exportShip}>출고 목록 받기</Button>
          {!ro && <Button variant="ghost" size="sm" onClick={() => { setUpResult(null); setUpOpen(true); }}>송장 올리기</Button>}
        </span>
      } />
      {requests > 0 && filter !== "accepted" && (
        <p className="text-label text-ink mb-3">주문자가 취소를 요청한 주문이 <span className="num font-bold">{requests}</span>건 있어요. &lsquo;접수&rsquo;에서 확인해 주세요</p>
      )}
      {c && (c.late > 0 || c.deliver_pending > 0) && (
        <p className="text-label text-ink mb-3">
          {c.late > 0 && <>결제하고 하루가 지나도록 보내지 않은 주문 <span className="num font-bold">{c.late}</span>건{c.deliver_pending > 0 && " · "}</>}
          {c.deliver_pending > 0 && <>보낸 지 5일이 넘었는데 배송 완료를 누르지 않은 주문 <span className="num font-bold">{c.deliver_pending}</span>건</>}
        </p>
      )}
      <Tabs variant="line" value={filter} onChange={pick} label="주문 상태" className="mb-3"
        items={[
          { value: "new", label: "새 주문", count: c?.new }, { value: "accepted", label: "접수", count: c?.accepted },
          { value: "shipped", label: "발송", count: c?.shipped }, { value: "done", label: "끝난 주문" },
        ]} />
      {state.status === "loading" ? <SkeletonList rows={3} thumb={false} />
        : state.status === "error" ? (
          <EmptyState title="주문을 불러오지 못했어요" description={state.error}
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading", data: [] }); load(filter); }}>다시 불러오기</Button>} />
        ) : shown.length === 0 ? (
          <EmptyState title={filter === "new" ? "새 주문이 없어요" : filter === "done" ? "끝난 주문이 없어요" : `${FULFIL_LABEL[filter]} 상태의 주문이 없어요`}
            description={filter === "new" ? "앱에서 결제가 끝난 주문이 여기로 들어와요" : undefined} />
        ) : (
          <div className="flex flex-col gap-3">
            {canPick && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Checkbox label={<span className="text-label">모두 고르기 <span className="num text-ink-2">{sel.size}/{pickable.length}</span></span>}
                  checked={pickable.length > 0 && sel.size === pickable.length} onChange={(e) => setSel(e.target.checked ? new Set(pickable.map((o) => o.order_id)) : new Set())} />
                <Button size="sm" disabled={sel.size === 0} loading={bulkBusy} onClick={acceptSelected}>
                  {sel.size > 0 ? `고른 ${sel.size}건 접수하기` : "고른 주문 접수하기"}
                </Button>
              </div>
            )}
            {shown.map((o) => (
              <Card key={o.order_id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  {canPick && o.status === "new" && (
                    <Checkbox className="-my-3 -ml-3 justify-center" aria-label={`주문 ${o.order_id.slice(0, 8)} 고르기`} checked={sel.has(o.order_id)}
                      onChange={(e) => setSel((cur) => { const n = new Set(cur); if (e.target.checked) n.add(o.order_id); else n.delete(o.order_id); return n; })} />
                  )}
                  <p className="text-caption text-ink-2 mr-auto">
                    주문 <span className="num">{o.order_id.slice(0, 8)}</span> · {timeAgo(o.ordered_at)}
                    {o.delivery_week_start && <> · <span className="num">{o.delivery_week_start}</span> 주 배송</>}
                  </p>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {o.first_order && <Badge tone="brand">첫 주문</Badge>}
                    {o.cancel_requested_at ? <Badge tone="danger">취소 요청</Badge> : <Badge tone={TONE[o.status]}>{FULFIL_LABEL[o.status]}</Badge>}
                  </span>
                </div>
                <ul className="mt-2 divide-y divide-line">
                  {o.lines.map((l, i) => (
                    <li key={i} className="py-2 flex items-baseline justify-between gap-3 text-label">
                      <span className="min-w-0">
                        <span className="text-ink">{l.product_name}</span>
                        <span className="block text-caption text-ink-2">
                          {l.partner_sku && <span className="num">{l.partner_sku}</span>}
                          {l.day_of_week && <> · {DAY[l.day_of_week] || l.day_of_week}요일</>}
                        </span>
                      </span>
                      <span className="num text-ink whitespace-nowrap">{l.quantity}개 · {won(l.unit_price * l.quantity)}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-label text-ink mt-2 flex justify-between gap-3">
                  <span className="text-ink-2">합계 <span className="text-caption">(배송비 {o.shipping_fee > 0 ? won(o.shipping_fee) : "무료"} 포함{o.discount > 0 && <> · 우리 쿠폰 −{won(o.discount)}</>})</span></span>
                  <span className="num font-bold whitespace-nowrap">{won(o.amount + o.shipping_fee - (o.discount || 0))}</span>
                </p>
                {o.cancel_requested_at && (
                  <p className="text-label text-ink mt-2">
                    주문자가 {timeAgo(o.cancel_requested_at)} 취소를 요청했어요{o.cancel_request_reason && <> · {o.cancel_request_reason}</>}.
                    보내기 전이면 취소해 주세요. 이미 보냈다면 발송 처리하면 돼요
                  </p>
                )}

                {o.shipping ? (
                  <dl className="mt-3 rounded-md bg-sunken px-4 py-3 text-label grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <dt className="text-ink-2">받는 분</dt><dd className="text-ink">{o.shipping.name} · <span className="num">{formatPhone(o.shipping.phone)}</span></dd>
                    <dt className="text-ink-2">주소</dt>
                    <dd className="text-ink">{o.shipping.postal_code && <span className="num">({o.shipping.postal_code}) </span>}{o.shipping.address1} {o.shipping.address2}</dd>
                    {o.shipping.note && <><dt className="text-ink-2">메모</dt><dd className="text-ink">{o.shipping.note}</dd></>}
                  </dl>
                ) : (o.status === "delivered" || o.status === "canceled") ? (
                  <p className="text-caption text-ink-2 mt-3">받는 분 정보는 배송이 끝나 가렸어요</p>
                ) : (
                  <p className="text-caption text-ink-2 mt-3">받는 분 정보를 받지 못했어요. 케어푸드에 문의해 주세요</p>
                )}
                {o.carrier && (
                  <p className="text-label text-ink mt-2">
                    <span className="text-ink-2">발송 </span>{CARRIERS[o.carrier] || o.carrier}{o.tracking_number && <> · <span className="num">{o.tracking_number}</span></>}
                  </p>
                )}
                {o.cancel_reason && <p className="text-label text-ink mt-2"><span className="text-ink-2">{o.canceled_by === "buyer" ? "주문자가 취소" : o.canceled_by === "admin" ? "케어푸드가 취소" : "취소 이유"} </span>{o.cancel_reason}</p>}

                {!ro && (o.status === "new" || o.status === "accepted" || o.status === "shipped") && (
                  <CardActions className="mt-3">
                    {o.status === "new" && <Button variant="secondary" loading={busy === o.order_id} onClick={() => send(o, { status: "accepted" }, "주문을 접수했어요", "접수")}>접수하기</Button>}
                    {o.status === "accepted" && <Button variant="secondary" onClick={() => { setCarrier(o.carrier || "cj"); setTracking(""); setShipping(o); }}>발송 처리하기</Button>}
                    {o.status === "shipped" && (() => {
                      const at = deliverableAt(o);
                      const wait = at !== null && at > Date.now();
                      return wait ? <span className="text-caption text-ink-2 self-center">{new Date(at!).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", timeZone: "Asia/Seoul" })}부터 배송 완료로 바꿀 수 있어요</span>
                        : <Button variant="secondary" loading={busy === o.order_id} onClick={() => send(o, { status: "delivered" }, "배송 완료로 바꿨어요. 8일 뒤 저절로 구매확정돼요", "배송 완료로 바꾸")}>배송 완료로 바꾸기</Button>;
                    })()}
                    {o.status === "shipped" && <Button variant="ghost" onClick={() => { setCarrier(o.carrier || "cj"); setTracking(o.tracking_number || ""); setShipping(o); }}>송장 고치기</Button>}
                    {o.status !== "shipped" && <Button variant="ghost" onClick={() => { setReason(o.cancel_requested_at ? "주문자 요청" : ""); setCanceling(o); }}>취소하기</Button>}
                  </CardActions>
                )}
              </Card>
            ))}
            {filter === "done" && state.hasMore && (
              <Button variant="secondary" loading={more} onClick={() => { setMore(true); load(filter, (state.page || 0) + 1); }}>더 보기</Button>
            )}
          </div>
        )}

      <Sheet open={!!shipping} onClose={() => setShipping(null)} title="발송 처리하기" description={shipping ? `주문 ${shipping.order_id.slice(0, 8)}` : undefined}
        footer={<div className="flex gap-2">
          <Button variant="ghost" onClick={() => setShipping(null)}>취소</Button>
          <Button block loading={!!shipping && busy === shipping.order_id} disabled={carrier !== "direct" && tracking.trim().length < 6}
            onClick={() => shipping && send(shipping, { status: "shipped", carrier, tracking_number: tracking }, "발송 처리했어요", "발송 처리")}>발송 처리하기</Button>
        </div>}>
        <div className="flex flex-col gap-3">
          <Field label="택배사">
            <Select value={carrier} onChange={(e) => setCarrier(e.target.value)}>
              {Object.entries(CARRIERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="송장 번호" hint={carrier === "direct" ? "직접 배송은 비워 둬도 돼요" : "영문·숫자 6~30자"}>
            <Input inputMode="numeric" value={tracking} onChange={(e) => setTracking(e.target.value)} />
          </Field>
        </div>
      </Sheet>

      <Sheet open={upOpen} onClose={() => setUpOpen(false)} title="송장 올리기"
        description="내려받은 출고 목록에 택배사·송장 번호를 적어 올리면 그 주문을 발송 처리하고 주문자에게 알려요"
        footer={<div className="flex gap-2">
          <Button variant="ghost" onClick={() => setUpOpen(false)}>닫기</Button>
          <Button block disabled={!file} loading={upBusy} onClick={uploadTracking}>송장 올리기</Button>
        </div>}>
        <div className="flex flex-col gap-3">
          <p className="text-label text-ink-2">
            택배사 칸은 코드(<span className="num">cj</span>)나 이름(CJ대한통운) 모두 돼요. 비어 있는 줄은 건너뛰고, 형식이 틀린 줄이 있으면 아무것도 바꾸지 않아요.
          </p>
          <FilePick accept=".xlsx" file={file} onChange={(f) => { setFile(f); setUpResult(null); }} />
          {upResult && (
            <Notice tone={upResult.errors.length ? "danger" : "neutral"} title={upResult.blocked ? "고칠 줄이 있어 바꾸지 않았어요" : "방금 올린 송장"}>
              {!upResult.blocked && (
                <p>
                  <span className="num">{upResult.rows}</span>줄 중 발송 처리 <span className="num">{upResult.shipped}</span>
                  {upResult.unchanged > 0 && <> · 이미 같은 송장 <span className="num">{upResult.unchanged}</span></>}
                  {upResult.skipped > 0 && <> · 빈 줄 <span className="num">{upResult.skipped}</span></>}
                  {upResult.errors.length > 0 && <> · 못 함 <span className="num">{upResult.errors.length}</span></>}
                </p>
              )}
              {upResult.errors.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {upResult.errors.slice(0, 50).map((e, i) => (
                    <li key={i} className="text-ink">{e.row > 0 && <><span className="num">{e.row}</span>줄 · </>}{e.order && <><span className="num">{e.order.slice(0, 8)}</span> — </>}{e.message}</li>
                  ))}
                  {upResult.errors.length > 50 && <li className="text-ink-2">그 밖에 <span className="num">{upResult.errors.length - 50}</span>줄</li>}
                </ul>
              )}
            </Notice>
          )}
        </div>
      </Sheet>

      <Sheet open={!!canceling} onClose={() => setCanceling(null)} title="주문 취소하기" description="취소하면 케어푸드가 주문자에게 알리고 환불해요"
        footer={<div className="flex gap-2">
          <Button variant="ghost" onClick={() => setCanceling(null)}>닫기</Button>
          <Button block variant="danger" loading={!!canceling && busy === canceling.order_id} disabled={!reason.trim()}
            onClick={() => canceling && send(canceling, { status: "canceled", reason }, "주문을 취소했어요", "취소")}>취소하기</Button>
        </div>}>
        <Field label="취소 이유" hint="예: 재고가 없어요">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
        </Field>
      </Sheet>
    </section>
  );
}
