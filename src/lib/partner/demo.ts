/**
 * 예시 데이터 — 테스트 업체(partners.is_demo)만. 서버 전용 (서비스 키).
 *
 * "예시로 채워 보기"는 실제 연동 길을 그대로 탄다:
 *   · 엑셀: 예시 제품 6개 → ingestRows("excel") → 새 제품이라 검수 대기
 *   · API : 그중 2개 가격·판매 상태만 바꿈 → ingestRows("api")
 *   · 대행: 예시 제품 3개를 오늘끼록이 대신 올린 것으로 → 업체가 '반영하기'를 눌러야 들어간다
 *   · 주문: 예시 고객 18명 · 지난 170일 주문 (orders.is_demo) — 고객·주문·정산 화면을 채운다
 *   · 협업: 예시 크리에이터 3명(테스트 업체에만 보임) · 받은 협업 하나(코드) · 답 기다리는 제안 하나
 *   · 혜택: 예시 쿠폰 2개(이름이 "예시 "로 시작) · 첫 주문 고객에게 준 쿠폰 · 한 주문에서 쓴 쿠폰 · 첫 주문 감사 자동 알림
 * 예시 제품은 검수 대기로만 둔다. 승인하면 실제 제품 목록(products)에 들어가 다른 사용자에게 보이기 때문이다.
 * 제품 코드는 EX- 로 시작하고, 예시 고객은 demo- 로 시작한다. "예시 지우기"가 이것만 지운다.
 */
import { ingestRows, type IngestResult, type Partner } from "./ingest";
import { parseRow } from "./schema";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

import { DEMO_SKU_PREFIX, DEMO_USER_PREFIX } from "./demo-ids";
import { selectAll } from "@/lib/supabase/all";
import { AGENCY_EXAMPLE_FILE } from "./agency";
import { closeMonth, markPaid, orderPayout, previousMonth, settlementMonths } from "./settlement";
export { DEMO_SKU_PREFIX, DEMO_USER_PREFIX };

const DAY = 86400e3;
const kstDay = (t: number) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);

/** 예시 제품 한 줄 — 양식 칸 키 그대로 */
type Sample = Record<string, string>;

function base(i: number, over: Sample): Sample {
  const now = Date.now();
  return {
    brand: "예시브랜드", manufacturer: "예시식품(주)", food_type: "즉석조리식품", category: "lunchbox", meal_role_hint: "meal",
    total_weight: "300", weight_unit: "g", serving_size: "300", pack_count: "1",
    nutrition_basis: "serving", nutrition_source: "label",
    calories_kcal: "420", sodium_mg: "640", carbs_g: "52", sugars_g: "6", fat_g: "11", trans_fat_g: "0", saturated_fat_g: "3",
    cholesterol_mg: "55", protein_g: "28", fiber_g: "4",
    ingredients_raw: "현미밥(국산), 닭가슴살(브라질산), 양파, 간장(대두, 밀)", allergens: "닭고기, 대두, 밀",
    storage: "frozen", shelf_life_days: "180", status: "on_sale", price: "5900", list_price: "6900",
    channel: "own_mall", url: `https://shop.example.com/p/${100 + i}`,
    shipping_type: "parcel", shipping_fee: "3000", free_shipping_over: "30000",
    available_from: kstDay(now - 7 * DAY), available_to: kstDay(now + 60 * DAY),
    image_url_1: `https://shop.example.com/img/${100 + i}.jpg`,
    ...over,
  };
}

