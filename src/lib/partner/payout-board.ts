/**
 * 정산 대시보드 — "다음 지급일에 얼마" · 이번 달 확정 · 확정 전 · 케어푸드에 낼 돈 → 실제 받을 돈,
 * 결제 → 배송 → 확정 → 지급 흐름, 날짜별 장부(확정일 기준), 입금 대사. 서버 전용. 계산은 lib/partner/payout.ts 하나.
 */
import { CONFIRM_DAYS, CONFIRM_WINDOW, PAY_DAY, dailyOf, kstDay, kstMonthOf, loadBundles, monthMs, payDate, type Bundle } from "./payout";
import { currentMonth, orderPayout, settlementMonths } from "./settlement";
import { selectAll } from "@/lib/supabase/all";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const prevMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

/** cur 부터 거꾸로 n달 */
const lastMonths = (cur: string, n: number) => { const out = [cur]; while (out.length < n) out.push(prevMonth(out[out.length - 1])); return out; };

async function rates(sb: Sb, partnerId: string) {
  const { data, error } = await sb.from("partners").select("commission_rate, order_commission_rate").eq("id", partnerId).single();
  if (error) throw new Error(error.message);
  const r = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return { link: r(data.commission_rate), order: r(data.order_commission_rate) };
}

export async function payoutBoard(sb: Sb, partnerId: string, month: string, now = Date.now()) {
  const cur = currentMonth();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > cur) month = cur;
  const rate = await rates(sb, partnerId);
  const pm = prevMonth(month);
  const since = Math.min(monthMs(pm).from, now - 185 * 86400e3) - CONFIRM_WINDOW;
  const [months, bundles] = await Promise.all([
    settlementMonths(sb, partnerId),
    loadBundles(sb, partnerId, rate.order, { deliveredFrom: since, live: true }, now),
  ]);

  // ── 받을 돈 — 지난 달까지 정산 끝나지 않은 달 (마감했으면 마감 숫자), 이번 달은 지금까지
  const net = (m: (typeof months)[number]) => {
    const s = m.settlement;
    return { app: orderPayout(s || m), link: s ? s.commission : m.commission };
  };
  // 오갈 돈이 0인 달(클릭만 있던 달)은 '정산 안 끝난 달'로 세지 않는다 — 0원 지급일 경고가 뜨지 않게
  const unpaid = months.filter((m) => !m.open && m.settlement?.status !== "paid" && (() => { const v = net(m); return v.app !== 0 || v.link !== 0; })())
    .sort((a, b) => a.month.localeCompare(b.month));
  const due = unpaid.reduce((acc, m) => { const v = net(m); return { app: acc.app + v.app, link: acc.link + v.link }; }, { app: 0, link: 0 });
  const nextPay = unpaid.length ? payDate(unpaid[0].month) : payDate(cur);
  const thisRow = months.find((m) => m.month === cur);
  const thisNet = thisRow ? net(thisRow) : { app: 0, link: 0 };

  // ── 확정 전 · 흐름 (상품 금액 기준)
  const stages = { preparing: { amount: 0, count: 0 }, shipping: { amount: 0, count: 0 }, delivered: { amount: 0, count: 0 }, confirmed: { amount: 0, count: 0 }, paid: { amount: 0, count: 0 } };
  const paidMonths = new Set(months.filter((m) => m.settlement?.status === "paid").map((m) => m.month));
  const flowFrom = now - 90 * 86400e3; // 흐름은 최근 90일에 결제한 주문
  for (const b of bundles) {
    if (b.kind !== "order" || Date.parse(b.paid_at) < flowFrom) continue; // 흐름은 주문 묶음만 (반품 배송비는 장부에만)
    const k = b.stage === "confirmed" && paidMonths.has(kstMonthOf(b.confirmed_at!)) ? "paid" : b.stage;
    stages[k].amount += b.sales; stages[k].count++;
  }
  const pending = bundles.filter((b) => b.kind === "order" && b.stage !== "confirmed");
  const nextAuto = pending.filter((b) => b.stage === "delivered" && b.auto_at).sort((a, b) => a.auto_at! - b.auto_at!)[0];

  // ── 날짜별 장부 (확정일) + 지난 달 같은 날
  const daily = dailyOf(bundles, month, now);
  const prevDaily = dailyOf(bundles, pm, now);

  // ── 입금 대사 — 정산을 끝낸 달에 실제 보낸 금액이 계산과 다르면
  const mismatches = months.filter((m) => m.settlement?.status === "paid" && m.settlement.paid_amount !== null && m.settlement.paid_amount !== undefined)
    .map((m) => { const v = net(m); return { month: m.month, expected: v.app - v.link, paid: m.settlement!.paid_amount as number }; })
    .filter((x) => x.expected !== x.paid);

  return {
    month, months_available: lastMonths(cur, 6), today: kstDay(now),
    rates: rate, pay_day: PAY_DAY, confirm_days: CONFIRM_DAYS,
    next: { date: nextPay, overdue: unpaid.length > 0 && kstDay(now) > nextPay, months: unpaid.map((m) => m.month), app: due.app, link: due.link, net: due.app - due.link },
    this_month: { month: cur, pay_date: payDate(cur), app: thisNet.app, link: thisNet.link, net: thisNet.app - thisNet.link },
    pending: { amount: pending.reduce((s, b) => s + b.sales, 0), count: pending.length, next_auto: nextAuto ? kstDay(nextAuto.auto_at!) : null },
    flow: stages,
    daily: daily.map((d, i) => ({ ...d, prev_payout: prevDaily[i]?.payout ?? null })),
    mismatches,
  };
}

