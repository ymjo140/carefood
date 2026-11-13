"use client";

// ds-wiring-drop: /api/orders/purchase-orders — 제조사 이름으로 짐작해 만들던 발주는 없앴다. 앱 주문은 입점 업체 화면·API 로 전달된다
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Page, PageHeader, Price, Sheet, SkeletonList, Tabs, timeAgo, useToast } from "@/components/ui";
import { LinkTabs, ADMIN_TABS } from "@/components/ui/LinkTabs";
import { CARRIERS, FULFIL_LABEL, formatPhone } from "@/lib/order-status";
import { ORDERING_ENABLED } from "@/lib/features";
import type { AdminOrder } from "@/lib/orders";

type Filter = "all" | "refund" | "cancel_request";
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const ORDER_STATUS: Record<string, string> = {
  pending: "결제 전", paid: "결제 완료", processing: "준비 중", dispatched: "발송", delivering: "배송 중", delivered: "배송 완료", cancelled: "취소",
};

/** 앱 주문 — 판매 업체별 진행, 취소 요청, 돌려줄 금액 (PG 를 붙이기 전에는 직접 환불하고 여기서 표시) */
export default function AdminOrdersPage() {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data: AdminOrder[]; error?: string }>({ status: "loading", data: [] });
  const [refunding, setRefunding] = useState<AdminOrder | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (f: Filter) => {
    try {
      const r = await fetch(`/api/admin/orders?filter=${f}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error);
      setState({ status: "done", data: d.orders || [] });
    } catch (e) { setState({ status: "error", data: [], error: (e as Error).message || "불러오지 못했어요" }); }
  }, []);
  useEffect(() => { load(filter); }, [load, filter]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const refund = async () => {
    if (!refunding) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_id: refunding.id, action: "refunded", note }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error);
      toast.show("환불했다고 표시했어요");
      setRefunding(null); setNote("");
      setState({ status: "loading", data: [] });
      await load(filter);
    } catch (e) {
      toast.show(`표시하지 못했어요. ${(e as Error).message || "다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setBusy(false); }
  };

  return (
    <Page width="wide">
      <LinkTabs items={ADMIN_TABS} current="/admin/orders" label="관리자 메뉴" className="mb-6" />
      <PageHeader title="주문" description={ORDERING_ENABLED ? "앱에서 들어온 주문과 돌려줄 금액" : "앱 주문은 아직 꺼져 있어요 (NEXT_PUBLIC_ORDERING_ENABLED). 켜면 여기 모여요"} />
      <Tabs value={filter} onChange={(f) => { setFilter(f); setState({ status: "loading", data: [] }); }} label="주문 거르기" className="mb-4"
        items={[{ value: "all", label: "전체" }, { value: "refund", label: "환불할 것" }, { value: "cancel_request", label: "취소 요청" }]} />

      {state.status === "loading" ? <SkeletonList rows={3} thumb={false} />
        : state.status === "error" ? (
          <EmptyState title="주문을 불러오지 못했어요" description={state.error}
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading", data: [] }); load(filter); }}>다시 불러오기</Button>} />
        ) : state.data.length === 0 ? (
          <EmptyState title={filter === "refund" ? "돌려줄 금액이 남은 주문이 없어요" : filter === "cancel_request" ? "업체가 답하지 않은 취소 요청이 없어요" : "아직 주문이 없어요"} />
        ) : (
          <div className="flex flex-col gap-3">
            {state.data.map((o) => {
              const left = o.refund_amount - o.refunded_amount;
              return (
                <Card key={o.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-caption text-ink-2">
                      주문 <span className="num">{o.id.slice(0, 8)}</span> · {timeAgo(o.created_at)} · {ORDER_STATUS[o.status] || o.status}
                      {o.shipping && <> · {o.shipping.name} <span className="num">{formatPhone(o.shipping.phone)}</span></>}
                    </p>
                    <p className="text-label text-ink">
                      상품 <span className="num">{won(o.total_price)}</span> + 배송비 <span className="num">{won(o.shipping_fee)}</span> = <Price value={o.final_price} className="font-bold" />
                    </p>
                  </div>
                  <ul className="mt-2 divide-y divide-line">
                    {o.groups.map((g) => (
                      <li key={g.partner_id || "none"} className="py-2 flex flex-wrap items-baseline justify-between gap-2 text-label">
                        <span className="min-w-0">
                          <span className="font-bold text-ink">{g.seller}</span>
                          <span className="text-ink-2"> · {g.lines.length}개 · <span className="num">{won(g.subtotal)}</span>{g.shipping_fee > 0 && <> + 배송비 <span className="num">{won(g.shipping_fee)}</span></>}</span>
                          {g.carrier && <span className="block text-caption text-ink-2">{CARRIERS[g.carrier] || g.carrier}{g.tracking_number && <> <span className="num">{g.tracking_number}</span></>}</span>}
                          {g.cancel_reason && <span className="block text-caption text-ink-2">취소({g.canceled_by === "buyer" ? "주문자" : g.canceled_by === "partner" ? "업체" : "관리자"}): {g.cancel_reason}</span>}
                          {g.status === "accepted" && g.cancel_requested_at && <span className="block text-caption text-ink">취소 요청 {timeAgo(g.cancel_requested_at)}{g.cancel_request_reason && <> · {g.cancel_request_reason}</>}</span>}
                        </span>
                        <Badge tone={g.status === "canceled" ? "danger" : g.status === "delivered" ? "positive" : "neutral"}>{FULFIL_LABEL[g.status]}</Badge>
                      </li>
                    ))}
                  </ul>
                  {o.refund_amount > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-3 border-t border-line">
                      <p className="text-label text-ink">
                        {left > 0 ? <>돌려줄 금액 <span className="num font-bold">{won(left)}</span></> : <>돌려준 금액 <span className="num">{won(o.refunded_amount)}</span>{o.refunded_at && <> · {timeAgo(o.refunded_at)}</>}{o.refund_note && <> · {o.refund_note}</>}</>}
                      </p>
                      {left > 0 && <Button size="sm" variant="secondary" onClick={() => { setNote(""); setRefunding(o); }}>환불했다고 표시하기</Button>}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

      <Sheet open={!!refunding} onClose={() => setRefunding(null)} title="환불했다고 표시하기"
        description={refunding ? `주문 ${refunding.id.slice(0, 8)} · ${won(refunding.refund_amount - refunding.refunded_amount)} — 결제한 수단으로 먼저 돌려준 뒤 표시해요` : undefined}
        footer={<div className="flex gap-2">
          <Button variant="ghost" onClick={() => setRefunding(null)}>취소</Button>
          <Button block loading={busy} onClick={refund}>환불했다고 표시하기</Button>
        </div>}>
        <Field label="메모 (선택)" hint="예: 카드 취소 승인번호">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Field>
      </Sheet>
    </Page>
  );
}
