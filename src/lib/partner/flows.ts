/**
 * 자동 알림 — 업체가 켜 두면 조건이 된 고객에게 한 번씩 보낸다 (v3 10.2). 서버 전용. /api/push/run 이 30분마다 부른다.
 *  · 첫 주문 감사: 첫 주문이 배송 완료되고 delay_days 일 지난 사람 (14일 안에만 — 너무 늦게 감사하지 않는다)
 *  · 다시 살 때: 마지막 주문 뒤 (평균 주문 간격, 한 번만 산 사람은 delay_days)일이 지난 사람 (그 뒤 14일 안에만)
 *  · 다시 찾아 주세요: 마지막 주문 뒤 delay_days 일이 지났고 180일은 넘지 않은 사람
 * 모두 광고라 광고 동의자에게만, 21~8시는 야간 동의자에게만. 같은 업체 알림은 한 사람에게 7일에 한 번.
 * 같은 계기(주문)로는 한 번만 보낸다 — flow_sends 의 (업체, 종류, 사람, 계기) 가 겹치면 넣지 못한다.
 */
import { adText, isNight } from "./crm";
import { adsConsented, loadBuyers } from "./customers";
import { COUPON_COLS, couponText, grantCoupon, type Coupon } from "./coupons";
import { WEEK_MS } from "./quota";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const DAY = 86400e3;
const WINDOW = 14 * DAY;

export const FLOWS = {
  first_thanks: { label: "첫 주문 감사", when: "첫 주문이 도착하고 며칠 뒤", days: 2, title: "첫 주문 고마워요", body: "드셔 보니 어떠셨어요? 다음 주문에 쓸 수 있는 혜택을 드려요" },
  replenish: { label: "다시 살 때", when: "평소 주문 간격이 지났을 때 (한 번만 산 사람은 정한 날 수)", days: 14, title: "식단 다시 채울 때예요", body: "자주 드시던 메뉴를 다시 담아 보세요" },
  winback: { label: "다시 찾아 주세요", when: "마지막 주문 뒤 정한 날 수가 지났을 때", days: 60, title: "오랜만이에요", body: "새 메뉴가 나왔어요. 다시 찾아 주시면 혜택을 드려요" },
} as const;
export type FlowKind = keyof typeof FLOWS;
export const isFlowKind = (v: unknown): v is FlowKind => typeof v === "string" && v in FLOWS;

export type Flow = { kind: FlowKind; is_on: boolean; coupon_id: string | null; title: string; body: string; delay_days: number; updated_at: string | null };

/** 업체 자동 알림 설정 — 저장한 적이 없으면 기본값(꺼짐) */
export async function listFlows(sb: Sb, partnerId: string): Promise<Flow[]> {
  const { data, error } = await sb.from("partner_flows").select("kind, is_on, coupon_id, title, body, delay_days, updated_at").eq("partner_id", partnerId);
  if (error) throw new Error(error.message);
  const saved = new Map(((data || []) as Flow[]).map((f) => [f.kind, f]));
  return (Object.keys(FLOWS) as FlowKind[]).map((k) => saved.get(k) || { kind: k, is_on: false, coupon_id: null, title: FLOWS[k].title, body: FLOWS[k].body, delay_days: FLOWS[k].days, updated_at: null });
}

/** 지금 이 알림을 받을 사람 — [사람, 계기] (마지막 주문 id 등) */
function due(kind: FlowKind, b: Awaited<ReturnType<typeof loadBuyers>>[number], delay: number, now: number): string | null {
  const live = b.live;
  if (live.length === 0) return null;
  const last = live[live.length - 1];
  if (kind === "first_thanks") {
    if (live.length !== 1) return null;
    // 배송 완료 시각은 묶음에 없다 — 결제 + 3일을 도착으로 본다 (배송 완료 상태일 때만)
    if (last.status !== "delivered") return null;
    const at = last.at + 3 * DAY + delay * DAY;
    return now >= at && now < at + WINDOW ? `first:${last.id}` : null;
  }
  if (kind === "replenish") {
    const gap = (b.avg_gap ?? delay) * DAY;
    const at = last.at + gap;
    return now >= at && now < at + WINDOW ? `rep:${last.id}` : null;
  }
  const at = last.at + delay * DAY;
  return now >= at && now - last.at < 180 * DAY ? `win:${last.id}` : null;
}

type Push = (userId: string, payload: { title: string; body: string; url: string; tag: string }) => Promise<boolean>;

