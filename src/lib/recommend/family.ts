/**
 * 같은 제품 묶음 — 맛·용량·포장만 다른 같은 브랜드 제품을 하나로 본다.
 *   "닥터디엣 하이프로틴 딸기 단백질 쉐이크" · "닥터디엣 하이프로틴 자색고구마 단백질 쉐이크" → 같은 묶음
 *   "서울우유" 5줄(용량 다름) → 같은 묶음
 * 추천 목록에서는 묶음마다 가장 높은 것 하나만 보이고 나머지 수를 variant_count 로 단다.
 */
const FLAVORS = [
  "오리지널", "플레인", "초코", "초콜릿", "쵸코", "바닐라", "딸기", "바나나", "망고", "복숭아", "블루베리", "녹차", "말차", "얼그레이",
  "커피", "모카", "카라멜", "캐러멜", "쿠키앤크림", "쿠앤크", "흑임자", "인절미", "고구마", "자색고구마", "단호박", "옥수수", "곡물", "미숫가루",
  "치즈", "크림", "갈릭", "마늘", "양파", "버터", "허니", "꿀", "레몬", "자몽", "청포도", "사과", "포도", "요거트", "피넛", "땅콩", "아몬드",
  "매운맛", "순한맛", "매콤", "불닭", "마라", "간장", "데리야끼", "카레", "커리", "로제", "까르보", "크림맛", "고추", "청양", "와사비",
  "제로", "라이트", "저당", "무가당", "슈가프리",
];
const FLAVOR_RE = new RegExp(FLAVORS.sort((a, b) => b.length - a.length).join("|"), "g");

function normMaker(m: unknown): string {
  return String(m || "").replace(/주식회사|\(주\)|㈜|\(유\)|농업회사법인|영농조합법인|[\s()]/g, "").slice(0, 8);
}

export function familyKey(p: Record<string, unknown>): string {
  let s = String(p.name || "");
  s = s.replace(/\[[^\]]*\]|\([^)]*\)|<[^>]*>/g, " ");                 // [브랜드] (용량) 같은 덧붙임
  s = s.replace(/\d+(\.\d+)?\s*(g|kg|ml|mL|l|L|개입|입|개|팩|봉|매|ea|EA|구|인분|p|P)\b/g, " ");
  s = s.replace(/[xX×*]\s*\d+/g, " ");
  s = s.replace(FLAVOR_RE, " ");
  s = s.replace(/맛\b|맛$/g, " ");
  s = s.replace(/[^가-힣a-zA-Z0-9]/g, "").toLowerCase();
  return `${normMaker(p.manufacturer)}|${s || String(p.name || "").slice(0, 12)}`;
}

/** 순서를 지키며 묶음마다 첫(가장 높은) 것만 — 나머지 수는 variant_count */
export function dedupeFamilies<T extends Record<string, unknown>>(rows: T[]): (T & { variant_count: number })[] {
  const first = new Map<string, T & { variant_count: number }>();
  const out: (T & { variant_count: number })[] = [];
  for (const r of rows) {
    const k = familyKey(r);
    const hit = first.get(k);
    if (hit) { hit.variant_count += 1; continue; }
    const row = { ...r, variant_count: 0 };
    first.set(k, row);
    out.push(row);
  }
  return out;
}
