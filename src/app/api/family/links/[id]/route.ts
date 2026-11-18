import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { LINK_COLS, accountActor, familyDayOk, familyToday, nicknameOf, scopesOf, type LinkRow } from "@/lib/family";
import { todayKst } from "@/lib/day";

/**
 * GET /api/family/links/[id][?date=YYYY-MM-DD] — 보는 사람의 가족 하루(식단 탭 사람 칩 · 가족 화면):
 *   확인받는 사람이 고른 것만 (끼니 기록 여부 · 이번 주 고른 제품 · 약 먹었는지 · 숫자). 연결된 보는 사람만. 고르지 않은 칸은 null.
 *   date 는 오늘부터 6일 전까지(없으면 오늘). nudge: 그날 콕 찌른 끼니 · 콕을 받는지 (표가 아직 없으면 ready:false)
 * POST /api/family/links/[id] { plan_id } — 식단 보내기: 내 식단 리스트의 식단 하나를 가족의 식단 리스트에 '가족이 보냄'으로 담는다 (연결마다 하루 5개)
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "연결을 찾지 못했어요" }, { status: 404 });
  const today = todayKst();
  const day = _req.nextUrl.searchParams.get("date") || today;
  if (!familyDayOk(day, today)) return NextResponse.json({ error: "오늘부터 6일 전까지만 볼 수 있어요" }, { status: 400 });
  const who = await accountActor();
  if ("res" in who) return who.res;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  try {
    const { data, error } = await sb.from("family_links").select(LINK_COLS).eq("id", id).eq("viewer_id", who.actor).eq("status", "active").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "연결을 찾지 못했어요" }, { status: 404 });
    const l = data as LinkRow;
    const [dayView, nudges, reqs] = await Promise.all([
      familyToday(sb, l, day),
      sb.from("family_nudges").select("meal").eq("link_id", l.id).eq("day", day),
      sb.from("family_requests").select("asks, status, granted, created_at, answered_at").eq("link_id", l.id)
        .gte("created_at", new Date(Date.now() - 7 * 86400e3).toISOString()).order("created_at", { ascending: false }).limit(1),
    ]);
    const missing = (e: { code?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205");
    if (reqs.error && !missing(reqs.error)) throw new Error(reqs.error.message);
    const nudgeReady = !nudges.error;
    if (nudges.error && nudges.error.code !== "42P01" && nudges.error.code !== "PGRST205") throw new Error(nudges.error.message);
    return NextResponse.json({
      id: l.id, label: l.label, scopes: scopesOf(l), alert_evening: l.alert_evening, alert_meds: l.alert_meds,
      today: dayView, is_today: day === today,
      // 최근 7일 안 요청 하나 (기다림·답함) — 보는 사람 화면의 '요청 보내기'·'답을 기다려요'
      request: reqs.error ? null : (reqs.data?.[0] ?? null), request_ready: !reqs.error,
      nudge: { ready: nudgeReady, allowed: l.allow_nudge && l.share_meals, sent: nudgeReady ? ((nudges.data || []) as { meal: string }[]).map((n) => n.meal) : [] },
    });
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
