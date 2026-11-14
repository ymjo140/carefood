/**
 * 구매 수수료(CPS) — 업체가 돌려준 주문을 클릭 번호와 맞춘다. 서버 전용.
 * 인정: 클릭 번호가 이 업체 링크의 것이고, 주문이 클릭 뒤 attribution_days(기본 7일) 안.
 * 수수료 = 구매확정 금액 × 받은 때의 수수료율. 같은 주문 번호를 다시 올리면 상태·금액을 고친다.
 */
import type { RowError } from "./ingest";
import { selectAll } from "@/lib/supabase/all";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES: Record<string, string> = {
  ordered: "ordered", confirmed: "confirmed", canceled: "canceled", cancelled: "canceled", returned: "returned",
  주문: "ordered", 구매확정: "confirmed", 취소: "canceled", 반품: "returned",
};
export const DEFAULT_ATTRIBUTION_DAYS = 7;

/** "2026-11-12" · "2026-11-12 14:30" (한국 시간) → ISO */
function parseKst(v: unknown): string | null {
  const raw = String(v ?? "").trim();
  // API 는 시간대가 붙은 ISO 시각도 보낸다 (2026-11-12T14:30:00+09:00 · …Z)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(raw)) {
    const t = Date.parse(raw);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  const s = raw.replace("T", " ");
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const t = Date.parse(`${m[1]}T${m[2] || "00"}:${m[3] || "00"}:${m[4] || "00"}+09:00`);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export async function ingestConversions(sb: Sb, partnerId: string, rows: { row: number; values: Record<string, unknown> }[]) {
  const { data: pa, error: pErr } = await sb.from("partners").select("commission_rate, attribution_days").eq("id", partnerId).single();
  if (pErr) throw new Error(pErr.message);
  const days = pa.attribution_days ?? DEFAULT_ATTRIBUTION_DAYS;
  const rate = pa.commission_rate === null || pa.commission_rate === undefined ? null : Number(pa.commission_rate);
  const errors: RowError[] = [];
  const good: { row: number; click_id: string; order_no: string; amount: number; status: string; ordered_at: string }[] = [];
  const seen = new Set<string>();

  for (const r of rows) {
    const v = r.values;
    const click_id = String(v.click_id ?? "").trim().toLowerCase();
    const order_no = String(v.order_no ?? "").trim().slice(0, 80);
    const amount = Number(String(v.amount ?? "").replace(/,/g, ""));
    const status = STATUSES[String(v.status ?? "").trim().toLowerCase()];
    const ordered_at = parseKst(v.ordered_at);
    const bad = (field: string, message: string) => errors.push({ row: r.row, sku: order_no || undefined, field, message });
    if (!UUID.test(click_id)) { bad("click_id", "클릭 번호 형식이 아니에요 (링크의 cf_click 값)"); continue; }
    if (!order_no) { bad("order_no", "주문 번호를 채워 주세요"); continue; }
    if (seen.has(order_no)) { bad("order_no", "같은 주문 번호가 이 파일에 두 번 있어요"); continue; }
    if (!(Number.isInteger(amount) && amount >= 0 && amount <= 100_000_000)) { bad("amount", "결제 금액은 0 이상의 정수(원)여야 해요"); continue; }
    if (!status) { bad("status", "상태는 ordered·confirmed·canceled·returned 중 하나예요"); continue; }
    if (!ordered_at) { bad("ordered_at", "주문 시각은 2026-11-12 14:30 처럼 적어 주세요"); continue; }
    seen.add(order_no);
    good.push({ row: r.row, click_id, order_no, amount, status, ordered_at });
  }

  // 클릭 번호 확인 — 이 업체 링크에서 나온 번호만
  const clicks = new Map<string, { product_id: string | null; created_at: string }>();
  const ids = [...new Set(good.map((g) => g.click_id))];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb.from("product_clicks").select("click_id, product_id, created_at").eq("partner_id", partnerId).in("click_id", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const c of data || []) clicks.set(c.click_id, c);
  }

  const now = new Date().toISOString();
  const upserts = [];
  for (const g of good) {
    const c = clicks.get(g.click_id);
    if (!c) { errors.push({ row: g.row, sku: g.order_no, field: "click_id", message: "오늘끼록 링크에서 나온 클릭 번호가 아니에요" }); continue; }
    const gap = Date.parse(g.ordered_at) - Date.parse(c.created_at);
    // 주문 시각을 날짜만 적으면 그날 0시로 읽으므로 하루까지는 앞서도 받는다
    if (gap < -86400e3) { errors.push({ row: g.row, sku: g.order_no, field: "ordered_at", message: "주문 시각이 클릭보다 빨라요" }); continue; }
    if (gap > days * 86400e3) { errors.push({ row: g.row, sku: g.order_no, field: "ordered_at", message: `클릭 뒤 ${days}일이 지난 주문이에요 (인정 기간 밖)` }); continue; }
    upserts.push({
      partner_id: partnerId, click_id: g.click_id, product_id: c.product_id, order_no: g.order_no, amount: g.amount, status: g.status,
      ordered_at: g.ordered_at, commission_rate: rate,
      commission: g.status === "confirmed" && rate !== null ? Math.round((g.amount * rate) / 100) : null, updated_at: now,
    });
  }
  for (let i = 0; i < upserts.length; i += 200) {
    const { error } = await sb.from("partner_conversions").upsert(upserts.slice(i, i + 200), { onConflict: "partner_id,order_no" });
    if (error) throw new Error(error.message);
  }
  return { rows: rows.length, saved: upserts.length, error: rows.length - upserts.length, errors: errors.slice(0, 500) };
}