/** 한 날(확정일) 또는 한 달의 확정 묶음 — 주문 단위 상세 (주문 번호 앞 8자리, 사람 정보 없음) */
export async function confirmedBundles(sb: Sb, partnerId: string, range: { from: number; to: number }, now = Date.now()) {
  const rate = await rates(sb, partnerId);
  const bundles = await loadBundles(sb, partnerId, rate.order, { deliveredFrom: range.from - CONFIRM_WINDOW, deliveredTo: range.to }, now);
  return {
    rate: rate.order,
    rows: bundles.filter((b): b is Bundle & { confirmed_at: number } => b.confirmed_at !== null && b.confirmed_at >= range.from && b.confirmed_at < range.to)
      .sort((a, b) => a.confirmed_at - b.confirmed_at)
      .map((b) => ({
        order: b.order_id.slice(0, 8).toUpperCase(), paid_day: kstDay(Date.parse(b.paid_at)), delivered_day: b.delivered_at ? kstDay(Date.parse(b.delivered_at)) : null,
        confirmed_day: kstDay(b.confirmed_at), confirm_by: b.confirm_by, kind: b.kind, lines: b.lines,
        sales: b.sales, discount: b.discount, shipping: b.shipping, fee: b.fee, payout: b.payout,
      })),
  };
}

