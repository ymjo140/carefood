import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { todayKst } from "@/lib/day";
import { MED_LABEL_MAX, accountActor } from "@/lib/family";

/**
 * 약 먹었는지 체크 (로그인한 계정만 — 가족에게 보여 줄 수 있게 계정 기록에 둔다) — 이름은 내가 정한다(약 이름·용량은 받지 않는다). 앱은 체크와 시간 알림만 한다 (복용 안내·약과 음식 판단은 하지 않음).
 * GET — { items: [{ id, label, remind_at, checked_at }] } 오늘 체크 포함
 * POST { label, remind_at? "HH:MM" } — 추가 (10개까지)
 * PATCH { id, checked: boolean } — 오늘 먹었어요 / 되돌리기
 * DELETE { id } — 지우기
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const kst = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(11, 16);

async function list(sb: Sb, actor: string) {
  const today = todayKst();
  const [i, c] = await Promise.all([
    sb.from("med_checks").select("id, label, remind_at, sort, created_at").eq("user_id", actor).eq("is_active", true).order("sort").order("created_at"),
    sb.from("med_check_log").select("item_id, checked_at").eq("user_id", actor).eq("day", today),
  ]);
  if (i.error || c.error) throw new Error((i.error || c.error).message);
  const checked = new Map(((c.data || []) as { item_id: string; checked_at: string }[]).map((x) => [x.item_id, x.checked_at]));
  return ((i.data || []) as { id: string; label: string; remind_at: string | null }[]).map((x) => ({
    id: x.id, label: x.label, remind_at: x.remind_at ? x.remind_at.slice(0, 5) : null, checked_at: checked.has(x.id) ? kst(checked.get(x.id)!) : null,
  }));
}

export async function GET() {
  await connection();
  const who = await accountActor();
  if ("res" in who) return who.res;
  const actor = who.actor;
  try { return NextResponse.json({ items: await list(createServiceRoleClient() as Sb, actor) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const who = await accountActor();
  if ("res" in who) return who.res;
  const actor = who.actor;
  const { label, remind_at } = await request.json().catch(() => ({}));
  const name = typeof label === "string" ? label.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > MED_LABEL_MAX) return NextResponse.json({ error: `이름을 ${MED_LABEL_MAX}자 안으로 적어 주세요 (예: 아침 약)` }, { status: 400 });
  if (remind_at != null && remind_at !== "" && (typeof remind_at !== "string" || !TIME.test(remind_at))) return NextResponse.json({ error: "알림 시각을 골라 주세요" }, { status: 400 });
  const sb = createServiceRoleClient() as Sb;
  const { count, error: cErr } = await sb.from("med_checks").select("id", { count: "exact", head: true }).eq("user_id", actor).eq("is_active", true);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if ((count || 0) >= 10) return NextResponse.json({ error: "10개까지 만들 수 있어요" }, { status: 409 });
  const { error } = await sb.from("med_checks").insert({ user_id: actor, label: name, remind_at: remind_at || null, sort: count || 0 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  try { return NextResponse.json({ items: await list(sb, actor) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

export async function PATCH(request: NextRequest) {
  const who = await accountActor();
  if ("res" in who) return who.res;
  const actor = who.actor;
  const { id, checked } = await request.json().catch(() => ({}));
  if (typeof id !== "string" || !UUID.test(id) || typeof checked !== "boolean") return NextResponse.json({ error: "체크할 것을 골라 주세요" }, { status: 400 });
  const sb = createServiceRoleClient() as Sb;
  const { data: item, error: iErr } = await sb.from("med_checks").select("id").eq("id", id).eq("user_id", actor).eq("is_active", true).maybeSingle();
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });
  if (!item) return NextResponse.json({ error: "찾지 못했어요" }, { status: 404 });
  const today = todayKst();
  const { error } = checked
    ? await sb.from("med_check_log").upsert({ item_id: id, user_id: actor, day: today }, { onConflict: "item_id,day", ignoreDuplicates: true })
    : await sb.from("med_check_log").delete().eq("item_id", id).eq("day", today);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  try { return NextResponse.json({ items: await list(sb, actor) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

export async function DELETE(request: NextRequest) {
  const who = await accountActor();
  if ("res" in who) return who.res;
  const actor = who.actor;
  const { id } = await request.json().catch(() => ({}));
  if (typeof id !== "string" || !UUID.test(id)) return NextResponse.json({ error: "지울 것을 골라 주세요" }, { status: 400 });
  const sb = createServiceRoleClient() as Sb;
  const { error } = await sb.from("med_checks").update({ is_active: false }).eq("id", id).eq("user_id", actor);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  try { return NextResponse.json({ items: await list(sb, actor) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
