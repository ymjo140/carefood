import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPartnerContext } from "@/lib/partner/auth";

const STATUSES = ["pending", "approved", "rejected", "discontinued"];

/** GET /api/partner/items[?status=pending][&as=slug] — 내 제품 목록 (최근 바뀐 순 200개) */
export async function GET(req: NextRequest) {
  await connection();
  const sp = req.nextUrl.searchParams;
  const ctx = await getPartnerContext(sp.get("as"));
  if ("error" in ctx) return ctx.error;
  const sb = createServiceRoleClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  let q = sb.from("partner_items").select("id, partner_sku, status, review_reasons, warnings, reject_note, product_id, updated_at, data->>name, data->offers")
    .eq("partner_id", ctx.partner.id).order("updated_at", { ascending: false }).limit(200);
  const status = sp.get("status");
  if (status && STATUSES.includes(status)) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data || [] });
}
