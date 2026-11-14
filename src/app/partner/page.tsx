"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge, Button, EmptyState, LinkButton, Page, PageHeader, PageLoading, Tabs } from "@/components/ui";
import { TAB_LABEL, resolveTab, tabsFor, viewsOf, type Go, type Tab } from "@/lib/partner/tabs";
import { isStage, type Stage } from "@/lib/partner/customer-stages";
import { ORDERING_ENABLED } from "@/lib/features";
import { LinkSalesUpload, Settlement } from "./Commission";
import { Report } from "./Report";
import { DemandFlow } from "./DemandTab";
import { Marketing } from "./Marketing";
import { Orders, type OrderFilter } from "./Orders";
import { Today } from "./Today";
import { CustomersTab } from "./Customers";
import { Connect, ProductUpload, type Batch } from "./Connect";
import { PartnerInfo, PartnerTeam } from "./Settings";
import { ProductBoard } from "./ProductBoard";
import { ProductInfo, isProductFilter, type ProductFilter } from "./Products";
import { Reviews } from "./Reviews";

type Partner = { id: string; slug: string; name: string; kind: string; status: string; is_demo?: boolean };
type Me = { partner: Partner; role: string; read_only?: boolean; counts: Record<string, number>; batches: Batch[] };
type Load<T> = { status: "loading" | "error" | "done" | "login" | "not_member"; data?: T; error?: string };

const KIND_LABEL: Record<string, string> = { meal_service: "식단 서비스", brand: "식품 브랜드", mall: "유통·몰" };

/**
 * 입점 업체 화면 — 메뉴 8개(홈·주문·제품·고객·마케팅·분석·정산·설정), 모든 업체가 같은 순서 (11/14 구조 진단 6부).
 * 주소 ?tab=<메뉴>&view=<보기> 로 모든 보기가 열리고 뒤로 가기가 된다(관리자 ?as= 와 함께 남는다). 예전 탭 이름은 새 메뉴로 옮겨 연다.
 * 다른 화면에서 고른 상태(주문 상태·고객 단계·제품 상태)나 조건(목표·찾는 조건)은 go() 로 들고 간다.
 */
