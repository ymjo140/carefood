/**
 * 가족·친구 오늘 끼니에 음식을 예정으로 넣기 — 서버 전용.
 *   /api/family/links/[id]/send(추천 보내기)와 /api/family/links/[id]/together(같이 먹기)가 같은 규칙을 쓴다.
 *   · 음식 값은 서버가 다시 읽는다(대표 메뉴 common_foods · 제품 1회 제공량) — 화면이 보낸 숫자는 쓰지 않는다.
 *   · 받는 사람이 이미 기록한 끼니, 직접 담아 둔 계획, 다른 사람이 보낸 예정은 덮어쓰지 않는다. 보낸 사람마다 하루 5번.
 *   · 내가 보낸 예정만 바꾸고, 없으면 새로 넣되 그사이 겹치면(unique) 멈춘다.
 */
import { perServing } from "@/lib/nutrition";
import { cleanPlanFoods } from "@/lib/planned-meals";
import type { PlanFood } from "@/lib/weekly-plan";
import { josa } from "@/lib/buddy";
import type { FamilyMeal } from "@/lib/family";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type SendFail = { error: string; status: number };

export function sendInput(body: Record<string, unknown>): { kind: "menu" | "product"; ref: string; note: string | null } | null {
  const kind = body.kind;
  const ref = typeof body.ref === "string" || typeof body.ref === "number" ? String(body.ref).slice(0, 64) : "";
  if ((kind !== "menu" && kind !== "product") || !ref || (kind === "product" && !UUID.test(ref))) return null;
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().replace(/\s+/g, " ").slice(0, 60) : null;
  return { kind, ref, note };
}

/** 보낼 음식 한 가지 — 서버에서 값을 읽어 예정 칸 모양으로 */
export async function planFoodOf(sb: Sb, kind: "menu" | "product", ref: string): Promise<{ foods: PlanFood[] } | SendFail> {
  let food: Record<string, unknown>;
  if (kind === "menu") {
    const { data: m, error } = await sb.from("common_foods").select("id, name, calories, protein_g, carbs_g, fat_g, sodium_mg").eq("id", ref).maybeSingle();
    if (error) throw new Error(error.message);
    if (!m) return { error: "음식을 찾지 못했어요", status: 404 };
    food = { name: m.name, calories: m.calories, protein_g: m.protein_g, carbs_g: m.carbs_g, fat_g: m.fat_g, sodium_mg: m.sodium_mg, type: "eating_out" };
  } else {
    const { data: p, error } = await sb.from("products")
      .select("id, name, calories, protein_g, carbs_g, fat_g, sodium_mg, serving_size_g, nutrient_base_g").eq("id", ref).eq("is_purchasable", true).maybeSingle();
    if (error) throw new Error(error.message);
    if (!p) return { error: "지금 살 수 있는 제품이 아니에요", status: 404 };
    const s = perServing(p);
    food = { product_id: p.id, name: p.name, calories: s.calories, protein_g: s.protein_g, carbs_g: s.carbs_g, fat_g: s.fat_g, sodium_mg: s.sodium_mg, type: "product" };
  }
  const foods = cleanPlanFoods([food]);
  if (!foods.length) return { error: "음식을 담지 못했어요", status: 400 };
  return { foods };
}

/** 받는 사람(owner) 오늘 그 끼니에 예정으로 넣기. label 은 보는 사람이 부르는 이름, word 는 '가족'·'친구' */
export async function sendPlanTo(sb: Sb, x: {
  owner: string; sender: string; senderName: string; label: string; word: string; meal: FamilyMeal; foods: PlanFood[]; note: string | null; today: string;
}): Promise<{ ok: true } | SendFail> {
  const [{ count: ate, error: dErr }, { data: cur, error: pErr }, { count: sent, error: sErr }] = await Promise.all([
    sb.from("meal_diary").select("id", { count: "exact", head: true }).eq("user_id", x.owner).eq("date", x.today).eq("meal_type", x.meal),
    sb.from("planned_meals").select("id, sent_by").eq("user_id", x.owner).eq("date", x.today).eq("meal", x.meal).maybeSingle(),
    sb.from("planned_meals").select("id", { count: "exact", head: true }).eq("user_id", x.owner).eq("sent_by", x.sender).gte("created_at", new Date(Date.now() - 86400e3).toISOString()),
  ]);
  for (const e of [dErr, pErr, sErr]) if (e) throw new Error(e.message);
  if ((ate || 0) > 0) return { error: `${x.label}${josa(x.label, "이", "가")} 이미 기록한 끼니예요`, status: 409 };
  if (cur && !cur.sent_by) return { error: `${x.label}${josa(x.label, "이", "가")} 직접 담아 둔 계획이 있는 끼니예요`, status: 409 };
  if (cur && cur.sent_by !== x.sender) return { error: `다른 ${x.word}${josa(x.word, "이", "가")} 이미 보낸 끼니예요`, status: 409 };
  if ((sent || 0) >= 5) return { error: "오늘은 5번까지 보낼 수 있어요", status: 429 };
  const name = x.senderName.slice(0, 20);
  if (cur) {
    const { data: up, error } = await sb.from("planned_meals").update({ foods: x.foods, note: x.note, sent_name: name }).eq("id", cur.id).eq("sent_by", x.sender).select("id");
    if (error) throw new Error(error.message);
    if (!up?.length) return { error: "그사이 계획이 바뀌었어요. 다시 불러와 주세요", status: 409 };
  } else {
    const { error } = await sb.from("planned_meals").insert({ user_id: x.owner, date: x.today, meal: x.meal, foods: x.foods, plan_title: null, sent_by: x.sender, sent_name: name, note: x.note });
    if (error) {
      if (error.code === "23505") return { error: "그사이 계획이 담긴 끼니예요. 다시 불러와 주세요", status: 409 };
      throw new Error(error.message);
    }
  }
  return { ok: true };
}
