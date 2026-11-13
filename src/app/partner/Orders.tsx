"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, CardActions, EmptyState, Field, Input, Select, SectionHeader, Sheet, SkeletonList, Tabs, timeAgo, useToast } from "@/components/ui";
import { CARRIERS, FULFIL_LABEL, formatPhone, type Fulfil } from "@/lib/order-status";
import type { PartnerOrder } from "@/lib/partner/orders";

type Filter = "new" | "accepted" | "shipped" | "done";
const DAY: Record<string, string> = { mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일" };
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const TONE: Record<Fulfil, "neutral" | "positive" | "danger" | "brand"> = { new: "brand", accepted: "neutral", shipped: "neutral", delivered: "positive", canceled: "danger" };

/** 주문 — 앱에서 들어온 주문을 접수하고 발송 처리한다 (결제가 끝난 주문만 온다) */
export function Orders({ qs }: { qs: string }) {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("new");
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data: PartnerOrder[]; error?: string }>({ status: "loading", data: [] });
  const [busy, setBusy] = useState<string | null>(null);
  const [shipping, setShipping] = useState<PartnerOrder | null>(null);
  const [canceling, setCanceling] = useState<PartnerOrder | null>(null);
  const [carrier, setCarrier] = useState("cj");
  const [tracking, setTracking] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/partner/orders?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setState({ status: "done", data: d.orders });
    } catch (e) { setState({ status: "error", data: [], error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const send = async (o: PartnerOrder, body: Record<string, unknown>, doneMsg: string, failWhat: string) => {
    setBusy(o.order_id);
    try {
      const r = await fetch(`/api/partner/orders?${qs}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_id: o.order_id, ...body }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error);
      toast.show(doneMsg);
      setShipping(null); setCanceling(null); setTracking(""); setReason("");
      await load();
    } catch (e) {
      toast.show(`${failWhat}하지 못했어요. ${(e as Error).message || "다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setBusy(null); }
  };

  const requests = state.data.filter((o) => o.status === "accepted" && o.cancel_requested_at).length;
  const count = (f: Filter) => state.data.filter((o) => (f === "done" ? o.status === "delivered" || o.status === "canceled" : o.status === f)).length;
  const shown = state.data.filter((o) => (filter === "done" ? o.status === "delivered" || o.status === "canceled" : o.status === filter));

  return (
    <section>
      <SectionHeader title="주문" />
      {requests > 0 && filter !== "accepted" && (
        <p className="text-label text-ink mb-3">주문자가 취소를 요청한 주문이 <span className="num font-bold">{requests}</span>건 있어요. &lsquo;접수&rsquo;에서 확인해 주세요</p>
      )}
      <Tabs variant="line" value={filter} onChange={setFilter} label="주문 상태" className="mb-3"
        items={[
          { value: "new", label: "새 주문", count: count("new") }, { value: "accepted", label: "접수", count: count("accepted") },
          { value: "shipped", label: "발송", count: count("shipped") }, { value: "done", label: "끝난 주문" },
        ]} />
      {state.status === "loading" ? <SkeletonList rows={3} thumb={false} />
        : state.status === "error" ? (
          <EmptyState title="주문을 불러오지 못했어요" description={state.error}
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading", data: [] }); load(); }}>다시 불러오기</Button>} />
        ) : shown.length === 0 ? (
          <EmptyState title={filter === "new" ? "새 주문이 없어요" : filter === "done" ? "끝난 주문이 없어요" : `${FULFIL_LABEL[filter]} 상태의 주문이 없어요`}
            description={filter === "new" ? "앱에서 결제가 끝난 주문이 여기로 들어와요" : undefined} />
        ) : (
          <div className="flex flex-col gap-3">
            {shown.map((o) => (
              <Card key={o.order_id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-caption text-ink-2">
                    주문 <span className="num">{o.order_id.slice(0, 8)}</span> · {timeAgo(o.ordered_at)}
                    {o.delivery_week_start && <> · <span className="num">{o.delivery_week_start}</span> 주 배송</>}
                  </p>
                  {o.cancel_requested_at ? <Badge tone="danger">취소 요청</Badge> : <Badge tone={TONE[o.status]}>{FULFIL_LABEL[o.status]}</Badge>}
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
                <p className="text-label text-ink mt-2 flex justify-between">
                  <span className="text-ink-2">합계 <span className="text-caption">(배송비 {o.shipping_fee > 0 ? won(o.shipping_fee) : "무료"} 포함)</span></span>
                  <span className="num font-bold">{won(o.amount + o.shipping_fee)}</span>
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

                {(o.status === "new" || o.status === "accepted" || o.status === "shipped") && (
                  <CardActions className="mt-3">
                    {o.status === "new" && <Button variant="secondary" loading={busy === o.order_id} onClick={() => send(o, { status: "accepted" }, "주문을 접수했어요", "접수")}>접수하기</Button>}
                    {o.status === "accepted" && <Button variant="secondary" onClick={() => { setCarrier(o.carrier || "cj"); setTracking(""); setShipping(o); }}>발송 처리하기</Button>}
                    {o.status === "shipped" && <Button variant="secondary" loading={busy === o.order_id} onClick={() => send(o, { status: "delivered" }, "배송 완료로 바꿨어요", "배송 완료로 바꾸")}>배송 완료로 바꾸기</Button>}
                    {o.status === "shipped" && <Button variant="ghost" onClick={() => { setCarrier(o.carrier || "cj"); setTracking(o.tracking_number || ""); setShipping(o); }}>송장 고치기</Button>}
                    {o.status !== "shipped" && <Button variant="ghost" onClick={() => { setReason(o.cancel_requested_at ? "주문자 요청" : ""); setCanceling(o); }}>취소하기</Button>}
                  </CardActions>
                )}
              </Card>
            ))}
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
