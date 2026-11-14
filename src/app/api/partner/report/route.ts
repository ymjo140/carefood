import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPartnerContext } from "@/lib/partner/auth";
import { buildReport } from "@/lib/partner/report";

const DAY = 86400e3;
const KST = 9 * 3600e3;
/** 기간 — 지난 30일(기본) · 이번 달 · 지난달 (한국 시간 달 경계). 비교할 지난 기간은 같은 길이의 바로 앞 (달이면 그 앞 달) */
function periodOf(p: string | null, now = Date.now()) {
  const k = new Date(now + KST);
  const monthStart = (y: number, m: number) => Date.UTC(y, m, 1) - KST;
  if (p === "this_month") {
    const from = monthStart(k.getUTCFullYear(), k.getUTCMonth());
    // 지난달의 같은 날수까지 (11월 14일이면 10월 1~14일)
    const pFrom = monthStart(k.getUTCFullYear(), k.getUTCMonth() - 1);
    return { key: "this_month", cur: { from, to: now }, prev: { from: pFrom, to: Math.min(from, pFrom + (now - from)) } };
  }
  if (p === "last_month") {
    const from = monthStart(k.getUTCFullYear(), k.getUTCMonth() - 1);
    const to = monthStart(k.getUTCFullYear(), k.getUTCMonth());
    return { key: "last_month", cur: { from, to }, prev: { from: monthStart(k.getUTCFullYear(), k.getUTCMonth() - 2), to: from } };
  }
  return { key: "30d", cur: { from: now - 30 * DAY, to: now }, prev: { from: now - 60 * DAY, to: now - 30 * DAY } };
}

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
