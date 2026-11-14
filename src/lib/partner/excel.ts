/**
 * 입점 업체 엑셀 양식 — 만들기(내려받기)와 읽기(올리기). 서버 전용.
 * 양식은 schema.ts 의 FIELDS 에서 바로 만든다 → 필드를 고치면 양식도 같이 바뀐다.
 *
 * '제품' 시트: 1행 = 한국어 칸 이름(필수는 *), 2행 = 필드 키(지우지 않는다 — 읽을 때 이 줄로 칸을 찾는다), 3행부터 제품.
 */
import ExcelJS from "exceljs";
import { FIELDS, type Field } from "./schema";

const SHEET = "제품";
const MAX_ROWS = 2000;

const needMark = (f: Field) => (f.need === "필수" ? " *" : f.need === "식단 서비스 필수" ? " (식단 서비스 *)" : "");

/** samples: '제품' 시트 3행부터 채울 예시 줄 (예시 양식 내려받기 — 그대로 올리면 예시 제품이 들어간다) */
export async function buildTemplate(samples?: Record<string, string>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "케어푸드";

  // ── 제품 ──
  const ws = wb.addWorksheet(SHEET, { views: [{ state: "frozen", xSplit: 2, ySplit: 2 }] });
  ws.addRow(FIELDS.map((f) => `${f.label}${needMark(f)}`));
  ws.addRow(FIELDS.map((f) => f.key));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).height = 32;
  ws.getRow(1).alignment = { wrapText: true, vertical: "middle" };
  ws.getRow(2).font = { color: { argb: "FF8A8A8A" }, size: 9 };
  for (const s of samples || []) ws.addRow(FIELDS.map((f) => s[f.key] ?? ""));
  FIELDS.forEach((f, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.min(40, Math.max(12, f.label.length * 2 + 4));
    if (f.need === "필수" || f.need === "식단 서비스 필수") {
      ws.getCell(1, i + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDF0D5" } };
    }
  });

  // ── 코드표 ── (드롭다운이 이 시트를 가리킨다)
  const codes = wb.addWorksheet("코드표");
  codes.addRow(["칸", "코드", "뜻"]);
  codes.getRow(1).font = { bold: true };
  const ranges: Record<string, string> = {};
  for (const f of FIELDS) {
    if (!f.enumOf) continue;
    const start = codes.rowCount + 1;
    for (const [k, v] of Object.entries(f.enumOf)) codes.addRow([f.label, k, v]);
    ranges[f.key] = `'코드표'!$B$${start}:$B$${codes.rowCount}`;
  }
  codes.columns = [{ width: 22 }, { width: 18 }, { width: 24 }];

  // 드롭다운 — 한 칸 고르기 (알레르기는 여러 개라 드롭다운 없이 쉼표로)
  FIELDS.forEach((f, i) => {
    if (!f.enumOf || f.type === "list") return;
    const letter = ws.getColumn(i + 1).letter;
    for (let r = 3; r <= 500; r++) {
      ws.getCell(`${letter}${r}`).dataValidation = {
        type: "list", allowBlank: true, formulae: [ranges[f.key]],
        showErrorMessage: true, errorTitle: f.label, error: "코드표에 있는 코드를 골라 주세요",
      };
    }
  });

  // ── 안내 ──
  const guide = wb.addWorksheet("안내");
  guide.addRow(["케어푸드 입점 제품 양식"]).font = { bold: true, size: 14 };
  guide.addRow(["'제품' 시트 3행부터 한 줄에 제품 하나씩 적어요. 2행(회색 영문)은 지우지 마세요. * 칸은 꼭 채워요."]);
  guide.addRow(["영양 값은 포장 표시사항에 적힌 기준(100g·1회·포장 전체) 그대로 적고, 그 기준을 '영양성분 기준' 칸에 골라요."]);
  guide.addRow(["가격·재고·링크만 바뀐 줄은 바로 반영되고, 새 제품과 영양·원재료·알레르기가 바뀐 줄은 케어푸드가 확인한 뒤 반영돼요."]);
  guide.addRow([]);
  guide.addRow(["칸 이름", "필드 키", "필수", "설명", "예"]).font = { bold: true };
  for (const f of FIELDS) guide.addRow([f.label, f.key, f.need, f.help, f.example]);
  guide.columns = [{ width: 22 }, { width: 22 }, { width: 16 }, { width: 60 }, { width: 36 }];

  // ── 작성 예시 ── (그대로 올리면 반영되지 않게 따로 둔다)
  const ex = wb.addWorksheet("작성 예시");
  ex.addRow(FIELDS.map((f) => `${f.label}${needMark(f)}`)).font = { bold: true };
  ex.addRow(FIELDS.map((f) => f.key)).font = { color: { argb: "FF8A8A8A" }, size: 9 };
  ex.addRow(FIELDS.map((f) => f.example));

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export type SheetRow = { row: number; values: Record<string, unknown> };

/** 주문(구매 수수료 정산) 양식의 칸 */
export const ORDER_FIELDS = [
  { key: "click_id", label: "클릭 번호 *", help: "구매 링크에 붙어 온 cf_click 값", example: "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90" },
  { key: "order_no", label: "주문 번호 *", help: "업체 안에서 겹치지 않는 번호. 같은 번호를 다시 올리면 상태·금액이 고쳐져요", example: "ORD-20261112-0001" },
  { key: "amount", label: "결제 금액(원) *", help: "배송비를 뺀 상품 금액", example: "23600" },
  { key: "status", label: "상태 *", help: "ordered(주문) · confirmed(구매확정) · canceled(취소) · returned(반품)", example: "confirmed" },
  { key: "ordered_at", label: "주문 시각 *", help: "2026-11-12 또는 2026-11-12 14:30", example: "2026-11-12 14:30" },
] as const;
const ORDER_SHEET = "주문";

export async function buildOrdersTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "케어푸드";
  const ws = wb.addWorksheet(ORDER_SHEET, { views: [{ state: "frozen", ySplit: 2 }] });
  ws.addRow(ORDER_FIELDS.map((f) => f.label)).font = { bold: true };
  ws.addRow(ORDER_FIELDS.map((f) => f.key)).font = { color: { argb: "FF8A8A8A" }, size: 9 };
  ws.columns = [{ width: 40 }, { width: 24 }, { width: 16 }, { width: 14 }, { width: 20 }];
  const guide = wb.addWorksheet("안내");
  guide.addRow(["케어푸드 주문 내역 양식"]).font = { bold: true, size: 14 };
  guide.addRow(["케어푸드 링크로 들어온 주문(주소에 cf_click 이 붙은 방문의 주문)을 '주문' 시트 3행부터 한 줄에 하나씩 적어요. 2행은 지우지 마세요."]);
  guide.addRow(["수수료는 구매확정(confirmed) 금액에만 계산해요. 취소·반품은 같은 주문 번호로 상태만 바꿔 다시 올려 주세요."]);
  guide.addRow([]);
  guide.addRow(["칸", "필드 키", "설명", "예"]).font = { bold: true };
  for (const f of ORDER_FIELDS) guide.addRow([f.label, f.key, f.help, f.example]);
  guide.columns = [{ width: 20 }, { width: 14 }, { width: 70 }, { width: 40 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** 올린 엑셀에서 줄을 읽는다 — 2행의 필드 키로 칸을 찾는다. kind: 제품(기본) 또는 주문 */
export async function readWorkbook(buf: ArrayBuffer, kind: "products" | "orders" = "products"): Promise<{ rows: SheetRow[]; unknownKeys: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet(kind === "orders" ? ORDER_SHEET : SHEET) || wb.worksheets[0];
  if (!ws) throw new Error("시트를 찾지 못했어요");
  const known = new Set<string>(kind === "orders" ? ORDER_FIELDS.map((f) => f.key) : FIELDS.map((f) => f.key));
  const keys: (string | null)[] = [];
  const unknownKeys: string[] = [];
  ws.getRow(2).eachCell({ includeEmpty: true }, (cell, col) => {
    const k = String(cellValue(cell.value) ?? "").trim();
    keys[col] = known.has(k) ? k : null;
    if (k && !known.has(k)) unknownKeys.push(k);
  });
  if (!keys.some(Boolean)) throw new Error("2행에 필드 키가 없어요. 케어푸드 양식 파일에 적어 주세요");

  const rows: SheetRow[] = [];
  for (let r = 3; r <= Math.min(ws.rowCount, MAX_ROWS + 2); r++) {
    const values: Record<string, unknown> = {};
    let any = false;
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
      const k = keys[col];
      if (!k) return;
      const v = cellValue(cell.value);
      if (v !== null && v !== "") { values[k] = v; any = true; }
    });
    if (any) rows.push({ row: r, values });
  }
  if (ws.rowCount > MAX_ROWS + 2) throw new Error(`한 번에 ${MAX_ROWS}개까지 올릴 수 있어요. 나눠서 올려 주세요`);
  return { rows, unknownKeys };
}

/** 엑셀 칸 값 → 문자열·숫자 (날짜는 YYYY-MM-DD, 링크는 주소, 서식 글자는 글자만) */
function cellValue(v: ExcelJS.CellValue): string | number | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") {
    if ("hyperlink" in v && typeof v.hyperlink === "string") return v.hyperlink;
    if ("richText" in v && Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return cellValue(v.result as ExcelJS.CellValue);
    if ("text" in v && typeof v.text === "string") return v.text;
  }
  return String(v);
}
