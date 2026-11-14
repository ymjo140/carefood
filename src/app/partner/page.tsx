"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Badge, Button, Card, EmptyState, Icon, LinkButton, ListRow, Page, PageHeader, PageLoading, SectionHeader,
  SkeletonList, Tabs, timeAgo,
} from "@/components/ui";
import { REVIEW_LABELS } from "@/lib/partner/schema";
import { isStage, type Stage } from "@/lib/partner/customer-stages";
import { TAB_LABEL, isTab, tabsFor, type Tab } from "@/lib/partner/tabs";
import { ORDERING_ENABLED } from "@/lib/features";
import { Commission } from "./Commission";
import { Report } from "./Report";
import { DemandTab } from "./DemandTab";
import { Orders, type OrderFilter } from "./Orders";
import { Today } from "./Today";
import { CustomersTab } from "./Customers";
import { Connect, type Batch } from "./Connect";
import { ProductSheet } from "./ProductSheet";
import { ProductBoard } from "./ProductBoard";

type Partner = { id: string; slug: string; name: string; kind: string; status: string; is_demo?: boolean };
type Claim = { phrase: string; why: string; suggest?: string };
type Item = {
  id: string; partner_sku: string; status: "pending" | "approved" | "rejected" | "discontinued"; review_reasons: string[];
  warnings: string[]; reject_note: string | null; product_id: string | null; updated_at: string; name: string;
  claims: Claim[]; dropped: string | null; price_age: number | null;
};
type Me = { partner: Partner; role: string; read_only?: boolean; counts: Record<string, number>; batches: Batch[] };
type Load<T> = { status: "loading" | "error" | "done" | "login" | "not_member"; data?: T; error?: string };

const STATUS_LABEL: Record<Item["status"], string> = { pending: "검수 중", approved: "반영", rejected: "반려", discontinued: "판매 종료" };
const STATUS_TONE = { pending: "neutral", approved: "positive", rejected: "danger", discontinued: "neutral" } as const;
const KIND_LABEL: Record<string, string> = { meal_service: "식단 서비스", brand: "식품 브랜드", mall: "유통·몰" };
type Filter = "all" | "pending" | "approved" | "rejected" | "discontinued";

/**
 * 입점 업체 화면 — 탭 여덟 개(오늘·주문·성과·고객층·수요·제품·정산·연동), 업체 유형이 순서를 정한다 (v3 6장).
 * ?tab= 으로 탭을 열 수 있고(관리자 ?as= 와 함께 남는다), 다른 탭에서 "이 조건으로 고객층 만들기"를 누르면 조건을 들고 고객층으로 간다.
 */
