/**
 * 업체 알림 — 새 주문·취소 요청·반품·교환 요청을 업체 담당자 기기에 푸시로 알린다. 서버 전용. /api/push/run 이 30분마다 부른다 (11/14 구조 진단 P0).
 *  · 알린 줄에는 partner_notified_at / cancel_notified_at 을 적어 다시 보내지 않는다. 기기가 없어도 적는다(쌓였다가 한꺼번에 가지 않게).
 *  · 담당자(partner_members.auth_user_id) → account_links.actor_id → push_subscriptions. 예시 주문(is_demo)은 보내지 않고 적기만 한다.
 *  · 담당자마다 설정에서 끌 수 있다(partner_members.notify_orders). 모두 껐어도 알린 것으로 적는다 — 다시 켜도 지난 주문이 한꺼번에 오지 않게.
 *  · 업무 알림이라 광고 동의·야간 규칙과 무관하다(내용에 혜택·광고 없음).
 */
import { sendToUser, type PushSub } from "@/lib/push";
import { asResult, selectUpTo } from "@/lib/supabase/all";
import { pendingInquiryNotices } from "./inquiries";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Line = { id: string; partner_id: string; order_id: string; orders: { is_demo: boolean | null } };

async function memberSubs(sb: Sb, partnerIds: string[]): Promise<Map<string, PushSub[]>> {
  const out = new Map<string, PushSub[]>();
  if (partnerIds.length === 0) return out;
  const { data: ms, error } = await sb.from("partner_members").select("partner_id, auth_user_id").in("partner_id", partnerIds).eq("notify_orders", true); // 설정 > 담당자·알림에서 끈 사람은 뺀다
  if (error) throw new Error(error.message);
  const auth = [...new Set(((ms || []) as { auth_user_id: string }[]).map((m) => m.auth_user_id).filter(Boolean))];
  if (auth.length === 0) return out;
  const { data: links, error: lErr } = await sb.from("account_links").select("auth_user_id, actor_id").in("auth_user_id", auth);
  if (lErr) throw new Error(lErr.message);
  const actorOf = new Map(((links || []) as { auth_user_id: string; actor_id: string }[]).map((l) => [l.auth_user_id, l.actor_id]));
  const actors = [...new Set(actorOf.values())];
  if (actors.length === 0) return out;
  const { data: subs, error: sErr } = await sb.from("push_subscriptions").select("endpoint, user_id, p256dh, auth").in("user_id", actors);
  if (sErr) throw new Error(sErr.message);
  for (const m of (ms || []) as { partner_id: string; auth_user_id: string }[]) {
    const actor = actorOf.get(m.auth_user_id);
    const mine = ((subs || []) as PushSub[]).filter((x) => x.user_id === actor);
    if (mine.length) out.set(m.partner_id, [...(out.get(m.partner_id) || []), ...mine]);
  }
  return out;
}

/** 알릴 줄 → 업체별 주문 수 (예시 주문 뺌) */
function byPartner(lines: Line[]) {
  const m = new Map<string, Set<string>>();
  for (const l of lines) if (!l.orders?.is_demo) (m.get(l.partner_id) || m.set(l.partner_id, new Set()).get(l.partner_id)!).add(l.order_id);
  return m;
}

