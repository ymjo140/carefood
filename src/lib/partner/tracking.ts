/**
 * 택배 조회로 배송 완료 자동 찍기 — 서버 전용. /api/push/run(30분마다)이 부른다.
 *  · 업체가 배송 완료를 누르지 않으면 구매확정 8일이 시작되지 않아 정산이 멈춘다 → 송장으로 택배사에 물어 배송 완료면 대신 찍는다.
 *  · 조회는 tracker.delivery (https://tracker.delivery/docs/tracking-api). 키는 환경 변수 TRACKER_CLIENT_ID · TRACKER_CLIENT_SECRET.
 *    키가 없으면 아무것도 하지 않는다(업체 화면은 "배송 완료를 눌러 주세요" 그대로).
 *  · 발송하고 12시간 뒤부터, 같은 묶음은 3시간에 한 번, 한 번에 묶음 MAX_PER_RUN 개까지 묻는다(무료 키 한도).
 *  · 배송 완료 시각은 택배사가 알려 준 때. 단 7일보다 오래됐으면 7일 전으로 — 늦게 알아차려 구매확정이 이미 지난 달(마감한 달)로 가지 않게.
 *  · 읽은 상태(발송) 그대로일 때만 바꾼다(조건부 update) — 그새 업체가 눌렀거나 취소됐으면 건드리지 않는다.
 */
import { syncOrderStatus } from "@/lib/orders";
import { selectUpTo } from "@/lib/supabase/all";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 우리 택배사 코드 → tracker.delivery carrierId. 직접 배송·그 밖의 택배는 조회하지 않는다 */
export const TRACKER_CARRIER: Record<string, string> = {
  cj: "kr.cjlogistics", hanjin: "kr.hanjin", lotte: "kr.lotte", epost: "kr.epost", logen: "kr.logen",
};
export { TRACK_LABEL } from "@/lib/order-status";

const HOUR = 3600e3;
export const MAX_PER_RUN = 60;
const RECHECK_HOURS = 3;
const FIRST_CHECK_HOURS = 12;
const BACKDATE_LIMIT_DAYS = 7;
const ENDPOINT = "https://apis.tracker.delivery/graphql";

export const trackingReady = () => !!(process.env.TRACKER_CLIENT_ID && process.env.TRACKER_CLIENT_SECRET);

export type TrackResult = { code: string; time: string | null } | null;
type Fetch = typeof fetch;

/** 송장 하나 조회 — 마지막 상태. 송장이 없거나 택배사가 모르면 null */
export async function trackOne(carrier: string, trackingNumber: string, f: Fetch = fetch): Promise<TrackResult> {
  const carrierId = TRACKER_CARRIER[carrier];
  if (!carrierId || !trackingNumber) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await f(ENDPOINT, {
      method: "POST", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `TRACKQL-API-KEY ${process.env.TRACKER_CLIENT_ID}:${process.env.TRACKER_CLIENT_SECRET}` },
      body: JSON.stringify({
        query: "query Track($carrierId: ID!, $trackingNumber: String!) { track(carrierId: $carrierId, trackingNumber: $trackingNumber) { lastEvent { time status { code } } } }",
        variables: { carrierId, trackingNumber },
      }),
    });
    if (!r.ok) throw new Error(`택배 조회 응답 ${r.status}`);
    const d = await r.json();
    // 송장이 없음(NOT_FOUND)은 오류가 아니라 '아직 모름'
    if (d.errors?.length) {
      if (d.errors.some((e: { extensions?: { code?: string } }) => e.extensions?.code === "NOT_FOUND")) return { code: "UNKNOWN", time: null };
      throw new Error(d.errors[0]?.message || "택배 조회 오류");
    }
    const ev = d.data?.track?.lastEvent;
    return ev ? { code: String(ev.status?.code || "UNKNOWN"), time: ev.time || null } : { code: "UNKNOWN", time: null };
  } finally { clearTimeout(t); }
}

type Due = { id: string; order_id: string; partner_id: string; tracking_carrier: string; tracking_number: string; shipped_at: string; tracking_checked_at: string | null };

/** 배송 완료를 대신 찍는다 — { checked: 물어본 묶음, delivered: 배송 완료로 바꾼 묶음, failed } */
export async function autoDeliver(sb: Sb, opt: { now?: number; fetch?: Fetch } = {}): Promise<{ checked: number; delivered: number; failed: number; skipped?: string }> {
  if (!trackingReady()) return { checked: 0, delivered: 0, failed: 0, skipped: "택배 조회 키가 없어요" };
  const now = opt.now ?? Date.now();
  const iso = (t: number) => new Date(t).toISOString();
  // 조회할 줄 — 발송, 조회되는 택배사, 발송 12시간 뒤, 3시간 안에 묻지 않은 것. 오래 안 물은 것부터
  const rows = await selectUpTo<Due>(() => sb.from("order_items").select("id, order_id, partner_id, tracking_carrier, tracking_number, shipped_at, tracking_checked_at")
    .eq("fulfil_status", "shipped").in("tracking_carrier", Object.keys(TRACKER_CARRIER)).not("tracking_number", "is", null)
    .lte("shipped_at", iso(now - FIRST_CHECK_HOURS * HOUR))
    .or(`tracking_checked_at.is.null,tracking_checked_at.lt.${iso(now - RECHECK_HOURS * HOUR)}`), ["tracking_checked_at", "id"], 3000);
  // 묶음(주문 × 업체)마다 한 번 — 같은 송장
  const bundles = new Map<string, Due>();
  for (const r of rows) { const k = `${r.order_id}|${r.partner_id}`; if (!bundles.has(k)) bundles.set(k, r); }
  const out = { checked: 0, delivered: 0, failed: 0 };
  for (const b of [...bundles.values()].slice(0, MAX_PER_RUN)) {
    let res: TrackResult;
    try { res = await trackOne(b.tracking_carrier, b.tracking_number, opt.fetch); }
    catch (e) {
      out.failed++;
      console.error("택배 조회 실패:", b.tracking_carrier, b.order_id, (e as Error).message);
      // 실패도 시각을 적어 다음 차례로 미룬다(같은 송장이 매번 앞을 막지 않게)
      const { error } = await sb.from("order_items").update({ tracking_checked_at: iso(now) }).eq("order_id", b.order_id).eq("partner_id", b.partner_id).eq("fulfil_status", "shipped");
      if (error) throw new Error(error.message);
      continue;
    }
    out.checked++;
    const code = res?.code || "UNKNOWN";
    if (code === "DELIVERED") {
      const said = res?.time ? Date.parse(res.time) : now;
      const at = Math.max(Number.isFinite(said) ? said : now, Date.parse(b.shipped_at), now - BACKDATE_LIMIT_DAYS * 24 * HOUR);
      const { data, error } = await sb.from("order_items").update({
        fulfil_status: "delivered", delivered_at: iso(Math.min(at, now)), delivered_by: "tracking", tracking_status: code, tracking_checked_at: iso(now),
      }).eq("order_id", b.order_id).eq("partner_id", b.partner_id).eq("fulfil_status", "shipped").select("id");
      if (error) throw new Error(error.message);
      if (data?.length) { out.delivered++; await syncOrderStatus(sb, b.order_id); }
    } else {
      const { error } = await sb.from("order_items").update({ tracking_status: code, tracking_checked_at: iso(now) })
        .eq("order_id", b.order_id).eq("partner_id", b.partner_id).eq("fulfil_status", "shipped");
      if (error) throw new Error(error.message);
    }
  }
  return out;
}