export function excelSamples(): Sample[] {
  return [
    base(1, { partner_sku: "EX-001", name: "닭가슴살 현미 볶음밥 도시락" }),
    base(2, { partner_sku: "EX-002", name: "연어 퀴노아 샐러드 도시락", calories_kcal: "380", sodium_mg: "420", protein_g: "24", fat_g: "14", ingredients_raw: "퀴노아, 연어(노르웨이산), 양상추, 올리브유, 레몬즙", allergens: "없음", price: "7900", list_price: "8900" }),
    base(3, { partner_sku: "EX-003", name: "두부 버섯 덮밥", calories_kcal: "450", sodium_mg: "580", protein_g: "19", ingredients_raw: "현미밥(국산), 두부(대두), 표고버섯, 간장(대두, 밀)", allergens: "대두, 밀", price: "5500", list_price: "5500" }),
    base(4, { partner_sku: "EX-004", name: "쇠고기 곤약 비빔밥", calories_kcal: "390", sodium_mg: "610", protein_g: "22", ingredients_raw: "곤약밥, 쇠고기(호주산), 시금치, 고사리, 고추장(밀)", allergens: "쇠고기, 밀", price: "6500", list_price: "7200" }),
    base(5, { partner_sku: "EX-005", name: "그릭요거트 그래놀라 컵", category: "dairy", meal_role_hint: "snack", total_weight: "150", serving_size: "150", calories_kcal: "210", sodium_mg: "80", carbs_g: "24", sugars_g: "9", fat_g: "7", saturated_fat_g: "3", cholesterol_mg: "10", protein_g: "12", fiber_g: "3", storage: "chilled", shelf_life_days: "14", ingredients_raw: "그릭요거트(우유), 귀리, 아몬드, 꿀", allergens: "우유", price: "3900", list_price: "3900" }),
    base(6, { partner_sku: "EX-006", name: "닭가슴살 스테이크 3팩", pack_count: "3", total_weight: "100", serving_size: "100", calories_kcal: "140", sodium_mg: "390", carbs_g: "3", sugars_g: "1", fat_g: "3", saturated_fat_g: "1", cholesterol_mg: "60", protein_g: "24", fiber_g: "0", category: "protein", meal_role_hint: "side", ingredients_raw: "닭가슴살(국산), 정제소금, 마늘, 후추", allergens: "닭고기", price: "8900", list_price: "9900" }),
  ];
}

/** API 로 보낸 것처럼 — 가격·판매 상태만 바뀐 두 줄 */
export function apiSamples(): Sample[] {
  const ex = excelSamples();
  return [
    { ...ex[0], price: "5600" },
    { ...ex[3], status: "sold_out" },
  ];
}

/** 대행 — 업체가 보내 준 상품 목록을 오늘끼록이 옮겨 적은 것 (한 줄은 일부러 빠진 칸이 있어 오류로 보인다) */
export function agencySamples(): Sample[] {
  return [
    base(7, { partner_sku: "EX-101", name: "고등어 구이 정식", calories_kcal: "480", sodium_mg: "690", protein_g: "27", fat_g: "18", ingredients_raw: "현미밥(국산), 고등어(노르웨이산), 무, 간장(대두, 밀)", allergens: "고등어, 대두, 밀", price: "6900", list_price: "6900" }),
    base(8, { partner_sku: "EX-102", name: "단호박 닭가슴살 샐러드", calories_kcal: "310", sodium_mg: "350", carbs_g: "30", protein_g: "26", fat_g: "8", ingredients_raw: "단호박, 닭가슴살(국산), 양상추, 발사믹드레싱", allergens: "닭고기", price: "6200", list_price: "6200" }),
    base(9, { partner_sku: "EX-103", name: "현미 김밥 2줄", ingredients_raw: "", price: "4500" }),
  ];
}

export const asRows = (s: Sample[]) => s.map((values, i) => ({ row: i + 3, values }));

/** 반영하기 전에 보여 줄 미리보기 — 바로 반영·검수·오류 줄 수와 줄별 오류 */
export function previewRows(rows: { row: number; values: Record<string, unknown> }[], kind: Partner["kind"]) {
  let ok = 0, review = 0, error = 0;
  const errors: { row: number; sku?: string; field?: string; message: string }[] = [];
  for (const r of rows) {
    const p = parseRow(r.values, kind);
    const sku = String(r.values.partner_sku ?? "").trim() || undefined;
    if (p.errors.length || !p.item) { error++; for (const e of p.errors.slice(0, 3)) errors.push({ row: r.row, sku, field: e.field, message: e.message }); }
    else if (p.review.length) review++;
    else ok++;
  }
  return { ok, review, error, errors: errors.slice(0, 50) };
}

/** 작은 고정 난수 — 다시 채워도 같은 모양 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

/** 예시 고객 — [주문 수, 마지막 주문이 며칠 전, 주문 간격(일)] */
const CUSTOMERS: [number, number, number][] = [
  [1, 2, 0], [1, 9, 0], [1, 18, 0], [1, 26, 0], // 첫 주문
  [2, 6, 21], [3, 12, 18], [2, 33, 25], [3, 48, 20], // 다시 산
  [5, 3, 14], [7, 8, 10], [4, 20, 15], // 단골
  [1, 45, 0], [1, 72, 0], [1, 101, 0], // 한 번 사고 뜸한
  [3, 75, 20], [2, 104, 30], // 뜸해지는
  [3, 133, 18], [4, 168, 14], // 떠난
  // 테스트 매장 — 석 달 장사한 것처럼 손님을 더 (고정 난수라 다시 채워도 같다)
  ...(() => {
    const r = rng(1117);
    return Array.from({ length: 42 }, (): [number, number, number] => {
      const kind = r();
      if (kind < 0.45) return [1, 1 + Math.floor(r() * 85), 0];
      if (kind < 0.8) return [2 + Math.floor(r() * 2), 1 + Math.floor(r() * 30), 12 + Math.floor(r() * 16)];
      return [4 + Math.floor(r() * 4), 1 + Math.floor(r() * 12), 8 + Math.floor(r() * 8)];
    });
  })(),
];

