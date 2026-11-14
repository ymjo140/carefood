import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { addDays, todayKst } from "@/lib/day";

/**
 * GET /api/community/group-buy/check?product_id= — 공구 만들기에서 제품을 고르면
 *   records: 내가 최근 30일 이 제품을 기록한 횟수 (공구 글에 '써 본 사람'으로 붙는다)
 *   existing: 같은 제품 공구가 모집 중이면 { id, current_count } — 새로 만들지 않고 그쪽으로 보낸다
 */
export async function GET(request: NextRequest) {
  await connection();
  const actor = await getActorId();
  if (!actor) return noActor();
  const pid = request.nextUrl.searchParams.get("product_id") || "";
  if (!/^[0-9a-f-]{36}$/i.test(pid)) return NextResponse.json({ error: "제품을 골라 주세요" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const [rec, open] = await Promise.all([
    sb.from("meal_diary").select("id", { count: "exact", head: true }).eq("user_id", actor).eq("product_id", pid).gte("date", addDays(todayKst(), -30)),
    sb.from("group_buys").select("id, current_count").eq("product_id", pid).eq("status", "recruiting").gt("expires_at", new Date().toISOString()).limit(1).maybeSingle(),
  ]);
  if (rec.error || open.error) return NextResponse.json({ error: (rec.error || open.error).message }, { status: 500 });
  return NextResponse.json({ records: rec.count || 0, existing: open.data ? { id: open.data.id, current_count: open.data.current_count || 0 } : null });
}
