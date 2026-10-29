"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

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
  greating: "🥗 그리팅", yundiet: "💪 윤식단", designmeal: "🍱 디자인밀",
  sixmeal: "🥩 식스밀", makesalad: "🥙 메이크샐러드",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "발주 대기", color: "text-yellow-400" },
  ordered: { label: "발주 완료", color: "text-blue-400" },
  confirmed: { label: "확인됨", color: "text-green-400" },
  shipped: { label: "출하", color: "text-primary" },
  delivered: { label: "배송 완료", color: "text-green-500" },
  cancelled: { label: "취소", color: "text-red-400" },
};

export default function AdminOrdersPage() {
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [summary, setSummary] = useState<Summary>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchData = () => {
    setLoading(true);
    fetch(`/api/orders/purchase-orders?status=${statusFilter}`)
      .then(r => r.json())
      .then(data => {
        setPos(data.purchase_orders || []);
        setSummary(data.summary || {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [statusFilter]);

  const updateStatus = async (poId: string, newStatus: string) => {
    await fetch("/api/orders/purchase-orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ po_id: poId, status: newStatus }),
    });
    fetchData();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <Link href="/admin" className="text-xs text-muted hover:text-foreground mb-1 inline-block">← 관리자</Link>
          <h1 className="text-xl font-extrabold">📦 발주 관리</h1>
          <p className="text-xs text-muted mt-0.5">서비스별 발주 현황 및 배송 관리</p>
        </div>
      </div>

      {/* 상태 필터 */}
      <div className="flex gap-1.5 mb-5 overflow-x-auto no-scrollbar">
        {[
          { key: "all", label: "전체" },
          { key: "pending", label: "발주 대기" },
          { key: "ordered", label: "발주 완료" },
          { key: "shipped", label: "배송 중" },
          { key: "delivered", label: "배송 완료" },
        ].map(f => (
          <button key={f.key} onClick={() => setStatusFilter(f.key)}
            className={`text-xs px-3 py-1.5 rounded-full shrink-0 ${
              statusFilter === f.key ? "bg-foreground text-card" : "bg-surface text-foreground/70 hover:bg-border"
            }`} style={{ minHeight: "28px", minWidth: "unset" }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* 서비스별 요약 */}
      {Object.keys(summary).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {Object.entries(summary).map(([service, s]) => (
            <div key={service} className="border border-border rounded-xl p-3">
              <p className="text-xs font-bold mb-1">{SERVICE_LABELS[service] || service}</p>
              <p className="text-lg font-extrabold">{s.items}끼</p>
              <div className="flex justify-between text-[10px] text-muted mt-1">
                <span>{s.users}명</span>
                <span>{s.amount.toLocaleString()}원</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 발주 목록 */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : pos.length === 0 ? (
        <div className="text-center py-12 text-muted">
          <p className="text-3xl mb-2">📦</p>
          <p className="text-sm">발주 내역이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pos.map(po => {
            const st = STATUS_LABELS[po.status] || { label: po.status, color: "" };
            return (
              <div key={po.id} className="border border-border rounded-xl overflow-hidden">
                <div className="bg-surface/50 px-4 py-3 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold">{SERVICE_LABELS[po.service] || po.service}</span>
                    <span className="text-xs text-muted">{po.delivery_date}</span>
                    <span className={`text-xs font-bold ${st.color}`}>{st.label}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{po.total_amount.toLocaleString()}원</p>
                    <p className="text-[10px] text-muted">{po.total_users}명 · {po.total_items}끼</p>
                  </div>
                </div>
                {/* 제품 목록 */}
                {po.items && po.items.length > 0 && (
                  <div className="px-4 py-2 divide-y divide-border/20">
                    {po.items.map((item, i) => (
                      <div key={i} className="flex justify-between py-1.5 text-xs">
                        <span>{item.product_name}</span>
                        <span className="text-muted">{item.quantity}개 · {(item.unit_price * item.quantity).toLocaleString()}원</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* 상태 변경 버튼 */}
                {po.status === "pending" && (
                  <div className="px-4 py-2 border-t border-border flex gap-2">
                    <button onClick={() => updateStatus(po.id, "ordered")}
                      className="text-xs bg-primary text-white px-3 py-1.5 rounded-lg font-bold"
                      style={{ minHeight: "28px", minWidth: "unset" }}>
                      발주하기
                    </button>
                    <button onClick={() => updateStatus(po.id, "cancelled")}
                      className="text-xs text-red-400 px-3 py-1.5 rounded-lg border border-red-400/30"
                      style={{ minHeight: "28px", minWidth: "unset" }}>
                      취소
                    </button>
                  </div>
                )}
                {po.status === "ordered" && (
                  <div className="px-4 py-2 border-t border-border">
                    <button onClick={() => updateStatus(po.id, "shipped")}
                      className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-bold"
                      style={{ minHeight: "28px", minWidth: "unset" }}>
                      출하 처리
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
