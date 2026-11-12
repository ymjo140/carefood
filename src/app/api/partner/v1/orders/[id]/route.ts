import { NextRequest, NextResponse } from "next/server";
import { apiAuth, apiError, readJson } from "@/lib/partner/api-auth";
import { updateFulfilment } from "@/lib/partner/orders";

/** PATCH /api/partner/v1/orders/{order_id} — {status: accepted|shipped|delivered|canceled, carrier?, tracking_number?, reason?} */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  const parsed = await readJson(req);
  if (parsed instanceof NextResponse) return parsed;
  const b = (parsed.body && typeof parsed.body === "object" ? parsed.body : {}) as Record<string, unknown>;
  try {
    const r = await updateFulfilment(ctx.sb, ctx.partner, (await params).id, { status: b.status, carrier: b.carrier, tracking_number: b.tracking_number, reason: b.reason });
    if (!r.ok) return apiError(r.code === "not_found" ? 404 : r.code === "conflict" ? 409 : 422, r.code, r.message);
    return NextResponse.json({ order: r.order, changed: r.changed });
  } catch (e) { return apiError(500, "server_error", (e as Error).message); }
}
