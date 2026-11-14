import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canAct, getPartnerContext, readOnly } from "@/lib/partner/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PUT /api/partner/items/:id/cost[?as=slug] — {unit_cost: number | null, tax_type: "taxable" | "exempt" | null}
 * 판매 단위 하나의 원가(원)와 과세 구분. 업체 화면의 마진·정산 엑셀 과세 구분에만 쓰고 앱에는 내보내지 않는다
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  if (!canAct(ctx)) return readOnly();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "제품을 찾지 못했어요" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const cost = b?.unit_cost === null || b?.unit_cost === "" || b?.unit_cost === undefined ? null : Math.round(Number(b.unit_cost));
  if (cost !== null && !(cost >= 0 && cost <= 10_000_000)) return NextResponse.json({ error: "원가는 0~10,000,000원 사이로 적어 주세요" }, { status: 400 });
  const tax = b?.tax_type === "taxable" || b?.tax_type === "exempt" ? b.tax_type : null;
  if (b?.tax_type && !tax) return NextResponse.json({ error: "과세 구분은 과세·면세 중 하나예요" }, { status: 400 });
  try {
    const sb = createServiceRoleClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb.from("partner_items").update({ unit_cost: cost, tax_type: tax })
      .eq("id", id).eq("partner_id", ctx.partner.id).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return NextResponse.json({ error: "제품을 찾지 못했어요" }, { status: 404 });
    return NextResponse.json({ ok: true, unit_cost: cost, tax_type: tax });
  } catch (e) {
    console.error("원가를 저장하지 못했어요:", id, (e as Error).message);
    return NextResponse.json({ error: "원가를 저장하지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
}
