import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { notReady } from "@/lib/partner/crm";

/**
 * 광고성 정보 수신 동의 (정보통신망법 제50조) — 사람 기준, 켜고 끈 기록을 남긴다
 * GET /api/marketing-consent → {ready, ads, night, targeting, ads_at}
 * PUT /api/marketing-consent {ads?, night?, targeting?}
 *   ads 를 끄면 night·targeting 도 같이 끈다. night·targeting 은 ads 가 켜져 있을 때만 켤 수 있다.
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const OFF = { ads: false, night: false, targeting: false, ads_at: null };

export async function GET() {
  await connection();
  const actor = await getActorId();
  if (!actor) return NextResponse.json({ ready: true, ...OFF });
  const sb = createServiceRoleClient() as Sb;
  const { data, error } = await sb.from("marketing_consents").select("ads, night, targeting, ads_at").eq("user_id", actor).maybeSingle();
  if (error) return notReady(error) ? NextResponse.json({ ready: false, ...OFF }) : NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ready: true, ...(data || OFF) });
}

export async function PUT(req: NextRequest) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const b = await req.json().catch(() => ({}));
  const sb = createServiceRoleClient() as Sb;
  const { data: cur, error: rErr } = await sb.from("marketing_consents").select("ads, night, targeting").eq("user_id", actor).maybeSingle();
  if (rErr) return NextResponse.json({ error: notReady(rErr) ? "광고 알림 설정을 준비하고 있어요" : rErr.message }, { status: notReady(rErr) ? 503 : 500 });
  const next = { ads: !!cur?.ads, night: !!cur?.night, targeting: !!cur?.targeting };
  for (const k of ["ads", "night", "targeting"] as const) if (typeof b[k] === "boolean") next[k] = b[k];
  if (!next.ads) { next.night = false; next.targeting = false; }
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { user_id: actor, ...next, updated_at: now };
  const changed = (["ads", "night", "targeting"] as const).filter((k) => next[k] !== !!cur?.[k]);
  for (const k of changed) patch[`${k}_at`] = now;
  const { data, error } = await sb.from("marketing_consents").upsert(patch, { onConflict: "user_id" }).select("ads, night, targeting, ads_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (changed.length) {
    const { error: lErr } = await sb.from("marketing_consent_log").insert(changed.map((k) => ({ user_id: actor, field: k, value: next[k], at: now })));
    if (lErr) console.error("동의 기록을 남기지 못했어요:", lErr.message);
  }
  return NextResponse.json({ ready: true, ...data });
}
