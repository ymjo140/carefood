import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { LINK_COLS, accountActor, familyToday, scopesOf, type LinkRow } from "@/lib/family";

/**
 * GET /api/family/links/[id] — 보는 사람의 가족 화면: 확인받는 사람이 고른 것만 (끼니 기록 여부 · 이번 주 고른 제품 · 약 먹었는지 · 숫자)
 *   연결된 보는 사람만. 고르지 않은 칸은 null.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "연결을 찾지 못했어요" }, { status: 404 });
  const who = await accountActor();
  if ("res" in who) return who.res;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  try {
    const { data, error } = await sb.from("family_links").select(LINK_COLS).eq("id", id).eq("viewer_id", who.actor).eq("status", "active").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "연결을 찾지 못했어요" }, { status: 404 });
    const l = data as LinkRow;
    return NextResponse.json({ id: l.id, label: l.label, scopes: scopesOf(l), alert_evening: l.alert_evening, today: await familyToday(sb, l) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
