/**
 * 연동 상태 — 내 정보가 최신인가 (v3 7.8). 서버 전용.
 * 마지막으로 받은 때 · 그때 실패한 줄 · 확인이 오래된 가격 · 구매 확정 보고(마지막 보고, 클릭 대비, 끊긴 날)
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const DAY = 86400e3;
/** 제품 상세에서 고친 것의 기록 이름 (ingest_batches.file_name) */
export const WEB_EDIT = "화면에서 고침";

export type ConnectStatus = {
  last: { at: string; via: "excel" | "feed" | "api" | "web"; rows: number; failed: number; review: number } | null;
  feed: { active: boolean; status: string | null; failures: number; error: string | null } | null;
  prices: { total: number; stale50: number; stale60: number };
  reports: { last_at: string | null; gap_days: number | null; clicks_28: number; reports_28: number };
};

export async function buildConnectStatus(sb: Sb, pid: string): Promise<ConnectStatus> {
  const now = Date.now();
  const since = new Date(now - 28 * DAY).toISOString();
  const [batch, feed, offers, convLast, conv28, clicks28] = await Promise.all([
    sb.from("ingest_batches").select("channel, file_name, created_at, row_count, error_count, review_count").eq("partner_id", pid).order("created_at", { ascending: false }).limit(1),
    sb.from("partner_feeds").select("is_active, last_status, failures, last_error").eq("partner_id", pid).maybeSingle(),
    sb.from("partner_offers").select("updated_at").eq("partner_id", pid).eq("is_available", true).limit(20000),
    sb.from("partner_conversions").select("created_at").eq("partner_id", pid).order("created_at", { ascending: false }).limit(1),
    sb.from("partner_conversions").select("id", { count: "exact", head: true }).eq("partner_id", pid).gte("created_at", since),
    sb.from("product_clicks").select("id", { count: "exact", head: true }).eq("partner_id", pid).gte("created_at", since),
  ]);
  for (const r of [batch, feed, offers, convLast, conv28, clicks28]) if (r.error) throw new Error(r.error.message);

  const b = batch.data?.[0] as { channel: "excel" | "feed" | "api"; file_name: string | null; created_at: string; row_count: number; error_count: number; review_count: number } | undefined;
  const ages = ((offers.data || []) as { updated_at: string }[]).map((o) => (now - Date.parse(o.updated_at)) / DAY);
  const lastConv = convLast.data?.[0]?.created_at as string | undefined;
  return {
    // 제품 상세에서 고친 것은 API 길로 받지만 화면에는 "화면에서 고침"으로 (app/api/partner/items/[id])
    last: b ? { at: b.created_at, via: b.channel === "api" && b.file_name === WEB_EDIT ? "web" : b.channel, rows: b.row_count, failed: b.error_count, review: b.review_count } : null,
    feed: feed.data ? { active: feed.data.is_active, status: feed.data.last_status, failures: feed.data.failures || 0, error: feed.data.last_error } : null,
    prices: { total: ages.length, stale50: ages.filter((a) => a >= 50 && a < 60).length, stale60: ages.filter((a) => a >= 60).length },
    reports: {
      last_at: lastConv || null,
      gap_days: lastConv ? Math.floor((now - Date.parse(lastConv)) / DAY) : null,
      clicks_28: clicks28.count || 0, reports_28: conv28.count || 0,
    },
  };
}
