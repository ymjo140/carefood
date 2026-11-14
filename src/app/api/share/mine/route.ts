import { NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";

/**
 * GET /api/share/mine — 내가 실제로 공유한 링크(공유·저장·복사를 누른 것)와 링크마다 본 사람 수·같이 시작한 사람 수.
 * 사람 수만 준다 — 누가 봤는지는 보이지 않는다. 끈 링크는 빼고, 최근 100개.
 */
export async function GET() {
  await connection();
  const actor = await getActorId();
  if (!actor) return noActor();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { data: links, error } = await sb.from("share_links").select("code, kind, target_url, card_url, created_at, shared_at")
    .eq("owner", actor).is("revoked_at", null).not("shared_at", "is", null).order("shared_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const codes = ((links || []) as { code: string }[]).map((l) => l.code);
  const counts = new Map<string, { visitors: Set<string>; joins: Set<string> }>();
  if (codes.length) {
    const { data: ev, error: eErr } = await sb.from("share_events").select("code, visitor, type").in("code", codes).limit(20000);
    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });
    for (const e of (ev || []) as { code: string; visitor: string; type: string }[]) {
      const c = counts.get(e.code) || counts.set(e.code, { visitors: new Set(), joins: new Set() }).get(e.code)!;
      if (e.type === "visit") c.visitors.add(e.visitor);
      if (e.type === "join") c.joins.add(e.visitor);
    }
  }
  const items = ((links || []) as { code: string; kind: string; target_url: string; card_url: string | null; created_at: string; shared_at: string }[]).map((l) => ({
    ...l, visitors: counts.get(l.code)?.visitors.size ?? 0, joins: counts.get(l.code)?.joins.size ?? 0,
  }));
  return NextResponse.json({
    items,
    total: { visitors: items.reduce((a, i) => a + i.visitors, 0), joins: items.reduce((a, i) => a + i.joins, 0) },
  });
}
