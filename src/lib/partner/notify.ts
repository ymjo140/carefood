/**
 * 업체 알림 — 새 주문·취소 요청을 업체 담당자 기기에 푸시로 알린다. 서버 전용. /api/push/run 이 30분마다 부른다 (11/14 구조 진단 P0).
 *  · 알린 줄에는 partner_notified_at / cancel_notified_at 을 적어 다시 보내지 않는다. 기기가 없어도 적는다(쌓였다가 한꺼번에 가지 않게).
 *  · 담당자(partner_members.auth_user_id) → account_links.actor_id → push_subscriptions. 예시 주문(is_demo)은 보내지 않고 적기만 한다.
 *  · 업무 알림이라 광고 동의·야간 규칙과 무관하다(내용에 혜택·광고 없음).
 */
import { sendToUser, type PushSub } from "@/lib/push";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Line = { id: string; partner_id: string; order_id: string; orders: { is_demo: boolean | null } };

async function memberSubs(sb: Sb, partnerIds: string[]): Promise<Map<string, PushSub[]>> {
  const out = new Map<string, PushSub[]>();
  if (partnerIds.length === 0) return out;
  const { data: ms, error } = await sb.from("partner_members").select("partner_id, auth_user_id").in("partner_id", partnerIds);
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

export async function notifyPartners(sb: Sb, send: boolean): Promise<{ new_orders: number; cancel_requests: number; pushed: number }> {
  const [nw, cr] = await Promise.all([
    sb.from("order_items").select("id, partner_id, order_id, orders!inner(is_demo)").eq("fulfil_status", "new").is("partner_notified_at", null)
      .not("partner_id", "is", null).not("orders.paid_at", "is", null).limit(2000),
    sb.from("order_items").select("id, partner_id, order_id, orders!inner(is_demo)").eq("fulfil_status", "accepted").not("cancel_requested_at", "is", null)
      .is("cancel_notified_at", null).not("partner_id", "is", null).limit(2000),
  ]);
  for (const r of [nw, cr]) if (r.error) throw new Error(r.error.message);
  const newLines = (nw.data || []) as Line[], cancelLines = (cr.data || []) as Line[];
  const newBy = byPartner(newLines), cancelBy = byPartner(cancelLines);
  let pushed = 0;
  if (send) {
    const subs = await memberSubs(sb, [...new Set([...newBy.keys(), ...cancelBy.keys()])]);
    for (const [pid, list] of subs) {
      const n = newBy.get(pid)?.size || 0, c = cancelBy.get(pid)?.size || 0;
      if (!n && !c) continue;
      const title = n && c ? `새 주문 ${n}건 · 취소 요청 ${c}건` : n ? `새 주문 ${n}건이 들어왔어요` : `취소 요청 ${c}건이 왔어요`;
      const body = c ? "보내기 전이면 취소해 주세요. 업체 화면 주문에서 확인할 수 있어요" : "업체 화면 주문에서 먼저 들어온 주문부터 접수해 주세요";
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
  if (send) await Promise.all([mark(newLines.map((l) => l.id), "partner_notified_at"), mark(cancelLines.map((l) => l.id), "cancel_notified_at")]);
  return { new_orders: [...newBy.values()].reduce((s, v) => s + v.size, 0), cancel_requests: [...cancelBy.values()].reduce((s, v) => s + v.size, 0), pushed };
}
