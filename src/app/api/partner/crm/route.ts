import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canAct, getPartnerContext } from "@/lib/partner/auth";
import {
  BEHAVIORS, BEHAVIOR_DAYS, CRM_GOALS, MIN_PEOPLE, PER_PARTNER_WEEK, SEGMENTS, TEMPLATES,
  adText, buildAudience, campaignResult, checkMessage, cleanConditions, creditBalance, describeConditions, isNight, notReady,
  previewOf, releaseHold, sendableOf, bookedTimes, type Template,
} from "@/lib/partner/crm";
import { WEEK_MS, fitsWeekly } from "@/lib/partner/quota";
import { loadClaimTerms } from "@/lib/partner/claims-server";

/**
 * 고객층(CRM) — 업체 화면 API. 업체는 조건·인원·합계만 받는다 (lib/partner/crm.ts).
 * GET  /api/partner/crm[?as=slug] — 충전금·단가·저장한 고객층·발송 목록과 결과·고를 수 있는 조건
 * GET  /api/partner/crm?view=credits — 충전금 잔액·건당 발송비·장부 최근 50줄 (정산 탭)
 * POST /api/partner/crm {action, ...}
 *   preview   {conditions, send_at}          → 인원 미리보기
 *   save      {name, conditions[, id]}       → 고객층 저장
 *   delete    {id}                           → 고객층 지우기
 *   request   {conditions, segment_id?, template, title, body, product_id, send_at} → 검수 요청 + 발송비 잡아 두기
 *   cancel    {id}                           → 검수 중·예약 취소 (발송 1시간 전까지) + 돌려주기
 *   topup     {amount}                       → 충전 신청 (입금 확인 뒤 반영)
 * 표가 없으면(마이그레이션 전) {ready:false}
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const HOUR = 3600e3;
const notReadyRes = () => NextResponse.json({ ready: false });
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET(req: NextRequest) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  const sb = createServiceRoleClient() as Sb;
  const pid = ctx.partner.id;
  if (req.nextUrl.searchParams.get("view") === "credits") {
    const [pa, led] = await Promise.all([
      sb.from("partners").select("crm_unit_price").eq("id", pid).single(),
      sb.from("partner_credit_ledger").select("id, kind, amount, status, note, created_at, campaign_id, partner_campaigns(title)").eq("partner_id", pid).order("created_at", { ascending: false }).limit(50),
    ]);
    for (const r of [pa, led]) if (r.error) return notReady(r.error) ? notReadyRes() : bad(r.error.message, 500);
    try {
      const credit = await creditBalance(sb, pid);
      return NextResponse.json({ ready: true, unit_price: pa.data?.crm_unit_price ?? null, ...credit, ledger: led.data || [], read_only: !canAct(ctx) });
    } catch (e) { return bad((e as Error).message, 500); }
  }
  const [pa, seg, camp, items] = await Promise.all([
    sb.from("partners").select("crm_unit_price").eq("id", pid).single(),
    sb.from("partner_segments").select("id, name, conditions, updated_at").eq("partner_id", pid).order("updated_at", { ascending: false }).limit(50),
    sb.from("partner_campaigns").select("id, segment_id, conditions, template, title, body, product_id, send_at, night, status, reject_note, unit_price, estimate_count, held_amount, sent_count, holdout_count, charged_amount, created_at, sent_at")
      .eq("partner_id", pid).order("created_at", { ascending: false }).limit(30),
    sb.from("partner_items").select("product_id, data->>name").eq("partner_id", pid).eq("status", "approved").not("product_id", "is", null).order("updated_at", { ascending: false }).limit(300),
  ]);
  for (const r of [pa, seg, camp]) if (r.error) return notReady(r.error) ? notReadyRes() : bad(r.error.message, 500);
  if (items.error) return bad(items.error.message, 500);
  try {
    const [credit, booked, terms] = await Promise.all([creditBalance(sb, pid), bookedTimes(sb, pid, Date.now() - WEEK_MS), loadClaimTerms(sb)]);
    type C = { id: string; status: string; sent_at: string | null; conditions: unknown; [k: string]: unknown };
    const campaigns = await Promise.all(((camp.data || []) as C[]).map(async (c) => ({
      ...c,
      summary: describeConditions(cleanConditions(c.conditions)),
      result: c.status === "sent" ? await campaignResult(sb, pid, { id: c.id, sent_at: c.sent_at }) : null,
    })));
    return NextResponse.json({
      ready: true,
      unit_price: pa.data?.crm_unit_price ?? null,
      balance: credit.balance, pending_topup: credit.pending,
      booked: booked.map((t) => new Date(t).toISOString()), weekly_limit: PER_PARTNER_WEEK,
      segments: ((seg.data || []) as { id: string; name: string; conditions: unknown; updated_at: string }[])
        .map((s) => ({ ...s, conditions: cleanConditions(s.conditions), summary: describeConditions(cleanConditions(s.conditions)) })),
      campaigns,
      products: ((items.data || []) as { product_id: string; name: string }[]).map((i) => ({ id: i.product_id, name: i.name })),
      options: { goals: CRM_GOALS, needs: SEGMENTS.map((s) => ({ key: s.key, label: s.label })), behaviors: BEHAVIORS, days: BEHAVIOR_DAYS, templates: TEMPLATES },
      partner_name: ctx.partner.name,
      read_only: !canAct(ctx),
      claim_terms: terms, // 화면에서 쓰는 동안 바로 점검하려고 (요청할 때 서버가 다시 점검한다)
    });
  } catch (e) {
    return notReady(e as { code?: string; message?: string }) ? notReadyRes() : bad((e as Error).message, 500);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  const b = await req.json().catch(() => ({}));
  const sb = createServiceRoleClient() as Sb;
  const pid = ctx.partner.id;
  const action = String(b?.action || "");
  if (action !== "preview" && !canAct(ctx)) return bad("관리자 보기에서는 바꿀 수 없어요. 업체 계정으로 해 주세요", 403);

  try {
    if (action === "preview") {
      const sendAt = Date.parse(String(b.send_at || "")) || Date.now() + 2 * HOUR;
      const c = cleanConditions(b.conditions);
      const { data: pa, error } = await sb.from("partners").select("crm_unit_price").eq("id", pid).single();
      if (error) return notReady(error) ? notReadyRes() : bad(error.message, 500);
      const a = await buildAudience(sb, pid, c, sendAt);
      return NextResponse.json({ ready: true, night: isNight(sendAt), summary: describeConditions(c), ...previewOf(a, pa?.crm_unit_price ?? null) });
    }

    if (action === "save") {
      const name = String(b.name || "").trim().slice(0, 40);
      if (!name) return bad("고객층 이름을 적어 주세요");
      const row = { partner_id: pid, name, conditions: cleanConditions(b.conditions), updated_at: new Date().toISOString() };
      const q = b.id ? sb.from("partner_segments").update(row).eq("id", b.id).eq("partner_id", pid) : sb.from("partner_segments").insert(row);
      const { data, error } = await q.select("id").single();
      if (error) return notReady(error) ? notReadyRes() : bad(error.message, 500);
      return NextResponse.json({ id: data.id });
    }

    if (action === "delete") {
      const { error } = await sb.from("partner_segments").delete().eq("id", b.id).eq("partner_id", pid);
      if (error) return bad(error.message, 500);
      return NextResponse.json({ ok: true });
    }

    if (action === "topup") {
      const amount = Math.round(Number(b.amount));
      if (!(Number.isInteger(amount) && amount >= 10_000 && amount <= 10_000_000)) return bad("충전 금액은 1만~1,000만 원 사이로 적어 주세요");
      const { error } = await sb.from("partner_credit_ledger").insert({ partner_id: pid, kind: "topup", amount, status: "requested", created_by: ctx.userId, note: "충전 신청" });
      if (error) return notReady(error) ? notReadyRes() : bad(error.message, 500);
      return NextResponse.json({ ok: true });
    }

    if (action === "cancel") {
      const { data: c, error } = await sb.from("partner_campaigns").select("id, partner_id, status, send_at, held_amount").eq("id", b.id).eq("partner_id", pid).maybeSingle();
      if (error) return bad(error.message, 500);
      if (!c) return bad("발송을 찾지 못했어요", 404);
      if (!["review", "scheduled"].includes(c.status)) return bad("검수 중이거나 예약된 발송만 취소할 수 있어요", 409);
      if (c.status === "scheduled" && Date.parse(c.send_at) - Date.now() < HOUR) return bad("보내기 1시간 전부터는 취소할 수 없어요", 409);
      const { data: done, error: uErr } = await sb.from("partner_campaigns").update({ status: "canceled" }).eq("id", c.id).in("status", ["review", "scheduled"]).select("id");
      if (uErr) return bad(uErr.message, 500);
      if (!done?.length) return bad("방금 상태가 바뀌었어요. 다시 불러와 주세요", 409);
      await releaseHold(sb, c, "업체가 취소");
      return NextResponse.json({ ok: true });
    }

    if (action === "request") {
      const { data: pa, error: pErr } = await sb.from("partners").select("crm_unit_price, status").eq("id", pid).single();
      if (pErr) return notReady(pErr) ? notReadyRes() : bad(pErr.message, 500);
      if (pa.crm_unit_price === null || pa.crm_unit_price === undefined) return bad("발송 단가가 아직 정해지지 않았어요. 오늘끼록에 문의해 주세요", 409);
      if (pa.status !== "active") return bad("운영 중인 업체만 보낼 수 있어요", 409);
      const sendAt = Date.parse(String(b.send_at || ""));
      if (!Number.isFinite(sendAt) || sendAt < Date.now() + 2 * HOUR || sendAt > Date.now() + 30 * 24 * HOUR) return bad("보낼 시각은 2시간 뒤부터 30일 안으로 골라 주세요");
      const template = String(b.template) as Template;
      if (!(template in TEMPLATES)) return bad("메시지 종류를 골라 주세요");
      const title = String(b.title || "").trim(), body = String(b.body || "").trim();
      const msg = checkMessage(title, body, await loadClaimTerms(sb));
      if (msg.error) return bad(msg.error);
      const productId = typeof b.product_id === "string" ? b.product_id : null;
      if (!productId) return bad("메시지를 누르면 열릴 제품을 골라 주세요");
      const { data: own, error: oErr } = await sb.from("partner_items").select("id").eq("partner_id", pid).eq("product_id", productId).eq("status", "approved").limit(1);
      if (oErr) return bad(oErr.message, 500);
      if (!own?.length) return bad("반영된 내 제품만 고를 수 있어요");
      if (!fitsWeekly(await bookedTimes(sb, pid, sendAt - WEEK_MS, sendAt + WEEK_MS), sendAt, PER_PARTNER_WEEK)) return bad(`고른 날 앞뒤 7일 안에 이미 ${PER_PARTNER_WEEK}번 보내요. 발송은 7일에 ${PER_PARTNER_WEEK}번까지라 다른 날을 골라 주세요`, 409);

      const c = cleanConditions(b.conditions);
      const a = await buildAudience(sb, pid, c, sendAt);
      if (a.eligible.length < MIN_PEOPLE) return bad("받을 수 있는 사람이 10명 미만이에요. 조건을 넓혀 주세요", 409);
      const estimate = sendableOf(a.eligible.length);
      const unit = Number(pa.crm_unit_price);
      const held = estimate * unit;
      const { data: camp, error: cErr } = await sb.from("partner_campaigns").insert({
        partner_id: pid, segment_id: typeof b.segment_id === "string" ? b.segment_id : null, conditions: c, template, title, body,
        product_id: productId, send_at: new Date(sendAt).toISOString(), night: isNight(sendAt), status: "review",
        unit_price: unit, estimate_count: estimate, held_amount: held, created_by: ctx.userId,
      }).select("id").single();
      if (cErr) return notReady(cErr) ? notReadyRes() : bad(cErr.message, 500);
      const { data: ok, error: hErr } = await sb.rpc("partner_credit_hold", { p_partner: pid, p_campaign: camp.id, p_amount: held });
      if (hErr || ok !== true) {
        await sb.from("partner_campaigns").delete().eq("id", camp.id);
        if (hErr) return bad(hErr.message, 500);
        const { balance } = await creditBalance(sb, pid);
        return NextResponse.json({ error: "충전금이 모자라요", need: held - balance }, { status: 402 });
      }
      return NextResponse.json({ id: camp.id, held, estimate, hits: msg.hits, preview: adText(ctx.partner.name, title, body) });
    }
    return bad("알 수 없는 요청이에요");
  } catch (e) {
    return notReady(e as { code?: string; message?: string }) ? notReadyRes() : bad((e as Error).message, 500);
  }
}
