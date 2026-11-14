import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { LINK_COLS, accountActor, familyToday, nicknameOf, scopesOf, type LinkRow } from "@/lib/family";

/**
 * GET /api/family/links/[id] — 보는 사람의 가족 화면: 확인받는 사람이 고른 것만 (끼니 기록 여부 · 이번 주 고른 제품 · 약 먹었는지 · 숫자)
 *   연결된 보는 사람만. 고르지 않은 칸은 null.
 * POST /api/family/links/[id] { plan_id } — 식단 보내기: 내 식단 리스트의 식단 하나를 가족의 식단 리스트에 '가족이 보냄'으로 담는다 (연결마다 하루 5개)
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "연결을 찾지 못했어요" }, { status: 404 });
  const who = await accountActor();
  if ("res" in who) return who.res;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  try {
    const { data, error } = await sb.from("family_links").select(LINK_COLS).eq("id", id).eq("viewer_id", who.actor).eq("status", "active").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "연결을 찾지 못했어요" }, { status: 404 });
    const l = data as LinkRow;
    return NextResponse.json({ id: l.id, label: l.label, scopes: scopesOf(l), alert_evening: l.alert_evening, today: await familyToday(sb, l) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "연결을 찾지 못했어요" }, { status: 404 });
  const who = await accountActor();
  if ("res" in who) return who.res;
  const { plan_id } = await request.json().catch(() => ({}));
  if (typeof plan_id !== "string" || !UUID.test(plan_id)) return NextResponse.json({ error: "보낼 식단을 골라 주세요" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  try {
    const { data: l, error } = await sb.from("family_links").select("id, owner_id, label").eq("id", id).eq("viewer_id", who.actor).eq("status", "active").maybeSingle();
    if (error) throw new Error(error.message);
    if (!l) return NextResponse.json({ error: "연결을 찾지 못했어요" }, { status: 404 });
    const { data: plan, error: pErr } = await sb.from("saved_meal_plans")
      .select("title, grid, total_price, avg_daily_calories, avg_daily_protein, product_count, eating_out_count")
      .eq("id", plan_id).eq("user_id", who.actor).eq("is_active", true).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!plan) return NextResponse.json({ error: "식단을 찾지 못했어요" }, { status: 404 });
    const { count, error: cErr } = await sb.from("saved_meal_plans").select("id", { count: "exact", head: true })
      .eq("user_id", l.owner_id).eq("source", "family").gte("created_at", new Date(Date.now() - 86400e3).toISOString());
    if (cErr) throw new Error(cErr.message);
    if ((count || 0) >= 5) return NextResponse.json({ error: "오늘은 식단을 5개까지 보낼 수 있어요" }, { status: 429 });
    const from = await nicknameOf(sb, who.actor);
    const { error: iErr } = await sb.from("saved_meal_plans").insert({
      user_id: l.owner_id, title: String(plan.title || "식단").slice(0, 60), grid: plan.grid,
      tags: ["가족이 보냄", ...(from ? [from] : [])], total_price: plan.total_price || 0, avg_daily_calories: plan.avg_daily_calories || 0,
      avg_daily_protein: plan.avg_daily_protein || 0, product_count: plan.product_count || 0, eating_out_count: plan.eating_out_count || 0, source: "family",
    });
    if (iErr) throw new Error(iErr.message);
    return NextResponse.json({ ok: true, label: l.label });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
