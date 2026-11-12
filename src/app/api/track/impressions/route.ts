import { NextRequest, NextResponse } from "next/server";
import { limitRequest } from "@/lib/rate-limit";
import { createServiceRoleClient } from "@/lib/supabase/server";

const PLACEMENTS = new Set(["home_reco", "home_cold", "onboarding_preview", "product_list", "weekly_fill"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/track/impressions — {placement, ids[]} 제품이 화면에 보인 횟수 (제품·날짜·자리별 합계만, 누가 봤는지는 남기지 않는다)
 */
export async function POST(request: NextRequest) {
  const limited = await limitRequest(request, "track");
  if (limited) return limited;
  const b = await request.json().catch(() => null);
  if (!b || !PLACEMENTS.has(b.placement) || !Array.isArray(b.ids)) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  const ids = [...new Set((b.ids as unknown[]).filter((x): x is string => typeof x === "string" && UUID.test(x)))].slice(0, 60);
  if (ids.length === 0) return NextResponse.json({ ok: true, counted: 0 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (createServiceRoleClient() as any).rpc("bump_impressions", { p_ids: ids, p_placement: b.placement });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, counted: ids.length });
}
