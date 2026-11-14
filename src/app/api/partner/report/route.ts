import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPartnerContext } from "@/lib/partner/auth";
import { buildReport } from "@/lib/partner/report";
import { periodOf } from "@/lib/partner/period";
import { dailySales, productSales } from "@/lib/partner/product-sales";
import { selectAll } from "@/lib/supabase/all";

/**
 * GET /api/partner/report?period=30d|this_month|last_month[&as=slug] — 내 제품의 성과와 본 사람들 (통계만, lib/partner/report.ts)
 * prev: 지난 기간의 합계 (비교용). purchases: 기간 안에 업체가 보고한 구매확정 수 — 보고가 한 번도 없으면 null
 * daily: 하루별 판매액·주문 수 + 지난 기간 같은 순서의 날. sales: 앱 주문 제품별 판매 (같은 기간, 결제 시각 기준 — lib/partner/product-sales.ts), prev.sales: 지난 기간 합계
 */
export async function GET(req: NextRequest) {
  await connection();
  const sp = req.nextUrl.searchParams;
  const ctx = await getPartnerContext(sp.get("as"));
  if ("error" in ctx) return ctx.error;
  const period = periodOf(sp.get("period"));
  const sb = createServiceRoleClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    const items = await selectAll<{ product_id: string; partner_sku: string; name: string }>(() => sb.from("partner_items").select("product_id, partner_sku, data->>name").eq("partner_id", ctx.partner.id).not("product_id", "is", null), "id");
    const iso = (ms: number) => new Date(ms).toISOString();
    const conv = (r: { from: number; to: number }) => sb.from("partner_conversions").select("id", { count: "exact", head: true })
      .eq("partner_id", ctx.partner.id).eq("status", "confirmed").gte("ordered_at", iso(r.from)).lt("ordered_at", iso(r.to));
    const [report, prev, c1, c0, any, sales, salesPrev, day1, day0] = await Promise.all([
      buildReport(sb, items || [], period.cur),
      buildReport(sb, items || [], period.prev, { totalsOnly: true }),
      conv(period.cur), conv(period.prev),
      sb.from("partner_conversions").select("id", { count: "exact", head: true }).eq("partner_id", ctx.partner.id),
      productSales(sb, ctx.partner.id, period.cur),
      productSales(sb, ctx.partner.id, period.prev),
      dailySales(sb, ctx.partner.id, period.cur),
      dailySales(sb, ctx.partner.id, period.prev),
    ]);
    for (const r of [c1, c0, any]) if (r.error) throw new Error(r.error.message);
    const reported = !!any.count;
    return NextResponse.json({
      ...report, period: period.key, from: iso(period.cur.from), to: iso(period.cur.to), as_of: iso(Date.now()),
      purchases: reported ? c1.count || 0 : null, sales,
      // 하루별 — 지난 기간은 같은 순서의 날에 겹쳐 그린다 (이번 달이면 지난달 같은 날짜)
      daily: day1.map((d, i) => ({ ...d, prev_revenue: day0[i]?.revenue ?? null, prev_orders: day0[i]?.orders ?? null })),
      prev: { from: iso(period.prev.from), to: iso(period.prev.to), totals: prev.totals, purchases: reported ? c0.count || 0 : null, sales: salesPrev.totals },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
