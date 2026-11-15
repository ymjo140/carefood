/**
 * 캐릭터 대화의 추천 — 우리 DB(제품 products · 대표 메뉴 common_foods)에서 고른다. AI 는 고른 것을 말로 옮기기만 하고 지어내지 않는다.
 * DB 없이 계산만 (시험: tests/chat-recs.test.ts). 서버는 /api/me/buddy/chat.
 *  - 무엇을 물었나(초점): 당류 적게 · 나트륨 적게 · 단백질 많이 · 열량 낮게 · (없으면) 내 목표 → 오늘 남은 양.
 *    "혈당"·"혈압"·"살" 같은 말은 초점을 정하는 데만 쓰고, 답은 성분 사실로만 한다("당류가 적은 쪽으로 골랐어요 · 당류 2g").
 *  - 내 목표(온보딩 프로필)는 서버에서만 쓴다 — AI 에는 "내 목표에 맞춰 당류가 적은 쪽"처럼 고른 기준만 간다(질환 이름은 보내지 않는다).
 *  - 겹치지 않게: 바로 전 끼니에 먹은 것은 늘 빼고, 점심·저녁은 최근 3일(오늘·어제·그제) 점심·저녁과 같은 음식·같은 주재료를 뺀다.
 *    최근 이틀 대화에서 이미 권한 것은 뒤로 미룬다.
 *  - 입맛: 온보딩에서 고른 짠·단·고소·매운맛(1~10)과 제품 맛 단계를 견줘(lib/recommend/taste.ts) 가까울수록 앞으로.
 *  - 채식이면 고기·생선이 든 이름은 뺀다. 알레르기 단어가 든 이름도 뺀다.
 *  - 순서는 영양·입맛 기준뿐 — 광고비로 바꾸지 않는다.
 *  - 한 끼(아침·점심·저녁)는 단백질 8g 이상만 (밥 한 공기 같은 곁들이 빼기). 같은 제조사는 한 번만.
 */
import { josa, seedOf } from "@/lib/buddy";
import { daysBetween } from "@/lib/day";
import type { MealKey } from "@/lib/menu-pick";

export type FocusKey = "sugar" | "sodium" | "protein" | "light" | "budget";
export type Focus = { key: FocusKey; reason: string };

const FOCUS_RULES: { key: Exclude<FocusKey, "budget">; re: RegExp; reason: string }[] = [
  { key: "sugar", re: /혈당|당뇨|당류|설탕|단\s*거|달달|저당|당\s*(적|낮)/, reason: "당류가 적은 쪽으로 골랐어요" },
  { key: "sodium", re: /혈압|나트륨|짜지\s*않|안\s*짠|싱거|싱겁|저염|염분|국물\s*적/, reason: "나트륨이 적은 쪽으로 골랐어요" },
  { key: "protein", re: /단백질|근육|운동|헬스|벌크/, reason: "단백질이 많은 쪽으로 골랐어요" },
  { key: "light", re: /살\s*(쪄|찌|빼|빠|뺄)|다이어트|체중|가볍|가벼운|칼로리\s*(낮|적)|저칼로리|야식/, reason: "열량이 낮은 쪽으로 골랐어요" },
];
const REASON: Record<Exclude<FocusKey, "budget">, string> = Object.fromEntries(FOCUS_RULES.map((f) => [f.key, f.reason])) as Record<Exclude<FocusKey, "budget">, string>;

/** 추천을 묻는 말인가 */
export function isRecAsk(text: string) {
  return /추천|뭐\s*먹|뭘\s*먹|무엇을\s*먹|메뉴|먹을\s*(까|만한|거)|먹으면\s*(좋|될)|음식\s*(알려|좀|뭐)|골라|어떤\s*(거|음식|걸)|간식\s*(뭐|추천)/.test(text);
}

/** 내 목표(온보딩 프로필) — 서버에서만 본다 */
export type ProfileGoal = { goals?: string[] | null; conditions?: string[] | null; concerns?: string[] | null; diet_type?: string | null };

