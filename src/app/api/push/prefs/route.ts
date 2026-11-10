import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { pushPublicKey } from "@/lib/push";

/**
 * GET /api/push/prefs — 알림 종류별 켜짐 + 켜 둔 기기 수 + 서버 준비 여부
 * PUT /api/push/prefs { meals?, weekly?, community?, challenge? }
 */
const KEYS = ["meals", "weekly", "community", "challenge"] as const;
const DEFAULTS = { meals: true, weekly: true, community: true, challenge: true };

export async function GET() {
  await connection();
  const actor = await getActorId();
  if (!actor) return NextResponse.json({ prefs: DEFAULTS, devices: 0, ready: !!pushPublicKey() });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const [p, d] = await Promise.all([
    sb.from("notification_prefs").select("meals, weekly, community, challenge").eq("user_id", actor).maybeSingle(),
    sb.from("push_subscriptions").select("endpoint", { count: "exact", head: true }).eq("user_id", actor),
  ]);
  if (p.error || d.error) return NextResponse.json({ error: (p.error || d.error).message }, { status: 500 });
  return NextResponse.json({ prefs: p.data || DEFAULTS, devices: d.count || 0, ready: !!pushPublicKey() });
}

export async function PUT(request: NextRequest) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const body = await request.json().catch(() => ({}));
  const patch: Record<string, boolean | string> = { user_id: actor, updated_at: new Date().toISOString() };
  for (const k of KEYS) if (typeof body[k] === "boolean") patch[k] = body[k];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { data, error } = await sb.from("notification_prefs").upsert(patch, { onConflict: "user_id" }).select("meals, weekly, community, challenge").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prefs: data });
}
