import { NextRequest, NextResponse } from "next/server";
import { apiAuth, apiError, readJson } from "@/lib/partner/api-auth";
import { ingestConversions } from "@/lib/partner/conversions";

export const maxDuration = 60;
const MAX = 1000;

/** POST /api/partner/v1/conversions — {conversions:[{click_id, order_no, amount, status, ordered_at}]} 최대 1,000건. 같은 주문 번호는 고쳐 쓴다 */
export async function POST(req: NextRequest) {
  const ctx = await apiAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  const parsed = await readJson(req);
  if (parsed instanceof NextResponse) return parsed;
  const b = parsed.body as { conversions?: unknown };
  const list = Array.isArray(parsed.body) ? parsed.body : Array.isArray(b?.conversions) ? b.conversions : null;
  if (!list || list.length === 0) return apiError(400, "bad_request", '{"conversions": […]} 로 보내 주세요');
  if (list.length > MAX) return apiError(413, "too_many", `한 번에 ${MAX.toLocaleString("ko-KR")}건까지예요`);
  const rows = list.map((o, i) => ({ row: i + 1, values: (o && typeof o === "object" ? o : {}) as Record<string, unknown> }));
  try {
    const r = await ingestConversions(ctx.sb, ctx.partner.id, rows);
    return NextResponse.json({ received: r.rows, saved: r.saved, rejected: r.error, errors: r.errors.map(({ row, sku, field, message }) => ({ row, order_no: sku, field, message })) });
  } catch (e) { return apiError(500, "server_error", (e as Error).message); }
}
