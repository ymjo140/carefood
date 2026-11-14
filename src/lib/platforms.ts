/**
 * 판매처 이름 — 화면 어디서나 같은 이름으로
 * 쿠팡은 쿠팡 파트너스 링크라 링크가 보이는 곳에 대가성 문구를 함께 둔다 (쿠팡 파트너스 정책 · 표시광고법)
 */
export const PLATFORM_LABELS: Record<string, string> = {
  coupang: "쿠팡", kurly: "컬리", oasis: "오아시스", homeplus: "홈플러스", "11st": "11번가",
  danawa: "다나와", greating: "그리팅", yundiet: "윤식단", sixmeal: "식스밀",
  designmeal: "디자인밀", makesalad: "메이크샐러드",
};

export const platformLabel = (key: string | null | undefined) => (key ? PLATFORM_LABELS[key] || key : "");

/** 수수료를 받는(제휴) 판매처 */
export const AFFILIATE_PLATFORMS = new Set(["coupang"]);

// 쿠팡 파트너스 대가성 문구 — 정해진 표현(합쇼체) 그대로
export const COUPANG_DISCLOSURE = "쿠팡 파트너스 활동을 통해 오늘끼록이 일정액의 수수료를 제공받습니다";
