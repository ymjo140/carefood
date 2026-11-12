import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/actor-server";
import { runFeed } from "@/lib/partner/feed";

export const maxDuration = 60;
const DUE_MS = 11.5 * 3600e3; // 하루 두 번
const BUDGET_MS = 45_000;     // 한 번 실행에 쓰는 시간 — 못 돈 피드는 다음 시간에 이어서

/**
 * POST /api/partner/feeds/run — 가져올 때가 된 상품 피드를 가져온다. Supabase 예약 작업(매시 20분)이 부른다.
 * 누가 부를 수 있나: x-cron-secret 이 Vault 의 값과 같을 때(cron_secret_ok) · 관리자.
 */
export async function POST(req: NextRequest) {
  const sb = createServiceRoleClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const cron = req.headers.get("x-cron-secret") || "";
  let allowed = false;
  if (/^[0-9a-f]{64}$/.test(cron)) {
    const { data, error } = await sb.rpc("cron_secret_ok", { p: cron });
    if (error) console.error("예약 작업 비밀값을 확인하지 못했어요:", error.message);
    allowed = data === true;
  } else allowed = !!(await getAdminUser());
  if (!allowed) return NextResponse.json({ error: "권한이 없어요" }, { status: 403 });

  const { data: feeds, error } = await sb.from("partner_feeds")
    .select("partner_id, url, last_hash, failures, last_fetched_at, partners(id, slug, name, kind, status)")
    .eq("is_active", true).order("last_fetched_at", { ascending: true, nullsFirst: true }).limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const started = Date.now();
  const counts: Record<string, number> = { ok: 0, unchanged: 0, failed: 0, waiting: 0 };
  for (const f of feeds || []) {
    if (!f.partners || f.partners.status === "paused") continue;
    if (f.last_fetched_at && Date.now() - Date.parse(f.last_fetched_at) < DUE_MS) continue;
    if (Date.now() - started > BUDGET_MS) { counts.waiting++; continue; }
    const out = await runFeed(sb, f, f.partners);
    counts[out.status]++;
  }
  return NextResponse.json({ feeds: (feeds || []).length, ...counts });
}