type Prod = { sku: string; name: string; price: number; meal: string };

/** 예시 주문 만들기 — 이미 있던 예시 주문은 지우고 다시 만든다 */
export async function seedDemoOrders(sb: Sb, partner: Partner) {
  await clearDemoOrders(sb, partner.id);
  const prods: Prod[] = excelSamples().map((s) => ({ sku: s.partner_sku, name: s.name, price: Number(s.price), meal: s.meal_role_hint === "snack" ? "snack" : "lunch" }));
  const rand = rng(20261115);
  const now = Date.now();
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const orders: Record<string, unknown>[] = [];
  const items: Record<string, unknown>[] = [];
  let n = 0;
  let couponOrder: { id: string; user: string } | null = null; // 예시 쿠폰을 쓴 주문 하나
  const meta: { id: string; ago: number; fulfil: string; at: number; subtotal: number; fee: number }[] = [];
  CUSTOMERS.forEach(([count, lastAgo, gap], ci) => {
    const user = `${DEMO_USER_PREFIX}${partner.slug}-${String(ci + 1).padStart(2, "0")}`;
    // 이 고객이 주로 사는 제품 1~2개 + 가끔 다른 것
    const fav = [prods[ci % prods.length], prods[(ci * 3 + 1) % prods.length]];
    for (let k = count - 1; k >= 0; k--) {
      const ago = lastAgo + k * gap + Math.floor(rand() * 3);
      const at = now - ago * DAY - Math.floor(rand() * 10) * 3600e3;
      const id = crypto.randomUUID();
      const lines = (rand() < 0.35 ? [fav[0], fav[1]] : [fav[0]]).concat(rand() < 0.15 ? [prods[Math.floor(rand() * prods.length)]] : []);
      const uniq = [...new Map(lines.map((p) => [p.sku, p])).values()];
      const rows = uniq.map((p) => ({ p, q: 1 + Math.floor(rand() * (p.meal === "snack" ? 4 : 5)) }));
      const subtotal = rows.reduce((s, r) => s + r.p.price * r.q, 0);
      const fee = subtotal >= 30000 ? 0 : 3000;
      // 상태: 하루 안은 새 주문, 사흘 안은 확인, 6일 안은 배송 중, 그 뒤는 배송 완료 (가끔 취소·취소 요청)
      n++;
      const canceled = n % 17 === 0 && ago > 7;
      const fulfil = canceled ? "canceled" : ago <= 1 ? "new" : ago <= 3 ? "accepted" : ago <= 6 ? "shipped" : "delivered";
      // 구매자 취소 요청은 업체가 확인한 뒤(accepted)에 생긴다 — 그 전에는 구매자가 바로 취소한다
      const cancelAsk = fulfil === "accepted" && ci % 2 === 0;
      // 다시 산 고객 하나는 마지막 주문에 예시 쿠폰(3,000원)을 썼다
      const discount = ci === 4 && k === 0 && !canceled && subtotal >= 15000 ? 3000 : 0;
      if (discount) couponOrder = { id, user };
      meta.push({ id, ago, fulfil, at, subtotal, fee });
      orders.push({
        id, user_id: user, status: fulfil === "delivered" ? "delivered" : fulfil === "canceled" ? "cancelled" : "paid",
        total_items: rows.length, total_price: subtotal, shipping_fee: fee, shipping_fees: { [partner.id]: fee },
        final_price: subtotal + fee - discount, discount_amount: discount, discount_fees: discount ? { [partner.id]: discount } : {}, payment_method: "demo", paid_at: new Date(at).toISOString(),
        created_at: new Date(at - 60e3).toISOString(), updated_at: new Date(at).toISOString(),
        third_party_consent_at: new Date(at - 60e3).toISOString(), is_demo: true,
        shipping: { name: `예시 고객 ${ci + 1}`, phone: "01000000000", postal_code: null, address1: "서울특별시 예시구 예시로 1", address2: null, note: null },
        delivery_preference: { note: null }, weekly_box_snapshot: [],
        refund_amount: canceled ? subtotal + fee : 0, refunded_amount: canceled ? subtotal + fee : 0,
        refunded_at: canceled ? new Date(at + DAY).toISOString() : null, refund_note: canceled ? "예시 환불" : null,
      });
      for (const r of rows) {
        items.push({
          order_id: id, product_id: null, day_of_week: days[Math.floor(rand() * 7)], meal_type: r.p.meal,
          product_name: r.p.name, service: partner.slug, quantity: r.q, unit_price: r.p.price,
          partner_id: partner.id, partner_sku: r.p.sku, fulfil_status: fulfil, created_at: new Date(at).toISOString(),
          accepted_at: ["accepted", "shipped", "delivered"].includes(fulfil) ? new Date(at + 3 * 3600e3).toISOString() : null,
          shipped_at: ["shipped", "delivered"].includes(fulfil) ? new Date(at + DAY).toISOString() : null,
          delivered_at: fulfil === "delivered" ? new Date(at + 2 * DAY).toISOString() : null,
          tracking_carrier: ["shipped", "delivered"].includes(fulfil) ? "cj" : null,
          tracking_number: ["shipped", "delivered"].includes(fulfil) ? `5${String(100000000 + n).slice(1)}0` : null,
          cancel_requested_at: cancelAsk ? new Date(at + 3600e3).toISOString() : null,
          cancel_request_reason: cancelAsk ? "주소를 잘못 적었어요" : null,
          canceled_by: canceled ? "buyer" : null, canceled_at: canceled ? new Date(at + 3600e3).toISOString() : null,
          cancel_reason: canceled ? "단순 변심" : null,
          // 배송 완료는 대부분 업체가, 가끔 택배 조회로 · 발송 중은 택배 조회 상태
          delivered_by: fulfil === "delivered" ? (n % 4 === 0 ? "tracking" : "partner") : null,
          tracking_status: fulfil === "shipped" ? (ago <= 4 ? "IN_TRANSIT" : "OUT_FOR_DELIVERY") : fulfil === "delivered" ? "DELIVERED" : null,
          tracking_checked_at: fulfil === "shipped" ? new Date(now - 2 * 3600e3).toISOString() : null,
          // 구매자가 받고 바로 확정한 것도 있다 (나머지는 배송 완료 8일 뒤 저절로)
          confirmed_at: fulfil === "delivered" && n % 3 === 0 && at + 4 * DAY < now ? new Date(at + 4 * DAY).toISOString() : null,
          confirm_by: fulfil === "delivered" && n % 3 === 0 && at + 4 * DAY < now ? "buyer" : null,
        });
      }
    }
  });
  // ── 반품·교환 — 받은 지 8일 안의 주문에 요청 하나·회수 중 교환 하나, 한두 달 전 주문에 마음이 바뀐 반품(반품 배송비) 하나
  const RET = { return_type: null, return_reason: null, return_note: null, return_requested_at: null, return_resolved_at: null, return_reply: null, return_fee: null, return_status: null };
  for (const it of items) Object.assign(it, RET); // 여러 줄을 한 번에 넣을 때는 줄마다 칸이 같아야 한다
  const recent = meta.filter((m) => m.fulfil === "delivered" && m.ago >= 4 && m.ago <= 9);
  const old = meta.find((m) => m.fulfil === "delivered" && m.ago >= 35 && m.ago <= 60);
  const setLines = (id: string, patch: Record<string, unknown>) => { for (const it of items) if (it.order_id === id) Object.assign(it, patch); };
  if (recent[0]) setLines(recent[0].id, { confirmed_at: null, confirm_by: null, return_status: "requested", return_type: "return", return_reason: "damaged",
    return_note: "포장이 터져서 국물이 샜어요", return_requested_at: new Date(now - 8 * 3600e3).toISOString() });
  if (recent[1]) setLines(recent[1].id, { confirmed_at: null, confirm_by: null, return_status: "approved", return_type: "exchange", return_reason: "wrong",
    return_note: "연어 대신 닭가슴살이 왔어요", return_requested_at: new Date(now - 30 * 3600e3).toISOString() });
  if (old) {
    const resolved = old.at + 6 * DAY;
    setLines(old.id, { confirmed_at: null, confirm_by: null, fulfil_status: "canceled", canceled_by: "partner", canceled_at: new Date(resolved).toISOString(),
      cancel_reason: "반품 · 마음이 바뀌었어요", return_status: "returned", return_type: "return", return_reason: "change_mind",
      return_note: null, return_requested_at: new Date(old.at + 3 * DAY).toISOString(), return_resolved_at: new Date(resolved).toISOString(),
      return_reply: "회수한 상품을 확인했어요", return_fee: 4000 });
    const o = orders.find((x) => x.id === old.id)!;
    const back = old.subtotal + old.fee - 4000;
    Object.assign(o, { status: "cancelled", refund_amount: back, refunded_amount: back, refunded_at: new Date(resolved + DAY).toISOString(), refund_note: "예시 환불" });
  }
  for (let i = 0; i < orders.length; i += 200) {
    const { error } = await sb.from("orders").insert(orders.slice(i, i + 200));
    if (error) throw new Error(`예시 주문을 만들지 못했어요: ${error.message}`);
  }
  for (let i = 0; i < items.length; i += 300) {
    const { error } = await sb.from("order_items").insert(items.slice(i, i + 300));
    if (error) throw new Error(`예시 주문 제품을 만들지 못했어요: ${error.message}`);
  }
  await seedDemoInquiries(sb, partner, now, meta, orders as { id: string; user_id: string }[]);
  await seedDemoCoupons(sb, partner, couponOrder);
  return { customers: CUSTOMERS.length, orders: orders.length };
}

