import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * POST /api/orders — 주간 식단 → 통합 주문 생성
 *
 * 1. 주간 박스의 제품들을 서비스별로 분류
 * 2. orders + order_items 생성
 * 3. 서비스별 purchase_orders 생성/집계
 *
 * GET /api/orders — 내 주문 내역
 */

// 서비스 식별: product의 manufacturer/source로 판단
const SERVICE_MAP: Record<string, string> = {
  "현대그린푸드": "greating",
  "그리팅": "greating",
  "(주)그리팅": "greating",
  "윤식단": "yundiet",
  "(주)윤식단": "yundiet",
  "풀무원": "designmeal",
  "디자인밀": "designmeal",
  "식스밀": "sixmeal",
  "메이크샐러드": "makesalad",
};

function identifyService(manufacturer: string | null): string {
  if (!manufacturer) return "market";
  for (const [key, service] of Object.entries(SERVICE_MAP)) {
    if (manufacturer.includes(key)) return service;
  }
  return "market"; // 시판 제품
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    const body = await request.json();
    const { user_id, items, address_id, delivery_week_start, delivery_preference } = body;

    if (!user_id || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "user_id, items[] 필수" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;

    // ── 1. 제품 정보 조회 (가격 + 서비스 식별) ──
    const productIds = items
      .map((it: { product_id?: string }) => it.product_id)
      .filter(Boolean);

    let productMap: Record<string, { name: string; manufacturer: string | null; calories: number | null; protein_g: number | null }> = {};
    if (productIds.length > 0) {
      const { data: products } = await sb
        .from("products")
        .select("id, name, manufacturer, calories, protein_g")
        .in("id", productIds.slice(0, 100));
      for (const p of (products || [])) {
        productMap[p.id] = p;
      }
    }

    // 가격 조회
    let priceMap: Record<string, number> = {};
    if (productIds.length > 0) {
      const { data: prices } = await sb
        .from("product_prices")
        .select("product_id, price")
        .in("product_id", productIds.slice(0, 100))
        .order("price", { ascending: true });
      for (const pp of (prices || [])) {
        if (!priceMap[pp.product_id]) priceMap[pp.product_id] = pp.price; // 최저가
      }
    }

    // ── 2. 주문 아이템 정리 ──
    type OrderItemRow = {
      product_id: string | null;
      day_of_week: string;
      meal_type: string;
      product_name: string;
      service: string;
      quantity: number;
      unit_price: number;
      calories: number | null;
      protein_g: number | null;
    };

    const orderItems: OrderItemRow[] = items.map((it: {
      product_id?: string;
      product_name?: string;
      day_of_week: string;
      meal_type: string;
      quantity?: number;
    }) => {
      const prod = it.product_id ? productMap[it.product_id] : null;
      const service = prod ? identifyService(prod.manufacturer) : "market";
      return {
        product_id: it.product_id || null,
        day_of_week: it.day_of_week,
        meal_type: it.meal_type,
        product_name: it.product_name || prod?.name || "직접 입력",
        service,
        quantity: it.quantity || 1,
        unit_price: it.product_id ? (priceMap[it.product_id] || 0) : 0,
        calories: prod?.calories || null,
        protein_g: prod?.protein_g || null,
      };
    });

    const totalPrice = orderItems.reduce((s, it) => s + it.unit_price * it.quantity, 0);

    // ── 3. 주문 생성 ──
    const { data: order, error: orderError } = await sb
      .from("orders")
      .insert({
        user_id,
        address_id: address_id || null,
        status: "pending",
        total_items: orderItems.length,
        total_price: totalPrice,
        final_price: totalPrice, // 할인 없는 경우
        delivery_week_start: delivery_week_start || null,
        delivery_preference: delivery_preference || {},
        weekly_box_snapshot: items,
      })
      .select()
      .single();

    if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });

    // ── 4. 주문 아이템 삽입 ──
    const itemsToInsert = orderItems.map(it => ({
      order_id: order.id,
      ...it,
    }));

    await sb.from("order_items").insert(itemsToInsert);

    // ── 5. 서비스별 발주 집계 ──
    const serviceGroups: Record<string, OrderItemRow[]> = {};
    for (const it of orderItems) {
      if (it.service === "market") continue; // 시판은 발주 대상 아님
      if (!serviceGroups[it.service]) serviceGroups[it.service] = [];
      serviceGroups[it.service].push(it);
    }

    const purchaseOrders: { service: string; items_count: number; amount: number }[] = [];

    for (const [service, serviceItems] of Object.entries(serviceGroups)) {
      // 기존 발주가 있으면 합치고, 없으면 새로 생성
      const deliveryDate = delivery_week_start || new Date().toISOString().slice(0, 10);

      const { data: existingPO } = await sb
        .from("purchase_orders")
        .select("id, total_items, total_users, total_amount, items")
        .eq("service", service)
        .eq("delivery_date", deliveryDate)
        .eq("status", "pending")
        .maybeSingle();

      // 제품별 수량 집계
      const productAgg: Record<string, { product_id: string; product_name: string; quantity: number; unit_price: number }> = {};
      for (const it of serviceItems) {
        const key = it.product_id || it.product_name;
        if (!productAgg[key]) {
          productAgg[key] = { product_id: it.product_id || "", product_name: it.product_name, quantity: 0, unit_price: it.unit_price };
        }
        productAgg[key].quantity += it.quantity;
      }

      const serviceAmount = serviceItems.reduce((s, it) => s + it.unit_price * it.quantity, 0);

      if (existingPO) {
        // 기존 발주에 합치기
        const existingItems = (existingPO.items || []) as { product_id: string; product_name: string; quantity: number; unit_price: number }[];
        for (const newItem of Object.values(productAgg)) {
          const existing = existingItems.find(e => e.product_id === newItem.product_id && e.product_name === newItem.product_name);
          if (existing) {
            existing.quantity += newItem.quantity;
          } else {
            existingItems.push(newItem);
          }
        }

        await sb.from("purchase_orders").update({
          total_items: existingPO.total_items + serviceItems.length,
          total_users: existingPO.total_users + 1,
          total_amount: existingPO.total_amount + serviceAmount,
          items: existingItems,
          updated_at: new Date().toISOString(),
        }).eq("id", existingPO.id);

        // 발주-주문 연결
        for (const it of serviceItems) {
          await sb.from("purchase_order_items").insert({
            purchase_order_id: existingPO.id,
            order_id: order.id,
            user_id,
            address_id: address_id || null,
          });
        }
      } else {
        // 새 발주 생성
        const { data: newPO } = await sb.from("purchase_orders").insert({
          service,
          delivery_date: deliveryDate,
          total_items: serviceItems.length,
          total_users: 1,
          total_amount: serviceAmount,
          items: Object.values(productAgg),
        }).select().single();

        if (newPO) {
          await sb.from("purchase_order_items").insert({
            purchase_order_id: newPO.id,
            order_id: order.id,
            user_id,
            address_id: address_id || null,
          });
        }
      }

      purchaseOrders.push({ service, items_count: serviceItems.length, amount: serviceAmount });
    }

    return NextResponse.json({
      order: {
        id: order.id,
        status: order.status,
        total_items: order.total_items,
        total_price: totalPrice,
      },
      service_breakdown: purchaseOrders,
      market_items: orderItems.filter(it => it.service === "market").length,
    });
  } catch (e) {
    return NextResponse.json({ error: "주문 생성 실패" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  await connection();
  const userId = request.nextUrl.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id 필수" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  const { data: orders } = await sb
    .from("orders")
    .select("id, status, total_items, total_price, final_price, delivery_week_start, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({ orders: orders || [] });
}
