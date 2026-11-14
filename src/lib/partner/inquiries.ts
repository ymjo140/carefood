/**
 * 주문 문의 — 주문자가 판매 업체 묶음에 묻고, 업체가 업체 화면 주문 > 문의에서 답한다. 서버 전용.
 *  · 결제한 주문만, 한 묶음에 답을 기다리는 문의는 INQUIRY_OPEN_MAX 개까지.
 *  · 업체에는 가명 번호(업체마다 다름)·주문 날짜·그 묶음 상품만 — 이름·연락처·건강 정보는 보내지 않는다.
 *  · 답은 한 번만(answer 가 비어 있을 때만 적는 조건부 update). 답에는 금지 표현 사전을 건다 — 질병·치료 효능을 말하지 않게.
 *  · 답하면 주문자에게 푸시(켜 둔 기기가 있으면)와 알림함 소식.
 */
import { INQUIRY_KINDS, INQUIRY_LATE_HOURS, INQUIRY_OPEN_MAX, type InquiryInfo, type InquiryKind } from "@/lib/order-status";
import { pushReady, sendToUser, type PushSub } from "@/lib/push";
import { checkClaimsWith, type ClaimTerm } from "./claims";
import { customerCode } from "./customers";
import { selectAllIn } from "@/lib/supabase/all";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOUR = 3600e3;
const COLS = "id, order_id, partner_id, user_id, kind, body, created_at, answer, answered_at";
type Row = { id: string; order_id: string; partner_id: string; user_id: string; kind: InquiryKind; body: string; created_at: string; answer: string | null; answered_at: string | null };
type Fail = { ok: false; code: "not_found" | "conflict" | "invalid"; message: string };

const info = (r: Row): InquiryInfo => ({ id: r.id, kind: r.kind, body: r.body, created_at: r.created_at, answer: r.answer, answered_at: r.answered_at });

/** 주문자 — 내 주문의 한 판매 업체 묶음에 묻는다 */
export async function buyerAsk(sb: Sb, userId: string, orderId: string, partnerId: string, input: { kind: unknown; body: unknown }): Promise<{ ok: true; inquiry: InquiryInfo } | Fail> {
  if (!UUID.test(orderId) || !UUID.test(partnerId)) return { ok: false, code: "not_found", message: "주문을 찾지 못했어요" };
  const kind = (INQUIRY_KINDS as readonly string[]).includes(String(input.kind)) ? (input.kind as InquiryKind) : null;
  const body = String(input.body ?? "").trim().slice(0, 500);
  if (!kind) return { ok: false, code: "invalid", message: "무엇에 대한 문의인지 골라 주세요" };
  if (body.length < 2) return { ok: false, code: "invalid", message: "물어볼 내용을 적어 주세요" };
  const { data: o, error } = await sb.from("orders").select("id").eq("id", orderId).eq("user_id", userId).not("paid_at", "is", null).maybeSingle();
  if (error) throw new Error(error.message);
  if (!o) return { ok: false, code: "not_found", message: "주문을 찾지 못했어요" };
  const { count: lines, error: lErr } = await sb.from("order_items").select("id", { count: "exact", head: true }).eq("order_id", orderId).eq("partner_id", partnerId);
  if (lErr) throw new Error(lErr.message);
  if (!lines) return { ok: false, code: "not_found", message: "주문을 찾지 못했어요" };
  const { data: open, error: oErr } = await sb.from("order_inquiries").select("id, body").eq("order_id", orderId).eq("partner_id", partnerId).is("answer", null);
  if (oErr) throw new Error(oErr.message);
  if (((open || []) as { body: string }[]).some((q) => q.body === body)) return { ok: false, code: "conflict", message: "같은 문의를 이미 남겼어요. 판매 업체가 답하면 알려 드려요" };
  if ((open || []).length >= INQUIRY_OPEN_MAX) return { ok: false, code: "conflict", message: `답을 기다리는 문의가 ${INQUIRY_OPEN_MAX}개 있어요. 답을 받은 뒤 다시 물어봐 주세요` };
  const { data, error: iErr } = await sb.from("order_inquiries").insert({ order_id: orderId, partner_id: partnerId, user_id: userId, kind, body, answer: null, answered_at: null, created_at: new Date().toISOString() }).select(COLS).single();
  if (iErr) throw new Error(iErr.message);
  return { ok: true, inquiry: info(data as Row) };
}

