"use client";

import { useCallback, useEffect, useState } from "react";
import { addDays, todayKst, weekday } from "@/lib/day";
import { ORDERING_ENABLED } from "@/lib/features";
import { Button, Card, EmptyState, Field, Icon, Input, LinkButton, Page, PageHeader, PageLoading, Price, TextLink, useToast } from "@/components/ui";

/**
 * 주문 확인
 *
 * 식단 리스트에서 "주문하기" → 이 화면
 * - 한 번에 주문할 수 있는 것은 입점 업체가 지금 팔고 있는 제품뿐이다. 판매 업체와 값은 서버에서 받아 온다 (/api/orders/quote)
 * - 그 밖의 제품은 '따로 사야 하는 제품'으로 보여 주고 주문·금액에 넣지 않는다
 * - 받는 분 정보 + 판매 업체에 전달 동의(필수)
 */

type BoxItem = { day: string; slot: string; product_id?: string; product_name: string };
type Seller = { seller: string; slug: string; price: number };
type Line = BoxItem & Seller;
type Quote = { status: "loading" | "error" | "done"; groups: { slug: string; seller: string; lines: Line[]; total: number; shipping: number; free_over: number | null; coupon: { name: string; discount: number } | null }[]; others: BoxItem[] };

const DAY_LABELS: Record<string, string> = {
  mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일",
};

const SLOT_LABELS: Record<string, string> = {
  breakfast: "아침", lunch: "점심", dinner: "저녁", snack: "간식",
};

function readBox(): BoxItem[] {
  try {
    const raw = localStorage.getItem("carefood_order_items");
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; } // ds-allow: 저장소를 못 읽으면 빈 주문으로 — 아래 빈 상태가 안내한다
}

export default function OrderPage() {
  if (!ORDERING_ENABLED) return <OrderLocked />;
  return <OrderFlow />;
}

/** 통합 주문은 사업자 등록·PG 연결 뒤에 연다 (src/lib/features.ts) */
function OrderLocked() {
  return (
    <Page width="narrow">
      <PageHeader title="한 번에 주문하기" />
      <EmptyState
        title="한 번에 주문하기는 준비 중이에요"
        description="지금은 식단 리스트의 장보기 목록에서 몰마다 바로 갈 수 있어요"
        action={<LinkButton href="/weekly-box" size="sm">식단 리스트로 가기</LinkButton>}
      />
    </Page>
  );
}

