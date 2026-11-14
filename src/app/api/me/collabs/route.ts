import { NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { myCollabs } from "@/lib/partner/collabs";
import { notReady } from "@/lib/partner/crm";

/** GET /api/me/collabs — 내가 받은 협업 제안 */
export async function GET() {
  await connection();
  const actor = await getActorId();
  if (!actor) return noActor();
  try { return NextResponse.json({ collabs: await myCollabs(createServiceRoleClient(), actor) }); }
  catch (e) {
    if (notReady(e as { message?: string })) return NextResponse.json({ collabs: [] });
    console.error("협업 제안을 불러오지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "협업 제안을 불러오지 못했어요" }, { status: 500 });
  }
}
