import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { LINK_COLS, MEAL_LABEL, accountActor, isFamilyMeal, nicknameOf, nudgeBlock, type LinkRow } from "@/lib/family";
import { kstMinutes } from "@/lib/family-alerts";
import { todayKst } from "@/lib/day";
import { userPusher } from "@/lib/push";

/**
 * POST /api/family/links/[id]/nudge { meal } — 콕 찌르기: 보는 사람이 가족의 오늘 아직 기록 안 한 끼니를 한 번 알린다.
 *   보는 사람만 · 끼니 기록 여부를 보여 주는 연결 · 가족이 콕 받기를 켰을 때 · 연결·날짜·끼니마다 한 번 · 밤 10시~아침 8시 안 보냄.
 *   가족에게 푸시(켜 둔 기기가 있으면) + 알림함(family_nudges 로 만든다). 재촉 문구 없이 사실만.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "연결을 찾지 못했어요" }, { status: 404 });
  const { meal } = await request.json().catch(() => ({}));
  if (!isFamilyMeal(meal)) return NextResponse.json({ error: "끼니를 골라 주세요" }, { status: 400 });
  const who = await accountActor();
  if ("res" in who) return who.res;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const today = todayKst();
  try {
    const { data, error } = await sb.from("family_links").select(LINK_COLS).eq("id", id).eq("viewer_id", who.actor).eq("status", "active").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "연결을 찾지 못했어요" }, { status: 404 });
    const l = data as LinkRow;
    const { count, error: dErr } = await sb.from("meal_diary").select("id", { count: "exact", head: true })
      .eq("user_id", l.owner_id).eq("date", today).eq("meal_type", meal);
    if (dErr) throw new Error(dErr.message);
    const why = nudgeBlock({ allow: l.allow_nudge, shareMeals: l.share_meals, recorded: (count || 0) > 0, already: false, hourKst: Math.floor(kstMinutes() / 60) });
    if (why) return NextResponse.json({ error: why }, { status: 409 });

    // 같은 끼니에 두 번 눌러도 한 번 — unique(link_id, day, meal)
    const { error: iErr } = await sb.from("family_nudges").insert({ link_id: l.id, day: today, meal });
    if (iErr) {
      if (iErr.code === "23505") return NextResponse.json({ error: "이 끼니는 오늘 이미 콕 찔렀어요" }, { status: 409 });
      if (iErr.code === "42P01" || iErr.code === "PGRST205") return NextResponse.json({ error: "콕 찌르기는 아직 준비 중이에요" }, { status: 503 });
      throw new Error(iErr.message);
    }

    let pushed = false;
    const push = userPusher(sb);
    if (push) {
      try {
        const name = (await nicknameOf(sb, who.actor)) || "가족";
        pushed = await push(l.owner_id!, { title: `${name} 님이 ${MEAL_LABEL[meal]} 기록을 기다려요`, body: "기록하면 가족 화면에 '기록했어요'로 보여요", url: "/diary", tag: `nudge-${l.id}` });
      } catch (e) { console.error("콕 찌르기 푸시를 보내지 못했어요:", (e as Error).message); } // ds-allow: 알림함에는 이미 들어갔다 — 푸시만 빠짐
    }
    return NextResponse.json({ ok: true, pushed });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
