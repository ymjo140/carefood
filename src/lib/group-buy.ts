/**
 * 공구 — 화면과 API 가 같이 쓰는 값.
 * 진행자가 사진·먹어 본 이야기와 함께 공구를 만들고 조건(구성·희망 공구가·배송·증정·1인 최대·목표 인원·기간)을 숫자로 정한다.
 * 알림 받는 사람은 구성·수량을 고르고, 목표 인원이 모이면 판매처에 이 조건표와 수요를 보내 공구를 요청한다.
 * 판매를 열기 전(GROUP_BUY_ENABLED 꺼짐)엔 관심만 모은다 — 조건은 진행자가 '바라는 것'이지 약속이 아니다.
 */

/** 목표 인원 — 진행자가 정한다 */
export const GROUP_TARGET = 30;
export const GROUP_TARGET_MIN = 10;
export const GROUP_TARGET_MAX = 100;
/** 관심을 모으는 기간(일) */
export const GROUP_DAYS = 14;
export const DAY_OPTIONS = [7, 14, 21, 30] as const;
/** 사진 수 · 이야기 길이 */
export const GROUP_MAX_PHOTOS = 4;
export const GROUP_STORY_MAX = 80;

/* ── 조건표 ── */
export const OFFER_MAX_OPTIONS = 3;
export const PACKS_MAX = 100;
export const PRICE_MIN = 1000;
export const PRICE_MAX = 2_000_000;
/** 지금 최저 1개 값보다 이만큼 넘게 깎을 수는 없다 (말이 안 되는 숫자 막기) */
export const DISCOUNT_MAX = 70;
export const SHIP_FEE_MAX = 10_000;
export const SHIP_OVER_MAX = 200_000;
export const PER_PERSON_MAX = 20;
export const GIFT_ITEM_MAX = 30;

export type OfferOption = { packs: number; price: number };
export type Shipping = { type: "free" } | { type: "fee"; fee: number } | { type: "free_over"; fee: number; over: number };
export type Gift = { type: "none" } | { type: "plus"; n: number } | { type: "first"; n: number; item: string };
export type Offer = { options: OfferOption[]; shipping: Shipping; gift: Gift; per_person_max: number | null };

const int = (v: unknown) => (typeof v === "number" || typeof v === "string") && String(v).trim() !== "" && Number.isFinite(Number(v)) ? Math.round(Number(v)) : NaN;

/** 1개 값 */
export const unitOf = (o: OfferOption) => Math.round(o.price / Math.max(1, o.packs));

/** 지금 최저 1개 값 대비 할인율(%) — 최저가를 모르면 null */
export function discountOf(o: OfferOption, lowestUnit: number | null | undefined) {
  if (!lowestUnit || lowestUnit <= 0) return null;
  return Math.round((1 - unitOf(o) / lowestUnit) * 100);
}

/** 할인율(%) → 그 구성의 공구가 (10원 단위) */
export function priceFromDiscount(packs: number, pct: number, lowestUnit: number) {
  return Math.round((lowestUnit * packs * (1 - pct / 100)) / 10) * 10;
}

/** 구성 하나를 살 때 배송비 */
export function shippingFee(s: Shipping, price: number) {
  if (s.type === "free") return 0;
  if (s.type === "fee") return s.fee;
  return price >= s.over ? 0 : s.fee;
}

export function shippingLabel(s: Shipping) {
  if (s.type === "free") return "무료배송";
  if (s.type === "fee") return `배송비 ${s.fee.toLocaleString("ko-KR")}원`;
  return `${s.over.toLocaleString("ko-KR")}원 이상 무료 (아니면 ${s.fee.toLocaleString("ko-KR")}원)`;
}

export function giftLabel(g: Gift) {
  if (g.type === "plus") return `${g.n}개 사면 1개 더`;
  if (g.type === "first") return `선착순 ${g.n}명 ${g.item} 증정`;
  return null;
}

/** 할인율이 가장 큰 구성 (카드에 크게 보일 것) */
export function bestOption(offer: Offer | null | undefined) {
  if (!offer?.options?.length) return null;
  return [...offer.options].sort((a, b) => unitOf(a) - unitOf(b))[0];
}

/**
 * 받은 조건표 검사 — 화면과 서버가 같이 쓴다. 말이 안 되는 숫자는 이유와 함께 막는다.
 * lowestUnit: 지금 최저 1개 값 (모르면 null → 할인율 검사는 건너뜀)
 */
