import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { notReady } from "@/lib/partner/crm";

/**
 * 광고성 정보 수신 동의 (정보통신망법 제50조) — 사람 기준, 켜고 끈 기록을 남긴다
 * GET /api/marketing-consent → {ready, ads, night, targeting, ads_at}
 * PUT /api/marketing-consent {ads | night | targeting: boolean} — 한 번에 하나
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
  // 한 번에 하나만 바꾼다 — DB 함수가 사람 줄을 잠그고 지금 값 위에서 바꾸므로, 먼저 읽은 값으로 덮어써 끈 동의가 되살아나지 않는다
  const keys = (["ads", "night", "targeting"] as const).filter((k) => typeof b[k] === "boolean");
  if (keys.length !== 1) return NextResponse.json({ error: "바꿀 설정을 하나만 보내 주세요" }, { status: 400 });
  const key = keys[0];
  const sb = createServiceRoleClient() as Sb;
  const { data, error } = await sb.rpc("marketing_consent_set", { p_user: actor, p_key: key, p_value: b[key] });
  if (error) return NextResponse.json({ error: notReady(error) ? "광고 알림 설정을 준비하고 있어요" : error.message }, { status: notReady(error) ? 503 : 500 });
  return NextResponse.json({ ready: true, ...(data as { ads: boolean; night: boolean; targeting: boolean; ads_at: string | null }) });
}
