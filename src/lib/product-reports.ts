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