function OrderFlow() {
  const toast = useToast();
  const [items, setItems] = useState<BoxItem[] | null>(null);
  const [quote, setQuote] = useState<Quote>({ status: "loading", groups: [], others: [] });
  const [ordering, setOrdering] = useState(false);
  const [orderResult, setOrderResult] = useState<{ id: string; final_price: number } | null>(null);

  // 배송지
  const [address, setAddress] = useState({ name: "", phone: "", addr1: "", addr2: "", note: "" });
  // 배송을 위해 판매 업체에 받는 분 정보를 전달하는 데 동의 (필수)
  const [consent, setConsent] = useState(false);
  const canOrder = address.name.trim() !== "" && address.phone.replace(/[^\d]/g, "").length >= 9 && address.addr1.trim().length >= 5 && consent;

  const loadQuote = useCallback(async (list: BoxItem[]) => {
    try {
      const res = await fetch("/api/orders/quote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_ids: list.map((it) => it.product_id).filter(Boolean) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "");
      const sellers = (data.sellers || {}) as Record<string, Seller>;
      const ship = (data.shipping || {}) as Record<string, { fee: number; free_over: number | null }>;
      const coupons = (data.coupons || {}) as Record<string, { name: string; discount: number }>;
      const by = new Map<string, Quote["groups"][number]>();
      const others: BoxItem[] = [];
      for (const it of list) {
        const s = it.product_id ? sellers[it.product_id] : undefined;
        if (!s) { others.push(it); continue; }
        const g = by.get(s.slug) || by.set(s.slug, { slug: s.slug, seller: s.seller, lines: [], total: 0, shipping: ship[s.slug]?.fee || 0, free_over: ship[s.slug]?.free_over ?? null, coupon: coupons[s.slug] || null }).get(s.slug)!;
        g.lines.push({ ...it, ...s });
        g.total += s.price;
      }
      setQuote({ status: "done", groups: [...by.values()].sort((a, b) => b.lines.length - a.lines.length), others });
    } catch { setQuote({ status: "error", groups: [], others: [] }); }
  }, []);

  useEffect(() => {
    const list = readBox();
    setItems(list); // eslint-disable-line react-hooks/set-state-in-effect -- 저장소는 화면이 뜬 뒤에만 읽을 수 있다
    if (list.length > 0) loadQuote(list);
  }, [loadQuote]);

  const lines = quote.groups.flatMap((g) => g.lines);
  const itemsPrice = quote.groups.reduce((s, g) => s + g.total, 0);
  const shippingPrice = quote.groups.reduce((s, g) => s + g.shipping, 0);
  const couponPrice = quote.groups.reduce((s, g) => s + (g.coupon?.discount || 0), 0);
  const totalPrice = itemsPrice + shippingPrice - couponPrice;

  const handleOrder = async () => {
    if (ordering || lines.length === 0 || !canOrder) return;
    setOrdering(true);
    const today = todayKst();
    const nextMonday = addDays(today, (8 - weekday(today)) % 7); // 오늘이 월요일이면 오늘

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map((it) => ({ product_id: it.product_id, day_of_week: it.day, meal_type: it.slot, quantity: 1 })),
          delivery_week_start: nextMonday,
          shipping: { name: address.name, phone: address.phone, address1: address.addr1, address2: address.addr2, note: address.note },
          third_party_consent: consent,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.order) throw new Error(data.error || "");
      setOrderResult(data.order);
      try { localStorage.removeItem("carefood_order_items"); } catch { /* */ } // ds-allow: 주문은 이미 접수됐다 — 담아 둔 목록만 못 지운 것
    } catch (e) {
      toast.show((e as Error).message || "주문을 접수하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
    finally { setOrdering(false); }
  };

  if (items === null || (items.length > 0 && quote.status === "loading" && !orderResult)) return <PageLoading />;


  // 주문 완료
  if (orderResult) {
    return (
      <Page width="narrow">
        <div className="min-h-[50vh] flex flex-col items-center justify-center text-center gap-2">
          <span className="size-12 rounded-full bg-sunken text-positive flex items-center justify-center mb-2">
            <Icon name="check" size={24} />
          </span>
          <h1 className="text-title font-bold text-ink">주문을 접수했어요</h1>
          <p className="text-label text-ink-2">주문번호 <span className="num font-bold text-ink">{orderResult.id.slice(0, 8)}</span></p>
          <p className="text-label text-ink-2 mb-4">판매 업체가 접수하면 배송을 준비해요. 진행은 주문 내역에서 볼 수 있어요</p>
          <div className="flex gap-2">
            <LinkButton href="/me/orders">주문 내역 보기</LinkButton>
            <LinkButton href="/" variant="secondary">홈으로 가기</LinkButton>
          </div>
        </div>
      </Page>
    );
  }

  // 빈 상태
  if (items.length === 0) {
    return (
      <Page width="narrow">
        <EmptyState
          className="mt-10"
          title="주문할 식단이 없어요"
          description="식단 리스트에서 식단을 구성한 뒤 주문해 주세요"
          action={<LinkButton href="/weekly-box">식단 리스트로 가기</LinkButton>}
        />
      </Page>
    );
  }
  if (quote.status === "error") {
    return (
      <Page width="narrow">
        <EmptyState
          className="mt-10"
          title="주문할 수 있는 제품을 확인하지 못했어요"
          description="잠시 뒤 다시 불러와 주세요"
          action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setQuote({ status: "loading", groups: [], others: [] }); loadQuote(items); }}>다시 불러오기</Button>}
        />
      </Page>
    );
  }
  if (lines.length === 0) {
    return (
      <Page width="narrow">
        <EmptyState
          className="mt-10"
          title="한 번에 주문할 수 있는 제품이 없어요"
          description="담은 제품은 장보기 목록에서 몰마다 따로 살 수 있어요"
          action={<LinkButton href="/weekly-box">식단 리스트로 가기</LinkButton>}
        />
      </Page>
    );
  }

  const ADDRESS_FIELDS: { key: keyof typeof address; label: string; placeholder: string }[] = [
    { key: "name", label: "받는 분", placeholder: "홍길동" },
    { key: "phone", label: "연락처", placeholder: "010-0000-0000" },
    { key: "addr1", label: "주소", placeholder: "도로명 주소" },
    { key: "addr2", label: "상세 주소", placeholder: "동·호수" },
    { key: "note", label: "배송 메모 (선택)", placeholder: "문 앞에 놓아 주세요" },
  ];

  return (
    <Page>
      <TextLink href="/weekly-box" className="mb-3"><Icon name="chevron-left" size={16} /> 식단 리스트</TextLink>
      <PageHeader title="주문 확인" />

      {/* ── 판매 업체별 주문 ── */}
      <div className="flex flex-col gap-4 mb-6">
        {quote.groups.map((g) => (
          <Card key={g.slug} padding="none" className="overflow-hidden">
            <div className="bg-sunken px-4 py-2.5 border-b border-line flex items-center justify-between gap-3">
              <span className="text-label font-bold text-ink">{g.seller}</span>
              <span className="text-caption text-ink-2"><span className="num">{g.lines.length}</span>끼 · {[...new Set(g.lines.map((l) => l.day))].map((d) => DAY_LABELS[d]).join("/")}요일</span>
            </div>
            <div className="divide-y divide-line">
              {g.lines.map((it, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-label text-ink truncate">{it.product_name}</p>
                    <p className="text-caption text-ink-2">{DAY_LABELS[it.day]}요일 {SLOT_LABELS[it.slot]}</p>
                  </div>
                  <Price value={it.price} className="text-label shrink-0" />
                </div>
              ))}
            </div>
            <div className="px-4 py-2.5 flex flex-col gap-1 text-label border-t border-line">
              <div className="flex justify-between">
                <span className="text-ink-2">배송비</span>
                {g.shipping > 0 ? <Price value={g.shipping} /> : <span className="text-ink">무료</span>}
              </div>
              {g.shipping > 0 && g.free_over !== null && (
                <p className="text-caption text-ink-2"><span className="num">{g.free_over.toLocaleString()}</span>원 이상이면 무료예요</p>
              )}
              {g.coupon && (
                <div className="flex justify-between gap-3">
                  <span className="text-ink-2 min-w-0 truncate">쿠폰 · {g.coupon.name}</span>
                  <span className="num text-ink whitespace-nowrap">−{g.coupon.discount.toLocaleString()}원</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-ink-2">소계</span>
                <Price value={g.total + g.shipping - (g.coupon?.discount || 0)} />
              </div>
            </div>
          </Card>
        ))}
        {quote.others.length > 0 && (
          <div>
            <h2 className="text-label font-bold text-ink mb-1">따로 사야 하는 제품 <span className="num font-regular text-ink-2">{quote.others.length}</span></h2>
            <p className="text-caption text-ink-2 mb-2">이 주문에는 들어가지 않아요. 식단 리스트의 장보기 목록에서 몰마다 살 수 있어요</p>
            <ul className="text-label text-ink-2 flex flex-col gap-1">
              {quote.others.map((it, i) => <li key={i} className="truncate">{DAY_LABELS[it.day]}요일 {SLOT_LABELS[it.slot]} · {it.product_name}</li>)}
            </ul>
          </div>
        )}
      </div>

      {/* ── 배송 정보 ── */}
      <Card className="mb-6">
        <h2 className="text-body font-bold text-ink mb-3">배송 정보</h2>
        <div className="flex flex-col gap-3">
          {ADDRESS_FIELDS.map(f => (
            <Field key={f.key} label={f.label}>
              <Input type={f.key === "phone" ? "tel" : "text"} placeholder={f.placeholder} value={address[f.key]}
                onChange={e => setAddress(p => ({ ...p, [f.key]: e.target.value }))} />
            </Field>
          ))}
        </div>
        <label className="flex items-start gap-2 mt-4 text-label text-ink">
          <input type="checkbox" className="ds-check shrink-0 mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            배송을 위해 주문한 상품의 판매 업체에 받는 분·연락처·주소·배송 메모를 전달하는 데 동의해요 (필수)
            <span className="block text-caption text-ink-2 mt-0.5">업체는 이 정보를 배송에만 쓰고, 배송이 끝나면 업체 화면에서 가려져요</span>
          </span>
        </label>
      </Card>

      {/* ── 결제 요약 ── */}
      <Card tone="sunken" className="mb-6">
        <div className="flex justify-between text-label mb-2">
          <span className="text-ink-2">총 <span className="num">{lines.length}</span>끼</span>
          <Price value={itemsPrice} className="font-medium" />
        </div>
        <div className="flex justify-between text-label mb-2">
          <span className="text-ink-2">배송비</span>
          {shippingPrice > 0 ? <Price value={shippingPrice} className="font-medium" /> : <span className="text-ink">무료</span>}
        </div>
        {couponPrice > 0 && (
          <div className="flex justify-between text-label mb-2">
            <span className="text-ink-2">쿠폰 할인 (업체마다 가장 큰 것 하나)</span>
            <span className="num font-medium text-ink whitespace-nowrap">−{couponPrice.toLocaleString()}원</span>
          </div>
        )}
        <div className="border-t border-line pt-2 flex justify-between items-baseline">
          <span className="text-body font-bold text-ink">결제 금액</span>
          <span className="num text-title font-bold text-ink highlight">{totalPrice.toLocaleString()}<span className="text-label font-medium text-ink-2 ml-0.5">원</span></span>
        </div>
      </Card>

      {/* ── 주문 버튼 ── */}
      <Button block onClick={handleOrder} loading={ordering} disabled={!canOrder}>
        {ordering ? "주문하는 중" : `${totalPrice.toLocaleString()}원 주문하기`}
      </Button>

      <p className="text-caption text-ink-2 text-center mt-3">
        {canOrder ? "주문은 판매 업체별로 전달돼요" : "받는 분·연락처·주소를 적고 동의하면 주문할 수 있어요"}
      </p>
    </Page>
  );
}
