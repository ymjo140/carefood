import { NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { adminOnly } from "@/lib/actor-server";
import { payoutQueue } from "@/lib/partner/payout-queue";

export const maxDuration = 60;

/** GET /api/admin/partners/payouts — 지급 대기열: 마감했지만 정산을 끝내지 않은 달(지급일순) + 지난 달을 마감하지 못한 업체 */
export async function GET() {
  await connection();
  const denied = await adminOnly(); if (denied) return denied;
  try { return NextResponse.json(await payoutQueue(createServiceRoleClient())); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
