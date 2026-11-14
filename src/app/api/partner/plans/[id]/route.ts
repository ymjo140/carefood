import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canAct, getPartnerContext, readOnly } from "@/lib/partner/auth";
import { updatePlan } from "@/lib/partner/plans";
import { limitRequest } from "@/lib/rate-limit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PATCH /api/partner/plans/:id[?as=slug] — {status} 상태 바꾸기 또는 {name, note?, target_price?} 고치기. 내 업체 것만 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const limited = await limitRequest(req, "upload");
  if (limited) return limited;
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  if (!canAct(ctx)) return readOnly();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "기획을 찾지 못했어요" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  try {
    const r = await updatePlan(createServiceRoleClient(), ctx.partner.id, id, {
      ...(b?.status !== undefined ? { status: String(b.status) } : {}),
      ...(b?.name !== undefined ? { name: String(b.name), note: b.note ?? null, target_price: b.target_price ?? null } : {}),
    });
    if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("기획을 고치지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "기획을 고치지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
}
