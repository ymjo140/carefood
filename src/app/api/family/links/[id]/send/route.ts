import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { MEAL_LABEL, accountActor, isFamilyMeal, nicknameOf } from "@/lib/family";
import { perServing } from "@/lib/nutrition";
import { cleanPlanFoods } from "@/lib/planned-meals";
import { userPusher } from "@/lib/push";
import { josa } from "@/lib/buddy";
import { todayKst } from "@/lib/day";

/**
 * POST /api/family/links/[id]/send { meal, kind: "menu" | "product", ref, note? } — 가족 오늘 끼니에 음식 하나를 예정으로 보낸다.
 *   보는 사람만 · 오늘 · 아직 기록 안 한 끼니 · 가족이 직접 담아 둔 계획이 있으면 덮어쓰지 않는다(다른 가족이 보낸 것도).
 *   음식 값은 서버가 다시 읽는다(대표 메뉴 common_foods · 제품 1회 제공량) — 화면이 보낸 숫자는 쓰지 않는다.
 *   가족 하루 보기에 '예정 · 지은이 보냄' + 한마디. 가족은 '계획대로 기록하기' 한 번으로 기록. 연결마다 하루 5번.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "연결을 찾지 못했어요" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const { meal, kind } = body;
  const ref = typeof body.ref === "string" || typeof body.ref === "number" ? String(body.ref).slice(0, 64) : "";
  if (!isFamilyMeal(meal)) return NextResponse.json({ error: "끼니를 골라 주세요" }, { status: 400 });
  if ((kind !== "menu" && kind !== "product") || !ref || (kind === "product" && !UUID.test(ref))) return NextResponse.json({ error: "보낼 음식을 골라 주세요" }, { status: 400 });
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().replace(/\s+/g, " ").slice(0, 60) : null;
  const who = await accountActor();
  if ("res" in who) return who.res;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const today = todayKst();
  try {
    const { data: l, error } = await sb.from("family_links").select("id, owner_id, label").eq("id", id).eq("viewer_id", who.actor).eq("status", "active").maybeSingle();
    if (error) throw new Error(error.message);
    if (!l) return NextResponse.json({ error: "연결을 찾지 못했어요" }, { status: 404 });
    const owner = l.owner_id as string;

    const [{ count: ate, error: dErr }, { data: cur, error: pErr }, { count: sent, error: sErr }] = await Promise.all([
      sb.from("meal_diary").select("id", { count: "exact", head: true }).eq("user_id", owner).eq("date", today).eq("meal_type", meal),
      sb.from("planned_meals").select("id, sent_by").eq("user_id", owner).eq("date", today).eq("meal", meal).maybeSingle(),
      sb.from("planned_meals").select("id", { count: "exact", head: true }).eq("user_id", owner).eq("sent_by", who.actor).gte("created_at", new Date(Date.now() - 86400e3).toISOString()),
    ]);
    for (const e of [dErr, pErr, sErr]) if (e) throw new Error(e.message);
    if ((ate || 0) > 0) return NextResponse.json({ error: "이미 기록한 끼니예요" }, { status: 409 });
    if (cur && !cur.sent_by) return NextResponse.json({ error: `${l.label}${josa(l.label, "이", "가")} 직접 담아 둔 계획이 있는 끼니예요` }, { status: 409 });
    if (cur && cur.sent_by !== who.actor) return NextResponse.json({ error: "다른 가족이 이미 보낸 끼니예요" }, { status: 409 });
    if ((sent || 0) >= 5) return NextResponse.json({ error: "오늘은 5번까지 보낼 수 있어요" }, { status: 429 });

    // 음식 값은 서버에서
    let food: Record<string, unknown>;
    if (kind === "menu") {
      const { data: m, error: mErr } = await sb.from("common_foods").select("id, name, calories, protein_g, carbs_g, fat_g, sodium_mg").eq("id", ref).maybeSingle();
      if (mErr) throw new Error(mErr.message);
      if (!m) return NextResponse.json({ error: "음식을 찾지 못했어요" }, { status: 404 });
      food = { name: m.name, calories: m.calories, protein_g: m.protein_g, carbs_g: m.carbs_g, fat_g: m.fat_g, sodium_mg: m.sodium_mg, type: "eating_out" };
    } else {
      const { data: p, error: prErr } = await sb.from("products")
        .select("id, name, calories, protein_g, carbs_g, fat_g, sodium_mg, serving_size_g, nutrient_base_g").eq("id", ref).eq("is_purchasable", true).maybeSingle();
      if (prErr) throw new Error(prErr.message);
      if (!p) return NextResponse.json({ error: "지금 살 수 있는 제품이 아니에요" }, { status: 404 });
      const s = perServing(p);
      food = { product_id: p.id, name: p.name, calories: s.calories, protein_g: s.protein_g, carbs_g: s.carbs_g, fat_g: s.fat_g, sodium_mg: s.sodium_mg, type: "product" };
    }
    const foods = cleanPlanFoods([food]);
    if (!foods.length) return NextResponse.json({ error: "음식을 담지 못했어요" }, { status: 400 });
    const name = ((await nicknameOf(sb, who.actor)) || "가족").slice(0, 20);
    // 읽은 뒤 사이에 가족이 계획을 담았을 수 있다 — 내가 보낸 것만 바꾸고, 없으면 새로 넣되 겹치면 멈춘다
    if (cur) {
      const { data: up, error: uErr } = await sb.from("planned_meals").update({ foods, note, sent_name: name })
        .eq("id", cur.id).eq("sent_by", who.actor).select("id");
      if (uErr) throw new Error(uErr.message);
      if (!up?.length) return NextResponse.json({ error: "그사이 계획이 바뀌었어요. 다시 불러와 주세요" }, { status: 409 });
    } else {
      const { error: iErr } = await sb.from("planned_meals").insert({ user_id: owner, date: today, meal, foods, plan_title: null, sent_by: who.actor, sent_name: name, note });
      if (iErr) {
        if (iErr.code === "23505") return NextResponse.json({ error: "그사이 계획이 담긴 끼니예요. 다시 불러와 주세요" }, { status: 409 });
        throw new Error(iErr.message);
      }
    }

    let pushed = false;
    const push = userPusher(sb);
    if (push) {
      try {
        pushed = await push(owner, { title: `${name} 님이 ${MEAL_LABEL[meal]}을 보냈어요`, body: `${foods[0].name} · ${note ? `“${note}”` : "예정에 담겼어요"}`, url: "/diary", tag: `famsend-${l.id}` });
      } catch (e) { console.error("식단 보내기 푸시를 보내지 못했어요:", (e as Error).message); } // ds-allow: 예정에는 담겼다 — 푸시만 빠짐
    }
    return NextResponse.json({ ok: true, pushed, food: foods[0].name });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
