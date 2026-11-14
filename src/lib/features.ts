/**
 * 기능 스위치 — 사업 조건이 갖춰지면 Vercel 환경변수로 켠다 (코드는 그대로)
 *
 * NEXT_PUBLIC_ORDERING_ENABLED=1
 *   통합 주문·결제. 사업자 등록 + 통신판매업 신고 + PG 연결이 끝나면 켠다.
 *   꺼져 있으면 주문 화면은 '준비 중', 주문 API 는 403, 식단 리스트는 몰별 장보기 목록만 보인다.
 *
 * NEXT_PUBLIC_GROUP_BUY_ENABLED=1
 *   공동구매(판매·결제·배송). 켜기 전까지 공구는 '관심 표시(수요 조사)'로만 동작한다.
 */
/*
 * NEXT_PUBLIC_SUBSCRIPTION_ENABLED=1
 *   캐릭터 구독(끼록이 플랜·모든 캐릭터 플랜). 사업자 등록 + 통신판매업 신고 + 토스 자동결제(빌링) 계약 + 약관 개정 공지가 끝나면 켠다.
 *   꺼져 있으면 체험 기간 — 모든 캐릭터를 쓸 수 있고 구독하기 버튼은 '준비 중'. 켜면 구독하지 않은 사람은 저절로 '캐릭터 없이'.
 */
export const SUBSCRIPTION_ENABLED = process.env.NEXT_PUBLIC_SUBSCRIPTION_ENABLED === "1";
export const ORDERING_ENABLED = process.env.NEXT_PUBLIC_ORDERING_ENABLED === "1";
export const GROUP_BUY_ENABLED = process.env.NEXT_PUBLIC_GROUP_BUY_ENABLED === "1";
