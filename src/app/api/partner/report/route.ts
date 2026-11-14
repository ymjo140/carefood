import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPartnerContext } from "@/lib/partner/auth";
import { buildReport } from "@/lib/partner/report";
import { periodOf } from "@/lib/partner/period";

/**
 * GET /api/partner/report?period=30d|this_month|last_month[&as=slug] — 내 제품의 성과와 본 사람들 (통계만, lib/partner/report.ts)
 * prev: 지난 기간의 합계 (비교용). purchases: 기간 안에 업체가 보고한 구매확정 수 — 보고가 한 번도 없으면 null
 */
export async function GET(req: NextRequest) {
  await connection();
  const sp = req.nextUrl.searchParams;
  const ctx = await getPartnerContext(sp.get("as"));
  if ("error" in ctx) return ctx.error;
  const period = periodOf(sp.get("period"));
  const sb = createServiceRoleClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    const { data: items, error } = await sb.from("partner_items").select("product_id, partner_sku, data->>name").eq("partner_id", ctx.partner.id).not("product_id", "is", null).limit(20000);
    if (error) throw new Error(error.message);
    const iso = (ms: number) => new Date(ms).toISOString();
    const conv = (r: { from: number; to: number }) => sb.from("partner_conversions").select("id", { count: "exact", head: true })
      .eq("partner_id", ctx.partner.id).eq("status", "confirmed").gte("ordered_at", iso(r.from)).lt("ordered_at", iso(r.to));
    const [report, prev, c1, c0, any] = await Promise.all([
      buildReport(sb, items || [], period.cur),
      buildReport(sb, items || [], period.prev, { totalsOnly: true }),
      conv(period.cur), conv(period.prev),
      sb.from("partner_conversions").select("id", { count: "exact", head: true }).eq("partner_id", ctx.partner.id),
    ]);
    for (const r of [c1, c0, any]) if (r.error) throw new Error(r.error.message);
    const reported = !!any.count;
    return NextResponse.json({
      ...report, period: period.key, from: iso(period.cur.from), to: iso(period.cur.to), as_of: iso(Date.now()),
      purchases: reported ? c1.count || 0 : null,
      prev: { from: iso(period.prev.from), to: iso(period.prev.to), totals: prev.totals, purchases: reported ? c0.count || 0 : null },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
