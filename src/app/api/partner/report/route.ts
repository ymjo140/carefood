import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPartnerContext } from "@/lib/partner/auth";
import { buildReport } from "@/lib/partner/report";

const PERIODS = [7, 28, 90];

/**
 * GET /api/partner/report?days=28[&as=slug] — 내 제품의 성과와 본 사람들의 목표 분포 (통계만, lib/partner/report.ts)
 * purchases: 같은 기간 업체가 보고한 구매확정 수 (퍼널의 마지막 칸) — 보고가 한 번도 없으면 null
 */
export async function GET(req: NextRequest) {
  await connection();
  const sp = req.nextUrl.searchParams;
  const ctx = await getPartnerContext(sp.get("as"));
  if ("error" in ctx) return ctx.error;
  const days = PERIODS.includes(Number(sp.get("days"))) ? Number(sp.get("days")) : 28;
  const sb = createServiceRoleClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    const { data: items, error } = await sb.from("partner_items").select("product_id, partner_sku, data->>name").eq("partner_id", ctx.partner.id).not("product_id", "is", null).limit(20000);
    if (error) throw new Error(error.message);
    const since = new Date(Date.now() - days * 86400e3).toISOString();
    const [report, conv, any] = await Promise.all([
      buildReport(sb, items || [], days),
      sb.from("partner_conversions").select("id", { count: "exact", head: true }).eq("partner_id", ctx.partner.id).eq("status", "confirmed").gte("ordered_at", since),
      sb.from("partner_conversions").select("id", { count: "exact", head: true }).eq("partner_id", ctx.partner.id),
    ]);
    if (conv.error || any.error) throw new Error((conv.error || any.error).message);
    return NextResponse.json({ ...report, purchases: any.count ? conv.count || 0 : null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
