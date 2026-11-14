import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { cardFor, cardIdOk } from "@/lib/share-card-server";

/**
 * GET /api/community/share-card?kind=meal|challenge|group_buy|day|streak&id= — 인증 카드에 그릴 것 (내 것만)
 * 무엇을 넣는지는 lib/share-card-server.ts
 */
export async function GET(request: NextRequest) {
  await connection();
  const actor = await getActorId();
  if (!actor) return noActor();
  const kind = request.nextUrl.searchParams.get("kind");
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!cardIdOk(kind, id)) return NextResponse.json({ error: "카드로 만들 것을 골라 주세요" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  try {
    const r = await cardFor(sb, actor, kind, id);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ card: r.card });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
