import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { GROUP_BUY_ENABLED } from "@/lib/features";

/**
 * GET /api/community/group-buy — 공구 목록
 *   ?status=recruiting(기본)|achieved|all   ?mine=1 내가 관심 표시·참여한 것만   ?concern=
 *   응답: group_buys(+ lowest_price·lowest_checked_at: 연결된 제품의 지금 최저가), mine_ids(그중 내가 표시한 것), total
 *   모집 중은 마감(expires_at)이 지난 것을 뺀다.
 * POST /api/community/group-buy — 공구 제안 (만든 사람은 자동으로 관심 표시)
 */

export async function GET(request: NextRequest) {
  await connection();
  const { searchParams } = request.nextUrl;
  const concern = searchParams.get("concern");
  const status = searchParams.get("status") || "recruiting";
  const mine = searchParams.get("mine") === "1";
  const page = Number(searchParams.get("page") || 1);
  const limit = 30;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const actor = await getActorId();

  let mineAll: string[] = [];
  if (actor) {
    const { data: rows, error: pErr } = await sb.from("group_buy_participants").select("group_buy_id").eq("user_id", actor);
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    mineAll = (rows || []).map((r: { group_buy_id: string }) => r.group_buy_id);
  }
  if (mine && mineAll.length === 0) return NextResponse.json({ group_buys: [], mine_ids: [], total: 0, page });

  let query = sb
    .from("group_buys")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (status === "all" || mine) {
    query = query.in("status", ["recruiting", "achieved"]);
  } else {
    query = query.eq("status", status);
  }
  if (status === "recruiting" && !mine) query = query.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
  if (mine) query = query.in("id", mineAll);
  if (concern) query = query.eq("concern", concern);

  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data: groupBuys, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const list = (groupBuys || []) as { id: string; product_id: string | null }[];

  // 연결된 제품의 지금 최저가 (가격 비교와 같은 뷰)
  const pids = [...new Set(list.map((g) => g.product_id).filter(Boolean))] as string[];
  const lowest: Record<string, { price: number; checked: string | null; image: string | null }> = {};
  if (pids.length) {
    const { data: prices, error: prErr } = await sb.from("v_all_prices").select("product_id, price, last_crawled_at, image_url").in("product_id", pids);
    if (prErr) return NextResponse.json({ error: prErr.message }, { status: 500 });
    for (const p of (prices || []) as { product_id: string; price: number; last_crawled_at: string | null; image_url: string | null }[]) {
      const cur = lowest[p.product_id];
      if (!cur || p.price < cur.price) lowest[p.product_id] = { price: p.price, checked: p.last_crawled_at, image: p.image_url || cur?.image || null };
    }
  }

  const mineSet = new Set(mineAll);
  return NextResponse.json({
    group_buys: list.map((g) => ({
      ...g,
      lowest_price: g.product_id ? lowest[g.product_id]?.price ?? null : null,
      lowest_checked_at: g.product_id ? lowest[g.product_id]?.checked ?? null : null,
      image_url: g.product_id ? lowest[g.product_id]?.image ?? null : null,
    })),
    mine_ids: list.filter((g) => mineSet.has(g.id)).map((g) => g.id),
    total: count || 0,
    page,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { product_id, concern, title, description, source_plan_id } = body;
    const creator_id = await getActorId();
    if (!creator_id) return noActor();

    const product_name = typeof body.product_name === "string" ? body.product_name.trim().slice(0, 80) : "";
    const target_count = Math.round(Number(body.target_count));
    if (!product_name || !Number.isFinite(target_count) || target_count < 5 || target_count > 200) {
      return NextResponse.json({ error: "제품 이름과 모을 인원(5~200명)을 넣어 주세요" }, { status: 400 });
    }
    // 판매를 열기 전엔 가격을 약속하지 않는다 — 사용자가 보낸 가격은 받지 않음 (src/lib/features.ts)
    const original_price = GROUP_BUY_ENABLED ? Number(body.original_price) || null : null;
    const target_price = GROUP_BUY_ENABLED ? Number(body.target_price) || null : null;

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
        expires_at: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(), // 14일 동안 모은다
        source_plan_id: source_plan_id || null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 생성자 자동 참여
    const { error: jErr } = await sb.from("group_buy_participants").insert({
      group_buy_id: groupBuy.id,
      user_id: creator_id,
    });
    if (jErr) return NextResponse.json({ error: jErr.message }, { status: 500 });

    return NextResponse.json({ group_buy: groupBuy });
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}
