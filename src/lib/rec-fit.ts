/**
 * 추천 점수에 같이 쓰는 잣대 — 다음 끼니(lib/next-picks)·대표 메뉴(lib/menu-pick)·캐릭터 대화(lib/chat-recs)가 같은 식을 쓴다.
 * 시험: tests/rec-fit.test.ts
 *
 * 몫 맞춤 (budgetFit): 이번 끼니 몫(kcal)에 얼마나 가까운가 0~1.
 *   몫의 90~105% 면 1. 모자란 쪽은 50% 에서 0 (덜 먹는 쪽은 조금 너그럽게), 넘는 쪽은 150% 에서 0.
 *   전에는 단백질 밀도만 봐서 몫이 667kcal 인데 200kcal 샐러드가 먼저 나왔다.
 * 나트륨 (sodiumTerm): 값을 모르면 0 으로 치지 않는다 — 아는 것 중 몫 안이면 +, 넘으면 −, 모르면 그 사이(0).
 */
export function budgetFit(kcal: number | null | undefined, target: number): number {
  const k = Number(kcal);
  if (!Number.isFinite(k) || k <= 0 || !(target > 0)) return 0;
  const r = k / target;
  if (r >= 0.9 && r <= 1.05) return 1;
  if (r < 0.9) return Math.max(0, (r - 0.5) / 0.4);
  return Math.max(0, 1 - (r - 1.05) / 0.45);
}

/** 나트륨 점수 — 몫(budget, mg) 안이면 +0.3, 넘으면 −1, 모르면 0. 몫이 없으면(0) 보지 않는다 */
export function sodiumTerm(sodium: number | null | undefined, budget: number): number {
  if (!(budget > 0)) return 0;
  if (sodium == null || !Number.isFinite(Number(sodium))) return 0;
  return Number(sodium) <= budget ? 0.3 : -1;
}

/** 값을 모르면 null 로 — 0 으로 바꾸지 않는다 */
export const known = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
