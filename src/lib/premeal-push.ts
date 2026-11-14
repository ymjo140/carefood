/**
 * 먹기 전 알림 — 점심 전(11시대) · 저녁 전(17시대), 같이 다니는 재료 캐릭터가 오늘 남은 영양 기준으로 메뉴 하나를 권한다.
 * 기획: Claude Doc '오늘끼록 캐릭터 기획' 기능 1 · 알림 규칙.
 *  - 받는 사람: 끼니 알림을 켰고(meals), 캐릭터를 보이게 두고 같이 다니는 캐릭터가 있고, 최근 2주 안에 기록한 사람.
 *  - 그 끼니를 이미 기록했으면 보내지 않는다. 캐릭터·끼니 알림은 하루 3개까지.
 *  - 메뉴는 대표 메뉴(common_foods)에서만 — 파는 물건이 아니라 광고가 아니다(끼니 알림 설정을 따른다). 매 끼니 추천(recs)이 없으면 메뉴 없이 부르기만.
 *  - 먹은 뒤 알림(13~15시 · 20~22시, 그 끼니 기록이 없을 때)은 /api/push/run 의 기존 끼니 알림이 맡는다.
 */
import type { PushPayload } from "@/lib/push";
import { mealBudget, menuFacts, pickMenus, type Menu } from "@/lib/menu-pick";
import { addDays } from "@/lib/day";

export const PRE_MEAL_HOURS = { lunch: 11, dinner: 17 } as const;
export const DAILY_CAP = 3;
type Slot = keyof typeof PRE_MEAL_HOURS;

export function preSlotOf(hour: number): Slot | null {
  return hour === PRE_MEAL_HOURS.lunch ? "lunch" : hour === PRE_MEAL_HOURS.dinner ? "dinner" : null;
}

type Row = { date: string; meal_type: string | null; calories: number | null; protein_g: number | null; sodium_mg: number | null };

export function planPreMeal(o: {
  slot: Slot; today: string; rows: Row[]; goals: { kcal: number; protein: number; sodium: number };
  foods: Menu[]; avoid: string[]; name: string; sentToday: number; seed: number; recs: boolean;
}): { key: string; payload: PushPayload } | null {
  const { slot, today } = o;
  if (o.sentToday >= DAILY_CAP) return null;
  if (!o.rows.length) return null; // 최근 2주 기록이 없으면 '부르기'는 다른 알림이 맡는다
  const todayRows = o.rows.filter((r) => r.date === today);
  if (todayRows.some((r) => r.meal_type === slot)) return null;
  const sum = (f: "calories" | "protein_g" | "sodium_mg") => todayRows.reduce((a, r) => a + (Number(r[f]) || 0), 0);
  const label = slot === "lunch" ? "점심" : "저녁";
  const left = slot === "lunch" ? 2 : 1;
  const b = mealBudget({
    meal: slot, mainLeft: left, goalKcal: o.goals.kcal,
    remainKcal: o.goals.kcal - sum("calories"), remainProtein: o.goals.protein - sum("protein_g"), remainSodium: o.goals.sodium - sum("sodium_mg"),
  });
  const menu = o.recs ? pickMenus(o.foods, { meal: slot, ...b, avoid: o.avoid }, 1, o.seed)[0] : undefined;
  const lead = todayRows.length ? `오늘 단백질 ${Math.round(sum("protein_g"))}g 기록했어요.` : "오늘 첫 끼예요.";
  const body = menu ? `${lead} ${label}은 ${menu.name} 어때요? ${menuFacts(menu)}` : `${lead} ${label} 먹고 같이 적어요`;
  return { key: `pre:${today}:${slot}`, payload: { title: `${o.name} · ${label} 시간이에요`, body, url: "/diary", tag: "meal" } };
}

/**
 * 오늘 이 사람에게 이미 보낸 캐릭터·끼니 알림 수 (push_log 열쇠에 날짜가 들어 있다).
 * 끼니 알림 열쇠는 오늘 날짜(`2026-11-15:lunch`, `pre:2026-11-15:dinner`), 삐짐 알림은 빠진 날(`sulk:어제`, `away:사흘 전`)이라 그 날짜로 센다.
 */
export function sentTodayCount(logged: Set<string>, user: string, today: string) {
  const sulk = `${user}|mascot|sulk:${addDays(today, -1)}`, away = `${user}|mascot|away:${addDays(today, -3)}`;
  let n = 0;
  for (const k of logged) if ((k.startsWith(`${user}|meal|`) && k.includes(today)) || k === sulk || k === away) n++;
  return n;
}
