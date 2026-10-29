"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

/**
 * 주문 요약 페이지
 *
 * 주간 박스에서 "주문하기" 클릭 → 이 페이지로 이동
 * - 서비스별 주문 그룹핑
 * - 배송지 입력
 * - 요일별 배송 스케줄
 * - 총 비용 요약
 */

type BoxItem = {
  day: string;
  slot: string;
  product_id?: string;
  product_name: string;
  service?: string;
  price?: number;
  calories?: number;
  protein_g?: number;
};

type ServiceGroup = {
  service: string;
  label: string;
  items: BoxItem[];
  total: number;
  deliveryDays: string[];
};

const SERVICE_LABELS: Record<string, string> = {
  greating: "🥗 그리팅", yundiet: "💪 윤식단", designmeal: "🍱 디자인밀",
  sixmeal: "🥩 식스밀", makesalad: "🥙 메이크샐러드", market: "🛒 시판 제품",
};

const DAY_LABELS: Record<string, string> = {
  mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일",
};

const SLOT_LABELS: Record<string, string> = {
  breakfast: "아침", lunch: "점심", dinner: "저녁", snack: "간식",
};

function getUserId(): string {
  try {
    let id = localStorage.getItem("carefood_anon_id");
    if (!id) {
      id = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem("carefood_anon_id", id);
    }
    return id;
  } catch { return `anon_${Date.now()}`; }
}

