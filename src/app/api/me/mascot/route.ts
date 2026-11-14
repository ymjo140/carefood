import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { cleanPrefs, lineOf } from "@/lib/mascot";
import { loadTodayMood, prefsOf } from "@/lib/mascot-facts";

/**
 * GET  /api/me/mascot — 캐릭터 켜기/끄기 설정 + 지금 표정·한 줄 (내 기록으로만 정한다, 다른 사람에게 보이지 않는다)
 * PATCH { kind } — 'none' 이면 캐릭터 없이(글자로만), 아니면 캐릭터와 같이. 재료 캐릭터 자체는 /api/me/buddy.
 * 규칙은 lib/mascot.ts
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
export async function GET() {
  await connection();
  const actor = await getActorId();
  if (!actor) return noActor();
  const sb = createServiceRoleClient() as Sb;
  try {
    const [prefs, t] = await Promise.all([prefsOf(sb, actor), loadTodayMood(sb, actor)]);
    const kind = prefs.kind === "none" ? null : prefs.kind;
    return NextResponse.json({
      prefs, mood: t.state.mood, welcome_back: t.state.welcomeBack, streak: t.streak, meals: t.meals,
      line: kind ? lineOf(kind, t.state, { streak: t.streak, meals: t.meals }) : null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const body = await request.json().catch(() => ({}));
  const sb = createServiceRoleClient() as Sb;
  try {
    const next = cleanPrefs(body || {}, await prefsOf(sb, actor));
    const { error } = await sb.from("notification_prefs").upsert({
      user_id: actor, mascot: next.kind, mascot_sulk: next.sulk, mascot_moods: next.moods, simple_mode: next.simple, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return NextResponse.json({ prefs: next });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