/** 예시 주문 문의 — 답할 것 둘(하나는 하루 지남)·답한 것 하나. 주문이 지워지면 같이 지워진다(order_id cascade) */
async function seedDemoInquiries(sb: Sb, partner: Partner, now: number, meta: { id: string; ago: number; fulfil: string }[], orders: { id: string; user_id: string }[]) {
  const userOf = new Map(orders.map((o) => [o.id, o.user_id]));
  const pick = (ok: (m: { id: string; ago: number; fulfil: string }) => boolean) => meta.find(ok);
  const shipping = pick((m) => m.fulfil === "accepted" || m.fulfil === "shipped");
  const fresh = pick((m) => m.fulfil === "new" && m.id !== shipping?.id) || pick((m) => m.fulfil === "delivered" && m.ago <= 3);
  const done = pick((m) => m.fulfil === "delivered" && m.ago >= 10 && m.ago <= 30);
  const at = (h: number) => new Date(now - h * 3600e3).toISOString();
  const rows = [
    shipping && { order_id: shipping.id, kind: "shipping", body: "이번 주 금요일까지 받을 수 있을까요? 주말에는 집을 비워요", created_at: at(30), answer: null, answered_at: null },
    fresh && { order_id: fresh.id, kind: "product", body: "전자레인지에 몇 분 데우면 될까요? 포장째 넣어도 되나요?", created_at: at(2), answer: null, answered_at: null },
    done && { order_id: done.id, kind: "product", body: "냉동실에 두면 언제까지 먹을 수 있나요?", created_at: at(24 * 9),
      answer: "냉동 보관하면 제조일부터 90일까지 드실 수 있어요. 녹인 뒤에는 다시 얼리지 말아 주세요", answered_at: at(24 * 9 - 3) },
  ].filter(Boolean).map((r) => ({ ...r!, partner_id: partner.id, user_id: userOf.get(r!.order_id)!, partner_notified_at: r!.created_at }));
  if (rows.length === 0) return;
  const { error } = await sb.from("order_inquiries").insert(rows);
  if (error) throw new Error(`예시 문의를 만들지 못했어요: ${error.message}`);
}