export async function notifyPartners(sb: Sb, send: boolean): Promise<{ new_orders: number; cancel_requests: number; return_requests: number; inquiries: number; pushed: number }> {
  // 한 번에 10,000줄까지(1,000줄씩) — 남은 줄은 30분 뒤 다음 차례에 (알린 줄만 적는다)
  const take = (make: () => any) => asResult(selectUpTo<Line>(make, "id", 10000)); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [nw, cr, rr] = await Promise.all([
    take(() => sb.from("order_items").select("id, partner_id, order_id, orders!inner(is_demo)").eq("fulfil_status", "new").is("partner_notified_at", null)
      .not("partner_id", "is", null).not("orders.paid_at", "is", null)),
    take(() => sb.from("order_items").select("id, partner_id, order_id, orders!inner(is_demo)").eq("fulfil_status", "accepted").not("cancel_requested_at", "is", null)
      .is("cancel_notified_at", null).not("partner_id", "is", null)),
    take(() => sb.from("order_items").select("id, partner_id, order_id, orders!inner(is_demo)").eq("fulfil_status", "delivered").eq("return_status", "requested")
      .is("return_notified_at", null).not("partner_id", "is", null)),
  ]);
  for (const r of [nw, cr, rr]) if (r.error) throw new Error(r.error.message);
  const newLines = (nw.data || []) as Line[], cancelLines = (cr.data || []) as Line[], returnLines = (rr.data || []) as Line[];
  const newBy = byPartner(newLines), cancelBy = byPartner(cancelLines), returnBy = byPartner(returnLines);
  const asked = await pendingInquiryNotices(sb);
  let pushed = 0;
  if (send) {
    const subs = await memberSubs(sb, [...new Set([...newBy.keys(), ...cancelBy.keys(), ...returnBy.keys(), ...asked.byPartner.keys()])]);
    for (const [pid, list] of subs) {
      const n = newBy.get(pid)?.size || 0, c = cancelBy.get(pid)?.size || 0, rq = returnBy.get(pid)?.size || 0, q = asked.byPartner.get(pid) || 0;
      if (!n && !c && !rq && !q) continue;
      const parts = [n && `새 주문 ${n}건`, c && `취소 요청 ${c}건`, rq && `반품·교환 요청 ${rq}건`, q && `문의 ${q}건`].filter(Boolean) as string[];
      const title = parts.length > 1 ? parts.join(" · ") : n ? `새 주문 ${n}건이 들어왔어요` : c ? `취소 요청 ${c}건이 왔어요` : rq ? `반품·교환 요청 ${rq}건이 왔어요` : `주문 문의 ${q}건이 왔어요`;
      const body = c ? "보내기 전이면 취소해 주세요. 업체 화면 주문에서 확인할 수 있어요"
        : rq && !n ? "업체 화면 주문 > 반품·교환에서 받아들이거나 거절해 주세요. 답할 때까지 구매확정이 멈춰요"
        : q && !n ? "업체 화면 주문 > 문의에서 답해 주세요. 답하면 주문자에게 바로 알려요"
        : "업체 화면 주문에서 먼저 들어온 주문부터 접수해 주세요";
      if (await sendToUser(sb, list, { title, body, url: `/partner?tab=orders`, tag: `partner-orders-${pid}` })) pushed++;
    }
  }
  const now = new Date().toISOString();
  const mark = async (ids: string[], col: string) => {
    for (let i = 0; i < ids.length; i += 300) {
      const { error } = await sb.from("order_items").update({ [col]: now }).in("id", ids.slice(i, i + 300)).is(col, null);
      if (error) throw new Error(error.message);
    }
  };
  // 푸시 키가 없을 때는 적지 않는다 — 키가 생기면 그때 알린다
  if (send) {
    await Promise.all([mark(newLines.map((l) => l.id), "partner_notified_at"), mark(cancelLines.map((l) => l.id), "cancel_notified_at"), mark(returnLines.map((l) => l.id), "return_notified_at")]);
    for (let i = 0; i < asked.ids.length; i += 300) {
      const { error } = await sb.from("order_inquiries").update({ partner_notified_at: now }).in("id", asked.ids.slice(i, i + 300)).is("partner_notified_at", null);
      if (error) throw new Error(error.message);
    }
  }
  const total = (m: Map<string, Set<string>>) => [...m.values()].reduce((s, v) => s + v.size, 0);
  return { new_orders: total(newBy), cancel_requests: total(cancelBy), return_requests: total(returnBy), inquiries: [...asked.byPartner.values()].reduce((s, v) => s + v, 0), pushed };
}
