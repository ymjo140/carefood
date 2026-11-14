/**
 * 업체 화면 탭 — 모든 업체가 같은 탭을 쓰고, 유형이 순서를 정한다 (v3 6장). 화면·서버가 같이 쓴다.
 * '주문'은 앱 주문(ORDERING_ENABLED)이 켜졌을 때만 보인다.
 */
export type Tab = "today" | "orders" | "report" | "segments" | "demand" | "products" | "commission" | "connect";

export const TAB_LABEL: Record<Tab, string> = {
  today: "오늘", orders: "주문", report: "성과", segments: "고객", demand: "수요", products: "제품", commission: "정산", connect: "연동",
};

const ORDER: Record<string, Tab[]> = {
  meal_service: ["today", "orders", "segments", "report", "products", "demand", "commission", "connect"],
  brand: ["today", "orders", "report", "demand", "segments", "products", "commission", "connect"],
  mall: ["today", "report", "connect", "products", "segments", "demand", "commission", "orders"],
};

export function tabsFor(kind: string, ordering: boolean): Tab[] {
  return (ORDER[kind] || ORDER.brand).filter((t) => t !== "orders" || ordering);
}

export function isTab(v: string | null): v is Tab {
  return !!v && v in TAB_LABEL;
}
