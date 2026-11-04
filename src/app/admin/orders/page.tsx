"use client";

import { useState, useEffect } from "react";
import {
  Badge, Button, Card, ConfirmSheet, EmptyState, Page, PageHeader, Spinner, Stat, Tabs, useToast,
  type BadgeTone,
} from "@/components/ui";
import { LinkTabs, ADMIN_TABS } from "@/components/ui/LinkTabs";

type PurchaseOrder = {
  id: string;
  service: string;
  delivery_date: string;
  status: string;
  total_items: number;
  total_users: number;
  total_amount: number;
  items: { product_name: string; quantity: number; unit_price: number }[];
  created_at: string;
};

type Summary = Record<string, { orders: number; items: number; amount: number; users: number }>;

const SERVICE_LABELS: Record<string, string> = {
  greating: "그리팅", yundiet: "윤식단", designmeal: "디자인밀",
  sixmeal: "식스밀", makesalad: "메이크샐러드",
};

/** 발주 상태 — 대기=caution, 완료=positive, 취소=danger, 진행 중=brand/neutral */
const STATUS_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "발주 대기", tone: "caution" },
  ordered: { label: "발주 완료", tone: "brand" },
  confirmed: { label: "확인됨", tone: "neutral" },
  shipped: { label: "출하", tone: "neutral" },
  delivered: { label: "배송 완료", tone: "positive" },
  cancelled: { label: "취소", tone: "danger" },
};

type StatusFilter = "all" | "pending" | "ordered" | "shipped" | "delivered";

export default function AdminOrdersPage() {
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [summary, setSummary] = useState<Summary>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const toast = useToast();

  const fetchData = () => {
    setLoading(true);
    fetch(`/api/orders/purchase-orders?status=${statusFilter}`)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(data => {
        setPos(data.purchase_orders || []);
        setSummary(data.summary || {});
      })
      .catch(() => toast.show("발주 목록을 불러오지 못했어요", { tone: "danger" }))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [statusFilter]);

  const updateStatus = async (poId: string, newStatus: string) => {
    await fetch("/api/orders/purchase-orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ po_id: poId, status: newStatus }),
    });
    const done: Record<string, string> = { ordered: "발주했어요", shipped: "출하 처리했어요", cancelled: "발주를 취소했어요" };
    if (done[newStatus]) toast.show(done[newStatus]);
    fetchData();
  };

  return (
    <Page width="wide">
      <PageHeader title="발주 관리" description="서비스별 발주 현황 및 배송 관리" />

      <LinkTabs items={ADMIN_TABS} current="/admin/orders" label="관리자 메뉴" className="mb-6" />

      {/* 상태 필터 */}
      <Tabs<StatusFilter>
        label="발주 상태"
        className="mb-5"
        value={statusFilter}
        onChange={setStatusFilter}
        items={[
          { value: "all", label: "전체" },
          { value: "pending", label: "발주 대기" },
          { value: "ordered", label: "발주 완료" },
          { value: "shipped", label: "배송 중" },
          { value: "delivered", label: "배송 완료" },
        ]}
      />

      {/* 서비스별 요약 */}
      {Object.keys(summary).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {Object.entries(summary).map(([service, s]) => (
            <Card key={service}>
              <p className="text-label font-bold text-ink mb-2">{SERVICE_LABELS[service] || service}</p>
              <Stat label="끼" value={s.items.toLocaleString()} />
              <div className="flex justify-between gap-2 text-caption text-ink-2 mt-2">
                <span><span className="num">{s.users}</span>명</span>
                <span><span className="num">{s.amount.toLocaleString()}</span>원</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 발주 목록 */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : pos.length === 0 ? (
        <EmptyState title="발주 내역이 없어요" description="주문이 들어오면 서비스별로 묶여 여기에 보여요" />
      ) : (
        <div className="flex flex-col gap-3">
          {pos.map(po => {
            const st = STATUS_LABELS[po.status] || { label: po.status, tone: "neutral" as BadgeTone };
            return (
              <Card key={po.id} padding="none" className="overflow-hidden">
                <div className="px-4 py-3 border-b border-line flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="text-body font-bold text-ink">{SERVICE_LABELS[po.service] || po.service}</span>
                    <span className="num text-caption text-ink-2">{po.delivery_date}</span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                  <div className="text-right">
                    <p className="text-body font-bold text-ink"><span className="num">{po.total_amount.toLocaleString()}</span>원</p>
                    <p className="text-caption text-ink-2"><span className="num">{po.total_users}</span>명 · <span className="num">{po.total_items}</span>끼</p>
                  </div>
                </div>
                {/* 제품 목록 */}
                {po.items && po.items.length > 0 && (
                  <div className="px-4 py-1 divide-y divide-line">
                    {po.items.map((item, i) => (
                      <div key={i} className="flex justify-between gap-3 py-2 text-label">
                        <span className="text-ink min-w-0">{item.product_name}</span>
                        <span className="text-ink-2 shrink-0">
                          <span className="num">{item.quantity}</span>개 · <span className="num">{(item.unit_price * item.quantity).toLocaleString()}</span>원
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {/* 상태 변경 */}
                {po.status === "pending" && (
                  <div className="px-4 py-3 border-t border-line flex gap-2">
                    <Button size="sm" onClick={() => updateStatus(po.id, "ordered")}>발주하기</Button>
                    <Button size="sm" variant="danger" onClick={() => setCancelTarget(po.id)}>취소하기</Button>
                  </div>
                )}
                {po.status === "ordered" && (
                  <div className="px-4 py-3 border-t border-line">
                    <Button size="sm" variant="secondary" onClick={() => updateStatus(po.id, "shipped")}>출하 처리하기</Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmSheet
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => { const id = cancelTarget; setCancelTarget(null); if (id) updateStatus(id, "cancelled"); }}
        title="이 발주를 취소할까요?"
        description="취소한 발주는 다시 대기 상태로 되돌릴 수 없어요"
        confirmLabel="취소하기"
      />
    </Page>
  );
}
