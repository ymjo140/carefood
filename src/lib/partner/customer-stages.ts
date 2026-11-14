/** 고객 단계 — 화면·서버가 같이 쓴다 (v3 10.2) */
export const STAGES = {
  first: { label: "첫 주문", rule: "주문 1번, 30일 안", todo: "첫 주문 감사와 두 번째 주문 혜택" },
  repeat: { label: "다시 산", rule: "주문 2~3번, 마지막 주문 60일 안", todo: "재구매 혜택" },
  loyal: { label: "단골", rule: "주문 4번 이상, 마지막 주문 60일 안", todo: "단골 혜택 · 새 제품 먼저 알리기" },
  one_lapsed: { label: "한 번 사고 뜸한", rule: "주문 1번, 30일 넘음", todo: "다시 찾아 주세요 혜택" },
  at_risk: { label: "뜸해지는", rule: "주문 2번 이상, 마지막 주문 60~120일", todo: "다시 살 때 알림" },
  lapsed: { label: "떠난", rule: "주문 2번 이상, 마지막 주문 120일 넘음", todo: "큰 혜택 한 번, 반응이 없으면 그만" },
} as const;
export type Stage = keyof typeof STAGES;
export const isStage = (v: unknown): v is Stage => typeof v === "string" && v in STAGES;