export default function OrderPage() {
  const [items, setItems] = useState<BoxItem[]>([]);
  const [groups, setGroups] = useState<ServiceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [orderResult, setOrderResult] = useState<{ id: string; total_price: number } | null>(null);

  // 배송지
  const [address, setAddress] = useState({ name: "", phone: "", addr1: "", addr2: "", note: "" });

  useEffect(() => {
    // 주간 박스에서 전달된 데이터 로드
    try {
      const boxData = localStorage.getItem("carefood_order_items");
      if (boxData) {
        const parsed = JSON.parse(boxData) as BoxItem[];
        setItems(parsed);

        // 서비스별 그룹핑
        const groupMap: Record<string, BoxItem[]> = {};
        for (const it of parsed) {
          const svc = it.service || "market";
          if (!groupMap[svc]) groupMap[svc] = [];
          groupMap[svc].push(it);
        }

        const grouped: ServiceGroup[] = Object.entries(groupMap).map(([service, serviceItems]) => ({
          service,
          label: SERVICE_LABELS[service] || service,
          items: serviceItems,
          total: serviceItems.reduce((s, it) => s + (it.price || 0), 0),
          deliveryDays: [...new Set(serviceItems.map(it => it.day))],
        }));

        // 건강식단 서비스 먼저, 시판 마지막
        grouped.sort((a, b) => {
          if (a.service === "market") return 1;
          if (b.service === "market") return -1;
          return b.items.length - a.items.length;
        });

        setGroups(grouped);
      }
    } catch { /* */ }
    setLoading(false);
  }, []);

  const totalPrice = groups.reduce((s, g) => s + g.total, 0);
  const totalItems = items.length;

  const handleOrder = async () => {
    if (ordering || items.length === 0) return;
    setOrdering(true);

    const userId = getUserId();
    const nextMonday = new Date();
    nextMonday.setDate(nextMonday.getDate() + (8 - nextMonday.getDay()) % 7);

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          items: items.map(it => ({
            product_id: it.product_id || null,
            product_name: it.product_name,
            day_of_week: it.day,
            meal_type: it.slot,
            quantity: 1,
          })),
          delivery_week_start: nextMonday.toISOString().slice(0, 10),
          delivery_preference: { note: address.note },
        }),
      });
      const data = await res.json();
      if (data.order) {
        setOrderResult(data.order);
        localStorage.removeItem("carefood_order_items");
      }
    } catch { /* */ }
    finally { setOrdering(false); }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // 주문 완료
  if (orderResult) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 text-center">
        <p className="text-5xl mb-4">✅</p>
        <h1 className="text-xl font-extrabold mb-2">주문이 접수되었습니다</h1>
        <p className="text-sm text-muted mb-1">주문번호: {orderResult.id.slice(0, 8)}</p>
        <p className="text-sm text-muted mb-6">서비스별 발주가 자동으로 처리됩니다</p>
        <div className="flex gap-3 justify-center">
          <Link href="/diary" className="bg-primary text-white px-6 py-3 rounded-xl text-sm font-bold">
            식단 기록하기
          </Link>
          <Link href="/" className="border border-border px-6 py-3 rounded-xl text-sm font-medium">
            홈으로
          </Link>
        </div>
      </div>
    );
  }

  // 빈 상태
  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 text-center">
        <p className="text-4xl mb-3">📦</p>
        <h1 className="text-lg font-bold mb-2">주문할 식단이 없습니다</h1>
        <p className="text-sm text-muted mb-6">주간 박스에서 식단을 구성한 뒤 주문해주세요</p>
        <Link href="/weekly-box" className="bg-primary text-white px-6 py-3 rounded-xl text-sm font-bold">
          주간 박스 만들기
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
      <Link href="/weekly-box" className="text-sm text-muted hover:text-foreground mb-4 inline-block">← 주간 박스</Link>
      <h1 className="text-xl font-extrabold mb-5">🛒 주문 확인</h1>

      {/* ── 서비스별 주문 ── */}
      <div className="space-y-4 mb-6">
        {groups.map(g => (
          <div key={g.service} className="border border-border rounded-xl overflow-hidden">
            <div className="bg-surface/50 px-4 py-2.5 border-b border-border flex items-center justify-between">
              <span className="text-sm font-bold">{g.label}</span>
              <span className="text-xs text-muted">{g.items.length}끼 · {g.deliveryDays.map(d => DAY_LABELS[d]).join("/")}요일</span>
            </div>
            <div className="divide-y divide-border/30">
              {g.items.map((it, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{it.product_name}</p>
                    <p className="text-[10px] text-muted">
                      {DAY_LABELS[it.day]}요일 {SLOT_LABELS[it.slot]}
                      {it.calories ? ` · ${it.calories}kcal` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-medium shrink-0 ml-3">
                    {it.price ? `${it.price.toLocaleString()}원` : "-"}
                  </span>
                </div>
              ))}
            </div>
            {g.total > 0 && (
              <div className="bg-surface/30 px-4 py-2 flex justify-between text-sm border-t border-border">
                <span className="text-muted">소계</span>
                <span className="font-bold">{g.total.toLocaleString()}원</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── 배송 정보 ── */}
      <div className="border border-border rounded-xl p-4 mb-6">
        <h2 className="text-sm font-bold mb-3">📍 배송 정보</h2>
        <div className="space-y-2">
          <input type="text" placeholder="받는 분" value={address.name}
            onChange={e => setAddress(p => ({ ...p, name: e.target.value }))}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
            style={{ minHeight: "36px" }} />
          <input type="text" placeholder="연락처" value={address.phone}
            onChange={e => setAddress(p => ({ ...p, phone: e.target.value }))}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
            style={{ minHeight: "36px" }} />
          <input type="text" placeholder="주소" value={address.addr1}
            onChange={e => setAddress(p => ({ ...p, addr1: e.target.value }))}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
            style={{ minHeight: "36px" }} />
          <input type="text" placeholder="상세 주소" value={address.addr2}
            onChange={e => setAddress(p => ({ ...p, addr2: e.target.value }))}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
            style={{ minHeight: "36px" }} />
          <input type="text" placeholder="배송 메모 (선택)" value={address.note}
            onChange={e => setAddress(p => ({ ...p, note: e.target.value }))}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
            style={{ minHeight: "36px" }} />
        </div>
      </div>

      {/* ── 결제 요약 ── */}
      <div className="bg-surface rounded-xl p-4 mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-muted">총 {totalItems}끼</span>
          <span>{totalPrice.toLocaleString()}원</span>
        </div>
        <div className="flex justify-between text-sm mb-2">
          <span className="text-muted">배송비</span>
          <span className="text-primary">무료</span>
        </div>
        <div className="border-t border-border pt-2 flex justify-between">
          <span className="font-bold">결제 금액</span>
          <span className="text-lg font-extrabold text-primary">{totalPrice.toLocaleString()}원</span>
        </div>
      </div>

      {/* ── 주문 버튼 ── */}
      <button onClick={handleOrder} disabled={ordering}
        className="w-full bg-primary text-white py-4 rounded-xl text-sm font-bold disabled:opacity-50 transition-opacity"
        style={{ minHeight: "48px" }}>
        {ordering ? "주문 처리 중..." : `${totalPrice.toLocaleString()}원 주문하기`}
      </button>

      <p className="text-[10px] text-muted text-center mt-3">
        * 각 서비스별로 자동 발주됩니다. 시판 제품은 별도 구매가 필요합니다.
      </p>
    </div>
  );
}
