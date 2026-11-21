/**
 * 같은 음식인지 — 상표·맛 이름·용량을 떼고 남은 음식 이름(마지막 낱말)으로 묶는다.
 *   "한식온도 사골 순대국" · "한식온도 얼큰 순대국" → 순대국
 *   "이지끼니 백미없는 순잡곡밥 프로틴 12개입" → 순잡곡밥
 * 한 상 추천(lib/next-picks bestCombos)이 세 상에 같은 음식을 두 번 내지 않게 쓴다. 계산만 (시험: tests/dish-family.test.ts)
 */
const MODIFIER = new Set([
  "사골", "얼큰", "매운", "매콤", "순한", "담백", "진한", "맑은", "칼칼", "구수한", "오리지널", "클래식", "프리미엄", "프로틴", "라이트",
  "플러스", "대용량", "소용량", "미니", "점보", "실속", "가정용", "업소용", "국산", "국내산", "수입산", "냉동", "냉장", "즉석", "간편",
  "저당", "저염", "무첨가", "유기농", "고단백", "신제품", "뉴", "new", "세트", "선물", "본품", "리뉴얼",
]);
/** 이름 끝이 이것이면 같은 음식으로 — 상표 낱말이 붙은 두부·달걀류 ("하늘이내린두부" · "쌈두부" · "실큰두부" → 두부) */
const SUFFIX: [RegExp, string][] = [
  [/(?<!순)두부$|연두부$/, "두부"],
  [/(계란|달걀|구운란|반숙란|훈제란|맥반석란|초란|흑란)$/, "달걀"],
  [/곰탕$/, "곰탕"],
];
const UNIT = /^(\d+([.,]\d+)?)(g|kg|ml|l|개|개입|입|팩|봉|인분|ea|p|매|구)?$|^\d+$|^[x×*]\d*$/i;

export function dishFamily(name: unknown, manufacturer?: unknown): string {
  const n = String(name || "")
    .replace(/\[[^\]]*\]|\([^)]*\)|【[^】]*】|<[^>]*>/g, " ")   // [브랜드] (용량)
    .replace(/[,·/+&_|~-]/g, " ");
  const maker = String(manufacturer || "").replace(/\(주\)|㈜|주식회사|농업회사법인|\s/g, "");
  const words = n.split(/\s+/).map((w) => w.trim()).filter(Boolean)
    .filter((w) => !UNIT.test(w) && !MODIFIER.has(w.toLowerCase()))
    .filter((w, i, all) => !(maker && w.length >= 2 && maker.includes(w) && i < all.length - 1));
  const last = words[words.length - 1] || String(name || "").trim();
  const base = last.replace(/\d+(g|kg|ml|개입|개|입)$/i, "").toLowerCase();
  for (const [re, fam] of SUFFIX) if (re.test(base)) return fam;
  return base;
}
