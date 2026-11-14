import { NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { myCoupons } from "@/lib/partner/coupons";
import { notReady } from "@/lib/partner/crm";

/** GET /api/me/coupons — 내 쿠폰함 (입점 업체가 준 쿠폰. 결제할 때 업체마다 가장 큰 것 하나가 저절로 쓰인다) */
export async function GET() {
  await connection();
  const actor = await getActorId();
  if (!actor) return noActor();
  try { return NextResponse.json({ coupons: await myCoupons(createServiceRoleClient(), actor) }); }
  catch (e) {
    if (notReady(e as { message?: string })) return NextResponse.json({ coupons: [] });
    console.error("쿠폰함을 불러오지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "쿠폰함을 불러오지 못했어요" }, { status: 500 });
  }
}
