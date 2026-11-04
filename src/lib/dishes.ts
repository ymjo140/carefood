/**
 * 일반 메뉴(외식·직접 만든 음식) — 식약처 식품영양성분DB '음식 · 품목대표' 830여 종
 * src/data/dishes.json 은 scripts/build_dishes.py 로 다시 만든다. 값은 보통 1인분(식약처 1회 중량) 기준.
 */
import data from "@/data/dishes.json";

export type CommonFoodRow = {
  id: string;
  name: string;
  category: string;
  serving_desc: string;
  serving_size_g: number | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  sodium_mg: number | null;
  sugar_g: number | null;
  /** curated: 우리가 정리한 대표 메뉴(먹는 단위) · mfds: 식약처 음식 DB */
  source: "curated" | "mfds";
};

type Dish = { id: string; name: string; group: string; cat: string; g: number; kcal: number;
  protein_g: number | null; fat_g: number | null; carbs_g: number | null; sugar_g: number | null; sodium_mg: number | null };

const DISHES = (data as { dishes: Dish[] }).dishes;

/** 부르는 이름이 DB 이름과 다른 것 */
const SYNONYMS: Record<string, string[]> = {
  파스타: ["스파게티"], 짜장: ["자장"], 짜장면: ["자장면"], 돈까스: ["돈가스"], 돈카츠: ["돈가스"],
  커피: ["커피_"], 라떼: ["라떼", "카페라떼"], 덮밥: ["덮밥"], 국밥: ["국밥"], 치킨: ["닭", "치킨"],
};

/** "국밥_순대국밥" → "순대국밥", "김치찌개_참치" → "김치찌개 (참치)" */
export function dishLabel(name: string) {
  const [head, ...rest] = name.split("_");
  if (rest.length === 0) return head;
  const tail = rest.join(" ");
  return tail.includes(head) ? tail : `${head} (${tail})`;
}

export function searchDishes(q: string, limit = 12): CommonFoodRow[] {
  const query = q.trim().replace(/\s+/g, "");
  if (!query) return [];
  const terms = [query, ...(SYNONYMS[query] || [])];
  const scored: { d: Dish; s: number }[] = [];
  for (const d of DISHES) {
    const n = d.name.replace(/\s+/g, "");
    const label = dishLabel(d.name).replace(/\s+/g, "");
    let s = -1;
    for (const t of terms) {
      if (label === t || n === t) s = Math.max(s, 100);
      else if (label.startsWith(t) || n.startsWith(t)) s = Math.max(s, 60);
      else if (n.includes(t)) s = Math.max(s, 30);
    }
    if (s < 0) continue;
    if (d.g > 100) s += 5; // 실제 1인분 중량이 있는 것을 100g 기준보다 앞에
    scored.push({ d, s: s - n.length * 0.1 });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map(({ d }) => ({
    id: d.id,
    name: dishLabel(d.name),
    category: d.cat,
    serving_desc: d.g === 100 ? "100g" : `1인분 ${d.g}g`,
    serving_size_g: d.g,
    calories: d.kcal,
    protein_g: d.protein_g, carbs_g: d.carbs_g, fat_g: d.fat_g, sodium_mg: d.sodium_mg, sugar_g: d.sugar_g,
    source: "mfds",
  }));
}
