"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, CardActions, ChoiceList, ConfirmSheet, EmptyState, Field, Input, LinkButton, Price, Sheet, SkeletonList, Tabs, Textarea, timeAgo, useToast } from "@/components/ui";
import { AUTO_CONFIRM_DAYS, BUYER_LABEL, CARRIERS, RETURN_REASONS, RETURN_REASON_LABEL, RETURN_TYPE_LABEL, returnOpen, type ReturnReason, type ReturnType } from "@/lib/order-status";
import type { BuyerOrder, OrderGroup } from "@/lib/orders";

const DAY: Record<string, string> = { mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일" };
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const md = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" });
const autoDay = (delivered: string) => md(new Date(Date.parse(delivered) + AUTO_CONFIRM_DAYS * 86400e3).toISOString());
type Target = { order: BuyerOrder; group: OrderGroup | null };

/** 내 주문 — 주문마다 판매 업체 묶음별 진행·송장·취소, 환불 */
export function OrderList() {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data: BuyerOrder[]; error?: string }>({ status: "loading", data: [] });
  const [target, setTarget] = useState<Target | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ order: BuyerOrder; group: OrderGroup } | null>(null);
  const [returning, setReturning] = useState<{ order: BuyerOrder; group: OrderGroup } | null>(null);
  const [rType, setRType] = useState<ReturnType>("return");
  const [rReason, setRReason] = useState<ReturnReason | null>(null);
  const [rNote, setRNote] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/orders");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error);
      setState({ status: "done", data: d.orders || [] });
    } catch (e) { setState({ status: "error", data: [], error: (e as Error).message || "불러오지 못했어요" }); }
  }, []);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const cancel = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/orders/${target.order.id}/cancel`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partner_id: target.group?.partner_id ?? null, reason }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error);
      toast.show(d.result === "requested" ? "취소를 요청했어요. 판매 업체가 확인하면 알려 드려요" : "주문을 취소했어요");
      setTarget(null); setReason("");
      await load();
    } catch (e) {
      toast.show((e as Error).message || "취소하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(false); }
  };

  const requestReturn = async () => {
    if (!returning || !rReason) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/orders/${returning.order.id}/return`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partner_id: returning.group.partner_id, type: rType, reason: rReason, note: rNote }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error);
      toast.show(`${RETURN_TYPE_LABEL[rType]}을 요청했어요. 판매 업체가 답하면 알려 드려요`);
      setReturning(null);
      await load();
    } catch (e) {
      toast.show(`요청하지 못했어요. ${(e as Error).message || "다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setBusy(false); }
  };

  const doConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/orders/${confirm.order.id}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ partner_id: confirm.group.partner_id }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error);
      toast.show(`${confirm.group.seller} 주문을 구매확정했어요`);
      setConfirm(null);
      await load();
    } catch (e) {
      toast.show((e as Error).message || "구매확정하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(false); }
  };

  if (state.status === "loading") return <SkeletonList rows={3} thumb={false} />;
  if (state.status === "error") {
    return <EmptyState title="주문 내역을 불러오지 못했어요" description={state.error}
      action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading", data: [] }); load(); }}>다시 불러오기</Button>} />;
  }
  if (state.data.length === 0) {
    return <EmptyState title="아직 주문한 적이 없어요" description="식단 리스트에서 식단을 짜고 한 번에 주문할 수 있어요"
      action={<LinkButton href="/weekly-box" size="sm">식단 리스트로 가기</LinkButton>} />;
  }

  // 접수 뒤 취소는 요청이 된다 — 시트 문구가 달라진다
  const requesting = target?.group?.status === "accepted";
  return (
    <>
      <div className="flex flex-col gap-4">
        {state.data.map((o) => {
          const unpaid = !o.paid_at;
          const refundLeft = o.refund_amount - o.refunded_amount;
          return (
            <Card key={o.id}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-caption text-ink-2">주문 <span className="num">{o.id.slice(0, 8)}</span> · {timeAgo(o.created_at)}</p>
                <Price value={o.final_price} className="text-label font-bold" />
              </div>
              {unpaid && (
                <p className="text-label text-ink-2 mt-1">{o.status === "cancelled" ? "결제 전에 취소한 주문이에요" : "결제를 마치지 않은 주문이에요"}</p>
              )}

              <div className="flex flex-col divide-y divide-line mt-2">
                {o.groups.map((g) => (
                  <div key={g.partner_id || "none"} className="py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-label font-bold text-ink">{g.seller}</span>
                      {!unpaid && <Badge tone={g.status === "delivered" ? "positive" : g.status === "canceled" ? "danger" : "neutral"}>{BUYER_LABEL[g.status]}</Badge>}
                    </div>
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {g.lines.map((l, i) => (
                        <li key={i} className="flex justify-between gap-3 text-label">
                          <span className="min-w-0 truncate text-ink">{l.product_name}{l.day_of_week && <span className="text-ink-2"> · {DAY[l.day_of_week]}요일</span>}</span>
                          <span className="num text-ink-2 whitespace-nowrap">{l.quantity}개</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-caption text-ink-2 mt-1.5">
                      상품 <span className="num">{won(g.subtotal)}</span> · 배송비 {g.shipping_fee > 0 ? <span className="num">{won(g.shipping_fee)}</span> : "무료"}
                    </p>
                    {g.carrier && (g.status === "shipped" || g.status === "delivered") && (
                      <p className="text-label text-ink mt-1.5">
                        {CARRIERS[g.carrier] || g.carrier}{g.tracking_number && <> · 송장 <span className="num select-all">{g.tracking_number}</span></>}
                      </p>
                    )}
                    {g.status === "canceled" && g.return?.status === "returned" ? (
                      <p className="text-label text-ink-2 mt-1.5">
                        반품을 마쳤어요{g.return.fee ? <> · 반품 배송비 <span className="num">{won(g.return.fee)}</span>를 빼고 돌려드려요</> : null}{g.return.reply && <> · {g.return.reply}</>}
                      </p>
                    ) : g.status === "canceled" && g.cancel_reason && (
                      <p className="text-label text-ink-2 mt-1.5">
                        {g.canceled_by === "buyer" ? "직접 취소했어요" : g.canceled_by === "partner" ? "판매 업체가 취소했어요" : "케어푸드가 취소했어요"} · {g.cancel_reason}
                      </p>
                    )}
                    {g.status === "accepted" && g.cancel_requested_at && (
                      <p className="text-label text-ink-2 mt-1.5">취소를 요청했어요. 판매 업체가 확인하고 있어요</p>
                    )}
                    {(g.status === "shipped" || g.status === "delivered") && g.cancel_requested_at && !g.return && (
                      <p className="text-label text-ink-2 mt-1.5">취소를 요청했지만 판매 업체가 이미 보냈어요. 받은 뒤 반품·교환을 요청할 수 있어요</p>
                    )}
                    {g.status === "shipped" && g.return?.status === "exchanged" && (
                      <p className="text-label text-ink-2 mt-1.5">교환 상품을 보냈어요{g.return.reply && <> · {g.return.reply}</>}</p>
                    )}
                    {g.status === "delivered" && g.return && returnOpen(g.return.status) && (
                      <p className="text-label text-ink mt-1.5">
                        {RETURN_TYPE_LABEL[g.return.type]}을 요청했어요 · {g.return.status === "approved" ? "판매 업체가 받아들였어요. 회수 안내를 기다려 주세요" : "판매 업체가 확인하고 있어요"}
                      </p>
                    )}
                    {g.status === "delivered" && g.return?.status === "rejected" && (
                      <p className="text-label text-ink mt-1.5">판매 업체가 {RETURN_TYPE_LABEL[g.return.type]} 요청을 거절했어요{g.return.reply && <> · {g.return.reply}</>}. 더 도움이 필요하면 케어푸드에 문의해 주세요</p>
                    )}
                    {!unpaid && g.status === "shipped" && g.partner_id && (
                      <>
                        <p className="text-caption text-ink-2 mt-1.5">상품을 받았으면 구매확정해 주세요. 판매 업체에 대금이 정산돼요</p>
                        <Button size="sm" variant="ghost" className="mt-1 -ml-3" onClick={() => setConfirm({ order: o, group: g })}>받았어요 · 구매확정하기</Button>
                      </>
                    )}
                    {!unpaid && g.status === "delivered" && g.partner_id && (g.confirmed_at ? (
                      <p className="text-label text-ink-2 mt-1.5">{md(g.confirmed_at)}에 구매확정했어요</p>
                    ) : g.return?.status === "approved" ? null : (
                      <>
                        {!g.return || !returnOpen(g.return.status)
                          ? <p className="text-caption text-ink-2 mt-1.5">받은 상품에 문제가 없으면 구매확정해 주세요. {g.delivered_at ? <>{autoDay(g.delivered_at)}에 저절로 확정돼요</> : <>배송 완료 {AUTO_CONFIRM_DAYS}일 뒤 저절로 확정돼요</>}</p>
                          : <p className="text-caption text-ink-2 mt-1.5">판매 업체가 답할 때까지 구매확정을 멈췄어요</p>}
                        <span className="flex flex-wrap gap-1 mt-1 -ml-3">
                          <Button size="sm" variant="ghost" onClick={() => setConfirm({ order: o, group: g })}>{g.return?.status === "requested" ? "요청 거두고 구매확정하기" : "구매확정하기"}</Button>
                          {(!g.return || g.return.status === "exchanged") && (
                            <Button size="sm" variant="ghost" onClick={() => { setRType("return"); setRReason(null); setRNote(""); setReturning({ order: o, group: g }); }}>반품·교환 요청하기</Button>
                          )}
                        </span>
                      </>
                    ))}
                    {!unpaid && (g.status === "new" || (g.status === "accepted" && !g.cancel_requested_at)) && (
                      <Button size="sm" variant="ghost" className="mt-1 -ml-3" onClick={() => { setReason(""); setTarget({ order: o, group: g }); }}>
                        {g.status === "new" ? "이 업체 주문 취소하기" : "취소 요청하기"}
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {refundLeft > 0 && (
                <p className="text-label text-ink mt-1">돌려받을 금액 <span className="num font-bold">{won(refundLeft)}</span> · 케어푸드가 결제한 수단으로 돌려드려요</p>
              )}
              {refundLeft <= 0 && o.refunded_amount > 0 && (
                <p className="text-label text-ink-2 mt-1"><span className="num">{won(o.refunded_amount)}</span>을 돌려드렸어요</p>
              )}
              {unpaid && o.status !== "cancelled" && (
                <CardActions>
                  <Button variant="ghost" onClick={() => { setReason(""); setTarget({ order: o, group: null }); }}>주문 취소하기</Button>
                </CardActions>
              )}
            </Card>
          );
        })}
      </div>

      <Sheet open={!!target} onClose={() => setTarget(null)} title={requesting ? "취소 요청하기" : "주문 취소하기"}
        description={target?.group ? `${target.group.seller} · ${requesting ? "판매 업체가 이미 접수해서, 업체가 확인한 뒤 취소돼요" : "아직 접수 전이라 바로 취소돼요"}` : "결제 전 주문을 취소해요"}
        footer={<div className="flex gap-2">
          <Button variant="ghost" onClick={() => setTarget(null)}>닫기</Button>
          <Button block variant="danger" loading={busy} onClick={cancel}>{requesting ? "취소 요청하기" : "취소하기"}</Button>
        </div>}>
        <Field label="이유 (선택)" hint="판매 업체에 보여요">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="예: 날짜를 잘못 골랐어요" />
        </Field>
      </Sheet>

      <Sheet open={!!returning} onClose={() => setReturning(null)} title="반품·교환 요청하기"
        description={returning ? `${returning.group.seller} · 판매 업체가 답할 때까지 구매확정이 멈춰요` : undefined}
        footer={<div className="flex gap-2">
          <Button variant="ghost" onClick={() => setReturning(null)}>닫기</Button>
          <Button block loading={busy} disabled={!rReason || (rReason !== "change_mind" && !rNote.trim())} onClick={requestReturn}>{RETURN_TYPE_LABEL[rType]} 요청하기</Button>
        </div>}>
        <div className="flex flex-col gap-4">
          <Tabs variant="line" value={rType} onChange={setRType} label="반품 또는 교환"
            items={[{ value: "return", label: "반품 (환불)" }, { value: "exchange", label: "교환 (같은 상품)" }]} />
          <ChoiceList label="이유" value={rReason} onChange={setRReason} options={RETURN_REASONS.map((r) => ({ value: r, label: RETURN_REASON_LABEL[r] }))} />
          <Field label={rReason === "change_mind" ? "남길 말 (선택)" : "어떤 문제인지"}
            hint={rReason === "change_mind" ? "마음이 바뀐 반품은 반품 배송비를 빼고 돌려받아요. 먹을거리는 열었거나 시간이 지나면 받아 주지 않을 수 있어요" : "사진은 판매 업체가 회수할 때 보여 주세요"}>
            <Textarea value={rNote} onChange={(e) => setRNote(e.target.value)} maxLength={300} rows={3} placeholder="예: 포장이 터져서 왔어요" />
          </Field>
        </div>
      </Sheet>

      <ConfirmSheet open={!!confirm} onClose={() => setConfirm(null)} onConfirm={doConfirm} loading={busy}
        title="구매확정할까요?" confirmLabel="구매확정하기" tone="primary"
        description={confirm ? `${confirm.group.seller} 주문이에요. 확정하면 판매 업체에 대금이 정산돼요.${confirm.group.return?.status === "requested" ? " 남긴 반품·교환 요청은 거둬요." : ""} 그 뒤 반품·교환은 케어푸드에 문의해 주세요` : ""} />
    </>
  );
}
