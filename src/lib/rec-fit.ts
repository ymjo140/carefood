/**
 * 추천 점수에 같이 쓰는 잣대 — 다음 끼니(lib/next-picks)·대표 메뉴(lib/menu-pick)·캐릭터 대화(lib/chat-recs)가 같은 식을 쓴다.
 * 시험: tests/rec-fit.test.ts
 *
 * 몫 맞춤 (budgetFit): 이번 끼니 몫(kcal)에 얼마나 가까운가 0~1.
 *   몫의 90~105% 면 1. 모자란 쪽은 50% 에서 0 (덜 먹는 쪽은 조금 너그럽게), 넘는 쪽은 150% 에서 0.
 *   전에는 단백질 밀도만 봐서 몫이 667kcal 인데 200kcal 샐러드가 먼저 나왔다.
 * 나트륨은 하루 기준 (sodiumTerm · sodiumCap): 끼니 몫(남은 나트륨 ÷ 남은 끼니)을 넘는다고 빼지 않는다.
 *   빼는 것은 '이걸 먹으면 남은 끼니를 가볍게 먹어도 하루 목표를 넘는' 것뿐(상한 = 남은 나트륨 − 남은 끼니마다 400mg).
 *   몫과 상한 사이는 넘은 만큼 감점 — 한식 한 끼는 대부분 667mg(2,000 ÷ 3)을 넘어서, 몫으로 자르면 몫에 맞는 한 끼가 거의 남지 않았다.
 *   이번 끼니에 많이 먹으면 다음 끼니 몫이 그만큼 줄어든다(남은 양으로 다시 나누므로) — 하루 합계가 맞춰진다.
 *   값을 모르면 0 으로 치지 않는다 — 몫 안(+0.3)과 넘음(−) 사이(0).
 */
export function budgetFit(kcal: number | null | undefined, target: number): number {
  const k = Number(kcal);
  if (!Number.isFinite(k) || k <= 0 || !(target > 0)) return 0;
  const r = k / target;
  if (r >= 0.9 && r <= 1.05) return 1;
  if (r < 0.9) return Math.max(0, (r - 0.5) / 0.4);
  return Math.max(0, 1 - (r - 1.05) / 0.45);
}

/** 간식 몫 맞춤 — 간식은 몫(300kcal)이 '많아야 이만큼'이다. 몫의 40~105%(120~315kcal)면 1, 그보다 작으면 20%에서 0.
 *  끼니처럼 90%부터 1로 두면 300kcal 가까운 큰 것(구운란 여러 알 묶음 등)만 위로 왔다 */
export function snackFit(kcal: number | null | undefined, target: number): number {
  const k = Number(kcal);
  if (!Number.isFinite(k) || k <= 0 || !(target > 0)) return 0;
  const r = k / target;
  if (r >= 0.4 && r <= 1.05) return 1;
  if (r < 0.4) return Math.max(0, (r - 0.2) / 0.2);
  return Math.max(0, 1 - (r - 1.05) / 0.45);
}

/** 영양 값이 물리적으로 될 수 있는가 — 1회 제공량(g) 1g 에 9kcal(지방)를 넘거나, 단백질이 무게보다 많으면 표기 오류.
 *  예: 그래놀라 20g 에 273kcal(포장 전체 값을 1회분 칸에 넣은 것). 무게를 모르면 거르지 않는다 */
export function plausible(r: { calories?: number | null; protein_g?: number | null; serving_size_g?: number | null }) {
  const g = Number(r.serving_size_g);
  if (!Number.isFinite(g) || g <= 0) return true;
  return (Number(r.calories) || 0) <= g * 9.2 && (Number(r.protein_g) || 0) <= g;
}

/** 남은 끼니 하나에 남겨 둘 나트륨 (가벼운 한 끼) */
export const SODIUM_RESERVE = 400;

/** 이번 끼니 나트륨 상한 — 남은 나트륨에서 이후 끼니 몫(끼니마다 400mg)을 남긴 만큼. 몫보다 작아지지는 않는다. 간식은 500mg 까지 */
export function sodiumCap(o: { meal: string; remainSodium: number; share: number; mainLeft: number }) {
  const after = o.meal === "snack" ? Math.max(0, o.mainLeft) : Math.max(0, o.mainLeft - 1);
  const cap = Math.max(o.share, Math.round(o.remainSodium - SODIUM_RESERVE * after));
  return o.meal === "snack" ? Math.min(cap, 500) : cap;
}

/** 나트륨 점수 — 몫(share) 안이면 +0.3, 몫~상한(cap) 사이는 넘은 만큼 0 → −1.5, 상한을 넘으면 −3, 모르면 0.
 *  상한을 주지 않으면 몫의 1.6배. 몫이 없으면(0) 보지 않는다 */
export function sodiumTerm(sodium: number | null | undefined, share: number, cap?: number): number {
  if (!(share > 0)) return 0;
  if (sodium == null || !Number.isFinite(Number(sodium))) return 0;
  const na = Number(sodium);
  const top = Math.max(share + 1, cap ?? share * 1.6);
  if (na <= share) return 0.3;
  if (na > top) return -3;
  return -1.5 * ((na - share) / (top - share));
}

/** 상한 안인가 (모르는 값·몫 없음은 통과) — 후보 거르기 */
export function underCap(sodium: number | null | undefined, share: number, cap?: number) {
  if (!(share > 0)) return true;
  const na = known(sodium);
  return na == null || na <= Math.max(share, cap ?? share * 1.6);
}

/** 값을 모르면 null 로 — 0 으로 바꾸지 않는다 */
export const known = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