export type MonthSummary = { month: string; clicks: number; orders: number; confirmed: number; confirmed_amount: number; commission: number; canceled: number };

/** 최근 6개월 — 한국 시간 달별 클릭·주문·구매확정·수수료 */
/** sinceMs: 셀 시작(달 첫날 한국 자정으로 맞춰 주면 첫 달도 온전히 센다). 없으면 185일 전 */
export async function monthlySummary(sb: Sb, partnerId: string, sinceMs?: number): Promise<MonthSummary[]> {
  const since = new Date(sinceMs ?? Date.now() - 185 * 86400e3).toISOString();
  const month = (iso: string) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 7);
  // 클릭은 줄을 다 받지 않고 달마다 건수만 센다(한국 시간 달 경계, 첫 달은 since 부터)
  const months: { m: string; from: string; to: string }[] = [];
  for (let m = month(since); ; ) {
    const [y, mm] = m.split("-").map(Number);
    const next = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
    const from = new Date(`${m}-01T00:00:00+09:00`).toISOString();
    months.push({ m, from: from < since ? since : from, to: new Date(`${next}-01T00:00:00+09:00`).toISOString() });
    if (m === month(new Date().toISOString())) break;
    m = next;
  }
  const [counts, conv] = await Promise.all([
    Promise.all(months.map((x) => sb.from("product_clicks").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).gte("created_at", x.from).lt("created_at", x.to))),
    selectAll<{ ordered_at: string; amount: number; status: string; commission: number | null }>(() => sb.from("partner_conversions").select("ordered_at, amount, status, commission").eq("partner_id", partnerId).gte("ordered_at", since), "id", 1_000_000),
  ]);
  const o = { data: conv };
  const by = new Map<string, MonthSummary>();
  const get = (m: string) => by.get(m) || by.set(m, { month: m, clicks: 0, orders: 0, confirmed: 0, confirmed_amount: 0, commission: 0, canceled: 0 }).get(m)!;
  months.forEach((x, i) => {
    const r = counts[i] as { count: number | null; error: { message: string } | null };
    if (r.error) throw new Error(r.error.message);
    if (r.count) get(x.m).clicks += r.count;
  });
  for (const r of o.data || []) {
    const s = get(month(r.ordered_at));
    s.orders++;
    if (r.status === "confirmed") { s.confirmed++; s.confirmed_amount += r.amount; s.commission += r.commission || 0; }
    if (r.status === "canceled" || r.status === "returned") s.canceled++;
  }
  return [...by.values()].sort((a, b) => b.month.localeCompare(a.month));
}
