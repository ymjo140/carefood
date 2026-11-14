import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { adminOnly } from "@/lib/actor-server";
import { enrichGroupBuys, type GroupBuyRow } from "@/lib/group-buy-server";

/**
 * GET  /api/admin/group-buys?view=reached|open — 관리자: 공구
 *   reached: 관심이 목표 인원에 닿은 공구(요청 전 먼저) — 판매처에 요청할 것
 *   open: 지금 관심을 모으는 공구 (마감 안 지난 것, 많이 모인 순)
 * POST /api/admin/group-buys { id, note? } — 판매처에 요청했어요 (requested_at). 알림 받는 사람에게 소식이 간다
 */
export async function GET(request: NextRequest) {
  await connection();
  const denied = await adminOnly();
  if (denied) return denied;
  const view = request.nextUrl.searchParams.get("view") === "open" ? "open" : "reached";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  let q = sb.from("group_buys").select("*");
  q = view === "reached"
    ? q.not("reached_at", "is", null).order("requested_at", { ascending: true, nullsFirst: true }).order("reached_at", { ascending: false }).limit(100)
    : q.eq("status", "recruiting").is("reached_at", null).gt("expires_at", new Date().toISOString()).order("current_count", { ascending: false }).limit(100);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  try {
    const list = await enrichGroupBuys(sb, (data || []) as GroupBuyRow[]);
    return NextResponse.json({ group_buys: list.map(({ creator_id, ...g }) => { void creator_id; return g; }) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await adminOnly();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
  if (!id) return NextResponse.json({ error: "공구를 골라 주세요" }, { status: 400 });
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) || null : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  // 목표에 닿았고 아직 요청 안 한 것만 (두 번 눌러도 시각이 바뀌지 않게)
  const { data, error } = await sb.from("group_buys").update({ requested_at: new Date().toISOString(), request_note: note })
    .eq("id", id).not("reached_at", "is", null).is("requested_at", null).select("id, requested_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "이미 요청했거나 아직 목표에 닿지 않은 공구예요" }, { status: 409 });
  return NextResponse.json({ ok: true, requested_at: data[0].requested_at });
}