const DEMO_COUPON = "예시 ";

/** 예시 쿠폰 두 개 — 첫 주문 고객에게 준 것, 한 주문에서 쓴 것. 자동 알림 '첫 주문 감사'를 켜 둔다 (예시 고객은 광고 동의가 없어 실제로 가지 않는다) */
async function seedDemoCoupons(sb: Sb, partner: Partner, used: { id: string; user: string } | null) {
  const { error: dErr } = await sb.from("partner_coupons").delete().eq("partner_id", partner.id).like("name", `${DEMO_COUPON}%`);
  if (dErr) throw new Error(dErr.message);
  const { data: cs, error } = await sb.from("partner_coupons").insert([
    { partner_id: partner.id, name: `${DEMO_COUPON}두 번째 주문 감사`, kind: "amount", value: 3000, max_discount: null, min_order: 15000, valid_days: 14 },
    { partner_id: partner.id, name: `${DEMO_COUPON}다시 찾아 주세요`, kind: "percent", value: 10, max_discount: 5000, min_order: 0, valid_days: 30 },
  ]).select("id, name");
  if (error) throw new Error(error.message);
  const thanks = cs.find((c: { name: string }) => c.name.endsWith("감사")).id;
  const now = Date.now();
  const firsts = CUSTOMERS.map((c, i) => ({ c, user: `${DEMO_USER_PREFIX}${partner.slug}-${String(i + 1).padStart(2, "0")}` })).filter(({ c }) => c[0] === 1 && c[1] <= 30);
  // 여러 줄을 한 번에 넣을 때는 줄마다 칸이 같아야 한다 — 빠진 칸은 기본값이 아니라 null 로 들어간다
  const grants: Record<string, unknown>[] = firsts.map(({ user }) => ({
    coupon_id: thanks, partner_id: partner.id, user_id: user, source: "flow", expires_at: new Date(now + 14 * DAY).toISOString(),
    status: "active", used_order_id: null, used_at: null, discount_amount: 0,
  }));
  if (used) grants.push({ coupon_id: thanks, partner_id: partner.id, user_id: used.user, source: "manual", expires_at: new Date(now + 7 * DAY).toISOString(),
    status: "used", used_order_id: used.id, used_at: new Date(now - 6 * DAY).toISOString(), discount_amount: 3000 });
  if (grants.length) {
    const { error: gErr } = await sb.from("coupon_grants").insert(grants);
    if (gErr) throw new Error(gErr.message);
  }
  const { error: fErr } = await sb.from("partner_flows").upsert({
    partner_id: partner.id, kind: "first_thanks", is_on: true, coupon_id: thanks, title: "첫 주문 고마워요",
    body: "드셔 보니 어떠셨어요? 두 번째 주문에 쓸 수 있는 3,000원 쿠폰을 드려요", delay_days: 2, updated_at: new Date().toISOString(),
  }, { onConflict: "partner_id,kind" });
  if (fErr) throw new Error(fErr.message);
}

