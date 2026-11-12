import { NextRequest, NextResponse } from "next/server";
import { apiAuth, apiError } from "@/lib/partner/api-auth";

const STATUSES = ["pending", "approved", "rejected", "discontinued"];

/** GET /api/partner/v1/products[?status=rejected][&limit=100][&after=<partner_sku>] — 내 제품과 검수 상태 (제품 코드 순) */
export async function GET(req: NextRequest) {
  const ctx = await apiAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(500, Math.max(1, Number(sp.get("limit")) || 100));
  let q = ctx.sb.from("partner_items").select("partner_sku, status, review_reasons, reject_note, product_id, updated_at, data->>name")
    .eq("partner_id", ctx.partner.id).order("partner_sku", { ascending: true }).limit(limit + 1);
  const status = sp.get("status");
  if (status) {
    if (!STATUSES.includes(status)) return apiError(400, "bad_request", `status 는 ${STATUSES.join(" · ")} 중 하나예요`);
    q = q.eq("status", status);
  }
  const after = sp.get("after");
  if (after) q = q.gt("partner_sku", after);
  const { data, error } = await q;
  if (error) return apiError(500, "server_error", error.message);
  const rows = (data || []) as { partner_sku: string; product_id: string | null }[];
  const page = rows.slice(0, limit);
  return NextResponse.json({
    products: page.map(({ product_id, ...p }) => ({ ...p, url: product_id ? `https://carefood-iota.vercel.app/products/${product_id}` : null })),
    next_after: rows.length > limit ? page[page.length - 1].partner_sku : null,
  });
}
