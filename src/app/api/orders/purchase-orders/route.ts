import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/orders/purchase-orders — 발주 현황 (관리자용)
 *
 * 서비스별 / 날짜별 발주 집계 조회
 * - 오늘/이번 주 발주 현황
 * - 서비스별 물량
 * - 배송 존별 분류
 */
export async function GET(request: NextRequest) {
  await connection();
  const service = request.nextUrl.searchParams.get("service");
  const status = request.nextUrl.searchParams.get("status") || "pending";
  const dateFrom = request.nextUrl.searchParams.get("from");
  const dateTo = request.nextUrl.searchParams.get("to");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  let query = sb
    .from("purchase_orders")
    .select("*")
    .order("delivery_date", { ascending: true });

  if (service) query = query.eq("service", service);
  if (status !== "all") query = query.eq("status", status);
  if (dateFrom) query = query.gte("delivery_date", dateFrom);
  if (dateTo) query = query.lte("delivery_date", dateTo);

  const { data: pos, error } = await query.limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 서비스별 요약
  const serviceSummary: Record<string, { orders: number; items: number; amount: number; users: number }> = {};
  for (const po of (pos || [])) {
    if (!serviceSummary[po.service]) {
      serviceSummary[po.service] = { orders: 0, items: 0, amount: 0, users: 0 };
    }
    const s = serviceSummary[po.service];
    s.orders++;
    s.items += po.total_items || 0;
    s.amount += po.total_amount || 0;
    s.users += po.total_users || 0;
  }

  return NextResponse.json({
    purchase_orders: pos || [],
    summary: serviceSummary,
    total: pos?.length || 0,
  });
}

/**
 * PATCH /api/orders/purchase-orders — 발주 상태 변경
 */
export async function PATCH(request: NextRequest) {
  try {
    const { po_id, status, tracking_info } = await request.json();
    if (!po_id || !status) {
      return NextResponse.json({ error: "po_id, status 필수" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;

    const updates: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === "ordered") updates.ordered_at = new Date().toISOString();
    if (status === "confirmed") updates.confirmed_at = new Date().toISOString();

    await sb.from("purchase_orders").update(updates).eq("id", po_id);

    // 배송 추적 번호 업데이트
    if (tracking_info && status === "shipped") {
      await sb.from("purchase_order_items")
        .update({ delivery_status: "shipped", tracking_number: tracking_info })
        .eq("purchase_order_id", po_id);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}