/** 이 업체의 예시 주문만 지운다 (주문 제품은 같이 지워진다). 테스트 업체의 정산 기록도 예시라 같이 지운다 */
export async function clearDemoOrders(sb: Sb, partnerId: string) {
  const { data: pt, error: pErr } = await sb.from("partners").select("is_demo").eq("id", partnerId).single();
  if (pErr) throw new Error(pErr.message);
  if (pt?.is_demo) {
    const { error } = await sb.from("partner_settlements").delete().eq("partner_id", partnerId);
    if (error) throw new Error(error.message);
  }
  const data = await selectAll<{ order_id: string }>(() => sb.from("order_items").select("order_id, orders!inner(is_demo)").eq("partner_id", partnerId).eq("orders.is_demo", true), "id");
  const ids = [...new Set(data.map((r) => r.order_id))];
  for (let i = 0; i < ids.length; i += 200) {
    const { error: dErr } = await sb.from("orders").delete().in("id", ids.slice(i, i + 200)).eq("is_demo", true);
    if (dErr) throw new Error(dErr.message);
  }
  return ids.length;
}

export type DemoResult = { excel: IngestResult; api: IngestResult; agency_id: string; customers: number; orders: number };

/** 예시로 채워 보기 — 엑셀·API·대행·주문 */
export async function seedDemo(sb: Sb, partner: Partner, userId: string | null): Promise<DemoResult> {
  const excel = await ingestRows(sb, partner, asRows(excelSamples()), "excel", "예시_제품목록.xlsx", userId);
  const api = await ingestRows(sb, partner, asRows(apiSamples()), "api", null, userId);
  // 재고 예시 — 넉넉한 것 하나, 적은 것 하나 (나머지는 세지 않음)
  for (const [sku, stock] of [["EX-001", 40], ["EX-005", 3]] as const) {
    const { error } = await sb.from("partner_items").update({ stock, stock_updated_at: new Date().toISOString() }).eq("partner_id", partner.id).eq("partner_sku", sku);
    if (error) throw new Error(error.message);
  }
  // 대행 — 기다리는 예시가 이미 있으면 새로 만들지 않는다
  const { error: cErr } = await sb.from("partner_agency_uploads").update({ status: "canceled", decided_at: new Date().toISOString(), decided_note: "예시를 다시 채워서 닫음" })
    .eq("partner_id", partner.id).eq("status", "waiting").eq("file_name", AGENCY_EXAMPLE_FILE);
  if (cErr) throw new Error(cErr.message);
  const rows = asRows(agencySamples());
  const { data: up, error: aErr } = await sb.from("partner_agency_uploads").insert({
    partner_id: partner.id, file_name: AGENCY_EXAMPLE_FILE, rows, row_count: rows.length,
    preview: previewRows(rows, partner.kind), note: "보내 주신 상품 목록 3개를 옮겨 적었어요. 김밥은 원재료명이 없어 비워 뒀어요", created_by: null,
  }).select("id").single();
  if (aErr) throw new Error(aErr.message);
  const o = await seedDemoOrders(sb, partner);
  await seedDemoCreators(sb, partner);
  await seedDemoStore(sb, partner);
  return { excel, api, agency_id: up.id, ...o };
}

/**
 * 테스트 매장 — 석 달 넘게 장사한 가게처럼: 제품 원가·과세 구분, 업체 정보(비어 있을 때만), 지난 달들 정산(지난 달은 마감만, 그 앞은 정산 끝, 한 달은 입금 차이).
 * 정산 숫자는 실제 마감 함수(closeMonth)로 센다 — 화면·엑셀과 같은 계산.
 */
