/**
 * 정보 오류 신고 — 종류·문구·맞는 값 다듬기·관리자 수정 값 확인 (계산만, 시험: tests/product-reports.test.ts)
 * 표: product_reports · product_fixes (supabase/migrations/20261130e_product_reports.sql)
 * 화면: components/ProductReportSheet(제품 상세) · app/admin/product-reports(관리 › 정보 신고)
 */
export const REPORT_KINDS = ["nutrition", "serving", "wrong_page", "price", "other"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const REPORT_KIND_LABEL: Record<ReportKind, string> = {
  nutrition: "영양 정보가 포장과 달라요",
  serving: "1회 제공량(무게)이 달라요",
  wrong_page: "다른 상품 페이지로 연결돼요",
  price: "가격이 다르거나 판매가 끝났어요",
  other: "기타",
};
export const REPORT_KIND_SHORT: Record<ReportKind, string> = {
  nutrition: "영양 정보", serving: "1회 제공량", wrong_page: "다른 상품 연결", price: "가격·판매", other: "기타",
};
export type ReportStatus = "new" | "checking" | "fixed" | "rejected";
export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = { new: "새 신고", checking: "확인 중", fixed: "고침", rejected: "반려" };

/** 사용자가 적은 맞는 값 — 종류에 맞는 칸만, 말이 되는 범위만 남긴다 (나머지는 버림) */
const CLAIM_FIELDS: Record<string, [number, number]> = {
  kcal: [0, 3000], protein_g: [0, 300], sodium_mg: [0, 20000], carbs_g: [0, 500], serving_g: [1, 5000],
};
export function cleanClaim(kind: ReportKind, raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== "object") return null;
  const allow = kind === "nutrition" ? ["kcal", "protein_g", "sodium_mg", "carbs_g"] : kind === "serving" ? ["serving_g"] : [];
  const out: Record<string, number> = {};
  for (const k of allow) {
    const v = Number((raw as Record<string, unknown>)[k]);
    const [lo, hi] = CLAIM_FIELDS[k];
    if ((raw as Record<string, unknown>)[k] !== "" && (raw as Record<string, unknown>)[k] != null && Number.isFinite(v) && v >= lo && v <= hi) out[k] = Math.round(v * 10) / 10;
  }
  return Object.keys(out).length ? out : null;
}

/** 관리자가 고칠 수 있는 제품 칸과 범위 — 이 밖의 값은 받지 않는다 */
export const FIX_FIELDS: Record<string, { label: string; unit: string; range: [number, number] }> = {
  serving_size_g: { label: "1회 제공량", unit: "g", range: [1, 5000] },
  nutrient_base_g: { label: "영양 기준량", unit: "g", range: [1, 5000] },
  calories: { label: "열량", unit: "kcal", range: [0, 5000] },
  protein_g: { label: "단백질", unit: "g", range: [0, 500] },
  carbs_g: { label: "탄수화물", unit: "g", range: [0, 1000] },
  sugar_g: { label: "당류", unit: "g", range: [0, 1000] },
  fat_g: { label: "지방", unit: "g", range: [0, 500] },
  sodium_mg: { label: "나트륨", unit: "mg", range: [0, 50000] },
};
/** 관리자 수정 값 다듬기 — 알려진 칸만, 범위 안 숫자만. 틀린 칸이 있으면 그 칸 이름을 돌려준다 */
export function cleanFix(raw: unknown): { fix: Record<string, number>; bad: string[] } {
  const fix: Record<string, number> = {}; const bad: string[] = [];
  if (!raw || typeof raw !== "object") return { fix, bad };
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const f = FIX_FIELDS[k];
    if (!f || v === "" || v == null) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < f.range[0] || n > f.range[1]) { bad.push(f.label); continue; }
    fix[k] = Math.round(n * 100) / 100;
  }
  return { fix, bad };
}

/** 고친 값이 물리적으로 될 수 있는지 — 기준량 1g 에 9.2kcal 넘거나 탄단지 무게 합이 기준량보다 무거우면 안 된다 */
export function fixPlausible(next: { nutrient_base_g?: number | null; calories?: number | null; protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null }) {
  const base = Number(next.nutrient_base_g) > 0 ? Number(next.nutrient_base_g) : 100;
  if ((Number(next.calories) || 0) > base * 9.2) return "기준량에 비해 열량이 너무 많아요";
  if ((Number(next.protein_g) || 0) + (Number(next.carbs_g) || 0) + (Number(next.fat_g) || 0) > base * 1.02) return "탄수화물·단백질·지방 합이 기준량보다 무거워요";
  return null;
}

/* ───── 신고 받은 제품이 DB 어디에 있는지 (관리 화면 'DB에서 보기') ───── */

