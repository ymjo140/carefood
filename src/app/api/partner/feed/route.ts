import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPartnerContext } from "@/lib/partner/auth";
import { assertSafeUrl, runFeed } from "@/lib/partner/feed";
import { limitRequest } from "@/lib/rate-limit";

export const maxDuration = 60;
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const COLS = "url, is_active, last_fetched_at, last_status, last_error, last_summary, failures";

/** GET /api/partner/feed[?as=slug] — 내 피드 설정과 마지막 가져오기 결과 */
export async function GET(req: NextRequest) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  const sb: Sb = createServiceRoleClient();
  const { data, error } = await sb.from("partner_feeds").select(COLS).eq("partner_id", ctx.partner.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ feed: data || null });
}

/** PUT /api/partner/feed — {url} 피드 주소 저장 (https · 공개 도메인만) */
export async function PUT(req: NextRequest) {
  const limited = await limitRequest(req, "upload");
  if (limited) return limited;
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  const b = await req.json().catch(() => null);
  const raw = String(b?.url || "").trim();
  if (raw.length > 500) return NextResponse.json({ error: "주소가 너무 길어요" }, { status: 400 });
  let url: string;
  try { url = (await assertSafeUrl(raw)).toString(); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  const sb: Sb = createServiceRoleClient();
  const now = new Date().toISOString();
  const { data, error } = await sb.from("partner_feeds").upsert({
    partner_id: ctx.partner.id, url, is_active: true, last_hash: null, failures: 0, updated_at: now,
  }, { onConflict: "partner_id" }).select(COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ feed: data });
}

/** POST /api/partner/feed — 지금 가져오기 */
export async function POST(req: NextRequest) {
  const limited = await limitRequest(req, "upload");
  if (limited) return limited;
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  const sb: Sb = createServiceRoleClient();
  const { data: feed, error } = await sb.from("partner_feeds").select("partner_id, url, last_hash, failures").eq("partner_id", ctx.partner.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!feed) return NextResponse.json({ error: "피드 주소를 먼저 저장해 주세요" }, { status: 400 });
  const outcome = await runFeed(sb, feed, ctx.partner);
  return NextResponse.json({ outcome });
}

/** DELETE /api/partner/feed — 피드 끄기 (받은 제품은 그대로 둔다) */
export async function DELETE(req: NextRequest) {
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  const sb: Sb = createServiceRoleClient();
  const { error } = await sb.from("partner_feeds").delete().eq("partner_id", ctx.partner.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
