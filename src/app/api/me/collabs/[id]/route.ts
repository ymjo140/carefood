import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { answerCollab } from "@/lib/partner/collabs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/me/collabs/:id — {accept: boolean, reply?} 받기·거절 (답을 기다리는 제안만) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const actor = await getActorId();
  if (!actor) return noActor();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "제안을 찾지 못했어요" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  if (typeof b?.accept !== "boolean") return NextResponse.json({ error: "받을지 거절할지 골라 주세요" }, { status: 400 });
  try {
    const r = await answerCollab(createServiceRoleClient(), actor, id, b.accept, String(b.reply || "").trim());
    if (!r.ok) return NextResponse.json({ error: "이미 답했거나 업체가 거둬들인 제안이에요" }, { status: 409 });
    return NextResponse.json(r);
  } catch (e) {
    console.error("협업 제안에 답하지 못했어요:", id, (e as Error).message);
    return NextResponse.json({ error: "답하지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
}