/** 달 정산 엑셀 — 요약 · 날짜별 · 주문별 (확정일 기준). 숫자는 화면·월 마감과 같은 계산 */
export async function buildMonthWorkbook(sb: Sb, partnerId: string, month: string): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const range = monthMs(month);
  const { rate, rows } = await confirmedBundles(sb, partnerId, range);
  const months = await settlementMonths(sb, partnerId);
  const m = months.find((x) => x.month === month);
  const s = m?.settlement || null;
  const link = s ? s.commission : m?.commission || 0;
  const sum = (k: "sales" | "discount" | "shipping" | "fee" | "payout") => rows.reduce((a, r) => a + r[k], 0);

  const wb = new ExcelJS.Workbook();
  wb.creator = "케어푸드";
  const money = "#,##0";
  const head = (ws: import("exceljs").Worksheet) => { ws.getRow(1).font = { bold: true }; ws.views = [{ state: "frozen", ySplit: 1 }]; };

  const a = wb.addWorksheet("요약");
  a.columns = [{ header: "항목", key: "k", width: 28 }, { header: "값", key: "v", width: 18 }];
  head(a);
  const add = (k: string, v: string | number) => { const r = a.addRow({ k, v }); if (typeof v === "number") r.getCell(2).numFmt = money; };
  add("정산 달", month);
  add("기준", `구매확정일(한국 시간) · 구매자가 누른 때 또는 배송 완료 ${CONFIRM_DAYS}일 뒤`);
  add("지급일", payDate(month));
  add("상태", s?.status === "paid" ? "정산 끝" : s ? "마감" : month >= currentMonth() ? "집계 중" : "마감 전");
  add("확정 주문(업체 묶음)", rows.filter((r) => r.kind === "order").length);
  add("판매액", sum("sales"));
  add("업체 쿠폰 할인", -sum("discount"));
  add("배송비 (반품 배송비 포함)", sum("shipping"));
  add(`앱 주문 수수료${rate === null ? "" : ` (${rate}%)`}`, -sum("fee"));
  add("앱 주문 대금 (케어푸드 → 업체)", sum("payout"));
  add("구매 링크 수수료 (업체 → 케어푸드)", -link);
  add("실제 받을 돈", sum("payout") - link);
  if (s) add("마감한 앱 주문 대금", orderPayout(s));
  if (s?.paid_amount !== null && s?.paid_amount !== undefined) add("실제 보낸 금액", s.paid_amount);

  const d = wb.addWorksheet("날짜별");
  d.columns = [
    { header: "확정일", key: "day", width: 12 }, { header: "주문", key: "orders", width: 8 }, { header: "판매액", key: "sales", width: 14 },
    { header: "쿠폰 할인", key: "discount", width: 12 }, { header: "배송비", key: "shipping", width: 12 }, { header: "수수료", key: "fee", width: 12 }, { header: "받을 돈", key: "payout", width: 14 },
  ];
  head(d);
  const byDay = new Map<string, { day: string; orders: number; sales: number; discount: number; shipping: number; fee: number; payout: number }>();
  for (const r of rows) {
    const v = byDay.get(r.confirmed_day) || byDay.set(r.confirmed_day, { day: r.confirmed_day, orders: 0, sales: 0, discount: 0, shipping: 0, fee: 0, payout: 0 }).get(r.confirmed_day)!;
    if (r.kind === "order") v.orders++;
    v.sales += r.sales; v.discount += r.discount; v.shipping += r.shipping; v.fee += r.fee; v.payout += r.payout;
  }
  for (const r of byDay.values()) d.addRow(r);
  d.addRow({ day: "합계", orders: rows.filter((r) => r.kind === "order").length, sales: sum("sales"), discount: sum("discount"), shipping: sum("shipping"), fee: sum("fee"), payout: sum("payout") }).font = { bold: true };

  const o = wb.addWorksheet("주문별");
  o.columns = [
    { header: "주문 번호", key: "order", width: 12 }, { header: "결제일", key: "paid_day", width: 12 }, { header: "배송 완료일", key: "delivered_day", width: 12 },
    { header: "구매확정일", key: "confirmed_day", width: 12 }, { header: "확정 방법", key: "by", width: 10 }, { header: "상품", key: "items", width: 40 },
    { header: "판매액", key: "sales", width: 12 }, { header: "쿠폰 할인", key: "discount", width: 12 }, { header: "배송비", key: "shipping", width: 10 },
    { header: "수수료", key: "fee", width: 10 }, { header: "받을 돈", key: "payout", width: 12 },
  ];
  head(o);
  for (const r of rows) o.addRow({ ...r, by: r.confirm_by === "buyer" ? "구매자" : r.confirm_by === "return" ? "반품 배송비" : `${CONFIRM_DAYS}일 자동`, items: r.lines.map((l) => `${l.name} × ${l.qty}`).join(", ") });
  // 과세 구분 — 제품 > 판매·재고에서 적은 과세·면세로 판매액을 나눈다 (쿠폰 할인 전 상품 금액, 업체 묶음 쿠폰은 제품에 나누지 않는다)
  const taxRows = await selectAll<{ partner_sku: string; tax_type: string }>(() => sb.from("partner_items").select("partner_sku, tax_type").eq("partner_id", partnerId).not("tax_type", "is", null), "id");
  const taxOf = new Map(taxRows.map((r) => [r.partner_sku, r.tax_type]));
  const tax = { taxable: { qty: 0, amount: 0 }, exempt: { qty: 0, amount: 0 }, unknown: { qty: 0, amount: 0 } };
  for (const r of rows) for (const l of r.lines) {
    const t = (l.sku && taxOf.get(l.sku)) as "taxable" | "exempt" | undefined;
    const v = tax[t || "unknown"];
    v.qty += l.qty; v.amount += l.amount;
  }
  const t = wb.addWorksheet("과세 구분");
  t.columns = [{ header: "구분", key: "k", width: 14 }, { header: "수량", key: "qty", width: 10 }, { header: "판매액(쿠폰 할인 전)", key: "amount", width: 20 }];
  head(t);
  t.addRow({ k: "과세", ...tax.taxable }); t.addRow({ k: "면세", ...tax.exempt }); t.addRow({ k: "미정", ...tax.unknown });
  t.addRow({ k: "합계", qty: tax.taxable.qty + tax.exempt.qty + tax.unknown.qty, amount: tax.taxable.amount + tax.exempt.amount + tax.unknown.amount }).font = { bold: true };
  t.addRow({});
  t.addRow({ k: "미정은 제품 > 판매·재고 > 원가 · 마진에서 과세 구분을 적지 않은 제품이에요. 쿠폰 할인·배송비는 나누지 않았어요" });

  for (const ws of [d, o, t]) ws.eachRow((row, i) => { if (i > 1) row.eachCell((c) => { if (typeof c.value === "number" && !["orders", "qty"].includes(String(ws.getColumn(c.col).key))) c.numFmt = money; }); });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
