import { NextRequest, NextResponse } from "next/server";
import { apiAuth, apiError } from "@/lib/partner/api-auth";
import { FULFIL, listPartnerOrders } from "@/lib/partner/orders";

/** GET /api/partner/v1/orders?status=new&since=2026-11-01T00:00:00Z&limit=100 — 앱에서 들어온 주문 (결제가 끝난 것만, 새 것부터) */
export async function GET(req: NextRequest) {
  const ctx = await apiAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  if (status && !(FULFIL as readonly string[]).includes(status)) return apiError(422, "invalid", `status 는 ${FULFIL.join(" · ")} 중 하나예요`);
  const sinceRaw = sp.get("since");
  const since = sinceRaw ? Date.parse(sinceRaw) : null;
  if (sinceRaw && !Number.isFinite(since)) return apiError(422, "invalid", "since 는 2026-11-01T00:00:00Z 처럼 적어 주세요");
  const limit = Number(sp.get("limit")) || 100;
  try {
    const orders = await listPartnerOrders(ctx.sb, ctx.partner.id, { status, since: since ? new Date(since).toISOString() : null, limit });
    return NextResponse.json({ orders });
  } catch (e) { return apiError(500, "server_error", (e as Error).message); }
}