export function parseOffer(raw: unknown, lowestUnit: number | null): { offer: Offer | null; error: string | null } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawOptions = Array.isArray(r.options) ? r.options : [];
  if (rawOptions.length < 1) return { offer: null, error: "구성을 하나 이상 넣어 주세요" };
  if (rawOptions.length > OFFER_MAX_OPTIONS) return { offer: null, error: `구성은 ${OFFER_MAX_OPTIONS}개까지예요` };
  const options: OfferOption[] = [];
  for (const [i, o] of rawOptions.entries()) {
    const x = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
    const packs = int(x.packs), price = int(x.price);
    const n = rawOptions.length > 1 ? `${i + 1}번째 구성: ` : "";
    if (!(packs >= 1 && packs <= PACKS_MAX)) return { offer: null, error: `${n}묶음 수량은 1~${PACKS_MAX}개로 넣어 주세요` };
    if (!(price >= PRICE_MIN && price <= PRICE_MAX)) return { offer: null, error: `${n}공구가는 ${PRICE_MIN.toLocaleString("ko-KR")}원 이상으로 넣어 주세요` };
    if (options.some((p) => p.packs === packs)) return { offer: null, error: `${n}같은 묶음 수량이 이미 있어요` };
    const opt = { packs, price };
    const pct = discountOf(opt, lowestUnit);
    if (pct != null && pct < 0) return { offer: null, error: `${n}지금 최저가보다 비싸요. 1개 ${unitOf(opt).toLocaleString("ko-KR")}원 → ${lowestUnit!.toLocaleString("ko-KR")}원보다 낮게 넣어 주세요` };
    if (pct != null && pct > DISCOUNT_MAX) return { offer: null, error: `${n}할인은 ${DISCOUNT_MAX}%까지 넣을 수 있어요` };
    options.push(opt);
  }
  options.sort((a, b) => a.packs - b.packs);

  const s = (r.shipping && typeof r.shipping === "object" ? r.shipping : { type: "free" }) as Record<string, unknown>;
  let shipping: Shipping;
  if (s.type === "fee" || s.type === "free_over") {
    const fee = int(s.fee);
    if (!(fee >= 0 && fee <= SHIP_FEE_MAX)) return { offer: null, error: `배송비는 0~${SHIP_FEE_MAX.toLocaleString("ko-KR")}원으로 넣어 주세요` };
    if (s.type === "fee") shipping = { type: "fee", fee };
    else {
      const over = int(s.over);
      if (!(over >= 1000 && over <= SHIP_OVER_MAX)) return { offer: null, error: `무료배송 기준은 1,000~${SHIP_OVER_MAX.toLocaleString("ko-KR")}원으로 넣어 주세요` };
      shipping = { type: "free_over", fee, over };
    }
  } else shipping = { type: "free" };

  const g = (r.gift && typeof r.gift === "object" ? r.gift : { type: "none" }) as Record<string, unknown>;
  let gift: Gift = { type: "none" };
  if (g.type === "plus") {
    const n = int(g.n);
    if (!(n >= 1 && n <= 20)) return { offer: null, error: "몇 개 사면 1개 더인지 1~20개로 넣어 주세요" };
    gift = { type: "plus", n };
  } else if (g.type === "first") {
    const n = int(g.n);
    const item = typeof g.item === "string" ? g.item.trim() : "";
    if (!(n >= 1 && n <= 100)) return { offer: null, error: "선착순 인원은 1~100명으로 넣어 주세요" };
    if (!item || item.length > GIFT_ITEM_MAX) return { offer: null, error: `증정품을 ${GIFT_ITEM_MAX}자 안으로 적어 주세요` };
    gift = { type: "first", n, item };
  }

  let per_person_max: number | null = null;
  if (r.per_person_max != null && String(r.per_person_max).trim() !== "") {
    const m = int(r.per_person_max);
    if (!(m >= 1 && m <= PER_PERSON_MAX)) return { offer: null, error: `1인 최대 구매는 1~${PER_PERSON_MAX}세트로 넣어 주세요` };
    per_person_max = m;
  }
  return { offer: { options, shipping, gift, per_person_max }, error: null };
}

/** 관심 표시 버튼·알림 문구 — 판매가 열리기 전엔 '열리면 알림 받기' (관심 표시한 사람에게 판매가 열리면 알린다) */
export function groupBuyWords(open: boolean) {
  return open
    ? { mark: "참여하기", marked: "참여했어요", done: "참여했어요", undo: "참여를 취소했어요", fail: "참여하지 못했어요", undoFail: "참여를 취소하지 못했어요" }
    : { mark: "열리면 알림 받기", marked: "알림 받는 중", done: "판매가 열리면 알려 드려요", undo: "알림을 껐어요", fail: "알림을 켜지 못했어요", undoFail: "알림을 끄지 못했어요" };
}

/* ── 예전 공구 (조건표 전) — 보기·관리자에서만 읽는다 ── */
const LEGACY_WISHES: Record<string, string> = { off10: "10% 할인", off20: "20% 할인", plus1: "1팩 더", free_ship: "배송비 무료" };
export function wishLabel(wishes: string[] | null | undefined) {
  const list = (wishes || []).map((w) => LEGACY_WISHES[w]).filter(Boolean);
  return list.length ? list.join(" 또는 ") : null;
}

/** 조건표 → 화면 줄 (구성 목록) */
export function offerRows(offer: Offer, lowestUnit: number | null) {
  return offer.options.map((o) => ({
    title: `${o.packs}개 묶음`,
    price: o.price,
    unit: unitOf(o),
    pct: discountOf(o, lowestUnit),
    total: o.price + shippingFee(offer.shipping, o.price),
  }));
}

/** 저장된 조건표 읽기 (예전 공구는 null) */
export function readOffer(raw: unknown): Offer | null {
  const o = raw as Offer | null;
  return o && Array.isArray(o.options) && o.options.length && o.shipping && o.gift ? o : null;
}
