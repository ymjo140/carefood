import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { LINK_COLS, MEAL_LABEL, accountActor, isFamilyMeal, nicknameOf, type LinkRow } from "@/lib/family";
import { givenNutrients, productNutrients } from "@/lib/diary-values";
import { userPusher } from "@/lib/push";
import { todayKst } from "@/lib/day";
import { josa } from "@/lib/buddy";

/**
 * POST /api/family/links/[id]/proxy — 대신 기록하기 (가족이 '대신 기록하기'를 켠 연결의 보는 사람만, 오늘만)
 *   { kind: "med", item_id }  가족 약 체크를 대신 — 약 체크를 보여 주는 연결만
 *   { kind: "meal", meal }    가족 그 끼니에 담긴 예정(계획·보낸 음식)을 그대로 기록 — 먹은 음식을 보여 주는 연결만
 *   기록에는 대신 기록한 사람 이름이 남고(recorded_name · checked_name), 가족 화면에 '지은이 기록'으로 보인다. 가족에게 알림.
 *   끼니는 예정을 먼저 지워 '가져오고' 기록한다 — 두 번 눌러도 한 번만 들어간다.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type PlanFood = { product_id?: string; name?: string; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number; sodium_mg?: number };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "연결을 찾지 못했어요" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
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
    const owner = l.owner_id!;
    if (!l.share_proxy) return NextResponse.json({ error: `${l.label} 쪽에서 대신 기록하기를 켜지 않았어요` }, { status: 403 });
    const name = ((await nicknameOf(sb, who.actor)) || "가족").slice(0, 20);
    const push = userPusher(sb);
    const tell = async (title: string, bodyText: string) => {
      if (!push) return;
      try { await push(owner, { title, body: bodyText, url: "/diary", tag: `famproxy-${l.id}` }); }
      catch (e) { console.error("대신 기록 알림을 보내지 못했어요:", (e as Error).message); } // ds-allow: 기록은 됐다 — 알림만 빠짐
    };

    if (body.kind === "med") {
      if (!l.share_meds) return NextResponse.json({ error: "약 체크를 보여 주는 가족만 대신 체크할 수 있어요" }, { status: 403 });
      if (typeof body.item_id !== "string" || !UUID.test(body.item_id)) return NextResponse.json({ error: "약을 골라 주세요" }, { status: 400 });
      const { data: item, error: iErr } = await sb.from("med_checks").select("id, label").eq("id", body.item_id).eq("user_id", owner).eq("is_active", true).maybeSingle();
      if (iErr) throw new Error(iErr.message);
      if (!item) return NextResponse.json({ error: "약 체크를 찾지 못했어요" }, { status: 404 });
      const { error: cErr } = await sb.from("med_check_log").insert({ item_id: item.id, user_id: owner, day: today, checked_by: who.actor, checked_name: name });
      if (cErr) {
        if (cErr.code === "23505") return NextResponse.json({ error: "이미 체크했어요" }, { status: 409 });
        throw new Error(cErr.message);
      }
      await tell(`${name} 님이 ${item.label}${josa(item.label, "을", "를")} 대신 체크했어요`, "가족 화면에서 고칠 수 있어요");
      return NextResponse.json({ ok: true });
    }

    if (body.kind === "meal") {
      const meal = body.meal;
      if (!isFamilyMeal(meal)) return NextResponse.json({ error: "끼니를 골라 주세요" }, { status: 400 });
      if (!l.share_foods || !l.share_meals) return NextResponse.json({ error: "먹은 음식을 보여 주는 가족만 끼니를 대신 기록할 수 있어요" }, { status: 403 });
      const { count, error: dErr } = await sb.from("meal_diary").select("id", { count: "exact", head: true }).eq("user_id", owner).eq("date", today).eq("meal_type", meal);
      if (dErr) throw new Error(dErr.message);
      if ((count || 0) > 0) return NextResponse.json({ error: "이미 기록한 끼니예요" }, { status: 409 });
      // 예정을 먼저 가져온다(지우기) — 동시에 두 번 눌러도 하나만 기록
      const { data: taken, error: tErr } = await sb.from("planned_meals").delete().eq("user_id", owner).eq("date", today).eq("meal", meal)
        .select("user_id, date, meal, foods, plan_title, sent_by, sent_name, note");
      if (tErr) throw new Error(tErr.message);
      const plan = taken?.[0];
      if (!plan || !Array.isArray(plan.foods) || !plan.foods.length) return NextResponse.json({ error: "기록할 예정이 없어요" }, { status: 404 });
      const rows = [];
      for (const f of plan.foods as PlanFood[]) {
        const pr = f.product_id && UUID.test(f.product_id) ? await productNutrients(sb, f.product_id, null, 1) : null;
        const n = pr ? pr.n : givenNutrients(f as Record<string, unknown>, 1);
        rows.push({
          user_id: owner, date: today, meal_type: meal, product_id: pr ? f.product_id : null, food_name: String(f.name || "음식").slice(0, 80),
          serving_g: pr ? pr.grams : null, serving_multiplier: 1, ...n, recorded_by: who.actor, recorded_name: name,
        });
      }
      const { error: iErr } = await sb.from("meal_diary").insert(rows);
      if (iErr) {
        // 기록이 안 됐으면 예정을 되돌린다
        const { error: rErr } = await sb.from("planned_meals").insert(plan);
        if (rErr) console.error("예정을 되돌리지 못했어요:", rErr.message); // ds-allow: 기록 실패를 먼저 알리고, 되돌리기 실패는 기록만
        throw new Error(iErr.message);
      }
      await tell(`${name} 님이 ${MEAL_LABEL[meal]}을 대신 기록했어요`, `${rows.map((r) => r.food_name).join(" · ")} · 식단에서 고칠 수 있어요`);
      return NextResponse.json({ ok: true, count: rows.length });
    }

    return NextResponse.json({ error: "무엇을 기록할지 골라 주세요" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
