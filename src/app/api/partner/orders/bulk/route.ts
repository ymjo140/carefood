import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canAct, getPartnerContext, readOnly } from "@/lib/partner/auth";
import { updateFulfilment } from "@/lib/partner/orders";

export const maxDuration = 60;
const MAX = 200;

/**
 * POST /api/partner/orders/bulk[?as=slug] — {action: "accept", order_ids: string[]} 새 주문 여러 건 접수 (200건까지).
 * 주문마다 따로 처리한다 — 그새 취소된 주문은 그 주문만 실패로 돌려준다
 */
export async function POST(req: NextRequest) {
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  if (!canAct(ctx)) return readOnly();
  const b = await req.json().catch(() => null);
  if (b?.action !== "accept") return NextResponse.json({ error: "action 은 accept 만 돼요" }, { status: 400 });
  const ids = [...new Set((Array.isArray(b.order_ids) ? b.order_ids : []).map(String))] as string[];
  if (ids.length === 0) return NextResponse.json({ error: "접수할 주문을 골라 주세요" }, { status: 400 });
  if (ids.length > MAX) return NextResponse.json({ error: `한 번에 ${MAX}건까지 접수할 수 있어요` }, { status: 400 });
  const sb = createServiceRoleClient();
  const out = { accepted: 0, unchanged: 0, failed: [] as { order_id: string; message: string }[] };
  // 주문끼리는 서로 상관없어 넷씩 나눠 처리 (200건도 시간 안에)
  let next = 0;
  const work = async () => { for (let i = next++; i < ids.length; i = next++) await one(ids[i]); };
  const one = async (id: string) => {
    try {
      const r = await updateFulfilment(sb, ctx.partner, id, { status: "accepted" });
      if (!r.ok) out.failed.push({ order_id: id, message: r.message });
      else if (r.changed) out.accepted++;
      else out.unchanged++;
    } catch (e) {
      console.error("일괄 접수 실패:", id, (e as Error).message);
      out.failed.push({ order_id: id, message: "처리하지 못했어요" });
    }
  };
  await Promise.all([work(), work(), work(), work()]);
  return NextResponse.json(out);
}
