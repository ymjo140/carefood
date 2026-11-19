import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { MAX, clean, round } from "@/lib/diary-values";
import { addDays, todayKst } from "@/lib/day";

/**
 * POST /api/community/tags/[id] { action: "approve" | "remove" | "record" } — 나를 태그한 것 하나 (태그된 사람만)
 *   approve: 승인 기다림 → 글에 보임 (pending 일 때만 한 번)
 *   remove : 글에서 내 태그 지우기 (보임·기다림 모두) — 다시 붙지 않는다(같은 글에 한 사람 한 줄)
 *   record : 같이 먹은 끼니를 내 식단에도 기록 — 글에 붙은 음식을 그 글의 날짜·끼니로 (7일 안의 글만, 한 번만).
 *            기다리던 태그면 함께 승인한다. 음식 값은 글쓴이가 기록한 값 그대로(메모에 '○○ 님 글에서 같이 먹기')
 *   조건부 update 라 두 번 눌러도 한 번만 바뀐다.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEALS = new Set(["breakfast", "lunch", "dinner", "snack"]);
const kstDay = (iso: string) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 10);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "태그를 찾지 못했어요" }, { status: 404 });
  const me = await getActorId();
  if (!me) return noActor();
  const { action } = await request.json().catch(() => ({}));
  if (action !== "approve" && action !== "remove" && action !== "record") return NextResponse.json({ error: "할 일을 골라 주세요" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const now = new Date().toISOString();

  if (action === "record") return record(sb, id, me, now);

  const q = sb.from("community_post_people").update({ status: action === "approve" ? "shown" : "removed", answered_at: now }).eq("id", id).eq("tagged_id", me);
  const { data, error } = await (action === "approve" ? q.eq("status", "pending") : q.in("status", ["shown", "pending"])).select("id, status");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: action === "approve" ? "이미 처리한 태그예요" : "이미 지운 태그예요" }, { status: 409 });
  return NextResponse.json({ ok: true, status: data[0].status });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function record(sb: any, id: string, me: string, now: string) {
  const { data: t, error } = await sb.from("community_post_people").select("id, post_id, status, recorded_at").eq("id", id).eq("tagged_id", me).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!t || t.status === "removed") return NextResponse.json({ error: "태그를 찾지 못했어요" }, { status: 404 });
  if (t.recorded_at) return NextResponse.json({ error: "이미 내 식단에 기록했어요" }, { status: 409 });
  const { data: p, error: pErr } = await sb.from("community_feed").select("id, author_nickname, meal_type, meal_data, created_at, is_active, hidden_by_reports").eq("id", t.post_id).maybeSingle();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!p || !p.is_active || p.hidden_by_reports) return NextResponse.json({ error: "볼 수 없는 글이에요" }, { status: 404 });
  const foods = (Array.isArray(p.meal_data?.foods) ? p.meal_data.foods : []).slice(0, 20) as Record<string, unknown>[];
  if (!foods.length) return NextResponse.json({ error: "기록할 음식이 없는 글이에요" }, { status: 400 });
  if (!MEALS.has(p.meal_type)) return NextResponse.json({ error: "끼니가 정해지지 않은 글이에요. 식단 탭에서 직접 기록해 주세요" }, { status: 400 });
  const date = kstDay(p.created_at);
  if (date < addDays(todayKst(), -6)) return NextResponse.json({ error: "7일이 지난 글은 기록할 수 없어요" }, { status: 400 });

  // 한 번만 — 먼저 표시하고(조건부), 기록에 실패하면 되돌린다
  const patch: Record<string, string> = { recorded_at: now };
  if (t.status === "pending") { patch.status = "shown"; patch.answered_at = now; }
  const { data: mark, error: mErr } = await sb.from("community_post_people").update(patch).eq("id", id).eq("tagged_id", me).is("recorded_at", null).neq("status", "removed").select("id");
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  if (!mark?.length) return NextResponse.json({ error: "이미 내 식단에 기록했어요" }, { status: 409 });

  const who = String(p.author_nickname || "함께 먹은 사람").slice(0, 20);
  const rows = foods.map((f) => ({
    user_id: me, date, meal_type: p.meal_type, food_name: String(f.name || "음식").slice(0, 80), serving_multiplier: 1,
    calories: round("calories", clean(f.calories, MAX.calories)), protein_g: round("protein_g", clean(f.protein_g, MAX.protein_g)),
    carbs_g: round("carbs_g", clean(f.carbs_g, MAX.carbs_g)), fat_g: round("fat_g", clean(f.fat_g, MAX.fat_g)),
    memo: `${who} 님 글에서 같이 먹기`, source: "together",
  }));
  const { error: iErr } = await sb.from("meal_diary").insert(rows);
  if (iErr) {
    const { error: back } = await sb.from("community_post_people").update({ recorded_at: null }).eq("id", id).eq("tagged_id", me);
    if (back) console.error("같이 먹기 기록 표시를 되돌리지 못했어요:", back.message);
    return NextResponse.json({ error: "내 식단에 기록하지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, recorded: rows.length, date, meal: p.meal_type, status: "shown" });
}
