import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { adminOnly, getAdminUser } from "@/lib/actor-server";
import { loadClaimTerms } from "@/lib/partner/claims-server";
import { adText, checkMessage, cleanConditions, creditBalance, describeConditions, notReady, releaseHold } from "@/lib/partner/crm";

/**
 * 관리자 — 고객층 발송 검수 · 충전 입금 확인 · 업체별 건당 발송비 (lib/partner/crm.ts)
 * GET  /api/admin/partners/crm → {ready, campaigns(검수 중·보내는 중), topups(확인 대기), partners(단가·잔액)}
 * POST /api/admin/partners/crm {action}
 *   approve {id} · reject {id, note} · topup_confirm {id} · topup_cancel {id} · price {partner_id, unit_price|null}
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET() {
  await connection();
  const denied = await adminOnly(); if (denied) return denied;
  const sb = createServiceRoleClient() as Sb;
  const [camp, top, pa] = await Promise.all([
    sb.from("partner_campaigns").select("id, partner_id, conditions, template, title, body, product_id, send_at, night, status, estimate_count, held_amount, unit_price, created_at, partners(name), products(name)")
      .in("status", ["review", "sending"]).order("send_at").limit(100),
    sb.from("partner_credit_ledger").select("id, partner_id, amount, note, created_at, partners(name)").eq("kind", "topup").eq("status", "requested").order("created_at").limit(100),
    sb.from("partners").select("id, name, crm_unit_price").order("name").limit(500),
  ]);
  for (const r of [camp, top, pa]) if (r.error) return notReady(r.error) ? NextResponse.json({ ready: false }) : bad(r.error.message, 500);
  try {
    type P = { id: string; name: string; crm_unit_price: number | null };
    const partners = await Promise.all(((pa.data || []) as P[]).map(async (p) => ({ ...p, balance: (await creditBalance(sb, p.id)).balance })));
    const terms = await loadClaimTerms(sb);
    type C = { title: string; body: string; conditions: unknown; partners: { name: string } | null; [k: string]: unknown };
    return NextResponse.json({
      ready: true,
      campaigns: ((camp.data || []) as C[]).map((c) => ({
        ...c, summary: describeConditions(cleanConditions(c.conditions)), hits: checkMessage(c.title, c.body, terms).hits,
        preview: adText(c.partners?.name || "", c.title, c.body),
      })),
      topups: top.data || [],
      partners,
    });
  } catch (e) { return bad((e as Error).message, 500); }
}

export async function POST(req: NextRequest) {
  const denied = await adminOnly(); if (denied) return denied;
  const admin = await getAdminUser();
  const b = await req.json().catch(() => ({}));
  const sb = createServiceRoleClient() as Sb;
  const now = new Date().toISOString();
  try {
    switch (b?.action) {
      case "approve": {
        const { data, error } = await sb.from("partner_campaigns").update({ status: "scheduled", reviewed_by: admin?.id ?? null, reviewed_at: now })
          .eq("id", b.id).eq("status", "review").select("id, send_at");
        if (error) return bad(error.message, 500);
        if (!data?.length) return bad("검수 중인 발송이 아니에요", 409);
        if (Date.parse(data[0].send_at) < Date.now()) return NextResponse.json({ ok: true, note: "보낼 시각이 지나 다음 실행 때 바로 나가요" });
        return NextResponse.json({ ok: true });
      }
      case "reject": {
        const note = String(b.note || "").trim().slice(0, 200);
        if (!note) return bad("반려 사유를 적어 주세요");
        const { data, error } = await sb.from("partner_campaigns").update({ status: "rejected", reject_note: note, reviewed_by: admin?.id ?? null, reviewed_at: now })
          .eq("id", b.id).eq("status", "review").select("id, partner_id, held_amount");
        if (error) return bad(error.message, 500);
        if (!data?.length) return bad("검수 중인 발송이 아니에요", 409);
        await releaseHold(sb, data[0], "반려");
        return NextResponse.json({ ok: true });
      }
      case "topup_confirm":
      case "topup_cancel": {
        const status = b.action === "topup_confirm" ? "confirmed" : "canceled";
        const { data, error } = await sb.from("partner_credit_ledger").update({ status, confirmed_by: admin?.id ?? null, confirmed_at: now })
          .eq("id", b.id).eq("kind", "topup").eq("status", "requested").select("id");
        if (error) return bad(error.message, 500);
        if (!data?.length) return bad("확인을 기다리는 충전이 아니에요", 409);
        return NextResponse.json({ ok: true });
      }
      case "price": {
        if (!UUID.test(String(b.partner_id || ""))) return bad("업체를 골라 주세요");
        const v = b.unit_price === null || b.unit_price === "" ? null : Math.round(Number(b.unit_price));
        if (v !== null && !(Number.isInteger(v) && v >= 0 && v <= 10000)) return bad("건당 발송비는 0~10,000원이에요");
        const { error } = await sb.from("partners").update({ crm_unit_price: v, updated_at: now }).eq("id", b.partner_id);
        if (error) return bad(error.message, 500);
        return NextResponse.json({ ok: true });
      }
      default: return bad("알 수 없는 요청이에요");
    }
  } catch (e) { return bad((e as Error).message, 500); }
}
