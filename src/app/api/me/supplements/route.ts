import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { todayKst } from "@/lib/day";
import { MAX_SUPPLEMENTS, isTiming } from "@/lib/supplements";
import { loadSupps, markTaken } from "@/lib/supplements-server";

/**
 * 영양제 챙기기 (내 것만) — 규칙은 lib/supplements.ts. 효과·양은 다루지 않고 먹었는지만.
 * GET — 내 영양제와 오늘 먹었는지
 * POST { name, timing } — 등록 (10개까지)
 * PATCH { id, taken } — 오늘 먹었음 체크 / 풀기
 * DELETE ?id= — 지우기 (그동안의 체크도 같이)
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const UUID = /^[0-9a-f-]{36}$/i;

export async function GET() {
  await connection();
  const actor = await getActorId();
  if (!actor) return noActor();
  try {
    return NextResponse.json({ items: await loadSupps(createServiceRoleClient() as Sb, actor, todayKst()) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const body = await request.json().catch(() => ({})); // ds-allow: 몸통이 없으면 아래에서 400
  const name = String(body?.name ?? "").replace(/\s+/g, " ").trim();
  const timing = isTiming(body?.timing) ? body.timing : "any";
  if (!name || name.length > 30) return NextResponse.json({ error: "이름을 30자 안으로 적어 주세요" }, { status: 400 });
  const sb = createServiceRoleClient() as Sb;
  const { count, error: cErr } = await sb.from("supplements").select("id", { count: "exact", head: true }).eq("user_id", actor);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if ((count ?? 0) >= MAX_SUPPLEMENTS) return NextResponse.json({ error: `영양제는 ${MAX_SUPPLEMENTS}개까지 등록할 수 있어요` }, { status: 400 });
  const { data, error } = await sb.from("supplements").insert({ user_id: actor, name, timing }).select("id, name, timing").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: { ...data, taken: false } });
}

export async function PATCH(request: NextRequest) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const body = await request.json().catch(() => ({})); // ds-allow: 몸통이 없으면 아래에서 400
  const id = String(body?.id ?? "");
  if (!UUID.test(id)) return NextResponse.json({ error: "영양제를 찾지 못했어요" }, { status: 400 });
  const sb = createServiceRoleClient() as Sb;
  const today = todayKst();
  // 내 것인지 먼저 (남의 영양제에 체크를 남기지 않게)
  const { data: mine, error: mErr } = await sb.from("supplements").select("id").eq("id", id).eq("user_id", actor).maybeSingle();
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  if (!mine) return NextResponse.json({ error: "영양제를 찾지 못했어요" }, { status: 404 });
  try {
    if (body?.taken) await markTaken(sb, actor, today, [id]);
    else {
      const { error } = await sb.from("supplement_logs").delete().eq("user_id", actor).eq("supplement_id", id).eq("date", today);
      if (error) throw new Error(error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!UUID.test(id)) return NextResponse.json({ error: "영양제를 찾지 못했어요" }, { status: 400 });
  const { error } = await (createServiceRoleClient() as Sb).from("supplements").delete().eq("id", id).eq("user_id", actor);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
