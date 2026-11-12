import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { adminOnly } from "@/lib/actor-server";
import { approveItem, rejectItem } from "@/lib/partner/ingest";
import type { PartnerItem } from "@/lib/partner/schema";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 아직 제품에 붙지 않은 업체 제품 — 같은 바코드·품목보고번호·비슷한 이름의 식약처 제품 후보 */
async function candidates(sb: Sb, item: PartnerItem) {
  const cols = "id, name, manufacturer, calories, protein_g, sodium_mg, serving_size_g, data_source";
  const out = new Map<string, Record<string, unknown> & { why: string }>();
  const add = (rows: Record<string, unknown>[] | null, why: string) => { for (const r of rows || []) if (!out.has(r.id as string)) out.set(r.id as string, { ...r, why }); };
  if (item.barcode) add((await sb.from("products").select(cols).eq("barcode", item.barcode).limit(3)).data, "바코드 같음");
  if (item.report_no) add((await sb.from("products").select(cols).eq("report_no", item.report_no).limit(3)).data, "품목보고번호 같음");
  const key = item.name.replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter((w) => w.length >= 2).slice(0, 3);
  if (key.length) {
    let q = sb.from("products").select(cols).eq("category_large", "상용제품").neq("data_source", "partner");
    for (const w of key) q = q.ilike("name", `%${w}%`);
    add((await q.limit(5)).data, "이름이 비슷함");
  }
  return [...out.values()].slice(0, 6);
}

/** GET /api/admin/partners/review — 검수 대기 (오래된 순 50개) */
export async function GET() {
  await connection();
  const denied = await adminOnly(); if (denied) return denied;
  const sb: Sb = createServiceRoleClient();
  const { data, error } = await sb.from("partner_items")
    .select("id, partner_sku, data, approved_data, review_reasons, warnings, product_id, updated_at, partners(slug, name, kind)")
    .eq("status", "pending").order("updated_at", { ascending: true }).limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const items = await Promise.all((data || []).map(async (it: { product_id: string | null; data: PartnerItem }) => ({
    ...it, candidates: it.product_id ? [] : await candidates(sb, it.data),
  })));
  return NextResponse.json({ items });
}

/** POST /api/admin/partners/review — {item_id, action: approve|reject, link?: product_id|"new", note?} */
export async function POST(req: NextRequest) {
  const denied = await adminOnly(); if (denied) return denied;
  const b = await req.json().catch(() => null);
  if (!b || !UUID.test(String(b.item_id))) return NextResponse.json({ error: "제품을 골라 주세요" }, { status: 400 });
  const sb: Sb = createServiceRoleClient();
  try {
    if (b.action === "approve") {
      const link = typeof b.link === "string" && UUID.test(b.link) ? b.link : null;
      const productId = await approveItem(sb, b.item_id, link);
      return NextResponse.json({ ok: true, product_id: productId });
    }
    if (b.action === "reject") {
      const note = String(b.note || "").trim().slice(0, 300);
      if (!note) return NextResponse.json({ error: "반려 이유를 적어 주세요. 업체가 보고 고쳐요" }, { status: 400 });
      await rejectItem(sb, b.item_id, note);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "승인 또는 반려를 골라 주세요" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
