/**
 * 표현 점검 — 상품명·소개·강조 문구·고객층 메시지에서 "확인이 필요한 표현"을 찾아 바꿀 말을 제안한다.
 * 법적 판단이 아니라 검수 전에 먼저 보여 주는 안내다. 표시된 문구도 근거를 달면 검수자가 통과시킬 수 있다.
 * 근거: 식품표시광고법 제8조①(질병 예방·치료 인식, 건강기능식품 오인), 시행령 별표1 제5호(체험기·전문가 추천),
 *       앱에서 바꾼 의료 표현 30여 개 (2026-10-27, 프로젝트 문서 "속편-의료법-개인정보-검토").
 * 사전 관리: 케어푸드가 관리한다 — 식약처 고시가 바뀌면 바로, 그 밖에는 분기마다 점검 (v3 9장, 11/13 결정).
 */
export type ClaimHit = { phrase: string; why: string; suggest?: string };

type Rule = { re: RegExp; why: string; suggest?: string };

const DISEASE = "질병을 막거나 고친다는 뜻으로 읽힐 수 있어요";
const HEALTH_FOOD = "건강기능식품처럼 읽힐 수 있어요";
const REVIEW = "체험기·전문가 추천을 광고에 쓰면 안 돼요";

const RULES: Rule[] = [
  { re: /당뇨|혈당\s*(관리|조절|개선|강하|낮춰|떨어)/, why: DISEASE, suggest: "저당 · 당류 ○g" },
  { re: /고혈압|혈압\s*(관리|조절|개선|낮춰|떨어)/, why: DISEASE, suggest: "저염 · 나트륨 ○mg" },
  { re: /콜레스테롤\s*(관리|개선|낮춰|감소)|고지혈/, why: DISEASE, suggest: "포화지방 ○g" },
  { re: /신장\s*(보호|건강|질환)|콩팥/, why: DISEASE, suggest: "저염·저단백" },
  { re: /간\s*(보호|해독|건강)|숙취\s*해소/, why: DISEASE },
  { re: /변비\s*(해소|개선|예방)|장\s*(질환|트러블\s*개선)/, why: DISEASE, suggest: "식이섬유 ○g" },
  { re: /(암|항암|종양)\s*(예방|억제)|항암/, why: DISEASE },
  { re: /염증\s*(완화|감소|억제)|항염/, why: DISEASE },
  { re: /치료|처방|진단|완치|낫는|낫게/, why: DISEASE },
  { re: /(질병|질환)\s*(예방|개선)|예방\s*효과/, why: DISEASE },
  { re: /환자(용|식)?/, why: DISEASE, suggest: "○○이 궁금한 분" },
  { re: /면역력\s*(강화|증진|높)|면역\s*증강/, why: HEALTH_FOOD },
  { re: /체지방\s*(감소|분해|연소)|지방\s*(분해|연소)|살\s*빠지|살이\s*빠|다이어트\s*효과|붓기\s*(제거|빠)/, why: HEALTH_FOOD, suggest: "열량 ○kcal" },
  { re: /디톡스|해독/, why: HEALTH_FOOD },
  { re: /혈관\s*(청소|건강)|혈액\s*순환\s*개선/, why: HEALTH_FOOD },
  { re: /근육\s*(생성|증가)\s*효과|근손실\s*방지/, why: HEALTH_FOOD, suggest: "단백질 ○g" },
  { re: /(의사|약사|한의사|교수|전문의)\s*(추천|인증|보증|가\s*만든)/, why: REVIEW },
  { re: /후기\s*(인증|보장)|먹고\s*\d+\s*(kg|킬로)\s*(빠|감량)/, why: REVIEW },
];

/** 문구에서 확인이 필요한 표현을 찾는다 (같은 표현은 한 번만) */
export function checkClaims(...texts: (string | null | undefined)[]): ClaimHit[] {
  const text = texts.filter(Boolean).join("\n");
  if (!text) return [];
  const out: ClaimHit[] = [];
  const seen = new Set<string>();
  for (const r of RULES) {
    const m = text.match(r.re);
    if (!m) continue;
    const phrase = m[0].trim();
    if (seen.has(phrase)) continue;
    seen.add(phrase);
    out.push({ phrase, why: r.why, suggest: r.suggest });
  }
  return out;
}