export async function seedDemoStore(sb: Sb, partner: Partner, now = Date.now()) {
  const COST: Record<string, [number, "taxable" | "exempt"]> = {
    "EX-001": [3100, "taxable"], "EX-002": [4300, "taxable"], "EX-003": [2400, "taxable"], "EX-004": [3000, "taxable"], "EX-005": [1700, "taxable"], "EX-006": [4600, "exempt"],
  };
  for (const [sku, [cost, tax]] of Object.entries(COST)) {
    const { error } = await sb.from("partner_items").update({ unit_cost: cost, tax_type: tax }).eq("partner_id", partner.id).eq("partner_sku", sku);
    if (error) throw new Error(error.message);
  }
  // 업체 정보 — 이미 적어 둔 칸은 그대로 둔다
  const { data: p, error: pErr } = await sb.from("partners").select("business_number, tax_email, bank_account, contact_email").eq("id", partner.id).single();
  if (pErr) throw new Error(pErr.message);
  const fill: Record<string, string> = {};
  if (!p.business_number) fill.business_number = "123-45-67890";
  if (!p.tax_email) fill.tax_email = `tax@${partner.slug}.example`;
  if (!p.contact_email) fill.contact_email = `ops@${partner.slug}.example`;
  if (!p.bank_account) Object.assign(fill, { bank_name: "예시은행", bank_holder: partner.name, bank_account: "00012345678901" });
  if (Object.keys(fill).length) {
    const { error } = await sb.from("partners").update(fill).eq("id", partner.id);
    if (error) throw new Error(error.message);
  }
  // 지난 달들 정산 — 돈이 오간 달은 모두 마감하고, 지급일(다음 달 10일)이 지난 달은 정산을 끝낸다(마지막으로 끝낸 달은 1,000원 덜 보내 입금 대사에 보이게).
  // 지난 달은 이번 달 10일 전이면 마감만 — 지급 대기. 지급일 지난 달을 남기면 정산 화면이 '지급일이 지났어요'로 보인다(11/14 테스트 매장 확인)
  const { error: dErr } = await sb.from("partner_settlements").delete().eq("partner_id", partner.id);
  if (dErr) throw new Error(dErr.message);
  const waiting = new Date(now + 9 * 3600e3).getUTCDate() < 10 ? previousMonth(now) : null;
  const months = (await settlementMonths(sb, partner.id))
    .filter((x) => !x.open && (orderPayout(x) !== 0 || x.commission !== 0)).map((x) => x.month).sort();
  const paid = months.filter((m) => m !== waiting);
  for (const month of months) {
    const st = await closeMonth(sb, partner.id, month, null);
    if (!st || month === waiting) continue;
    const net = orderPayout(st) - st.commission;
    const short = month === paid[paid.length - 1];
    await markPaid(sb, partner.id, month, "예시 입금", short ? net - 1000 : net);
  }
}

