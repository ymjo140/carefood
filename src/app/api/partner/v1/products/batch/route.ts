import { NextRequest, NextResponse } from "next/server";
import { apiAuth, apiError, readJson } from "@/lib/partner/api-auth";
import { flatten } from "@/lib/partner/feed";
import { ingestRows } from "@/lib/partner/ingest";

export const maxDuration = 60;
const MAX = 500;

/** POST /api/partner/v1/products/batch — {products:[…]} 최대 500개. 줄마다 결과(errors 의 row 는 1부터) */
export async function POST(req: NextRequest) {
  const ctx = await apiAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  const parsed = await readJson(req);
  if (parsed instanceof NextResponse) return parsed;
  const b = parsed.body as { products?: unknown };
  const list = Array.isArray(parsed.body) ? parsed.body : Array.isArray(b?.products) ? b.products : null;
  if (!list || list.length === 0) return apiError(400, "bad_request", '{"products": […]} 로 보내 주세요');
  if (list.length > MAX) return apiError(413, "too_many", `한 번에 ${MAX}개까지예요`);
  const rows = list.map((o, i) => ({ row: i + 1, values: o && typeof o === "object" ? flatten(o as Record<string, unknown>) : {} }));
  try {
    const r = await ingestRows(ctx.sb, ctx.partner, rows, "api", null, null);
    return NextResponse.json({ batch_id: r.batch_id, received: r.rows, applied: r.ok, pending_review: r.review, unchanged: r.unchanged, rejected: r.error, errors: r.errors.map(({ row, sku, field, message }) => ({ row, partner_sku: sku, field, message })) });
  } catch (e) { return apiError(500, "server_error", (e as Error).message); }
}
