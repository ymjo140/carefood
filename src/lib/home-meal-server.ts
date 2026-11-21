/** 홈 끼니 추천 · 담을 날 고르기 — 그날 목표·기록·예정 읽기 (서버 전용, 서비스 키) */
import type { DayPlan, DayRow } from "@/lib/ai-fill";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function dayState(sb: Sb, me: string, date: string) {
  const [gRes, dRes, pRes] = await Promise.all([
    sb.from("daily_nutrition_goals").select("daily_calories, daily_protein_g, max_sodium_mg").eq("user_id", me).maybeSingle(),
    sb.from("meal_diary").select("meal_type, calories, protein_g, sodium_mg, product_id").eq("user_id", me).eq("date", date).limit(500),
    sb.from("planned_meals").select("meal, foods, plan_title").eq("user_id", me).eq("date", date),
  ]);
  for (const r of [gRes, dRes, pRes]) if (r.error) throw new Error(r.error.message);
  return {
    goals: {
      kcal: Number(gRes.data?.daily_calories) || 2000,
      protein: Number(gRes.data?.daily_protein_g) || 60,
      sodium: Number(gRes.data?.max_sodium_mg) || 2000,
    },
    rows: (dRes.data || []) as (DayRow & { product_id: string | null })[],
    plans: (pRes.data || []) as (DayPlan & { plan_title: string | null; foods: { product_id?: string }[] })[],
  };
}

/** 여러 날 한 번에 — 담을 날 고르기 시트 (7일) */
export async function weekState(sb: Sb, me: string, from: string, to: string) {
  const [gRes, dRes, pRes] = await Promise.all([
    sb.from("daily_nutrition_goals").select("daily_calories, daily_protein_g, max_sodium_mg").eq("user_id", me).maybeSingle(),
    sb.from("meal_diary").select("date, meal_type, calories, protein_g, sodium_mg").eq("user_id", me).gte("date", from).lte("date", to).limit(2000),
    sb.from("planned_meals").select("date, meal, foods, plan_title").eq("user_id", me).gte("date", from).lte("date", to),
  ]);
  for (const r of [gRes, dRes, pRes]) if (r.error) throw new Error(r.error.message);
  return {
    goals: {
      kcal: Number(gRes.data?.daily_calories) || 2000,
      protein: Number(gRes.data?.daily_protein_g) || 60,
      sodium: Number(gRes.data?.max_sodium_mg) || 2000,
    },
    rows: (dRes.data || []) as (DayRow & { date: string })[],
    plans: (pRes.data || []) as (DayPlan & { date: string; plan_title: string | null })[],
  };
}