/** 말에서 초점을 못 찾으면 내 목표에서 — 그것도 없으면 오늘 남은 양 */
export function focusOf(text: string, profile?: ProfileGoal | null): Focus {
  const hit = FOCUS_RULES.find((f) => f.re.test(text));
  if (hit) return { key: hit.key, reason: hit.reason };
  const mine = profileFocus(profile);
  if (mine) return { key: mine, reason: `내 목표에 맞춰 ${REASON[mine]}` };
  return { key: "budget", reason: "오늘 남은 양에 맞춰 골랐어요" };
}

export function profileFocus(p?: ProfileGoal | null): Exclude<FocusKey, "budget"> | null {
  if (!p) return null;
  const cond = p.conditions || [], con = p.concerns || [], goals = p.goals || [];
  // 질환 체크 → 고른 건강 목표 → 식단 유형 → 관심사 순서 (먼저 걸린 것 하나)
  if (cond.includes("diabetes")) return "sugar";
  if (cond.includes("blood_pressure") || cond.includes("kidney")) return "sodium";
  if (goals.includes("weight_loss")) return "light";
  if (goals.includes("muscle")) return "protein";
  if (p.diet_type === "diet") return "light";
  if (p.diet_type === "exercise") return "protein";
  if (con.includes("weight")) return "light";
  return null;
}

/** 말에 끼니가 있으면 그 끼니 */
export function mealOfText(text: string): MealKey | null {
  if (/아침/.test(text)) return "breakfast";
  if (/점심/.test(text)) return "lunch";
  if (/저녁/.test(text)) return "dinner";
  if (/간식|야식|출출/.test(text)) return "snack";
  return null;
}

export type Cand = {
  kind: "menu" | "product"; id: string; name: string; maker: string | null; image: string | null; category: string | null;
  calories: number | null; protein_g: number | null; carbs_g: number | null; sugar_g: number | null; sodium_mg: number | null;
  /** 입맛 가까움 0~100 (모르면 null) — lib/recommend/taste.ts tasteFit */
  taste?: number | null;
  /** 입맛 이유 한 줄 ("짠맛·매운맛이 고른 입맛과 가까워요") */
  tasteWhy?: string | null;
};
export type Pick = { kind: "menu" | "product"; id: string; name: string; maker: string | null; image: string | null; facts: string; href: string | null; why?: string | null };

const n = (v: number | null | undefined) => (v == null || Number.isNaN(Number(v)) ? null : Number(v));
const fmt = (v: number) => Math.round(v).toLocaleString("ko-KR");

/** 숫자 한 줄 — 물은 초점이 맨 앞 ("당류 2g · 탄수화물 31g · 420kcal") */
export function pickFacts(c: Pick | Cand, focus: FocusKey) {
  const x = c as Cand;
  const kcal = n(x.calories), p = n(x.protein_g), s = n(x.sugar_g), na = n(x.sodium_mg), carb = n(x.carbs_g);
  const parts: Record<string, string | null> = {
    kcal: kcal != null ? `${fmt(kcal)}kcal` : null,
    p: p != null ? `단백질 ${fmt(p)}g` : null,
    s: s != null ? `당류 ${fmt(s)}g` : null,
    na: na != null ? `나트륨 ${fmt(na)}mg` : null,
    carb: carb != null ? `탄수화물 ${fmt(carb)}g` : null,
  };
  const order = focus === "sugar" ? ["s", "carb", "kcal"] : focus === "sodium" ? ["na", "p", "kcal"] : focus === "protein" ? ["p", "kcal", "na"] : ["kcal", "p", "na"];
  return order.map((k) => parts[k]).filter(Boolean).join(" · ");
}

// ── 겹치지 않게 ──
export type RecentMeal = { date: string; meal: string; food: string; productId: string | null; at?: string };

/** 이름 견주기용 — 괄호·기호·띄어쓰기 빼기 */
export const normName = (s: string) => s.replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^가-힣a-zA-Z0-9]/g, "").toLowerCase();
/** 주재료 — 이름에 같은 것이 있으면 같은 음식으로 본다 (점심·저녁 3일) */
const MAIN = ["닭가슴살", "치킨", "닭", "연어", "참치", "고등어", "갈치", "삼치", "소고기", "한우", "스테이크", "돼지", "제육", "삼겹", "족발", "보쌈", "불고기", "오리", "두부", "새우", "오징어", "주꾸미", "김치찌개", "된장", "카레", "파스타", "라면", "우동", "국수", "떡볶이", "비빔밥", "덮밥", "포케", "만두", "돈가스", "햄버거", "피자", "초밥"];
export const mainOf = (name: string) => MAIN.filter((w) => name.includes(w));

