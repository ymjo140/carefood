/**
 * 건강 점수(0~100) — scripts/health_score.py 를 그대로 옮긴 것. 입점 업체 제품을 반영할 때 한 개씩 계산한다.
 * 100g 당 값만 쓴다. Nutri-Score(2023) 점수표 → 등급 구간을 0~100 에 옮김. 의료 판단이 아니라 성분을 한 숫자로 줄인 것.
 * 두 쪽을 고치면 같이 고친다.
 */
type P = { name?: string; calories?: number | null; fat_g?: number | null; saturated_fat_g?: number | null; sugar_g?: number | null; sodium_mg?: number | null; fiber_g?: number | null; protein_g?: number | null };

const SWEETENER = /알룰로스|스테비아|수크랄로스|에리스리톨|아스파탐|아세설팜|말티톨|자일리톨|사카린|나한과|감미료|제로|zero|다이어트|diet/i;
const FOOD = {
  energy: [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350],
  sugar: [3.4, 6.8, 10, 14, 17, 20, 24, 27, 31, 34, 37, 41, 44, 48, 51],
  satfat: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  salt: Array.from({ length: 20 }, (_, i) => Math.round(0.2 * (i + 1) * 10) / 10),
  protein: [2.4, 4.8, 7.2, 9.6, 12, 14, 17],
  fiber: [3.0, 4.1, 5.2, 6.3, 7.4],
};
const BEVERAGE = { ...FOOD, energy: [30, 90, 150, 210, 240, 270, 300, 330, 360, 390], sugar: [0.5, 2, 3.5, 5, 6, 7, 8, 9, 10, 11], protein: [1.2, 1.5, 1.8, 2.1, 2.4, 2.7, 3.0] };
const FOOD_BANDS: [number, number, number, number][] = [[-17, 0, 100, 80], [1, 2, 79, 70], [3, 10, 69, 50], [11, 18, 49, 30], [19, 40, 29, 0]];
const BEV_BANDS: [number, number, number, number][] = [[-15, 2, 79, 70], [3, 6, 69, 50], [7, 9, 49, 30], [10, 30, 29, 0]];
const SEASONED = /볶음|덮밥|불닭|양념|돈까스|돈가스|까스|짬뽕|라면|우동|크림|소스|찌개|탕$|국$|국밥|스테이크|치즈|카레|커리|짜장|김치|불고기|제육|갈비|떡볶이|만두|피자|버거|샌드위치|햄|소시지|어묵|조림|구이|튀김|치킨|강정|마라|매운|매콤|짭짤|간장|된장|고추장/;
const UNSALTED = /곰탕|곰국|설렁탕|도가니|우족|꼬리탕|사골|백숙|삼계탕|수육/;

const pts = (v: number, t: number[]) => t.filter((x) => v > x).length;
const n = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

function nutriNs(p: P, beverage: boolean, sweetener: boolean): number | null {
  const kcal = n(p.calories);
  if (kcal === null) return null;
  const t = beverage ? BEVERAGE : FOOD;
  const fat = n(p.fat_g);
  const sat = n(p.saturated_fat_g) ?? (fat !== null ? 0.3 * fat : 0);
  const sugar = n(p.sugar_g) ?? 0;
  const salt = (n(p.sodium_mg) ?? 0) * 2.5 / 1000;
  let neg = pts(kcal * 4.184, t.energy) + pts(sugar, t.sugar) + pts(sat, t.satfat) + pts(salt, t.salt);
  const fiber = pts(n(p.fiber_g) ?? 0, t.fiber);
  let protein = pts(n(p.protein_g) ?? 0, t.protein);
  if (beverage && sweetener) neg += 4;
  if (!beverage && neg >= 11) protein = 0;
  return neg - (protein + fiber);
}

function band(ns: number, bands: [number, number, number, number][]): number {
  if (ns <= bands[0][0]) return bands[0][2];
  for (const [a, b, sa, sb] of bands) {
    if (a - 1 < ns && ns <= b) {
      if (a === b) return sa;
      const x = (Math.min(Math.max(ns, a), b) - a) / (b - a);
      return Math.round(sa + (sb - sa) * x);
    }
  }
  return 0;
}

/** role: meal·side·snack·drink. 나트륨이 빠진 간 된 요리는 null (0 으로 치면 점수가 부풀어) */
export function healthScore(p: P, role: string | null, ingredients = ""): number | null {
  if (role === "meal" || role === "side") {
    const sod = n(p.sodium_mg);
    const name = p.name || "";
    if (sod === null || (sod < 20 && SEASONED.test(name) && !UNSALTED.test(name))) return null;
  }
  const kcal = n(p.calories);
  const bev = role === "drink" && kcal !== null && kcal <= 120;
  const sweet = bev && (SWEETENER.test(p.name || "") || SWEETENER.test(ingredients));
  const ns = nutriNs(p, bev, sweet);
  if (ns === null) return null;
  if (bev) {
    if ((kcal ?? 0) <= 5 && (n(p.sugar_g) ?? 0) <= 0.5 && !sweet) return 90;
    return Math.max(0, Math.min(100, band(ns, BEV_BANDS)));
  }
  return Math.max(0, Math.min(100, band(ns, FOOD_BANDS)));
}
