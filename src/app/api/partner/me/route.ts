import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPartnerContext } from "@/lib/partner/auth";

/** GET /api/partner/me[?as=slug] — 내 업체, 제품 상태별 수, 최근 올린 기록 5개 */
export async function GET(req: NextRequest) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  // 로그인 전·업체가 아닌 계정은 오류가 아니라 화면의 한 상태 — 200 으로 상태만 알린다
  if ("error" in ctx) return ctx.reason ? NextResponse.json({ state: ctx.reason }) : ctx.error;
  const sb = createServiceRoleClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [items, batches] = await Promise.all([
    sb.from("partner_items").select("status").eq("partner_id", ctx.partner.id).limit(20000),
    sb.from("ingest_batches").select("id, channel, file_name, row_count, ok_count, review_count, error_count, unchanged_count, errors, created_at")
      .eq("partner_id", ctx.partner.id).order("created_at", { ascending: false }).limit(5),
  ]);
  if (items.error || batches.error) return NextResponse.json({ error: (items.error || batches.error).message }, { status: 500 });
  const counts: Record<string, number> = { pending: 0, approved: 0, rejected: 0, discontinued: 0 };
  for (const r of items.data || []) counts[r.status] = (counts[r.status] || 0) + 1;
  return NextResponse.json({ partner: ctx.partner, role: ctx.role, counts, batches: batches.data || [] });
}
