/**
 * 관리자 지급 대기열 — 업체 전체에서 마감했지만 정산을 끝내지 않은 달, 그리고 지난 달을 아직 마감하지 못한 업체. 서버 전용 (11/14 구조 진단 3b).
 *  · 오갈 돈 = 앱 주문 대금(판매 − 쿠폰 + 배송비 − 수수료) − 구매 링크 수수료. 양수면 오늘끼록 → 업체, 음수면 업체 → 오늘끼록.
 *  · 지급일은 다음 달 10일(PAY_DAY). 계좌 번호는 여기서만 전체가 보인다(관리자 전용 API).
 */
import { payDate } from "./payout";
import { closeMonth, orderPayout, previousMonth, type Settlement } from "./settlement";
import { asResult, selectAll } from "@/lib/supabase/all";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type PayoutItem = {
  partner_id: string; name: string; slug: string; month: string; pay_date: string; overdue: boolean;
  order_payout: number; commission: number; net: number; auto_closed: boolean; closed_at: string;
  bank: { name: string | null; holder: string | null; account: string | null }; tax_email: string | null; business_number: string | null;
};
export type Unclosed = { partner_id: string; name: string; slug: string; month: string; net: number | null; reason: string | null };

const net = (s: Pick<Settlement, "order_sales" | "order_shipping" | "order_discount" | "order_fee" | "commission">) => orderPayout(s) - s.commission;
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

export async function payoutQueue(sb: Sb): Promise<{ items: PayoutItem[]; unclosed: Unclosed[]; month: string }> {
  const month = previousMonth();
  const [st, ps] = await Promise.all([
    asResult(selectAll(() => sb.from("partner_settlements").select("partner_id, month, commission, order_sales, order_shipping, order_discount, order_fee, status, closed_at, auto_closed").in("status", ["closed"]), ["month", "id"])),
    sb.from("partners").select("id, name, slug, status, is_demo, tax_email, business_number, bank_name, bank_holder, bank_account"),
  ]);
  if (st.error) throw new Error(st.error.message);
  if (ps.error) throw new Error(ps.error.message);
  type P = { id: string; name: string; slug: string; status: string; is_demo: boolean; tax_email: string | null; business_number: string | null; bank_name: string | null; bank_holder: string | null; bank_account: string | null };
  const byId = new Map(((ps.data || []) as P[]).map((p) => [p.id, p]));
  const today = kstToday();
  const items: PayoutItem[] = [];
  for (const s of (st.data || []) as (Settlement & { partner_id: string; auto_closed: boolean })[]) {
    const p = byId.get(s.partner_id);
    if (!p || p.is_demo) continue;
    const pd = payDate(s.month);
    items.push({
      partner_id: p.id, name: p.name, slug: p.slug, month: s.month, pay_date: pd, overdue: today > pd,
      order_payout: orderPayout(s), commission: s.commission, net: net(s), auto_closed: !!s.auto_closed, closed_at: s.closed_at,
      bank: { name: p.bank_name, holder: p.bank_holder, account: p.bank_account }, tax_email: p.tax_email, business_number: p.business_number,
    });
  }
  // 지난 달을 아직 마감하지 못한 운영 중 업체 — 미리 세어 오갈 돈이 있거나 셀 수 없는(수수료율 없음 등) 업체만
  const { data: closedPrev, error: cErr } = await sb.from("partner_settlements").select("partner_id").eq("month", month);
  if (cErr) throw new Error(cErr.message);
  const has = new Set(((closedPrev || []) as { partner_id: string }[]).map((r) => r.partner_id));
  const unclosed: Unclosed[] = [];
  for (const p of byId.values()) {
    if (p.status !== "active" || p.is_demo || has.has(p.id)) continue;
    try {
      const d = await closeMonth(sb, p.id, month, null, { dry: true });
      if (d && (d.orders > 0 || d.order_sales > 0 || d.confirmed_amount > 0)) unclosed.push({ partner_id: p.id, name: p.name, slug: p.slug, month, net: net(d), reason: null });
    } catch (e) { unclosed.push({ partner_id: p.id, name: p.name, slug: p.slug, month, net: null, reason: (e as Error).message }); }
  }
  items.sort((a, b) => a.pay_date.localeCompare(b.pay_date) || a.name.localeCompare(b.name, "ko"));
  return { items, unclosed, month };
}