function sameFood(a: string, b: string, productA: string | null, productB: string | null, byMain: boolean) {
  if (productA && productB && productA === productB) return true;
  const x = normName(a), y = normName(b);
  if (x.length >= 2 && y.length >= 2 && (x.includes(y) || y.includes(x))) return true;
  if (!byMain) return false;
  const ma = mainOf(a);
  return ma.length > 0 && mainOf(b).some((w) => ma.includes(w));
}

/** 바로 전 끼니 — 가장 늦게 적은 기록과 같은 날·같은 끼니 */
export function lastMealOf(recent: RecentMeal[]): RecentMeal[] {
  if (!recent.length) return [];
  const last = [...recent].sort((a, z) => (a.at ?? a.date).localeCompare(z.at ?? z.date)).at(-1)!;
  return recent.filter((r) => r.date === last.date && r.meal === last.meal);
}

/** 이 후보가 최근 먹은 것과 겹치나 — 겹치는 기록을 돌려준다 */
export function repeatOf(c: Pick | Cand, recent: RecentMeal[], meal: MealKey, today: string): RecentMeal | null {
  for (const r of lastMealOf(recent)) if (sameFood(c.name, r.food, c.kind === "product" ? c.id : null, r.productId, false)) return r;
  if (meal !== "lunch" && meal !== "dinner") return null;
  for (const r of recent) {
    if (r.meal !== "lunch" && r.meal !== "dinner") continue;
    if (daysBetween(r.date, today) > 2) continue;
    if (sameFood(c.name, r.food, c.kind === "product" ? c.id : null, r.productId, true)) return r;
  }
  return null;
}

const MEAT = /고기|소고기|한우|돼지|제육|삼겹|족발|보쌈|불고기|닭|치킨|오리|햄|베이컨|소시지|스테이크|갈비|육포|연어|참치|고등어|갈치|삼치|새우|오징어|주꾸미|멸치|어묵|게맛살|굴|조개|홍합|장어/;

export type RecBudget = { meal: MealKey; kcal: number; protein: number; sodium: number; avoid: string[] };
export type RecOpts = {
  today?: string;
  /** 최근 3일 기록 (바로 전 끼니 · 점심·저녁 겹침) */
  recent?: RecentMeal[];
  /** 최근 이틀 대화에서 권한 것 (id) — 뒤로 미룬다 */
  shown?: string[];
  vegetarian?: boolean;
};

