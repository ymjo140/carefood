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
