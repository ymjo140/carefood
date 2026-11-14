import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPartnerContext } from "@/lib/partner/auth";
import { checkClaimsWith } from "@/lib/partner/claims";
import { loadClaimTerms } from "@/lib/partner/claims-server";

const STATUSES = ["pending", "approved", "rejected", "discontinued"];

/**
 * GET /api/partner/items[?status=pending][&as=slug] — 내 제품 목록 (최근 바뀐 순 200개)
 * 제품마다 claims(확인이 필요한 표현 — lib/partner/claims.ts)와, 반영된 제품이면 dropped(추천에서 빠진 이유)·price_age(가격 확인 뒤 지난 날)를 붙인다.
 */
export async function GET(req: NextRequest) {
  await connection();
  const sp = req.nextUrl.searchParams;
  const ctx = await getPartnerContext(sp.get("as"));
  if ("error" in ctx) return ctx.error;
  const sb = createServiceRoleClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  let q = sb.from("partner_items").select("id, partner_sku, status, review_reasons, warnings, reject_note, product_id, updated_at, data->>name, data->>description, data->>claims, data->offers")
    .eq("partner_id", ctx.partner.id).order("updated_at", { ascending: false }).limit(200);
  const status = sp.get("status");
  if (status && STATUSES.includes(status)) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  type Row = { id: string; status: string; product_id: string | null; name: string; description: string | null; claims: string | null; [k: string]: unknown };
  const rows = (data || []) as Row[];
  const pids = rows.filter((r) => r.status === "approved" && r.product_id).map((r) => r.product_id!);
  const [prods, offers, terms] = await Promise.all([
    pids.length ? sb.from("products").select("id, rec_hold, nutrition_flag, is_purchasable").in("id", pids) : { data: [], error: null },
    rows.length ? sb.from("partner_offers").select("item_id, updated_at").in("item_id", rows.map((r) => r.id)) : { data: [], error: null },
    loadClaimTerms(sb),
  ]);
  if (prods.error || offers.error) return NextResponse.json({ error: (prods.error || offers.error).message }, { status: 500 });
  const flag = new Map<string, { rec_hold: string | null; nutrition_flag: string | null; is_purchasable: boolean | null }>((prods.data || []).map((p: { id: string }) => [p.id, p]));
  const seen = new Map<string, number>();
  for (const o of (offers.data || []) as { item_id: string; updated_at: string }[]) seen.set(o.item_id, Math.max(seen.get(o.item_id) || 0, Date.parse(o.updated_at)));
  const items = rows.map(({ description, claims, ...r }) => {
    const f = r.product_id ? flag.get(r.product_id) : undefined;
    const dropped = r.status !== "approved" || !f ? null
      : f.nutrition_flag ? "영양 값 확인 필요" : f.rec_hold ? "판매처 연결 확인 중" : f.is_purchasable === false ? "판매 기간 밖" : null;
    const last = seen.get(r.id);
    return { ...r, claims: checkClaimsWith(terms, r.name, description, claims), dropped, price_age: last ? Math.floor((Date.now() - last) / 86400e3) : null };
  });
  return NextResponse.json({ items });
}
