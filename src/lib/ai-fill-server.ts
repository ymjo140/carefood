import { AI_PLAN_TITLE } from "@/lib/ai-fill";
import type { PlanFood } from "@/lib/weekly-plan";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * 'AI 추천'로 고른 음식을 그날 그 끼니의 예정으로 담는다 (서버 전용, 시험: tests/ai-fill.test.ts).
 *  - 예정이 없던 끼니: 새로 넣는다. 그 사이 누가 먼저 담았으면(고유 키 user_id·date·meal) 덮지 않는다.
 *  - 'AI 추천' 예정이 있던 끼니(다른 추천): 그 줄이 아직 'AI 추천'일 때만 바꾼다 — 그 사이 식단 불러오기·가족이 보낸 계획으로 바뀌었으면 덮지 않는다.
 * → "ok" | "conflict"
 */
export async function saveAiPlan(sb: Sb, me: string, date: string, meal: string, foods: PlanFood[], hadAiPlan: boolean): Promise<"ok" | "conflict"> {
  if (hadAiPlan) {
    const { data, error } = await sb.from("planned_meals").update({ foods })
      .eq("user_id", me).eq("date", date).eq("meal", meal).eq("plan_title", AI_PLAN_TITLE).select("meal");
    if (error) throw new Error(error.message);
    return data?.length ? "ok" : "conflict";
  }
  const { error } = await sb.from("planned_meals")
    .insert({ user_id: me, date, meal, foods, plan_title: AI_PLAN_TITLE, sent_by: null, sent_name: null, note: null });
  if (error?.code === "23505") return "conflict";
  if (error) throw new Error(error.message);
  return "ok";
}
