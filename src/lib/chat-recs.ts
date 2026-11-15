/**
 * 캐릭터 대화의 추천 — 우리 DB(제품 products · 대표 메뉴 common_foods)에서 고른다. AI 는 고른 것을 말로 옮기기만 하고 지어내지 않는다.
 * DB 없이 계산만 (시험: tests/chat-recs.test.ts). 서버는 /api/me/buddy/chat.
 *  - 무엇을 물었나(초점): 당류 적게 · 나트륨 적게 · 단백질 많이 · 열량 낮게 · (없으면) 오늘 남은 양에 맞게.
 *    "혈당"·"혈압"·"살" 같은 말은 초점을 정하는 데만 쓰고, 답은 성분 사실로만 한다("당류가 적은 쪽으로 골랐어요 · 당류 2g").
 *  - 순서는 영양 기준뿐 — 광고비로 바꾸지 않는다. 알레르기 단어가 든 이름은 미리 뺀다.
 *  - 한 끼(아침·점심·저녁)는 단백질 8g 이상만 (밥 한 공기 같은 곁들이 빼기). 같은 제조사는 한 번만.
 */
import { seedOf } from "@/lib/buddy";
import type { MealKey } from "@/lib/menu-pick";

export type FocusKey = "sugar" | "sodium" | "protein" | "light" | "budget";
export type Focus = { key: FocusKey; reason: string };

const FOCUS_RULES: { key: Exclude<FocusKey, "budget">; re: RegExp; reason: string }[] = [
  { key: "sugar", re: /혈당|당뇨|당류|설탕|단\s*거|달달|저당|당\s*(적|낮)/, reason: "당류가 적은 쪽으로 골랐어요" },
  { key: "sodium", re: /혈압|나트륨|짜지\s*않|안\s*짠|싱거|싱겁|저염|염분|국물\s*적/, reason: "나트륨이 적은 쪽으로 골랐어요" },
  { key: "protein", re: /단백질|근육|운동|헬스|벌크/, reason: "단백질이 많은 쪽으로 골랐어요" },
  { key: "light", re: /살\s*(쪄|찌|빼|빠|뺄)|다이어트|체중|가볍|가벼운|칼로리\s*(낮|적)|저칼로리|야식/, reason: "열량이 낮은 쪽으로 골랐어요" },
];

/** 추천을 묻는 말인가 */
export function isRecAsk(text: string) {
  return /추천|뭐\s*먹|뭘\s*먹|무엇을\s*먹|메뉴|먹을\s*(까|만한|거)|먹으면\s*(좋|될)|음식\s*(알려|좀|뭐)|골라|어떤\s*(거|음식|걸)|간식\s*(뭐|추천)/.test(text);
}

export function focusOf(text: string): Focus {
  const hit = FOCUS_RULES.find((f) => f.re.test(text));
  return hit ? { key: hit.key, reason: hit.reason } : { key: "budget", reason: "오늘 남은 양에 맞춰 골랐어요" };
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
};
export type Pick = { kind: "menu" | "product"; id: string; name: string; maker: string | null; image: string | null; facts: string; href: string | null };

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

export type RecBudget = { meal: MealKey; kcal: number; protein: number; sodium: number; avoid: string[] };

/** 고르기 — 대표 메뉴 1 + 제품 2 (모자라면 있는 쪽으로 채워 3개까지) */
export function rankRecs(cands: Cand[], focus: FocusKey, b: RecBudget, seed: string | number = 0, total = 3): Pick[] {
  const snack = b.meal === "snack";
  const minKcal = snack ? 50 : 200;
  const maxKcal = Math.max(minKcal + 150, (b.kcal > 0 ? b.kcal : 500) * 1.1);
  const ok = cands.filter((c) => {
    const kcal = n(c.calories);
    if (kcal == null || kcal < minKcal || kcal > maxKcal) return false;
    if (!snack && (n(c.protein_g) ?? 0) < 8) return false;
    if (b.avoid.some((w) => w && c.name.includes(w))) return false;
    if ((n(c.protein_g) ?? 0) > 60) return false; // 한 번에 이보다 많으면 데이터 오류일 가능성
    if (focus === "sugar") return n(c.sugar_g) != null && n(c.sugar_g)! <= 5;
    if (focus === "sodium") return n(c.sodium_mg) != null && n(c.sodium_mg)! <= 600;
    if (focus === "protein") return (n(c.protein_g) ?? 0) >= 15;
    if (focus === "light") return kcal <= Math.min(450, maxKcal);
    return true;
  });
  const protein = (c: Cand) => n(c.protein_g) ?? 0;
  const score = (c: Cand): number => {
    const kcal = n(c.calories) || 1;
    if (focus === "sugar") return -(n(c.sugar_g) ?? 99) * 2 + protein(c) / 10;
    if (focus === "sodium") return -(n(c.sodium_mg) ?? 9999) / 100 + protein(c) / 10;
    if (focus === "protein") return protein(c);
    if (focus === "light") return (protein(c) * 4) / kcal;
    const fill = b.protein > 0 ? Math.min(1, protein(c) / b.protein) : 0;
    const over = (n(c.sodium_mg) ?? 0) > b.sodium ? -1 : 0;
    return fill * 2 + (protein(c) * 4) / kcal + over;
  };
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
    if (out.some((o) => o.name === c.name)) return false;
    makers.add(m); out.push(c); return true;
  };
  if (menus[0]) take(menus[0]);
  for (const p of products) { if (out.length >= total) break; take(p); }
  for (const c of [...menus.slice(1), ...products]) { if (out.length >= total) break; take(c); }
  return out.map((c) => ({
    kind: c.kind, id: c.id, name: c.name, maker: c.maker, image: c.image,
    facts: pickFacts(c, focus), href: c.kind === "product" ? `/products/${c.id}` : null,
  }));
}

/** AI 없이(또는 AI 답을 버렸을 때) 추천 한 줄 */
export function recLine(focus: Focus, meal: MealKey, picks: Pick[]) {
  const label = { breakfast: "아침", lunch: "점심", dinner: "저녁", snack: "간식" }[meal];
  if (!picks.length) return "지금 조건에 맞는 걸 찾지 못했어요. 끼니를 바꿔서 물어봐 주세요";
  const p = picks[0];
  return `${focus.reason}. ${label}은 ${p.name} 어때요? ${p.facts}${picks.length > 1 ? ". 아래에 몇 가지 더 있어요" : ""}`;
}