/** 예시 크리에이터 3명(협업 제안 받기 켬, 테스트 업체에만 보임) + 협업 하나(받음·코드) + 제안 하나(답 기다림) + 코드로 받은 쿠폰 하나 */
async function seedDemoCreators(sb: Sb, partner: Partner) {
  const people = [
    { n: 1, nick: "예시 고단백러", intro: "운동하면서 먹는 도시락을 기록해요", topics: ["고단백", "도시락"] },
    { n: 2, nick: "예시 저염일기", intro: "싱겁게 먹는 한 끼를 나눠요", topics: ["저염 식단"] },
    { n: 3, nick: "예시 간단식단", intro: "바쁜 날의 가벼운 한 끼", topics: ["다이어트", "도시락"] },
  ].map((p) => ({ ...p, id: `${DEMO_USER_PREFIX}creator-${partner.slug}-${p.n}` }));
  const { error: pErr } = await sb.from("community_profiles").upsert(people.map((p) => ({ actor_id: p.id, nickname: p.nick, nickname_key: `${p.nick}-${partner.slug}`.replace(/\s/g, "").toLowerCase() })), { onConflict: "actor_id" });
  if (pErr) throw new Error(pErr.message);
  const { error: cErr } = await sb.from("creator_profiles").upsert(people.map((p) => ({ user_id: p.id, is_open: true, intro: p.intro, topics: p.topics, opened_at: new Date().toISOString(), updated_at: new Date().toISOString() })), { onConflict: "user_id" });
  if (cErr) throw new Error(cErr.message);
  const { error: dErr } = await sb.from("partner_collabs").delete().eq("partner_id", partner.id).like("user_id", `${DEMO_USER_PREFIX}%`);
  if (dErr) throw new Error(dErr.message);
  const { data: coupon, error: qErr } = await sb.from("partner_coupons").select("id, valid_days").eq("partner_id", partner.id).eq("name", `${DEMO_COUPON}다시 찾아 주세요`).maybeSingle();
  if (qErr) throw new Error(qErr.message);
  const code = `CF${partner.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  // 예시 기획 하나 — 협업 관리에서 기획별로 묶인 모습을 본다 (기획 표가 아직 없으면 기획 없이)
  const { error: xErr } = await sb.from("partner_plans").delete().eq("partner_id", partner.id).like("name", `${DEMO_COUPON}%`);
  if (xErr && xErr.code !== "42P01" && xErr.code !== "PGRST205") throw new Error(xErr.message);
  const { data: plan, error: plErr } = xErr ? { data: null, error: null } : await sb.from("partner_plans").insert({
    partner_id: partner.id, segment: "meal_protein_low_sodium", name: `${DEMO_COUPON}고단백 저염 도시락`, note: "단백질 25g 이상 · 나트륨 600mg 이하, 1식 450kcal 아래로", target_price: 7900, status: "making",
  }).select("id").single();
  if (plErr) throw new Error(plErr.message);
  const { data: cs, error: iErr } = await sb.from("partner_collabs").insert([
    { partner_id: partner.id, plan_id: plan?.id || null, user_id: people[0].id, title: "고단백 도시락 써 보실래요?", offer: "신제품 5식을 보내 드려요. 드셔 보고 솔직한 후기를 커뮤니티에 남겨 주세요", product_name: "닭가슴살 현미 볶음밥 도시락", coupon_id: coupon?.id || null, code, status: "accepted", decided_at: new Date(Date.now() - 5 * DAY).toISOString(), created_at: new Date(Date.now() - 7 * DAY).toISOString() },
    { partner_id: partner.id, plan_id: plan?.id || null, user_id: people[1].id, title: "저염 한 끼 같이 알려요", offer: "나트륨 600mg 이하 도시락 3식을 보내 드려요. 마음에 들면 글 하나 부탁드려요", product_name: "두부 버섯 덮밥", coupon_id: null, code: null, status: "proposed", decided_at: null, created_at: new Date(Date.now() - DAY).toISOString() },
  ]).select("id, status");
  if (iErr) throw new Error(iErr.message);
  const accepted = cs.find((c: { status: string }) => c.status === "accepted");
  if (coupon && accepted) {
    const { error: gErr } = await sb.from("coupon_grants").insert({ coupon_id: coupon.id, partner_id: partner.id, user_id: `${DEMO_USER_PREFIX}${partner.slug}-03`, source: "influencer", collab_id: accepted.id, expires_at: new Date(Date.now() + coupon.valid_days * DAY).toISOString() });
    if (gErr && gErr.code !== "23505") throw new Error(gErr.message);
  }
}

/** 예시 지우기 — 예시 주문·예시 제품(승인 안 된 EX- 만)·기다리는 예시 대행 */
export async function clearDemo(sb: Sb, partnerId: string) {
  const orders = await clearDemoOrders(sb, partnerId);
  const { data: its, error } = await sb.from("partner_items").select("id").eq("partner_id", partnerId).like("partner_sku", `${DEMO_SKU_PREFIX}%`).is("product_id", null).limit(1000);
  if (error) throw new Error(error.message);
  const ids = ((its || []) as { id: string }[]).map((r) => r.id);
  if (ids.length) {
    const { error: dErr } = await sb.from("partner_items").delete().in("id", ids);
    if (dErr) throw new Error(dErr.message);
  }
  const { error: uErr } = await sb.from("partner_agency_uploads").delete().eq("partner_id", partnerId).eq("file_name", AGENCY_EXAMPLE_FILE);
  if (uErr) throw new Error(uErr.message);
  const { error: kErr } = await sb.from("partner_collabs").delete().eq("partner_id", partnerId).like("user_id", `${DEMO_USER_PREFIX}%`);
  if (kErr) throw new Error(kErr.message);
  const { error: pErr } = await sb.from("partner_plans").delete().eq("partner_id", partnerId).like("name", `${DEMO_COUPON}%`);
  if (pErr && pErr.code !== "42P01" && pErr.code !== "PGRST205") throw new Error(pErr.message);
  const { error: cErr } = await sb.from("partner_coupons").delete().eq("partner_id", partnerId).like("name", `${DEMO_COUPON}%`); // 준 쿠폰도 같이 지워진다
  if (cErr) throw new Error(cErr.message);
  return { orders, items: ids.length };
}
