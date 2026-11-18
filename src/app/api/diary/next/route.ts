import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { budgetReason, type MealKey } from "@/lib/menu-pick";
import { PICK_MEALS, loadNextPicks } from "@/lib/next-picks";
import { seedOf } from "@/lib/buddy";
import { loadAccess } from "@/lib/subscription";
import { hasPerk } from "@/lib/plans";
import { todayKst } from "@/lib/day";

/**
 * GET /api/diary/next?meal=dinner&kcal=650&protein=25&sodium=800&exclude=id,id
 * 기록 직후 '다음 끼니' — 일반 메뉴 2개(대표 메뉴 common_foods, lib/menu-pick.ts) + 제품 1개(메뉴가 없으면 제품 3개).
 * 오늘 남은 칼로리·단백질·나트륨에 맞춰 (1회 제공량 기준). 순서는 영양 기준뿐 — 광고비로 바꾸지 않는다.
 * 구독을 연 뒤 매 끼니 추천(recs)이 없는 무료는 메뉴 1개 + 제품 1개.
 * 남은 값 계산은 화면이 이미 가진 오늘 합계·목표로 한다. 알레르기는 서버의 내 프로필로 거른다.
 * "성분 정보 + 통계적 매칭" — 처방이 아니다.
 */
export async function GET(request: NextRequest) {
  await connection();
  const me = await getActorId();
  if (!me) return noActor();

  const sp = request.nextUrl.searchParams;
  const meal = sp.get("meal") || "dinner";
  if (!PICK_MEALS.has(meal)) return NextResponse.json({ error: "meal 이 올바르지 않아요" }, { status: 400 });
  const kcal = Math.max(0, Number(sp.get("kcal")) || 0);
  const protein = Math.max(0, Number(sp.get("protein")) || 0);
  const sodium = Math.max(0, Number(sp.get("sodium")) || 0);
  const exclude = new Set((sp.get("exclude") || "").split(",").filter(Boolean));

  // 남은 칼로리가 거의 없으면 제안하지 않는다
  if (kcal < 120) return NextResponse.json({ items: [], menus: [], reason: null });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  let access, menus, items;
  try {
    access = await loadAccess(sb, me);
    const recs = hasPerk(access, "recs");
    ({ menus, items } = await loadNextPicks(sb, me, { meal: meal as MealKey, kcal, protein, sodium, exclude, menus: recs ? 2 : 1, seed: seedOf(me, todayKst(), meal) }));
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  return NextResponse.json({
    menus, items: menus.length ? items.slice(0, 1) : items,
    reason: budgetReason({ kcal, protein, sodium }),
  });
}
