import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { MEAL_LABEL, accountActor, isFamilyMeal, kindOf, kindWord, nicknameOf } from "@/lib/family";
import { planFoodOf, sendInput, sendPlanTo } from "@/lib/family-send";
import { userPusher } from "@/lib/push";
import { todayKst } from "@/lib/day";

/**
 * POST /api/family/links/[id]/send { meal, kind: "menu" | "product", ref, note? } — 가족·친구 오늘 끼니에 음식 하나를 예정으로 보낸다.
 *   보는 사람만 · 오늘 · 아직 기록 안 한 끼니 · 받는 사람이 직접 담아 둔 계획이 있으면 덮어쓰지 않는다(다른 사람이 보낸 것도).
 *   음식 값은 서버가 다시 읽는다 — 규칙은 lib/family-send (같이 먹기와 같다).
 *   받는 사람 하루 보기에 '예정 · 지은이 보냄' + 한마디. 받는 사람은 '계획대로 기록하기' 한 번으로 기록. 보낸 사람마다 하루 5번.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "연결을 찾지 못했어요" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const { meal } = body;
  if (!isFamilyMeal(meal)) return NextResponse.json({ error: "끼니를 골라 주세요" }, { status: 400 });
  const input = sendInput(body);
  if (!input) return NextResponse.json({ error: "보낼 음식을 골라 주세요" }, { status: 400 });
  const who = await accountActor();
  if ("res" in who) return who.res;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const today = todayKst();
  try {
    const { data: l, error } = await sb.from("family_links").select("id, owner_id, label, kind").eq("id", id).eq("viewer_id", who.actor).eq("status", "active").maybeSingle();
    if (error) throw new Error(error.message);
    if (!l) return NextResponse.json({ error: "연결을 찾지 못했어요" }, { status: 404 });
    const word = kindWord(kindOf(l));
    const food = await planFoodOf(sb, input.kind, input.ref);
    if ("error" in food) return NextResponse.json({ error: food.error }, { status: food.status });
    const name = ((await nicknameOf(sb, who.actor)) || word).slice(0, 20);
    const res = await sendPlanTo(sb, { owner: l.owner_id, sender: who.actor, senderName: name, label: l.label, word, meal, foods: food.foods, note: input.note, today });
    if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status });

    let pushed = false;
    const push = userPusher(sb);
    if (push) {
      try {
        pushed = await push(l.owner_id, { title: `${name} 님이 ${MEAL_LABEL[meal]}을 보냈어요`, body: `${food.foods[0].name} · ${input.note ? `“${input.note}”` : "예정에 담겼어요"}`, url: "/diary", tag: `famsend-${l.id}` });
      } catch (e) { console.error("식단 보내기 푸시를 보내지 못했어요:", (e as Error).message); } // ds-allow: 예정에는 담겼다 — 푸시만 빠짐
    }
    return NextResponse.json({ ok: true, pushed, food: food.foods[0].name });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
