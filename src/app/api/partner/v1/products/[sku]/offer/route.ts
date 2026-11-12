import { NextRequest, NextResponse } from "next/server";
import { apiAuth, apiError, readJson } from "@/lib/partner/api-auth";
import { patchOffer } from "@/lib/partner/ingest";
import { STATUS } from "@/lib/partner/schema";

/** PATCH /api/partner/v1/products/{partner_sku}/offer — 가격·재고·판매 상태만. 검수 없이 바로 반영 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ sku: string }> }) {
  const ctx = await apiAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  const sku = decodeURIComponent((await params).sku).trim();
  const parsed = await readJson(req);
  if (parsed instanceof NextResponse) return parsed;
  const b = (parsed.body && typeof parsed.body === "object" ? parsed.body : {}) as Record<string, unknown>;
  const patch: Parameters<typeof patchOffer>[3] = {};
  const errors: { field: string; message: string }[] = [];
  const int = (k: string) => {
    if (b[k] === undefined) return undefined;
    const n = Number(b[k]);
    if (!(Number.isInteger(n) && n > 0 && n <= 100_000_000)) { errors.push({ field: k, message: "0보다 큰 정수(원)여야 해요" }); return undefined; }
    return n;
  };
  patch.price = int("price");
  patch.list_price = int("list_price");
  if (b.status !== undefined) {
    if (typeof b.status === "string" && b.status in STATUS) patch.status = b.status as keyof typeof STATUS;
    else errors.push({ field: "status", message: "on_sale · sold_out · discontinued 중 하나예요" });
  }
  if (b.url !== undefined) {
    if (typeof b.url === "string" && /^https:\/\/\S+$/.test(b.url) && b.url.length <= 500) patch.url = b.url;
    else errors.push({ field: "url", message: "https:// 로 시작하는 주소여야 해요" });
  }
  if (errors.length) return apiError(422, "invalid", "값이 맞지 않아요", { errors });
  if (patch.price === undefined && patch.list_price === undefined && !patch.status && !patch.url) return apiError(400, "bad_request", "price · list_price · status · url 중 하나는 보내 주세요");
  try {
    const r = await patchOffer(ctx.sb, ctx.partner, sku, patch);
    if (r === "not_found") return apiError(404, "not_found", "이 제품 코드가 없어요. 먼저 PUT 으로 등록해 주세요");
    return NextResponse.json({ partner_sku: sku, result: r });
  } catch (e) { return apiError(500, "server_error", (e as Error).message); }
}