/** 고르기 — 대표 메뉴 1 + 제품 2 (모자라면 있는 쪽으로 채워 3개까지) */
export function rankRecs(cands: Cand[], focus: FocusKey, b: RecBudget, seed: string | number = 0, total = 3, o: RecOpts = {}): Pick[] {
  const snack = b.meal === "snack";
  const minKcal = snack ? 50 : 200;
  const maxKcal = Math.max(minKcal + 150, (b.kcal > 0 ? b.kcal : 500) * 1.1);
  const recent = o.recent ?? [];
  const today = o.today ?? "";
  const shown = new Set(o.shown ?? []);
  const ok = cands.filter((c) => {
    const kcal = n(c.calories);
    if (kcal == null || kcal < minKcal || kcal > maxKcal) return false;
    if (!snack && (n(c.protein_g) ?? 0) < 8) return false;
    if (b.avoid.some((w) => w && c.name.includes(w))) return false;
    if (o.vegetarian && MEAT.test(c.name)) return false;
    if ((n(c.protein_g) ?? 0) > 60) return false; // 한 번에 이보다 많으면 데이터 오류일 가능성
    if (today && repeatOf(c, recent, b.meal, today)) return false;
    if (focus === "sugar") return n(c.sugar_g) != null && n(c.sugar_g)! <= 5;
    if (focus === "sodium") return n(c.sodium_mg) != null && n(c.sodium_mg)! <= 600;
    if (focus === "protein") return (n(c.protein_g) ?? 0) >= 15;
    if (focus === "light") return kcal <= Math.min(450, maxKcal);
    return true;
  });
  const protein = (c: Cand) => n(c.protein_g) ?? 0;
  const base = (c: Cand): number => {
    const kcal = n(c.calories) || 1;
    if (focus === "sugar") return -(n(c.sugar_g) ?? 99) * 2 + protein(c) / 10;
    if (focus === "sodium") return -(n(c.sodium_mg) ?? 9999) / 100 + protein(c) / 10;
    if (focus === "protein") return protein(c) / 5;
    if (focus === "light") return (protein(c) * 4) / kcal * 5;
    const fill = b.protein > 0 ? Math.min(1, protein(c) / b.protein) : 0;
    const over = (n(c.sodium_mg) ?? 0) > b.sodium ? -1 : 0;
    return fill * 2 + (protein(c) * 4) / kcal + over;
  };
  // 입맛이 가까우면 앞으로 (0~100 → -2~+2), 최근 권한 것은 뒤로
  const score = (c: Cand) => base(c) + (c.taste != null ? (c.taste - 50) / 25 : 0) - (shown.has(c.id) ? 3 : 0);
  const sorted = [...ok].sort((a, z) => score(z) - score(a) || a.name.localeCompare(z.name));
  // 위쪽 6개 안에서 날마다 시작점을 돌린다 (매번 같은 것만 나오지 않게)
  const rotate = (list: Cand[]) => {
    const top = list.slice(0, 6);
    const s = top.length ? seedOf(seed, focus) % top.length : 0;
    return [...top.slice(s), ...top.slice(0, s), ...list.slice(6)];
  };
  const menus = rotate(sorted.filter((c) => c.kind === "menu"));
  const products = rotate(sorted.filter((c) => c.kind === "product"));
  const out: Cand[] = [];
  const makers = new Set<string>();
  const take = (c: Cand) => {
    const m = c.maker || c.id;
    if (c.kind === "product" && makers.has(m)) return false;
    // 고른 것끼리도 같은 음식·같은 주재료는 한 번만
    if (out.some((x) => sameFood(x.name, c.name, null, null, true))) return false;
    makers.add(m); out.push(c); return true;
  };
  if (menus[0]) take(menus[0]);
  for (const p of products) { if (out.length >= total) break; take(p); }
  for (const c of [...menus.slice(1), ...products]) { if (out.length >= total) break; take(c); }
  return out.map((c) => ({
    kind: c.kind, id: c.id, name: c.name, maker: c.maker, image: c.image,
    facts: pickFacts(c, focus), href: c.kind === "product" ? `/products/${c.id}` : null, why: c.tasteWhy ?? null,
  }));
}

const MEAL_LABEL: Record<string, string> = { breakfast: "아침", lunch: "점심", dinner: "저녁", snack: "간식" };

/** 겹치지 않게 고른 것을 말할 때 — 가장 가까운 점심·저녁 하나 ("어제 점심 김치찌개") */
export function avoidedNote(recent: RecentMeal[], meal: MealKey, today: string): string | null {
  const pool = meal === "lunch" || meal === "dinner"
    ? recent.filter((r) => (r.meal === "lunch" || r.meal === "dinner") && daysBetween(r.date, today) <= 2)
    : lastMealOf(recent);
  const r = [...pool].sort((a, z) => (a.at ?? a.date).localeCompare(z.at ?? z.date)).at(-1);
  if (!r) return null;
  const d = daysBetween(r.date, today);
  const when = d === 0 ? "오늘" : d === 1 ? "어제" : "그제";
  return `${when} ${MEAL_LABEL[r.meal] ?? "끼니"} ${r.food.slice(0, 16)}`;
}

/** AI 없이(또는 AI 답을 버렸을 때) 추천 한 줄 */
export function recLine(focus: Focus, meal: MealKey, picks: Pick[], avoided?: string | null) {
  const label = MEAL_LABEL[meal];
  if (!picks.length) return "지금 조건에 맞는 걸 찾지 못했어요. 끼니를 바꿔서 물어봐 주세요";
  const p = picks[0];
  const reason = avoided ? `${focus.reason.replace(/ 골랐어요$/, "")}, ${avoided}${josa(avoided, "과", "와")} 겹치지 않게 골랐어요` : focus.reason;
  return `${reason}. ${label}은 ${p.name} 어때요? ${p.facts}${picks.length > 1 ? ". 아래에 몇 가지 더 있어요" : ""}`;
}
