/**
 * 업체 화면 메뉴 — 일하는 대상 8개, 모든 업체가 같은 순서 (11/14 구조 진단 6부). 화면·서버가 같이 쓴다.
 * 업체 유형은 순서를 바꾸지 않고 홈의 숫자·할 일만 바꾼다. '주문'은 앱 주문(ORDERING_ENABLED)이 켜졌을 때만 보인다.
 * 주소: /partner?tab=<메뉴>&view=<보기> — 모든 보기가 링크로 열린다. 예전 탭 이름(today·report·segments·demand·commission·connect)은 새 메뉴로 옮겨 연다.
 */
export type Tab = "home" | "orders" | "products" | "customers" | "marketing" | "analytics" | "settlement" | "settings";

export const TABS: Tab[] = ["home", "orders", "products", "customers", "marketing", "analytics", "settlement", "settings"];

export const TAB_LABEL: Record<Tab, string> = {
  home: "홈", orders: "주문", products: "제품", customers: "고객", marketing: "마케팅", analytics: "분석", settlement: "정산", settings: "설정",
};

/** 메뉴 안의 보기 — 첫째가 기본. 보기가 하나면 줄을 그리지 않는다 */
export const VIEWS: Partial<Record<Tab, { value: string; label: string }[]>> = {
  products: [{ value: "stock", label: "판매·재고" }, { value: "info", label: "제품 정보" }, { value: "reviews", label: "리뷰" }, { value: "upload", label: "올리기" }],
  marketing: [{ value: "coupons", label: "쿠폰" }, { value: "flows", label: "자동 알림" }, { value: "ads", label: "광고" }, { value: "collabs", label: "협업" }],
  analytics: [{ value: "report", label: "성과" }, { value: "demand", label: "수요 → 기획" }],
  settings: [{ value: "info", label: "업체 정보" }, { value: "team", label: "담당자·알림" }, { value: "connect", label: "연동" }],
};

export function viewsOf(tab: Tab) {
  return VIEWS[tab] || [];
}
export function isView(tab: Tab, v: string | null | undefined): v is string {
  return !!v && viewsOf(tab).some((x) => x.value === v);
}

/** 예전 탭 이름 → 새 메뉴·보기 (알림·북마크·문서의 옛 주소) */
const LEGACY: Record<string, { tab: Tab; view?: string }> = {
  today: { tab: "home" }, report: { tab: "analytics", view: "report" }, segments: { tab: "customers" },
  demand: { tab: "analytics", view: "demand" }, commission: { tab: "settlement" }, connect: { tab: "settings", view: "connect" },
};

export function resolveTab(v: string | null, view?: string | null): { tab: Tab; view: string | null } {
  if (v && (TABS as string[]).includes(v)) { const t = v as Tab; return { tab: t, view: isView(t, view) ? view! : viewsOf(t)[0]?.value || null }; }
  const l = v ? LEGACY[v] : undefined;
  if (l) return { tab: l.tab, view: l.view || viewsOf(l.tab)[0]?.value || null };
  return { tab: "home", view: null };
}

export function tabsFor(ordering: boolean): Tab[] {
  return TABS.filter((t) => t !== "orders" || ordering);
}

export function isTab(v: string | null): v is Tab {
  return !!v && (TABS as string[]).includes(v);
}

/** 화면 사이 이동 — 메뉴·보기와 함께 고른 상태(주문 상태·고객 단계)나 조건(목표·찾는 조건)을 들고 간다 */
export type GoOpts = { view?: string; filter?: string; need?: string; goal?: string };
export type Go = (tab: Tab, opts?: GoOpts) => void;
