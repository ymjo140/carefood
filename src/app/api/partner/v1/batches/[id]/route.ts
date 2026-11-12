import { NextRequest, NextResponse } from "next/server";
import { apiAuth, apiError } from "@/lib/partner/api-auth";

/** GET /api/partner/v1/batches/{batch_id} — 한 번 보낸 묶음의 처리 결과 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  const id = (await params).id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return apiError(404, "not_found", "이 묶음이 없어요");
  const { data, error } = await ctx.sb.from("ingest_batches")
    .select("id, channel, status, row_count, ok_count, review_count, unchanged_count, error_count, errors, created_at")
    .eq("id", id).eq("partner_id", ctx.partner.id).maybeSingle();
  if (error) return apiError(500, "server_error", error.message);
  if (!data) return apiError(404, "not_found", "이 묶음이 없어요");
  return NextResponse.json({
    batch_id: data.id, channel: data.channel, status: data.status, created_at: data.created_at, received: data.row_count,
    applied: data.ok_count, pending_review: data.review_count, unchanged: data.unchanged_count, rejected: data.error_count,
    errors: ((data.errors || []) as { row: number; sku?: string; field?: string; message: string }[]).map(({ row, sku, field, message }) => ({ row, partner_sku: sku, field, message })),
  });
}