function PartnerHome() {
  const sp = useSearchParams();
  const router = useRouter();
  const as = sp.get("as");
  const qs = as ? `as=${encodeURIComponent(as)}` : "";
  const [me, setMe] = useState<Load<Me>>({ status: "loading" });
  const { tab: urlTab, view: urlView } = resolveTab(sp.get("tab"), sp.get("view"));
  const [carry, setCarry] = useState<{ filter?: string; need?: string; goal?: string } | null>(null);

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
  useEffect(() => { loadMe(); }, [loadMe]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  // 메뉴·보기는 주소가 기준 — push 로 바꿔 뒤로 가기가 이전 보기로 돌아간다
  const go: Go = useCallback((tab, opts) => {
    setCarry(opts?.filter || opts?.need || opts?.goal ? { filter: opts.filter, need: opts.need, goal: opts.goal } : null);
    const next = new URLSearchParams();
    if (as) next.set("as", as);
    next.set("tab", tab);
    const v = opts?.view || viewsOf(tab)[0]?.value;
    if (v) next.set("view", v);
    router.push(`/partner?${next.toString()}`, { scroll: false });
    window.scrollTo({ top: 0 });
  }, [router, as]);

  if (me.status === "loading") return <PageLoading />;
  if (me.status === "login") {
    return (
      <Page width="narrow">
        <EmptyState className="mt-16" title="입점 업체 화면은 로그인해야 볼 수 있어요"
          description="오늘끼록에 연결된 담당자 계정으로 로그인해 주세요"
          action={<LinkButton href="/login?returnTo=/partner" size="sm">로그인하기</LinkButton>} />
      </Page>
    );
  }
  if (me.status === "not_member") {
    return (
      <Page width="narrow">
        <EmptyState className="mt-16" title="이 계정은 아직 입점 업체에 연결되지 않았어요"
          description="입점을 신청하면 오늘끼록이 확인한 뒤 이 계정을 업체에 연결해 드려요"
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
  const readOnly = !!me.data.read_only;
  // 테스트 업체는 예시 주문을 볼 수 있게 주문 메뉴를 연다 (앱 주문이 아직 닫혀 있어도)
  const tabs = tabsFor(ORDERING_ENABLED || !!partner.is_demo);
  const current: Tab = tabs.includes(urlTab) ? urlTab : "home";
  const views = viewsOf(current);
  const view = current === urlTab && urlView ? urlView : views[0]?.value || "";
  const f = carry?.filter;
  const prefill = carry?.need || carry?.goal ? { need: carry.need, goal: carry.goal } : null;

  return (
    <Page width="wide">
      <PageHeader
        title={partner.name}
        description={`${KIND_LABEL[partner.kind] || "입점 업체"} · ${partner.is_demo ? "테스트 업체 · 제품은 앱에 보이지 않고 주문도 받지 않아요" : partner.status === "active" ? "반영된 제품이 앱에 보이고 있어요" : "입점 준비 중 · 반영된 제품은 운영을 시작하면 앱에 보여요"}`}
        actions={as ? <Badge tone="brand">관리자 보기</Badge> : undefined}
      />

      <Tabs value={current} onChange={(t) => go(t)} label="입점 업체 메뉴" className="mb-4"
        items={tabs.map((t) => ({ value: t, label: TAB_LABEL[t], count: t === "products" ? counts.rejected || undefined : undefined }))} />
      {views.length > 1 && (
        <Tabs variant="line" value={view} onChange={(v) => go(current, { view: v })} label={`${TAB_LABEL[current]} 보기`} className="mb-6"
          items={views.map((v) => ({ value: v.value, label: v.label, count: current === "products" && v.value === "info" ? counts.rejected || undefined : undefined }))} />
      )}
      {views.length <= 1 && <div className="mb-2" />}

      {current === "home" && <Today qs={qs} go={go} />}
      {current === "orders" && <Orders key={f || "new"} qs={qs} initialFilter={f && ["new", "accepted", "shipped", "returns", "inquiries", "done"].includes(f) ? f as OrderFilter : undefined} />}
      {current === "products" && view === "stock" && <ProductBoard qs={qs} toOrders={() => go("orders")} />}
      {current === "products" && view === "info" && (
        <ProductInfo key={f || "all"} qs={qs} isDemo={!!partner.is_demo} counts={counts} initialFilter={isProductFilter(f) ? f as ProductFilter : undefined}
          onChanged={loadMe} toUpload={() => go("products", { view: "upload" })} />
      )}
      {current === "products" && view === "reviews" && <Reviews qs={qs} />}
      {current === "products" && view === "upload" && <ProductUpload qs={qs} batches={batches} isDemo={!!partner.is_demo} readOnly={readOnly} onChanged={loadMe} />}
      {current === "customers" && <CustomersTab key={f || "all"} qs={qs} go={go} initialStage={isStage(f) ? f as Stage : null} />}
      {current === "marketing" && <Marketing qs={qs} view={view} go={go} prefill={prefill} readOnly={readOnly} />}
      {current === "analytics" && view === "report" && <Report qs={qs} onMakeSegment={(goal) => go("marketing", { view: "ads", goal })} />}
      {current === "analytics" && view === "demand" && (
        <DemandFlow qs={qs} onMakeSegment={(need) => go("marketing", { view: "ads", need })} onSent={() => go("marketing", { view: "collabs" })} />
      )}
      {current === "settlement" && <Settlement qs={qs} readOnly={!!as} />}
      {current === "settings" && view === "info" && <PartnerInfo qs={qs} />}
      {current === "settings" && view === "team" && <PartnerTeam qs={qs} />}
      {current === "settings" && view === "connect" && <Connect qs={qs} onChanged={loadMe} linkSales={<LinkSalesUpload qs={qs} readOnly={readOnly} />} />}
    </Page>
  );
}

export default function PartnerPage() {
  return <Suspense fallback={<PageLoading />}><PartnerHome /></Suspense>;
}
