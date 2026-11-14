/**
 * 출고 엑셀 — 보낼 주문을 내려받고(출고 목록·상품별 줄·생산표), 송장을 적어 다시 올린다. 서버 전용.
 *  · 출고 목록 시트가 곧 송장 양식이다: 2행 필드 키(order_id · carrier · tracking_number)로 칸을 찾으니 칸 순서를 바꿔도 된다.
 *  · 받는 분 정보는 주문 목록과 같은 기준 — 주문자가 제3자 제공에 동의했고 배송 전인 주문만. 관리자 보기에서는 빼고 만든다.
 *  · 송장 올리기는 먼저 파일 전체를 검사하고, 형식이 틀린 줄이 하나라도 있으면 아무것도 바꾸지 않는다.
 *    형식이 맞으면 줄마다 발송 처리(updateFulfilment) — 그새 상태가 바뀐 주문은 그 줄만 실패로 알려 준다.
 */
import ExcelJS from "exceljs";
import { CARRIERS, FULFIL_LABEL, formatPhone } from "@/lib/order-status";
import { listPartnerOrders, updateFulfilment, type PartnerOrder } from "./orders";
import { readSheet } from "./excel";
import type { Partner } from "./ingest";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export const SHIP_SHEET = "출고 목록";
const DAY: Record<string, string> = { mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일" };
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const MEAL: Record<string, string> = { breakfast: "아침", lunch: "점심", dinner: "저녁", snack: "간식" };
/** 한 번에 내려받는 보낼 주문 — 이보다 많으면 알려 준다 */
export const EXPORT_MAX = 2000;

const kst = (iso: string) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
const weekLabel = (w: string | null) => (w ? `${Number(w.slice(5, 7))}/${Number(w.slice(8, 10))} 주` : "배송 주 없음");

/** 보낼 주문(새 주문·접수) — 오래된 것부터. 주문 전체가 취소된 묶음은 뺀다 */
export async function loadOpenOrders(sb: Sb, partnerId: string): Promise<{ orders: PartnerOrder[]; truncated: boolean }> {
  const all = await listPartnerOrders(sb, partnerId, { open: true, cap: EXPORT_MAX + 1 });
  const orders = all.filter((o) => o.status === "new" || o.status === "accepted");
  return { orders: orders.slice(0, EXPORT_MAX), truncated: orders.length > EXPORT_MAX };
}

const SHIP_COLS: { key: string; label: string; width: number }[] = [
  { key: "order_id", label: "주문 번호 (지우지 마세요)", width: 38 },
  { key: "status", label: "상태", width: 9 },
  { key: "ordered_at", label: "주문 시각", width: 17 },
  { key: "week", label: "배송 주", width: 11 },
  { key: "items", label: "상품", width: 40 },
  { key: "qty", label: "수량", width: 7 },
  { key: "name", label: "받는 분", width: 10 },
  { key: "phone", label: "연락처", width: 15 },
  { key: "postal_code", label: "우편번호", width: 9 },
  { key: "address", label: "주소", width: 44 },
  { key: "note", label: "배송 메모", width: 24 },
  { key: "carrier", label: "택배사 *", width: 14 },
  { key: "tracking_number", label: "송장 번호 *", width: 18 },
];

/**
 * 출고 엑셀 — ① 출고 목록(주문마다 한 줄, 송장 칸 비움) ② 상품별 줄(포장용) ③ 생산표(배송 주 × 상품 수량) ④ 안내.
 * withShipping=false 면 받는 분·연락처·주소·메모 칸을 비운다 (관리자 보기)
 */
export async function buildShipWorkbook(orders: PartnerOrder[], opt: { withShipping: boolean; truncated?: boolean }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "케어푸드";
  const carrierCodes = Object.keys(CARRIERS);

  // ① 출고 목록
  const ws = wb.addWorksheet(SHIP_SHEET, { views: [{ state: "frozen", xSplit: 1, ySplit: 2 }] });
  ws.addRow(SHIP_COLS.map((c) => c.label)).font = { bold: true };
  ws.addRow(SHIP_COLS.map((c) => c.key)).font = { color: { argb: "FF8A8A8A" }, size: 9 };
  SHIP_COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
  for (const o of orders) {
    const s = opt.withShipping ? o.shipping : null;
    ws.addRow([
      o.order_id, FULFIL_LABEL[o.status], kst(o.ordered_at), weekLabel(o.delivery_week_start),
      o.lines.map((l) => `${l.product_name} ×${l.quantity}`).join(", "), o.lines.reduce((n, l) => n + l.quantity, 0),
      s?.name || "", s ? formatPhone(s.phone) : "", s?.postal_code || "", s ? [s.address1, s.address2].filter(Boolean).join(" ") : "", s?.note || "",
      o.carrier || "", "",
    ]);
  }
  const cIdx = SHIP_COLS.findIndex((c) => c.key === "carrier") + 1;
  const letter = ws.getColumn(cIdx).letter;
  for (let r = 3; r < 3 + orders.length; r++) {
    ws.getCell(`${letter}${r}`).dataValidation = {
      type: "list", allowBlank: true, formulae: [`"${carrierCodes.join(",")}"`],
      showErrorMessage: true, errorTitle: "택배사", error: `${carrierCodes.join(" · ")} 중 하나를 골라 주세요`,
    };
  }
  ws.getColumn(SHIP_COLS.findIndex((c) => c.key === "tracking_number") + 1).numFmt = "@"; // 송장 번호 앞자리 0 이 지워지지 않게
  ws.getColumn(SHIP_COLS.findIndex((c) => c.key === "postal_code") + 1).numFmt = "@";

  // ② 상품별 줄
  const lines = wb.addWorksheet("상품별 줄", { views: [{ state: "frozen", ySplit: 1 }] });
  lines.addRow(["주문 번호", "배송 주", "먹는 요일", "끼니", "상품 코드", "상품", "수량"]).font = { bold: true };
  lines.columns = [{ width: 12 }, { width: 11 }, { width: 9 }, { width: 7 }, { width: 16 }, { width: 40 }, { width: 7 }];
  for (const o of orders) {
    const sorted = [...o.lines].sort((a, b) => DAYS.indexOf(a.day_of_week || "") - DAYS.indexOf(b.day_of_week || ""));
    for (const l of sorted) lines.addRow([o.order_id.slice(0, 8), weekLabel(o.delivery_week_start), l.day_of_week ? DAY[l.day_of_week] || l.day_of_week : "", l.meal_type ? MEAL[l.meal_type] || l.meal_type : "", l.partner_sku || "", l.product_name, l.quantity]);
  }

  // ③ 생산표 — 배송 주마다 상품 수량 (만들 양)
  const weeks = [...new Set(orders.map((o) => o.delivery_week_start || ""))].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  const prod = new Map<string, { sku: string; name: string; byWeek: Map<string, number> }>();
  for (const o of orders) for (const l of o.lines) {
    const k = l.partner_sku || l.product_name;
    if (!prod.has(k)) prod.set(k, { sku: l.partner_sku || "", name: l.product_name, byWeek: new Map() });
    const w = prod.get(k)!.byWeek;
    const wk = o.delivery_week_start || "";
    w.set(wk, (w.get(wk) || 0) + l.quantity);
  }
  const plan = wb.addWorksheet("생산표", { views: [{ state: "frozen", xSplit: 2, ySplit: 1 }] });
  plan.addRow(["상품 코드", "상품", ...weeks.map((w) => weekLabel(w || null)), "합계"]).font = { bold: true };
  plan.columns = [{ width: 16 }, { width: 40 }, ...weeks.map(() => ({ width: 11 })), { width: 9 }];
  const rows = [...prod.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  for (const p of rows) {
    const vals = weeks.map((w) => p.byWeek.get(w) || 0);
    plan.addRow([p.sku, p.name, ...vals, vals.reduce((s, v) => s + v, 0)]);
  }
  if (rows.length) {
    const tot = weeks.map((w) => rows.reduce((s, p) => s + (p.byWeek.get(w) || 0), 0));
    plan.addRow(["", "합계", ...tot, tot.reduce((s, v) => s + v, 0)]).font = { bold: true };
  }

  // ④ 안내
  const g = wb.addWorksheet("안내");
  g.addRow(["케어푸드 출고 목록"]).font = { bold: true, size: 14 };
  g.addRow([`보낼 주문(새 주문·접수) ${orders.length}건, 오래된 주문부터예요.${opt.truncated ? ` 한 번에 ${EXPORT_MAX}건까지라 나머지는 처리한 뒤 다시 받아 주세요.` : ""}`]);
  g.addRow(["송장 올리기: '출고 목록' 시트의 택배사·송장 번호 칸을 채워 그대로 올리면 그 주문이 발송 처리돼요. 2행(필드 키)과 주문 번호는 지우지 마세요."]);
  g.addRow(["택배사·송장 번호가 비어 있는 줄은 건너뛰어요. 직접 배송(direct)은 송장 번호를 비워 둬도 돼요."]);
  g.addRow(["받는 분 정보는 배송에만 쓰고, 배송이 끝나면 지워 주세요. 주문자가 제3자 제공에 동의한 주문만 들어 있어요."]);
  g.addRow([]);
  g.addRow(["택배사 코드", "이름"]).font = { bold: true };
  for (const [k, v] of Object.entries(CARRIERS)) g.addRow([k, v]);
  g.columns = [{ width: 16 }, { width: 90 }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** 택배사 칸 — 코드(cj) · 이름(CJ대한통운) · 흔한 줄임(CJ, 대한통운, 우체국) 모두 받는다 */
const ALIAS: Record<string, string> = { "cj": "cj", "대한통운": "cj", "cj택배": "cj", "한진": "hanjin", "롯데": "lotte", "우체국": "epost", "로젠": "logen", "직접": "direct", "직접배송": "direct", "기타": "other" };
export function parseCarrier(v: unknown): string | null {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const low = t.toLowerCase().replace(/\s/g, "");
  if (low in CARRIERS) return low;
  for (const [k, name] of Object.entries(CARRIERS)) if (name.replace(/\s/g, "").toLowerCase() === low) return k;
  return ALIAS[low] || null;
}

export type TrackingResult = {
  rows: number; shipped: number; unchanged: number; skipped: number;
  errors: { row: number; order: string | null; message: string }[];
  /** 형식 검사에서 막혀 아무것도 바꾸지 않았으면 true */
  blocked: boolean;
};

/** 한 번에 발송 처리하는 주문 — 줄마다 상태를 확인하고 주문자에게 알리느라 오래 걸린다 */
export const TRACKING_MAX = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 송장 엑셀 올리기 — 검사 → (형식이 모두 맞으면) 줄마다 발송 처리 */
export async function applyTrackingSheet(sb: Sb, partner: Pick<Partner, "id">, buf: ArrayBuffer): Promise<TrackingResult> {
  const { rows } = await readSheet(buf, SHIP_SHEET, SHIP_COLS.map((c) => c.key));
  const out: TrackingResult = { rows: rows.length, shipped: 0, unchanged: 0, skipped: 0, errors: [], blocked: false };
  const todo: { row: number; order_id: string; carrier: string; tracking: string }[] = [];
  const seen = new Map<string, number>();
  for (const r of rows) {
    const id = String(r.values.order_id ?? "").trim();
    const rawCarrier = r.values.carrier;
    const tracking = String(r.values.tracking_number ?? "").trim().replace(/[\s-]/g, "");
    if (!String(rawCarrier ?? "").trim() && !tracking) { out.skipped++; continue; }
    if (!UUID.test(id)) { out.errors.push({ row: r.row, order: id || null, message: "주문 번호가 없거나 잘렸어요. 내려받은 파일의 주문 번호를 그대로 두세요" }); continue; }
    const carrier = parseCarrier(rawCarrier);
    if (!carrier) { out.errors.push({ row: r.row, order: id, message: `택배사를 알아보지 못했어요. ${Object.keys(CARRIERS).join(" · ")} 중 하나로 적어 주세요` }); continue; }
    if (carrier !== "direct" && !/^[A-Za-z0-9]{6,30}$/.test(tracking)) { out.errors.push({ row: r.row, order: id, message: "송장 번호를 영문·숫자 6~30자로 적어 주세요" }); continue; }
    if (seen.has(id)) { out.errors.push({ row: r.row, order: id, message: `${seen.get(id)}줄과 같은 주문이에요. 한 줄만 남겨 주세요` }); continue; }
    seen.set(id, r.row);
    todo.push({ row: r.row, order_id: id, carrier, tracking });
  }
  if (!out.errors.length && todo.length > TRACKING_MAX) out.errors.push({ row: 0, order: null, message: `한 번에 ${TRACKING_MAX}건까지 발송 처리할 수 있어요. 나눠서 올려 주세요` });
  if (out.errors.length) { out.blocked = true; return out; }

  for (const t of todo) {
    try {
      const r = await updateFulfilment(sb, partner, t.order_id, { status: "shipped", carrier: t.carrier, tracking_number: t.tracking });
      if (!r.ok) out.errors.push({ row: t.row, order: t.order_id, message: r.message });
      else if (r.changed) out.shipped++;
      else out.unchanged++;
    } catch (e) {
      console.error("송장 처리 실패:", t.order_id, (e as Error).message);
      out.errors.push({ row: t.row, order: t.order_id, message: "처리하지 못했어요. 다시 올려 주세요" });
    }
  }
  return out;
}