/** products.data_source → 사람이 읽는 출처 */
export const DATA_SOURCE_LABEL: Record<string, string> = {
  mfds_api: "식약처 품목제조보고 영양성분 API",
  partner: "입점 업체가 올린 값",
  crawler: "판매 페이지에서 모은 값",
  manual: "직접 넣은 값",
};
/** 저장된 칸 — 영양 값은 nutrient_base_g(기준량) 당으로 저장된다 */
export const TRACE_COLUMNS: { col: string; label: string; unit: string; nutrient: boolean }[] = [
  { col: "nutrient_base_g", label: "영양 기준량", unit: "g", nutrient: false },
  { col: "serving_size_g", label: "1회 제공량", unit: "g", nutrient: false },
  { col: "total_weight_g", label: "총 내용량", unit: "g", nutrient: false },
  { col: "calories", label: "열량", unit: "kcal", nutrient: true },
  { col: "protein_g", label: "단백질", unit: "g", nutrient: true },
  { col: "carbs_g", label: "탄수화물", unit: "g", nutrient: true },
  { col: "sugar_g", label: "당류", unit: "g", nutrient: true },
  { col: "fat_g", label: "지방", unit: "g", nutrient: true },
  { col: "sodium_mg", label: "나트륨", unit: "mg", nutrient: true },
];
/** 신고 종류마다 먼저 볼 칸 */
export const KIND_COLUMNS: Record<ReportKind, string[]> = {
  nutrition: ["nutrient_base_g", "calories", "protein_g", "carbs_g", "sugar_g", "fat_g", "sodium_mg"],
  serving: ["serving_size_g", "total_weight_g", "nutrient_base_g"],
  wrong_page: [],
  price: [],
  other: [],
};

export type TraceRow = { col: string; label: string; unit: string; stored: number | null; serving: number | null; per100: number | null; flagged: boolean };
export type TraceHistory = { at: string; what: string; by: string | null };
export type DbTrace = {
  id: string; source: string; data_source: string | null;
  food_code: string | null; report_no: string | null; barcode: string | null;
  created_at: string | null; updated_at: string | null;
  base_g: number; serving_g: number;
  rows: TraceRow[];
  history: TraceHistory[];
  partner: { name: string; sku: string; status: string } | null;
  /** 다시 불러오기로 덮일 수 있는지 — 고친 칸은 식약처 다시 불러오기에서 건너뛴다(scripts/ingest_mfds.py) */
  overwrite: string | null;
  sql: string;
};

const n = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const r1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);

/** 제품 한 줄 + 고친 이력 + 업체 연결 → 관리 화면이 그대로 그리는 모양 (계산만, 시험: tests/product-reports.test.ts) */
export function buildDbTrace(p: Record<string, unknown>, kind: ReportKind, opts: {
  fixes?: { field: string; old_value: string | null; new_value: string | null; fixed_by: string | null; fixed_at: string }[];
  baseFixes?: { old_base: unknown; fixed_at: string; reason?: string | null }[];
  partner?: { name: string; sku: string; status: string } | null;
  servingG: number;
}): DbTrace {
  const base = n(p.nutrient_base_g) && Number(p.nutrient_base_g) > 0 ? Number(p.nutrient_base_g) : 100;
  const look = new Set(KIND_COLUMNS[kind]);
  const rows: TraceRow[] = TRACE_COLUMNS.map((c) => {
    const stored = n(p[c.col]);
    return {
      col: c.col, label: c.label, unit: c.unit, stored,
      serving: c.nutrient && stored != null ? r1(stored * opts.servingG / base) : null,
      per100: c.nutrient && stored != null ? r1(stored * 100 / base) : null,
      flagged: look.has(c.col),
    };
  });
  const label = (f: string) => TRACE_COLUMNS.find((c) => c.col === f)?.label ?? f;
  const history: TraceHistory[] = [
    ...(opts.fixes || []).map((f) => ({ at: f.fixed_at, what: `${label(f.field)} ${f.old_value ?? "없음"} → ${f.new_value ?? "없음"}`, by: f.fixed_by })),
    ...(opts.baseFixes || []).map((b) => ({ at: b.fixed_at, what: `영양 기준량 일괄 수정 ${n(b.old_base) ?? "없음"}g → ${base}g${b.reason ? ` (${b.reason})` : ""}`, by: "일괄 수정" })),
  ].sort((a, z) => z.at.localeCompare(a.at));
  const src = String(p.data_source || "");
  const overwrite = src === "mfds_api" ? "식약처 자료를 다시 불러와도 여기서 고친 칸은 건너뛰어요. 고치지 않은 칸은 새 값으로 바뀔 수 있어요"
    : src === "partner" ? "업체가 같은 제품 코드로 다시 올리면 업체 값으로 바뀌어요. 업체에도 알려 주세요" : null;
  const id = String(p.id);
  return {
    id, source: DATA_SOURCE_LABEL[src] || (src ? src : "출처 기록 없음"), data_source: src || null,
    food_code: (p.food_code as string) || null, report_no: (p.report_no as string) || null, barcode: (p.barcode as string) || null,
    created_at: (p.created_at as string) || null, updated_at: (p.updated_at as string) || null,
    base_g: base, serving_g: opts.servingG, rows, history, partner: opts.partner ?? null, overwrite,
    sql: `select ${TRACE_COLUMNS.map((c) => c.col).join(", ")}\nfrom products where id = '${id}';${p.food_code ? `\n-- 식약처 식품코드: ${p.food_code}` : ""}`,
  };
}
