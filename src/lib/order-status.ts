/**
 * 앱 주문의 상태·택배사·배송 정보·배송비 — 화면과 서버가 같이 쓴다 (서버 전용 import 없음).
 *  · 한 주문 안에서 한 판매 업체의 상품은 한 묶음으로 움직인다: 새 주문(new) → 접수(accepted) → 발송(shipped) → 배송 완료(delivered) / 취소(canceled).
 */
export const FULFIL = ["new", "accepted", "shipped", "delivered", "canceled"] as const;
export type Fulfil = (typeof FULFIL)[number];
/** 업체가 보는 이름 */
export const FULFIL_LABEL: Record<Fulfil, string> = { new: "새 주문", accepted: "접수", shipped: "발송", delivered: "배송 완료", canceled: "취소" };
/** 주문자가 보는 이름 */
export const BUYER_LABEL: Record<Fulfil, string> = { new: "판매 업체 확인 중", accepted: "배송 준비 중", shipped: "배송 중", delivered: "배송 완료", canceled: "취소" };
/** 택배사 코드 — direct 는 업체가 직접 배송(새벽 배송 등)이라 송장 번호가 없어도 된다 */
export const CARRIERS: Record<string, string> = {
  cj: "CJ대한통운", hanjin: "한진택배", lotte: "롯데택배", epost: "우체국택배", logen: "로젠택배", direct: "직접 배송", other: "그 밖의 택배",
};

/** 택배 조회 상태 이름 (lib/partner/tracking.ts 가 tracker.delivery 에서 받아 order_items.tracking_status 에 적는다) */
export const TRACK_LABEL: Record<string, string> = {
  INFORMATION_RECEIVED: "접수됨", AT_PICKUP: "집하", IN_TRANSIT: "이동 중", OUT_FOR_DELIVERY: "배송 출발",
  ATTEMPT_FAIL: "배달 못 함", DELIVERED: "배송 완료", AVAILABLE_FOR_PICKUP: "찾아가기 기다림", EXCEPTION: "문제 있음", UNKNOWN: "아직 조회되지 않음",
};

/** 구매확정 — 배송 완료 뒤 이 날수가 지나면 저절로 (lib/partner/payout.ts 와 같은 값) */
export const AUTO_CONFIRM_DAYS = 8;

/** 반품·교환 — 배송 완료 뒤 구매확정 전에 주문자가 업체 묶음 단위로 요청한다 (supabase/migrations/20261117d_order_returns.sql) */
export type ReturnStatus = "requested" | "approved" | "rejected" | "returned" | "exchanged";
export type ReturnType = "return" | "exchange";
export const RETURN_REASONS = ["defect", "damaged", "wrong", "change_mind"] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];
export const RETURN_REASON_LABEL: Record<ReturnReason, string> = { defect: "상품에 문제가 있어요", damaged: "배송 중 망가졌어요", wrong: "다른 상품이 왔어요", change_mind: "마음이 바뀌었어요" };
export const RETURN_TYPE_LABEL: Record<ReturnType, string> = { return: "반품", exchange: "교환" };
/** 요청·회수 중 — 이 동안은 구매확정하지 않는다 */
export const returnOpen = (s: string | null | undefined) => s === "requested" || s === "approved";

export type Shipping = { name: string; phone: string; postal_code: string | null; address1: string; address2: string | null; note: string | null };

/** 주문 화면·API 가 받는 배송 정보 검증 → 저장할 모양 */
export function parseShipping(v: unknown): { shipping: Shipping } | { error: string } {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const text = (k: string, max: number) => String(o[k] ?? "").trim().slice(0, max);
  const name = text("name", 40);
  const phone = text("phone", 20).replace(/[^\d]/g, "");
  const address1 = text("address1", 120);
  if (!name) return { error: "받는 분을 적어 주세요" };
  if (!/^0\d{8,10}$/.test(phone)) return { error: "연락처를 다시 확인해 주세요" };
  if (address1.length < 5) return { error: "주소를 적어 주세요" };
  return { shipping: { name, phone, postal_code: text("postal_code", 10) || null, address1, address2: text("address2", 80) || null, note: text("note", 100) || null } };
}

/** 010-1234-5678 · 02-123-4567 꼴로 (서울 지역번호 02 만 두 자리) */
export const formatPhone = (p: string) => (p.startsWith("02") ? p.replace(/^(02)(\d{3,4})(\d{4})$/, "$1-$2-$3") : p.replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3"));

export type ShipLine = { price: number; quantity: number; shipping_fee: number | null; free_shipping_over: number | null };

/**
 * 한 판매 업체 묶음의 배송비 — 업체가 제품마다 적은 배송비 중 가장 큰 값 한 번,
 * 묶음 상품 금액이 무료배송 기준(적힌 것 중 가장 낮은 값) 이상이면 0. 배송비를 비워 둔 제품은 무료 배송으로 본다.
 */
export function sellerShipping(lines: ShipLine[]): { fee: number; subtotal: number; free_over: number | null } {
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const fee = Math.max(0, ...lines.map((l) => l.shipping_fee ?? 0));
  const overs = lines.map((l) => l.free_shipping_over).filter((v): v is number => typeof v === "number" && v > 0);
  const free_over = overs.length ? Math.min(...overs) : null;
  return { fee: free_over !== null && subtotal >= free_over ? 0 : fee, subtotal, free_over };
}

/** 배송 완료로 바꿀 수 있는 때 — 발송하고 12시간 뒤(직접 배송은 1시간 뒤). 배송 완료가 구매확정 8일의 시작점이라 너무 이르게 누를 수 없게 (화면·서버가 같이 쓴다) */
export function deliverableAt(o: { shipped_at: string | null; carrier: string | null }): number | null {
  if (!o.shipped_at) return null;
  return Date.parse(o.shipped_at) + (o.carrier === "direct" ? 1 : 12) * 3600e3;
}

/** 주문 문의 종류 (order_inquiries.kind) — 주문자가 고르고 업체 화면에 보인다 */
export const INQUIRY_KINDS = ["shipping", "product", "return", "other"] as const;
export type InquiryKind = (typeof INQUIRY_KINDS)[number];
export const INQUIRY_KIND_LABEL: Record<InquiryKind, string> = { shipping: "배송", product: "상품", return: "반품·교환", other: "그 밖의 것" };
/** 한 묶음에 답을 기다리는 문의는 이만큼까지 */
export const INQUIRY_OPEN_MAX = 3;
/** 이 시간이 지나도록 답하지 않으면 늦은 문의 (업체 홈 할 일) */
export const INQUIRY_LATE_HOURS = 24;
/** 주문자에게 보이는 문의 한 줄 */
export type InquiryInfo = { id: string; kind: InquiryKind; body: string; created_at: string; answer: string | null; answered_at: string | null };