/** 켜진 자동 알림을 돌린다 */
export async function runFlows(sb: Sb, push?: Push) {
  const now = Date.now();
  const { data: flows, error } = await sb.from("partner_flows").select("partner_id, kind, coupon_id, title, body, delay_days, partners!inner(name, status)")
    .eq("is_on", true).eq("partners.status", "active").limit(500);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || /does not exist|Could not find the table/i.test(error.message || "")) return { sent: 0 };
    throw new Error(error.message);
  }
  type F = { partner_id: string; kind: FlowKind; coupon_id: string | null; title: string; body: string; delay_days: number; partners: { name: string } };
  const night = isNight(now);
  let sent = 0;
  const byPartner = new Map<string, F[]>();
  for (const f of (flows || []) as F[]) (byPartner.get(f.partner_id) || byPartner.set(f.partner_id, []).get(f.partner_id)!).push(f);
  for (const [pid, list] of byPartner) {
    try {
      const buyers = await loadBuyers(sb, pid, now);
      const ads = await adsConsented(sb, buyers.map((b) => b.user));
      // 7일 안에 이 업체 자동 알림을 받은 사람은 건너뛴다
      const { data: recent, error: rErr } = await sb.from("flow_sends").select("user_id").eq("partner_id", pid).gte("sent_at", new Date(now - WEEK_MS).toISOString()).limit(50000);
      if (rErr) throw new Error(rErr.message);
      const capped = new Set(((recent || []) as { user_id: string }[]).map((r) => r.user_id));
      for (const f of list) {
        let coupon: Coupon | null = null;
        if (f.coupon_id) {
          const { data: c, error: cErr } = await sb.from("partner_coupons").select(COUPON_COLS).eq("id", f.coupon_id).eq("status", "active").maybeSingle();
          if (cErr) throw new Error(cErr.message);
          coupon = c;
        }
        for (const b of buyers) {
          const key = due(f.kind, b, f.delay_days, now);
          if (!key || capped.has(b.user)) continue;
          const consent = ads.get(b.user);
          if (!consent || (night && !consent.night)) continue;
          // 먼저 기록을 넣어 같은 계기로 두 번 보내지 않는다
          const body = coupon ? `${f.body} (${coupon.name}: ${couponText(coupon)})` : f.body;
          const { data: ins, error: iErr } = await sb.from("flow_sends").insert({ partner_id: pid, kind: f.kind, user_id: b.user, trigger_key: key, title: f.title, body: body.slice(0, 200) }).select("id");
          if (iErr) { if (iErr.code === "23505") continue; throw new Error(iErr.message); }
          capped.add(b.user);
          sent++;
          if (coupon) {
            const g = await grantCoupon(sb, { id: pid, name: f.partners.name }, coupon, [b.user], "flow", undefined, false); // 쿠폰 알림은 이 알림으로 갈음한다
            if (g.granted === 0) console.error("자동 알림 쿠폰을 주지 못했어요(이미 있음):", pid, f.kind);
          }
          if (push) {
            const t = adText(f.partners.name, f.title, body);
            try {
              if (await push(b.user, { ...t, url: "/me/coupons", tag: `flow-${f.kind}-${pid}` })) {
                await sb.from("flow_sends").update({ pushed: true }).eq("id", ins[0].id);
              }
            } catch (e) { console.error("자동 알림 푸시를 보내지 못했어요:", pid, f.kind, (e as Error).message); } // 알림함에는 들어갔다
          }
        }
      }
    } catch (e) {
      console.error("자동 알림을 돌리지 못했어요:", pid, (e as Error).message);
    }
  }
  return { sent };
}

/** 업체 화면 — 자동 알림마다 지난 30일 보낸 수 */
export async function flowCounts(sb: Sb, partnerId: string) {
  const { data, error } = await sb.from("flow_sends").select("kind").eq("partner_id", partnerId).gte("sent_at", new Date(Date.now() - 30 * DAY).toISOString()).limit(50000);
  if (error) throw new Error(error.message);
  const out: Record<string, number> = {};
  for (const r of (data || []) as { kind: string }[]) out[r.kind] = (out[r.kind] || 0) + 1;
  return out;
}

/** 알림함 — 받은 자동 알림 (30일) */
export async function flowNotifications(sb: Sb, actor: string) {
  const { data, error } = await sb.from("flow_sends").select("id, title, body, sent_at, partners(name)")
    .eq("user_id", actor).gte("sent_at", new Date(Date.now() - 30 * DAY).toISOString()).order("sent_at", { ascending: false }).limit(20);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || /does not exist|Could not find the table/i.test(error.message || "")) return [];
    throw new Error(error.message);
  }
  type R = { id: string; title: string; body: string; sent_at: string; partners: { name: string } | null };
  return ((data || []) as R[]).map((r) => ({ id: `flow-${r.id}`, type: "ad" as const, at: r.sent_at, who: r.partners?.name || "입점 업체", text: `${r.title} — ${r.body}`, url: "/me/coupons" }));
}
