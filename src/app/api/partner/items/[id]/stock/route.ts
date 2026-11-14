import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canAct, getPartnerContext, readOnly } from "@/lib/partner/auth";
import { setStock } from "@/lib/partner/stock";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PUT /api/partner/items/:id/stock[?as=slug] — {stock: number | null} 남은 수량 (null = 세지 않음). 0 이면 앱에서 살 수 없게 된다 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  if (!canAct(ctx)) return readOnly();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "제품을 찾지 못했어요" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const stock = b?.stock === null || b?.stock === "" ? null : Math.floor(Number(b?.stock));
  if (stock !== null && !(stock >= 0 && stock <= 1000000)) return NextResponse.json({ error: "재고는 0~1,000,000 사이로 적어 주세요" }, { status: 400 });
  try {
    if (!(await setStock(createServiceRoleClient(), ctx.partner.id, id, stock))) return NextResponse.json({ error: "제품을 찾지 못했어요" }, { status: 404 });
    return NextResponse.json({ ok: true, stock });
  } catch (e) {
    console.error("재고를 저장하지 못했어요:", id, (e as Error).message);
    return NextResponse.json({ error: "재고를 저장하지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
}
