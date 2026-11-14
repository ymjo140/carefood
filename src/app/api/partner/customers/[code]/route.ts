import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPartnerContext } from "@/lib/partner/auth";
import { customerDetail } from "@/lib/partner/customers";

/** GET /api/partner/customers/:code[?as=slug] — 한 고객의 주문 이력과 받은 혜택 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  const { code } = await params;
  if (!/^[0-9A-F]{6}$/.test(code)) return NextResponse.json({ error: "고객을 찾지 못했어요" }, { status: 404 });
  try {
    const d = await customerDetail(createServiceRoleClient(), ctx.partner.id, code);
    if (!d) return NextResponse.json({ error: "고객을 찾지 못했어요" }, { status: 404 });
    return NextResponse.json(d);
  } catch (e) {
    console.error("고객을 불러오지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "고객을 불러오지 못했어요" }, { status: 500 });
  }
}
