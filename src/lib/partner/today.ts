/**
 * 업체 화면 '오늘' — 유형별 숫자 4개 · 할 일 Top 3 · 퍼널 한 줄 · 수요 한 줄. 서버 전용. (v3 6장·7.1)
 * 할 일은 팔리지 않게 막는 일(반려·가격 오래됨·추천 제외·전환 보고 끊김)을 먼저, 기회(공구·주문 간격·발송 결과)를 뒤에 둔다.
 * 숫자는 모두 집계이고, 사람 수를 세는 값은 10명 미만이면 주지 않는다.
 */
import { ORDERING_ENABLED } from "@/lib/features";
import { buildReport } from "./report";
import { buildDemand } from "./demand";
import { campaignResult, notReady } from "./crm";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const DAY = 86400e3;
const MIN_PEOPLE = 10;

import type { Tab } from "./tabs";
export type Kpi = { label: string; value: string; unit?: string; tab: Tab; note?: string; how: string };
export type Task = { kind: string; title: string; reason: string; action: string; tab: Tab; filter?: string; blocking: boolean; weight: number };

const n = (v: number) => v.toLocaleString("ko-KR");

export async function buildToday(sb: Sb, partner: { id: string; kind: string; name: string; is_demo?: boolean }) {
  const pid = partner.id;
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();

  const [itemsRes, offersRes, clicks7, conv28, convLast] = await Promise.all([
    sb.from("partner_items").select("id, partner_sku, status, reject_note, product_id, data->>name, data->>available_to").eq("partner_id", pid).limit(5000),
    sb.from("partner_offers").select("item_id, updated_at, is_available").eq("partner_id", pid).limit(10000),
    sb.from("product_clicks").select("id", { count: "exact", head: true }).eq("partner_id", pid).gte("created_at", iso(now - 7 * DAY)),
    sb.from("partner_conversions").select("amount, status, ordered_at").eq("partner_id", pid).gte("ordered_at", iso(now - 28 * DAY)).limit(20000),
    sb.from("partner_conversions").select("created_at").eq("partner_id", pid).order("created_at", { ascending: false }).limit(1),
  ]);
  for (const r of [itemsRes, offersRes, clicks7, conv28, convLast]) if (r.error) throw new Error(r.error.message);

  type Item = { id: string; partner_sku: string; status: string; reject_note: string | null; product_id: string | null; name: string; available_to: string | null };
  const items = (itemsRes.data || []) as Item[];
  const approved = items.filter((i) => i.status === "approved" && i.product_id);
  const rejected = items.filter((i) => i.status === "rejected");

  // 추천에서 빠진 이유 — 제품의 표시
  const flags = new Map<string, { rec_hold: string | null; nutrition_flag: string | null; is_purchasable: boolean | null }>();
  for (let i = 0; i < approved.length; i += 200) {
    const { data, error } = await sb.from("products").select("id, rec_hold, nutrition_flag, is_purchasable").in("id", approved.slice(i, i + 200).map((a) => a.product_id));
    if (error) throw new Error(error.message);
    for (const p of data || []) flags.set(p.id, p);
  }
  const dropped = { nutrition: 0, link: 0, window: 0 };
  for (const a of approved) {
    const f = flags.get(a.product_id!);
    if (!f) continue;
    if (f.nutrition_flag) dropped.nutrition++;
    else if (f.rec_hold) dropped.link++;
    else if (f.is_purchasable === false) dropped.window++;
  }

  // 가격 확인일 — 60일이 넘으면 앱에서 감춰진다, 50일부터 알린다
  const offers = (offersRes.data || []) as { item_id: string; updated_at: string; is_available: boolean }[];
  const lastByItem = new Map<string, number>();
  for (const o of offers) lastByItem.set(o.item_id, Math.max(lastByItem.get(o.item_id) || 0, Date.parse(o.updated_at)));
  const approvedIds = new Set(approved.map((a) => a.id));
  let stale50 = 0, stale60 = 0;
  for (const [itemId, t] of lastByItem) {
    if (!approvedIds.has(itemId)) continue;
    const age = (now - t) / DAY;
    if (age >= 60) stale60++; else if (age >= 50) stale50++;
  }

  // 판매 종료 임박 (식단 서비스 메뉴) — 7일 안에 판매 기간이 끝나는 것
  const today = new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
  const in7 = new Date(now + 9 * 3600e3 + 7 * DAY).toISOString().slice(0, 10);
  const ending = approved.filter((a) => a.available_to && a.available_to >= today && a.available_to <= in7).length;

  // 성과 28일 (퍼널·본 사람 목표)
  const report = await buildReport(sb, approved.map((a) => ({ product_id: a.product_id!, partner_sku: a.partner_sku, name: a.name })), 28);
  const confirmed = ((conv28.data || []) as { amount: number; status: string }[]).filter((c) => c.status === "confirmed");
  const purchaseAmount = confirmed.reduce((s, c) => s + c.amount, 0);
  const lastConv = convLast.data?.[0]?.created_at ? Date.parse(convLast.data[0].created_at) : null;
  const gapDays = lastConv ? Math.floor((now - lastConv) / DAY) : null;
  const clicksWeek = clicks7.count || 0;

  // 공구 — 내 제품에 연결된 모집 중 공구가 목표의 절반을 넘었는지
  const productIds = approved.map((a) => a.product_id!);
  let groupBuy: { title: string; current: number; target: number } | null = null;
  if (productIds.length) {
    const { data, error } = await sb.from("group_buys").select("title, current_count, target_count").in("product_id", productIds.slice(0, 300)).eq("status", "recruiting")
      .or(`expires_at.is.null,expires_at.gt.${new Date(now).toISOString()}`).limit(50); // 마감 지난 공구는 뺀다
    if (error) throw new Error(error.message);
    const half = ((data || []) as { title: string; current_count: number; target_count: number }[])
      .filter((g) => g.target_count > 0 && g.current_count * 2 >= g.target_count).sort((a, b) => b.current_count - a.current_count)[0];
    if (half) groupBuy = { title: half.title, current: half.current_count, target: half.target_count };
  }

  // 앱 주문 (켜진 경우 · 테스트 업체는 예시 주문) — 이번 주 주문 · 재주문률 · 주문 간격이 벌어진 고객 수
  let orders: { week: number; repeat: number | null; gap: number } | null = null;
  if (ORDERING_ENABLED || partner.is_demo) {
    const { data, error } = await sb.from("order_items").select("order_id, orders!inner(user_id, created_at, paid_at)").eq("partner_id", pid)
      .gte("orders.created_at", iso(now - 90 * DAY)).not("orders.paid_at", "is", null).limit(20000);
    if (error) throw new Error(error.message);
    const byOrder = new Map<string, { user: string; at: number }>();
    for (const r of (data || []) as { order_id: string; orders: { user_id: string; created_at: string } }[]) byOrder.set(r.order_id, { user: r.orders.user_id, at: Date.parse(r.orders.created_at) });
    const byUser = new Map<string, number[]>();
    for (const o of byOrder.values()) byUser.set(o.user, [...(byUser.get(o.user) || []), o.at]);
    const week = [...byOrder.values()].filter((o) => o.at > now - 7 * DAY).length;
    const buyers = [...byUser.values()];
    const repeaters = buyers.filter((t) => t.length >= 2);
    const gap = repeaters.filter((t) => Math.max(...t) < now - 14 * DAY).length;
    orders = { week, repeat: buyers.length >= MIN_PEOPLE ? Math.round((repeaters.length / buyers.length) * 100) : null, gap: gap >= MIN_PEOPLE ? gap : 0 };
  }

  // 고객층 발송 결과 — 7일 셈이 끝난 지 7일 안의 것 (표가 없으면 건너뛴다)
  let segmentResult: { title: string; click_rate: number | null; holdout: number | null } | null = null;
  {
    const { data, error } = await sb.from("partner_campaigns").select("id, title, sent_at").eq("partner_id", pid).eq("status", "sent")
      .gte("sent_at", iso(now - 14 * DAY)).lte("sent_at", iso(now - 7 * DAY)).order("sent_at", { ascending: false }).limit(1);
    if (error && !notReady(error)) throw new Error(error.message);
    if (data?.[0]) {
      const r = await campaignResult(sb, pid, data[0]);
      segmentResult = { title: data[0].title, click_rate: r.click_rate, holdout: r.holdout_click_rate };
    }
  }

  // 수요 한 줄 — 찾는 사람에 비해 제품이 가장 적은 조건
  const demand = await buildDemand(sb, pid);
  const gapRow = demand.segments.find((s) => s.share !== null) || null;

  // ── 할 일 ──
  const tasks: Task[] = [];
  if (rejected.length) tasks.push({
    kind: "REJECTED", blocking: true, weight: 100 + rejected.length, tab: "products", filter: "rejected",
    title: `반려된 제품 ${n(rejected.length)}개를 고쳐 주세요`, reason: rejected[0].reject_note ? `반려 이유: ${rejected[0].reject_note}` : "고쳐서 다시 올리면 다시 검수해요", action: "반려 이유 보기",
  });
  if (stale60 || stale50) tasks.push({
    kind: "STALE_PRICE", blocking: true, weight: 90 + stale60 * 2 + stale50, tab: "connect",
    title: stale60 ? `가격이 감춰진 제품 ${n(stale60)}개가 있어요` : `가격을 확인한 지 50일이 넘은 제품 ${n(stale50)}개`,
    reason: "가격을 확인한 지 60일이 지나면 앱에서 가격이 감춰져요. 다시 올리거나 피드를 연결해 주세요", action: "가격 다시 올리기",
  });
  const droppedTotal = dropped.nutrition + dropped.link + dropped.window;
  if (droppedTotal) tasks.push({
    kind: "DROPPED", blocking: true, weight: 80 + droppedTotal, tab: "products", filter: "approved",
    title: `추천에서 빠진 제품 ${n(droppedTotal)}개`,
    reason: [dropped.nutrition && `영양 값 확인 필요 ${dropped.nutrition}`, dropped.link && `판매처 연결 확인 중 ${dropped.link}`, dropped.window && `판매 기간 밖 ${dropped.window}`].filter(Boolean).join(" · "),
    action: "빠진 이유 보기",
  });
  if (partner.kind !== "meal_service" && clicksWeek > 0 && (gapDays === null || gapDays > 3)) tasks.push({
    kind: "REPORT_GAP", blocking: true, weight: 70 + clicksWeek, tab: "commission",
    title: gapDays === null ? "구매 확정 보고가 아직 한 번도 없어요" : `구매 확정 보고가 ${gapDays}일째 없어요`,
    reason: `지난 7일 구매 링크 클릭 ${n(clicksWeek)}번이 있었어요. 보고가 있어야 성과와 정산이 맞아요`, action: "주문 올리기",
  });
  if (groupBuy) tasks.push({
    kind: "GROUP_BUY_HALF", blocking: false, weight: 50 + groupBuy.current, tab: "demand",
    title: `공구에 ${n(groupBuy.current)}명이 모였어요`, reason: `${groupBuy.title} · 목표 ${n(groupBuy.target)}명의 절반을 넘었어요`, action: "공구 수요 보기",
  });
  if (orders && orders.gap >= MIN_PEOPLE) tasks.push({
    kind: "ORDER_GAP", blocking: false, weight: 40 + orders.gap, tab: "segments", filter: "order_gap",
    title: `2주 넘게 주문이 없는 단골 ${n(orders.gap)}명`, reason: "두 번 이상 주문했는데 최근 2주 주문이 없어요", action: "고객층으로 부르기",
  });
  if (segmentResult) tasks.push({
    kind: "SEGMENT_RESULT", blocking: false, weight: 30, tab: "segments",
    title: `'${segmentResult.title}' 발송 결과가 나왔어요`,
    reason: segmentResult.click_rate !== null ? `받은 사람 클릭률 ${segmentResult.click_rate}%${segmentResult.holdout !== null ? ` · 안 받은 사람 ${segmentResult.holdout}%` : ""}` : "받은 사람이 적어 비율은 가렸어요",
    action: "결과 보기",
  });
  tasks.sort((a, b) => Number(b.blocking) - Number(a.blocking) || b.weight - a.weight);

  // ── 숫자 4개 (유형별) ──
  const t = report.totals;
  const saves = t ? t.diary + t.plans + t.favorites : 0;
  const topGoal = report.audience && "goals" in report.audience ? report.audience.goals?.[0] : undefined;
  const kpis: Kpi[] =
    partner.kind === "meal_service" ? [
      orders ? { label: "이번 주 주문", value: n(orders.week), unit: "건", tab: "orders", how: "지난 7일 동안 결제된 앱 주문 수" } : { label: "이번 주 구매 링크 클릭", value: n(clicksWeek), unit: "번", tab: "report", how: "지난 7일 동안 내 구매 링크를 누른 횟수 (같은 사람이 여러 번 누르면 모두)" },
      orders ? { label: "재주문률", value: orders.repeat !== null ? String(orders.repeat) : "—", unit: orders.repeat !== null ? "%" : undefined, tab: "orders", note: orders.repeat === null ? "주문한 사람이 10명 미만이라 가렸어요" : undefined, how: "지난 90일 동안 주문한 사람 중 두 번 이상 주문한 사람의 비율" }
        : { label: "확정 구매 28일", value: n(confirmed.length), unit: "건", tab: "commission", how: "지난 28일 주문일 기준으로 업체가 보고한 구매확정 수" },
      orders ? { label: "주문 간격이 벌어진 단골", value: orders.gap ? n(orders.gap) : "—", unit: orders.gap ? "명" : undefined, tab: "segments", how: "두 번 이상 주문했는데 최근 2주 주문이 없는 사람 (10명 미만이면 —)" }
        : { label: "7일 안에 판매가 끝나는 메뉴", value: n(ending), unit: "개", tab: "products", how: "판매 종료일이 오늘부터 7일 안인 반영된 메뉴" },
      { label: "반려된 메뉴", value: n(rejected.length), unit: "개", tab: "products", how: "반려된 뒤 아직 고치지 않은 메뉴" },
    ] : partner.kind === "brand" ? [
      { label: "노출 28일", value: n(t?.impressions || 0), unit: "번", tab: "report", how: "지난 28일 추천·목록·식단 채우기에 내 제품이 보인 횟수" },
      { label: "조회 → 담기", value: t && t.views > 0 ? String(Math.round((saves / t.views) * 100)) : "—", unit: t && t.views > 0 ? "%" : undefined, tab: "report", how: "지난 28일 상세 조회 대비 식단 기록·식단 리스트·즐겨찾기에 담은 횟수" },
      { label: "본 사람의 첫째 목표", value: topGoal ? topGoal.label : "—", tab: "report", note: topGoal ? `${topGoal.share}%` : "10명 이상 모이면 보여요", how: "지난 28일 내 제품을 본·누른·기록한 사람들이 고른 목표 중 가장 많은 것 (질환 관심은 쓰지 않아요)" },
      { label: "반려된 제품", value: n(rejected.length), unit: "개", tab: "products", how: "반려된 뒤 아직 고치지 않은 제품" },
    ] : [
      { label: "구매 링크 클릭 28일", value: n(t?.clicks || 0), unit: "번", tab: "report", how: "지난 28일 내 구매 링크를 누른 횟수" },
      { label: "확정 구매 금액 28일", value: n(purchaseAmount), unit: "원", tab: "commission", how: "지난 28일 주문일 기준으로 업체가 보고한 구매확정 금액의 합" },
      { label: "전환 보고가 끊긴 날", value: gapDays === null ? "—" : String(gapDays), unit: gapDays === null ? undefined : "일", tab: "commission", note: gapDays === null ? "아직 보고가 없어요" : undefined, how: "마지막으로 구매 확정을 보고한 날부터 오늘까지" },
      { label: "60일 넘은 가격", value: n(stale60), unit: "개", tab: "connect", how: "판매 중 가격 중 마지막 확인이 60일 넘어 앱에서 감춘 것" },
    ];

  return {
    kind: partner.kind,
    kpis,
    tasks: tasks.slice(0, 3),
    funnel: t ? [
      { key: "impressions", label: "노출", value: t.impressions },
      { key: "views", label: "조회", value: t.views },
      { key: "saves", label: "담기", value: saves },
      { key: "clicks", label: "클릭", value: t.clicks },
      { key: "purchases", label: "확정 구매", value: confirmed.length },
    ] : null,
    demand: gapRow ? { key: gapRow.key, label: gapRow.label, rule: gapRow.rule, share: gapRow.share, supply: gapRow.supply, mine: gapRow.mine } : null,
    counts: { approved: approved.length, total: items.length },
  };
}
