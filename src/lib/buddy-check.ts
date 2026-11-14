/**
 * 기록 직후 숫자 체크 — 오늘 합계를 '내 목표'와 견줘 사실만 한두 줄 (구독 기능 check, 체험 기간엔 모두).
 * 기준은 사용자가 정한 목표(daily_nutrition_goals)뿐. 많다·적다를 평가하지 않고, 효능을 말하지 않는다.
 *  1줄: 단백질 — "단백질 38g · 하루 목표의 50%"
 *  2줄: 나트륨이 내 기준의 70%를 넘었으면 나트륨, 아니면 남은 열량
 */
export type DayTotals = { kcal: number; protein: number; sodium: number };
export type DayGoals = { kcal: number; protein: number; sodium: number };

const n = (v: number) => Math.round(v).toLocaleString("ko-KR");

export function checkLines(t: DayTotals, g: DayGoals): string[] {
  const out: string[] = [];
  if (g.protein > 0) out.push(`단백질 ${n(t.protein)}g · 하루 목표의 ${Math.round((t.protein / g.protein) * 100)}%`);
  if (g.sodium > 0 && t.sodium >= g.sodium * 0.7) {
    out.push(t.sodium > g.sodium
      ? `나트륨 ${n(t.sodium)}mg · 내 기준 ${n(g.sodium)}mg보다 ${n(t.sodium - g.sodium)}mg 더 기록됐어요`
      : `나트륨 ${n(t.sodium)}mg · 내 기준까지 ${n(g.sodium - t.sodium)}mg 남았어요`);
  } else if (g.kcal > 0) {
    out.push(t.kcal < g.kcal ? `남은 열량 ${n(g.kcal - t.kcal)}kcal` : `오늘 ${n(t.kcal)}kcal 기록했어요`);
  }
  return out;
}