/** 주문 목록에 붙일 문의 — `${order_id}|${partner_id}` → 오래된 것부터 */
export async function inquiriesByBundle(sb: Sb, orderIds: string[]): Promise<Map<string, InquiryInfo[]>> {
  const out = new Map<string, InquiryInfo[]>();
  if (orderIds.length === 0) return out;
  const rows = (await selectAllIn<Row>(orderIds, 100, (part) => sb.from("order_inquiries").select(COLS).in("order_id", part), "id"))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  for (const r of rows) {
    const k = `${r.order_id}|${r.partner_id}`;
    (out.get(k) || out.set(k, []).get(k)!).push(info(r));
  }
  return out;
}

export type PartnerInquiry = InquiryInfo & {
  order_id: string; customer: string; ordered_at: string | null; status: string | null; late: boolean;
  lines: { name: string; quantity: number }[];
};

/** 업체 — 답할 문의(오래된 것부터 전부, 200개까지) 또는 답한 문의(최근 것부터 50개씩) */
export async function listPartnerInquiries(sb: Sb, partnerId: string, opt: { answered?: boolean; page?: number; now?: number } = {}): Promise<PartnerInquiry[]> {
  const now = opt.now ?? Date.now();
  const page = Math.max(0, opt.page || 0);
  let q = sb.from("order_inquiries").select(COLS).eq("partner_id", partnerId);
  q = opt.answered
    ? q.not("answer", "is", null).order("answered_at", { ascending: false }).range(page * 50, page * 50 + 49)
    : q.is("answer", null).order("created_at", { ascending: true }).limit(200);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data || []) as Row[];
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.map((r) => r.order_id))];
  type It = { order_id: string; product_name: string; quantity: number | null; fulfil_status: string };
  const [items, orders] = await Promise.all([
    selectAllIn<It>(ids, 100, (part) => sb.from("order_items").select("id, order_id, product_name, quantity, fulfil_status").in("order_id", part).eq("partner_id", partnerId), "id"),
    selectAllIn<{ id: string; paid_at: string | null }>(ids, 100, (part) => sb.from("orders").select("id, paid_at").in("id", part), "id"),
  ]);
  const lines = new Map<string, It[]>();
  for (const l of items) (lines.get(l.order_id) || lines.set(l.order_id, []).get(l.order_id)!).push(l);
  const paid = new Map(orders.map((o) => [o.id, o.paid_at]));
  return rows.map((r) => {
    const ls = lines.get(r.order_id) || [];
    const live = ls.filter((l) => l.fulfil_status !== "canceled");
    return {
      ...info(r), order_id: r.order_id, customer: customerCode(partnerId, r.user_id), ordered_at: paid.get(r.order_id) ?? null,
      status: (live[0] || ls[0])?.fulfil_status ?? null,
      late: !r.answer && now - Date.parse(r.created_at) > INQUIRY_LATE_HOURS * HOUR,
      lines: ls.map((l) => ({ name: l.product_name, quantity: l.quantity || 1 })),
    };
  });
}

/** 업체 — 답할 문의 수와 그중 늦은 것 (홈 할 일·주문 탭 건수) */
export async function countInquiries(sb: Sb, partnerId: string, now = Date.now()): Promise<{ open: number; late: number }> {
  const late = new Date(now - INQUIRY_LATE_HOURS * HOUR).toISOString();
  const [a, b] = await Promise.all([
    sb.from("order_inquiries").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).is("answer", null),
    sb.from("order_inquiries").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).is("answer", null).lt("created_at", late),
  ]);
  if (a.error) throw new Error(a.error.message);
  if (b.error) throw new Error(b.error.message);
  return { open: a.count || 0, late: b.count || 0 };
}

