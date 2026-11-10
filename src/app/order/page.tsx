"use client";

import { useState, useEffect } from "react";
import { addDays, todayKst, weekday } from "@/lib/day";
import { ORDERING_ENABLED } from "@/lib/features";
import { Button, Card, EmptyState, Field, Icon, Input, LinkButton, Page, PageHeader, PageLoading, Price, TextLink, useToast } from "@/components/ui";
import { getClientActorId } from "@/lib/actor-client";

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
  greating: "그리팅", yundiet: "윤식단", designmeal: "디자인밀",
  sixmeal: "식스밀", makesalad: "메이크샐러드", market: "시판 제품",
};

const DAY_LABELS: Record<string, string> = {
  mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일",
};

const SLOT_LABELS: Record<string, string> = {
  breakfast: "아침", lunch: "점심", dinner: "저녁", snack: "간식",
};

function getUserId(): string {
  // 서버가 발급한 쿠키의 id — API 는 이 값을 받지 않고 쿠키로 직접 확인한다
  return getClientActorId() || "";
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
    } catch { /* */ } // ds-allow: 로컬 주문 목록 읽기
    setLoading(false);
  }, []);

  const totalPrice = groups.reduce((s, g) => s + g.total, 0);
  const totalItems = items.length;

  const handleOrder = async () => {
    if (ordering || items.length === 0) return;
    setOrdering(true);

    const userId = getUserId();
    const today = todayKst();
    const nextMonday = addDays(today, (8 - weekday(today)) % 7); // 오늘이 월요일이면 오늘

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
          delivery_week_start: nextMonday,
          delivery_preference: { note: address.note },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.order) throw new Error(String(res.status));
      setOrderResult(data.order);
      localStorage.removeItem("carefood_order_items");
    } catch {
      toast.show("주문을 접수하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
    finally { setOrdering(false); }
  };

  if (loading) return <PageLoading />;

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
          <p className="text-label text-ink-2 mb-4">서비스별 발주가 자동으로 처리돼요</p>
          <div className="flex gap-2">
            <LinkButton href="/diary">식단 기록하기</LinkButton>
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

      {/* ── 서비스별 주문 ── */}
      <div className="flex flex-col gap-4 mb-6">
        {groups.map(g => (
          <Card key={g.service} padding="none" className="overflow-hidden">
            <div className="bg-sunken px-4 py-2.5 border-b border-line flex items-center justify-between gap-3">
              <span className="text-label font-bold text-ink">{g.label}</span>
              <span className="text-caption text-ink-2"><span className="num">{g.items.length}</span>끼 · {g.deliveryDays.map(d => DAY_LABELS[d]).join("/")}요일</span>
            </div>
            <div className="divide-y divide-line">
              {g.items.map((it, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-label text-ink truncate">{it.product_name}</p>
                    <p className="text-caption text-ink-2">
                      {DAY_LABELS[it.day]}요일 {SLOT_LABELS[it.slot]}
                      {it.calories ? <> · <span className="num">{it.calories}</span>kcal</> : ""}
                    </p>
                  </div>
                  {it.price ? <Price value={it.price} className="text-label shrink-0" /> : <span className="text-label text-ink-3 shrink-0">–</span>}
                </div>
              ))}
            </div>
            {g.total > 0 && (
              <div className="px-4 py-2.5 flex justify-between text-label border-t border-line">
                <span className="text-ink-2">소계</span>
                <Price value={g.total} />
              </div>
            )}
          </Card>
        ))}
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
      </Card>

      {/* ── 결제 요약 ── */}
      <Card tone="sunken" className="mb-6">
        <div className="flex justify-between text-label mb-2">
          <span className="text-ink-2">총 <span className="num">{totalItems}</span>끼</span>
          <Price value={totalPrice} className="font-medium" />
        </div>
        <div className="flex justify-between text-label mb-2">
          <span className="text-ink-2">배송비</span>
          <span className="text-positive font-medium">무료</span>
        </div>
        <div className="border-t border-line pt-2 flex justify-between items-baseline">
          <span className="text-body font-bold text-ink">결제 금액</span>
          <span className="num text-title font-bold text-ink highlight">{totalPrice.toLocaleString()}<span className="text-label font-medium text-ink-2 ml-0.5">원</span></span>
        </div>
      </Card>

      {/* ── 주문 버튼 ── */}
      <Button block onClick={handleOrder} loading={ordering}>
        {ordering ? "주문하는 중" : `${totalPrice.toLocaleString()}원 주문하기`}
      </Button>

      <p className="text-caption text-ink-2 text-center mt-3">
        각 서비스별로 자동 발주돼요. 시판 제품은 따로 구매해야 해요.
      </p>
    </Page>
  );
}
