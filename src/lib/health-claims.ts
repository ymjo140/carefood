/**
 * 효능 표현 거르기 — 진행자가 쓰는 공구 이야기처럼 여러 사람에게 파는 글에서.
 * 일반 식품에 질병 예방·치료 효능을 붙이면 식품 표시·광고 규정에 걸리고, 우리 원칙(의료 표현 금지)에도 어긋난다.
 * 완벽한 걸름은 아니다 — 걸리면 그 말을 알려 주고 고쳐 쓰게 한다. 신고 사유 '근거 없는 의료·효능 주장'이 뒤를 받친다.
 */
const PATTERNS: { re: RegExp; word: string }[] = [
  { re: /치료/, word: "치료" },
  { re: /완치/, word: "완치" },
  { re: /처방/, word: "처방" },
  { re: /예방/, word: "예방" },
  { re: /(병|증상|염증)이?\s*(나아|낫)/, word: "병이 나아요" },
  { re: /혈당[이을]?\s*(내려|낮춰|떨어|잡|조절)/, word: "혈당" },
  { re: /혈압[이을]?\s*(내려|낮춰|떨어|잡|조절)/, word: "혈압" },
  { re: /콜레스테롤[이을]?\s*(내려|낮춰|떨어|잡)/, word: "콜레스테롤" },
  { re: /(당뇨|고혈압|암|비만|변비|아토피)(에|에도)?\s*(좋|효과|도움)/, word: "질병에 좋아요" },
  { re: /면역력/, word: "면역력" },
  { re: /(해독|디톡스)/, word: "해독" },
  { re: /살[이]?\s*(빠져|빠지|빼줘|빼 줘)/, word: "살이 빠져요" },
];

/** 걸린 말 하나 (없으면 null) */
export function findHealthClaim(text: string | null | undefined): string | null {
  const t = (text || "").replace(/\s+/g, " ");
  for (const p of PATTERNS) if (p.re.test(t)) return p.word;
  return null;
}
