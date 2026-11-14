import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { loadTodayMood, prefsOf } from "@/lib/mascot-facts";
import { loadBuddyState, openWrap } from "@/lib/buddy-server";
import { loadAccess } from "@/lib/subscription";
import { PLANS, cheapestPlanFor } from "@/lib/plans";
import { josa } from "@/lib/buddy";

/**
 * GET  /api/me/buddy — 내 재료 캐릭터: 같이 다니는 캐릭터 · 키우는 캐릭터들 · 아직 안 푼 보자기 · 지금 표정과 한 줄 · 요금제
 *      (부를 때 받을 보자기가 있으면 넣는다: 가입 · 연속 30일 · 시즌 참여). 내 기록으로만 정하고 다른 사람에게 보이지 않는다.
 * POST { action: "open", wrap_id } — 보자기 풀기 (재료·성격 랜덤, 한 번만). 키울 수 있는 칸이 다 찼으면 403.
 * POST { action: "activate", buddy_id } — 같이 다닐 캐릭터 바꾸기
 * 규칙은 lib/buddy.ts · lib/buddy-lines.ts · lib/plans.ts
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const UUID = /^[0-9a-f-]{36}$/i;

export async function GET() {
  await connection();
  const actor = await getActorId();
  if (!actor) return noActor();
  const sb = createServiceRoleClient() as Sb;
  try {
    const [prefs, t, access] = await Promise.all([prefsOf(sb, actor), loadTodayMood(sb, actor), loadAccess(sb, actor)]);
    const state = await loadBuddyState(sb, actor, t, access);
    return NextResponse.json({
      on: prefs.kind !== "none", mood: t.state.mood, streak: t.streak, meals: t.meals, ...state, access, plans: PLANS,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const body = await request.json().catch(() => ({}));
  const sb = createServiceRoleClient() as Sb;
  try {
    if (body?.action === "open") {
      if (!UUID.test(String(body.wrap_id || ""))) return NextResponse.json({ error: "보자기를 찾지 못했어요" }, { status: 400 });
      const access = await loadAccess(sb, actor);
      const { count, error: cErr } = await sb.from("buddies").select("id", { count: "exact", head: true }).eq("user_id", actor);
      if (cErr) throw new Error(cErr.message);
      if ((count ?? 0) >= access.slots) {
        const plus = PLANS.find((p) => p.slots > access.slots) ?? cheapestPlanFor("closet");
        return NextResponse.json({ error: `캐릭터 칸이 다 찼어요. ${plus.name}${josa(plus.name, "이면", "면")} ${plus.slots}마리까지 키울 수 있어요`, plan: plus.code }, { status: 403 });
      }
      const r = await openWrap(sb, actor, String(body.wrap_id));
      if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
      return NextResponse.json(r);
    }
    if (body?.action === "activate") {
      if (!UUID.test(String(body.buddy_id || ""))) return NextResponse.json({ error: "캐릭터를 찾지 못했어요" }, { status: 400 });
      const { error } = await sb.rpc("buddy_activate", { p_user: actor, p_buddy: String(body.buddy_id) });
      if (error) {
        if (error.code === "P0001") return NextResponse.json({ error: error.message }, { status: 404 });
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "할 수 없는 요청이에요" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
