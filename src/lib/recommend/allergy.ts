/**
 * 알레르기 — 제품 이름과 원재료(ingredients_raw)를 같이 본다.
 * 전에는 이름만 봐서 '멸치넛츠'(견과)·'초코칩 쿠키'(우유) 같은 제품이 걸러지지 않았다.
 * 원재료 쪽 말은 표시 관행(예: "(우유, 대두 함유)")에 맞춰 이름 쪽보다 넓게 잡는다 — 덜 거르는 것보다 더 거르는 쪽이 안전하다.
 */
import { ALLERGEN_KEYWORDS } from "./constants";

const INGREDIENT_PATTERNS: Record<string, RegExp> = {
  egg: /계란|달걀|난류|전란|난백|난황|알부민/,
  milk: /우유|유청|카제인|탈지분유|전지분유|혼합분유|유당|버터|치즈|크림|연유|요구르트|요거트|발효유|우유단백/,
  wheat: /밀가루|소맥|글루텐|(^|[\s,(\[·])밀([\s,)\]·]|$)|밀\(|통밀|호밀/,
  soybean: /대두|콩|두부|두유|된장|간장|고추장|청국장|레시틴\(대두/,
  peanut: /땅콩|피넛/,
  treenut: /호두|아몬드|캐슈|피스타치오|마카다미아|(^|[\s,(\[·])잣([\s,)\]·]|$)|헤이즐넛|피칸|브라질너트|견과|넛츠|너트/,
  shellfish: /새우|꽃게|대게|홍게|게살|게장|(^|[\s,(\[·])게([\s,)\]·]|$)|랍스터|크랩|가재|갑각/,
  fish: /고등어|연어|참치|멸치|조기|꽁치|갈치|명태|대구|가자미|생선|어육|액젓|어간장/,
  buckwheat: /메밀/,
  peach: /복숭아/,
  sulfite: /아황산|메타중아황산|차아황산/,
};

export function isAllergenic(p: Record<string, unknown>, allergies: string[]): boolean {
  if (!allergies.length) return false;
  const name = String(p.name || "").toLowerCase();
  const ing = String(p.ingredients_raw || "");
  return allergies.some((a) => {
    const kws = ALLERGEN_KEYWORDS[a];
    if (kws && kws.some((kw) => name.includes(kw))) return true;
    const re = INGREDIENT_PATTERNS[a];
    return !!(re && ing && re.test(ing));
  });
}
