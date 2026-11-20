import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { accountActor, isFamilyMeal } from "@/lib/family";
import { loadNextPicks, personMealBudget } from "@/lib/next-picks";
import { loadPrices } from "@/lib/recommend/query-builder";
import { seedOf } from "@/lib/buddy";
import { todayKst } from "@/lib/day";

/**
 * GET /api/family/links/[id]/picks?meal=dinner — 보는 사람이 가족에게 보낼 끼니 후보 (식단 탭 가족 하루 보기 '추천 보내기')
 *   가족(확인받는 사람)의 오늘 남은 열량·단백질·나트륨과 알레르기로 고른다 — 내 '다음 끼니'와 같은 규칙(lib/next-picks).
 *   보는 사람에게는 후보와 성분 숫자만 — 가족의 목표·남은 양·알레르기는 내보내지 않는다.
 *   일반 메뉴 3개(집밥·외식) + 살 수 있는 제품 3개. 순서는 영양 기준뿐.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "연결을 찾지 못했어요" }, { status: 404 });
  const meal = request.nextUrl.searchParams.get("meal");
  if (!isFamilyMeal(meal)) return NextResponse.json({ error: "끼니를 골라 주세요" }, { status: 400 });
  const who = await accountActor();
  if ("res" in who) return who.res;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const today = todayKst();
  try {
    const { data: l, error } = await sb.from("family_links").select("id, owner_id").eq("id", id).eq("viewer_id", who.actor).eq("status", "active").maybeSingle();
    if (error) throw new Error(error.message);
    if (!l) return NextResponse.json({ error: "연결을 찾지 못했어요" }, { status: 404 });
    const owner = l.owner_id as string;
    const budget = await personMealBudget(sb, owner, meal, today);
    const { menus, items } = await loadNextPicks(sb, owner, { meal, kcal: budget.kcal, protein: budget.protein, sodium: budget.sodium, menus: 3, seed: seedOf(owner, today, meal) });
    const prices = await loadPrices(sb, items.map((i) => i.id));
    return NextResponse.json({
      menus: menus.map((m) => ({ id: m.id, name: m.name, category: m.category, serving_desc: m.serving_desc, calories: Math.round(Number(m.calories) || 0), protein_g: Math.round(Number(m.protein_g) || 0), sodium_mg: m.sodium_mg == null ? null : Math.round(Number(m.sodium_mg)) })),
      items: items.map((i) => {
        const ps = (prices[i.id] || []).filter((p) => p.price > 0);
        return { id: i.id, name: i.name, image_url: i.image_url || ps.find((p) => p.image_url)?.image_url || null, calories: i.calories, protein_g: Math.round(i.protein_g), sodium_mg: i.sodium_mg, price: ps.length ? Math.min(...ps.map((p) => p.price)) : null };
      }).filter((i) => i.price !== null),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