/** 업체 — 답하기. 한 번만, 금지 표현이 있으면 막는다. 답한 뒤 주문자에게 알린다(실패해도 답은 그대로) */
export async function answerInquiry(sb: Sb, partner: { id: string; name: string }, authUserId: string | null, id: string, input: unknown, terms: ClaimTerm[] | null):
  Promise<{ ok: true; inquiry: InquiryInfo } | Fail> {
  if (!UUID.test(id)) return { ok: false, code: "not_found", message: "문의를 찾지 못했어요" };
  const answer = String(input ?? "").trim().slice(0, 1000);
  if (answer.length < 2) return { ok: false, code: "invalid", message: "답을 적어 주세요" };
  const hit = checkClaimsWith(terms, answer)[0];
  if (hit) return { ok: false, code: "invalid", message: `‘${hit.phrase}’ — ${hit.why}${hit.suggest ? `. ‘${hit.suggest}’처럼 바꿔 주세요` : ". 바꿔서 다시 답해 주세요"}` };
  const now = new Date().toISOString();
  const { data, error } = await sb.from("order_inquiries").update({ answer, answered_at: now, answered_by: authUserId && UUID.test(authUserId) ? authUserId : null })
    .eq("id", id).eq("partner_id", partner.id).is("answer", null).select(COLS);
  if (error) throw new Error(error.message);
  if (!data?.length) {
    const { data: cur, error: cErr } = await sb.from("order_inquiries").select("id").eq("id", id).eq("partner_id", partner.id).maybeSingle();
    if (cErr) throw new Error(cErr.message);
    return cur ? { ok: false, code: "conflict", message: "그새 다른 담당자가 답했어요. 새로 불러와 주세요" } : { ok: false, code: "not_found", message: "문의를 찾지 못했어요" };
  }
  const row = data[0] as Row;
  await notifyBuyer(sb, row, partner.name);
  return { ok: true, inquiry: info(row) };
}

/** 답을 주문자에게 푸시로 — 예시 주문·기기 없음·키 없음이면 보내지 않는다. 실패는 기록만 */
async function notifyBuyer(sb: Sb, r: Row, partnerName: string) {
  if (!pushReady()) return;
  try {
    const { data: o, error } = await sb.from("orders").select("is_demo").eq("id", r.order_id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!o || o.is_demo) return;
    const { data: subs, error: sErr } = await sb.from("push_subscriptions").select("endpoint, user_id, p256dh, auth").eq("user_id", r.user_id);
    if (sErr) throw new Error(sErr.message);
    if (!subs?.length) return;
    await sendToUser(sb, subs as PushSub[], { title: `${partnerName}가 문의에 답했어요`, body: (r.answer || "").slice(0, 80), url: "/me/orders", tag: `inquiry-${r.id}` });
  } catch (e) { console.error("문의 답 알림을 보내지 못했어요:", (e as Error).message); }
}

/** 주문자 알림함 — 최근 30일에 받은 답 */
export async function inquiryNotifications(sb: Sb, actor: string) {
  const since = new Date(Date.now() - 30 * 24 * HOUR).toISOString();
  const { data, error } = await sb.from("order_inquiries").select("id, answer, answered_at, partners(name)").eq("user_id", actor)
    .not("answer", "is", null).gte("answered_at", since).order("answered_at", { ascending: false }).limit(10);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || /does not exist|Could not find the table/i.test(error.message || "")) return [];
    throw new Error(error.message);
  }
  type R = { id: string; answer: string; answered_at: string; partners: { name: string } | null };
  return ((data || []) as R[]).map((r) => ({ id: `inquiry-${r.id}`, type: "inquiry" as const, at: r.answered_at, who: r.partners?.name || "판매 업체", text: r.answer, url: "/me/orders" }));
}

/** 업체 푸시 — 알리지 않은 새 문의 (notify.ts 가 부른다). 예시 주문은 알리지 않는다 */
export async function pendingInquiryNotices(sb: Sb): Promise<{ ids: string[]; byPartner: Map<string, number> }> {
  const { data, error } = await sb.from("order_inquiries").select("id, partner_id, orders!inner(is_demo)").is("partner_notified_at", null).is("answer", null).limit(1000);
  if (error) throw new Error(error.message);
  const rows = (data || []) as { id: string; partner_id: string; orders: { is_demo: boolean | null } }[];
  const byPartner = new Map<string, number>();
  for (const r of rows) if (!r.orders?.is_demo) byPartner.set(r.partner_id, (byPartner.get(r.partner_id) || 0) + 1);
  return { ids: rows.map((r) => r.id), byPartner };
}
