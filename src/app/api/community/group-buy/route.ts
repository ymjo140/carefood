import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/community/group-buy — 공구 목록
 * POST /api/community/group-buy — 공구 생성
 */

export async function GET(request: NextRequest) {
  await connection();
  const { searchParams } = request.nextUrl;
  const concern = searchParams.get("concern");
  const status = searchParams.get("status") || "recruiting";
  const page = Number(searchParams.get("page") || 1);
  const limit = 10;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  let query = sb
    .from("group_buys")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (status === "all") {
    query = query.in("status", ["recruiting", "achieved"]);
  } else {
    query = query.eq("status", status);
  }

  if (concern) query = query.eq("concern", concern);

  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data: groupBuys, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    group_buys: groupBuys || [],
    total: count || 0,
    page,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { creator_id, product_id, product_name, original_price, target_price,
            target_count, concern, title, description, source_plan_id } = body;

    if (!creator_id || !product_name || !target_count) {
      return NextResponse.json({ error: "creator_id, product_name, target_count 필수" }, { status: 400 });
    }

    const discountRate = original_price && target_price
      ? Math.round((1 - target_price / original_price) * 100) / 100
      : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;

    const { data: groupBuy, error } = await sb
      .from("group_buys")
      .insert({
        creator_id,
        title: title || `${product_name} 공구`,
        description: description || null,
        product_id: product_id || null,
        product_name,
        original_price: original_price || null,
        target_price: target_price || null,
        discount_rate: discountRate,
        target_count,
        current_count: 1, // 생성자 자동 참여
        concern: concern || null,
        status: "recruiting",
        expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(), // 7일 후 만료
        source_plan_id: source_plan_id || null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 생성자 자동 참여
    await sb.from("group_buy_participants").insert({
      group_buy_id: groupBuy.id,
      user_id: creator_id,
    });

    return NextResponse.json({ group_buy: groupBuy });
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}
