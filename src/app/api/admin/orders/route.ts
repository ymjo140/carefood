import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { adminOnly } from "@/lib/actor-server";
import { listAdminOrders, markRefunded } from "@/lib/orders";

/** GET /api/admin/orders?filter=all|refund|cancel_request — 앱 주문 (최근 100건) */
export async function GET(req: NextRequest) {
  await connection();
  const denied = await adminOnly(); if (denied) return denied;
  const filter = req.nextUrl.searchParams.get("filter") || "all";
  try { return NextResponse.json({ orders: await listAdminOrders(createServiceRoleClient(), filter) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

/** POST /api/admin/orders — {order_id, action: "refunded", note?} 직접 환불하고 표시 (PG 를 붙이기 전) */
export async function POST(req: NextRequest) {
  const denied = await adminOnly(); if (denied) return denied;
  const b = await req.json().catch(() => null);
  if (b?.action !== "refunded") return NextResponse.json({ error: "action 은 refunded 예요" }, { status: 400 });
  try { await markRefunded(createServiceRoleClient(), String(b?.order_id || ""), typeof b?.note === "string" ? b.note : null); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