function PartnerHome() {
  const sp = useSearchParams();
  const router = useRouter();
  const as = sp.get("as");
  const qs = as ? `as=${encodeURIComponent(as)}` : "";
  const [me, setMe] = useState<Load<Me>>({ status: "loading" });
  const [items, setItems] = useState<Load<Item[]>>({ status: "loading" });
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<Tab>(() => { const t = sp.get("tab"); return isTab(t) ? t : "today"; });
  const [prefill, setPrefill] = useState<{ need?: string; goal?: string } | null>(null);
  // 오늘의 할 일에서 들어올 때 — 주문 상태·고객 단계를 고른 채로 연다
  const [orderFilter, setOrderFilter] = useState<OrderFilter | undefined>(undefined);
  const [customerStage, setCustomerStage] = useState<Stage | null>(null);
  const [openItem, setOpenItem] = useState<string | null>(null);
  // 판매·출고가 먼저 — 매일 보는 것. 제품 관리는 올리기·검수·고치기 (반려·검수 중으로 들어오면 제품 관리로)
  const [productView, setProductView] = useState<"info" | "board">("board");

  const loadMe = useCallback(async () => {
    try {
      const r = await fetch(`/api/partner/me?${qs}`);
      const d = await r.json();
      if (d.state === "login") return setMe({ status: "login" });
      if (d.state === "not_member") return setMe({ status: "not_member" });
      if (!r.ok) throw new Error(d.error);
      setMe({ status: "done", data: d });
    } catch (e) { setMe({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);

  // 상태 필터를 빨리 바꾸면 늦게 온 예전 응답이 새 목록을 덮지 않게 — 마지막 요청만 상태를 바꾼다
  const itemsSeq = useRef(0);
  const loadItems = useCallback(async (f: Filter) => {
    const my = ++itemsSeq.current;
    try {
      const r = await fetch(`/api/partner/items?${qs}${f === "all" ? "" : `&status=${f}`}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (my === itemsSeq.current) setItems({ status: "done", data: d.items });
    } catch (e) { if (my === itemsSeq.current) setItems({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);

  useEffect(() => { loadMe(); }, [loadMe]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다
  useEffect(() => { if (me.status === "done" && view === "products") loadItems(filter); }, [me.status, view, filter, loadItems]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const go = useCallback((tab: Tab, opts?: { filter?: string; need?: string; goal?: string }) => {
    if (tab === "products" && opts?.filter && ["pending", "approved", "rejected", "discontinued"].includes(opts.filter)) { setFilter(opts.filter as Filter); setItems({ status: "loading" }); setProductView("info"); }
    if (tab === "segments" && (opts?.need || opts?.goal)) setPrefill({ need: opts.need, goal: opts.goal });
    if (tab === "orders") setOrderFilter(opts?.filter && ["new", "accepted", "shipped", "done"].includes(opts.filter) ? opts.filter as OrderFilter : undefined);
    if (tab === "segments") setCustomerStage(isStage(opts?.filter) ? opts.filter : null);
    setView(tab);
    const next = new URLSearchParams(sp.toString());
    next.set("tab", tab);
    router.replace(`/partner?${next.toString()}`, { scroll: false });
    window.scrollTo({ top: 0 });
  }, [router, sp]);

  if (me.status === "loading") return <PageLoading />;
  if (me.status === "login") {
    return (
      <Page width="narrow">
        <EmptyState className="mt-16" title="입점 업체 화면은 로그인해야 볼 수 있어요"
          description="케어푸드에 연결된 담당자 계정으로 로그인해 주세요"
          action={<LinkButton href="/login?returnTo=/partner" size="sm">로그인하기</LinkButton>} />
      </Page>
    );
  }
  if (me.status === "not_member") {
    return (
      <Page width="narrow">
        <EmptyState className="mt-16" title="이 계정은 아직 입점 업체에 연결되지 않았어요"
          description="입점을 신청하면 케어푸드가 확인한 뒤 이 계정을 업체에 연결해 드려요"
          action={<LinkButton href="/vendor/apply" size="sm" variant="secondary">입점 신청하기</LinkButton>} />
      </Page>
    );
  }
  if (me.status === "error" || !me.data) {
    return (
      <Page width="narrow">
        <EmptyState className="mt-16" title="업체 정보를 불러오지 못했어요" description={me.error}
          action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setMe({ status: "loading" }); loadMe(); }}>다시 불러오기</Button>} />
      </Page>
    );
  }

  const { partner, counts, batches } = me.data;
  // 테스트 업체는 예시 주문을 볼 수 있게 주문 탭을 연다 (앱 주문이 아직 닫혀 있어도)
  const tabs = tabsFor(partner.kind, ORDERING_ENABLED || !!partner.is_demo);
  const current = tabs.includes(view) ? view : "today";

  return (
    <Page width="wide">
      <PageHeader
        title={partner.name}
        description={`${KIND_LABEL[partner.kind] || "입점 업체"} · ${partner.status === "active" ? "반영된 제품이 앱에 보이고 있어요" : "입점 준비 중 · 반영된 제품은 운영을 시작하면 앱에 보여요"}`}
        actions={as ? <Badge tone="brand">관리자 보기</Badge> : undefined}
      />

      <Tabs value={current} onChange={(t) => go(t)} label="입점 업체 메뉴" className="mb-6"
        items={tabs.map((t) => ({ value: t, label: TAB_LABEL[t], count: t === "products" ? counts.rejected || 0 : undefined }))} />

      {current === "today" && <Today qs={qs} go={go} />}
      {current === "orders" && <Orders key={orderFilter || "new"} qs={qs} initialFilter={orderFilter} />}
      {current === "report" && <Report qs={qs} onMakeSegment={(goal) => go("segments", { goal })} />}
      {current === "segments" && <CustomersTab key={customerStage || "all"} qs={qs} go={go} prefill={prefill} initialStage={customerStage} />}
      {current === "demand" && <DemandTab qs={qs} onMakeSegment={(need) => go("segments", { need })} />}
      {current === "commission" && <Commission qs={qs} readOnly={!!as} />}
      {current === "connect" && <Connect qs={qs} batches={batches} isDemo={!!partner.is_demo} readOnly={!!me.data.read_only} onChanged={() => { loadMe(); setItems({ status: "loading" }); }} onReport={() => go("commission")} />}

      {current === "products" && (
        <section>
          <SectionHeader title="제품" />
          <Tabs value={productView} onChange={setProductView} label="제품 보기" className="mb-4"
            items={[{ value: "board", label: "판매·출고" }, { value: "info", label: "제품 관리" }]} />
          {productView === "board" ? <ProductBoard qs={qs} toOrders={() => go("orders")} /> : (<>
          <Tabs variant="line" value={filter} onChange={(f) => { setFilter(f); setItems({ status: "loading" }); }} label="제품 상태" className="mb-3"
            items={[
              { value: "all", label: "전체" },
              { value: "pending", label: "검수 중", count: counts.pending || 0 },
              { value: "approved", label: "반영", count: counts.approved || 0 },
              { value: "rejected", label: "반려", count: counts.rejected || 0 },
              { value: "discontinued", label: "판매 종료", count: counts.discontinued || 0 },
            ]} />
          {items.status === "loading" ? <SkeletonList rows={4} thumb={false} />
            : items.status === "error" ? (
              <EmptyState title="제품 목록을 불러오지 못했어요" description={items.error}
                action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setItems({ status: "loading" }); loadItems(filter); }}>다시 불러오기</Button>} />
            ) : !items.data?.length ? (
              <EmptyState title={filter === "all" ? "아직 올린 제품이 없어요" : `${STATUS_LABEL[filter as Item["status"]]} 제품이 없어요`}
                description={filter === "all" ? "연동 탭에서 피드를 연결하거나 엑셀로 올려 주세요" : undefined}
                action={filter === "all" ? <Button size="sm" variant="secondary" onClick={() => go("connect")}>연동하러 가기</Button> : undefined} />
            ) : (
              <Card padding="none" className="divide-y divide-line">
                {items.data.map((it) => (
                  <ListRow key={it.id} onClick={() => setOpenItem(it.id)}
                    title={it.name}
                    meta={
                      <span className="flex flex-col gap-0.5">
                        <span><span className="num">{it.partner_sku}</span> · {timeAgo(it.updated_at)}{it.price_age !== null && it.price_age >= 50 ? <> · 가격 확인 <span className="num">{it.price_age}</span>일 전</> : null}</span>
                        {it.status === "pending" && it.review_reasons.length > 0 && <span>{it.review_reasons.map((r) => REVIEW_LABELS[r] || r).join(" · ")}</span>}
                        {it.reject_note && <span className="text-danger">반려 이유: {it.reject_note}</span>}
                        {it.dropped && <span className="inline-flex items-center gap-1 text-ink"><Icon name="alert" size={14} className="text-danger" />추천에서 빠짐 · {it.dropped}</span>}
                        {it.claims.map((c) => (
                          <span key={c.phrase} className="inline-flex items-start gap-1 text-ink">
                            <Icon name="alert" size={14} className="text-ink-2 shrink-0 mt-0.5" />
                            <span>&lsquo;{c.phrase}&rsquo; — {c.why}{c.suggest ? ` · 바꿀 말: ${c.suggest}` : ""}</span>
                          </span>
                        ))}
                      </span>
                    }
                    trailing={<Badge tone={STATUS_TONE[it.status]}>{STATUS_LABEL[it.status]}</Badge>}
                  />
                ))}
              </Card>
            )}
          <ProductSheet qs={qs} id={openItem} onClose={() => setOpenItem(null)} onSaved={() => { loadMe(); loadItems(filter); }} />
          <p className="text-caption text-ink-2 mt-3">
            제품을 누르면 상태·이유·판매처별 가격을 보고 바로 고칠 수 있어요. 표현 점검은 상품명·소개·강조 문구에서 질병·효능으로 읽힐 수 있는 말을 먼저 알려 드리는 안내예요. 법적 판단은 아니고, 근거를 달면 검수에서 통과될 수 있어요
          </p>
          </>)}
        </section>
      )}
    </Page>
  );
}

export default function PartnerPage() {
  return <Suspense fallback={<PageLoading />}><PartnerHome /></Suspense>;
}
