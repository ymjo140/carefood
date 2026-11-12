import { NextRequest, NextResponse } from "next/server";
import { apiAuth, apiError, readJson } from "@/lib/partner/api-auth";
import { flatten } from "@/lib/partner/feed";
import { ingestRows, patchOffer } from "@/lib/partner/ingest";

type Params = { params: Promise<{ sku: string }> };

/** PUT /api/partner/v1/products/{partner_sku} — 제품 하나 등록·수정 (전체 필드). 같은 내용을 다시 보내면 unchanged */
export async function PUT(req: NextRequest, { params }: Params) {
  const ctx = await apiAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  const sku = decodeURIComponent((await params).sku).trim();
  const parsed = await readJson(req);
  if (parsed instanceof NextResponse) return parsed;
  const b = parsed.body;
  if (!b || typeof b !== "object" || Array.isArray(b)) return apiError(400, "bad_request", "제품 하나를 JSON 객체로 보내 주세요");
  const values = flatten(b as Record<string, unknown>);
  if (values.partner_sku !== undefined && String(values.partner_sku).trim() !== sku) return apiError(400, "sku_mismatch", "주소의 제품 코드와 본문의 partner_sku 가 달라요");
  values.partner_sku = sku;
  try {
    const r = await ingestRows(ctx.sb, ctx.partner, [{ row: 1, values }], "api", null, null);
    if (r.error) return apiError(422, "invalid", "제품을 받지 못했어요. errors 를 확인해 주세요", { errors: r.errors.map(({ field, message }) => ({ field, message })) });
    const result = r.unchanged ? "unchanged" : r.ok ? "applied" : "pending_review";
    return NextResponse.json({ partner_sku: sku, result, batch_id: r.batch_id }, { status: result === "pending_review" ? 202 : 200 });
  } catch (e) { return apiError(500, "server_error", (e as Error).message); }
}

/** DELETE /api/partner/v1/products/{partner_sku} — 판매 종료 (기록은 남는다) */
export async function DELETE(req: NextRequest, { params }: Params) {
  const ctx = await apiAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  const sku = decodeURIComponent((await params).sku).trim();
  try {
    const r = await patchOffer(ctx.sb, ctx.partner, sku, { status: "discontinued" });
    if (r === "not_found") return apiError(404, "not_found", "이 제품 코드가 없어요");
    return NextResponse.json({ partner_sku: sku, result: r });
  } catch (e) { return apiError(500, "server_error", (e as Error).message); }
}
