import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPartnerContext } from "@/lib/partner/auth";
import { readWorkbook } from "@/lib/partner/excel";
import { DEFAULT_ATTRIBUTION_DAYS, ingestConversions } from "@/lib/partner/conversions";
import { settlementMonths } from "@/lib/partner/settlement";
import { limitRequest } from "@/lib/rate-limit";

export const maxDuration = 60;

/** GET /api/partner/conversions[?as=slug] — 달별 클릭·주문·수수료·정산 상태 + 계약 조건 */
export async function GET(req: NextRequest) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  const sb = createServiceRoleClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    const { data: pa, error } = await sb.from("partners").select("commission_rate, order_commission_rate, attribution_days").eq("id", ctx.partner.id).single();
    if (error) throw new Error(error.message);
    return NextResponse.json({
      commission_rate: pa.commission_rate === null ? null : Number(pa.commission_rate),
      order_commission_rate: pa.order_commission_rate === null ? null : Number(pa.order_commission_rate),
      attribution_days: pa.attribution_days ?? DEFAULT_ATTRIBUTION_DAYS,
      months: await settlementMonths(sb, ctx.partner.id),
    });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

/** POST /api/partner/conversions[?as=slug] — 주문 내역 엑셀(.xlsx) */
export async function POST(req: NextRequest) {
  const limited = await limitRequest(req, "upload");
  if (limited) return limited;
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "파일을 받지 못했어요" }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File) || !/\.xlsx$/i.test(file.name)) return NextResponse.json({ error: "주문 내역 양식(.xlsx)으로 올려 주세요" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "5MB 까지 올릴 수 있어요. 나눠서 올려 주세요" }, { status: 413 });
  let rows;
  try { rows = (await readWorkbook(await file.arrayBuffer(), "orders")).rows; }
  catch (e) { return NextResponse.json({ error: (e as Error).message || "엑셀을 읽지 못했어요" }, { status: 400 }); }
  if (rows.length === 0) return NextResponse.json({ error: "'주문' 시트 3행부터 주문을 적어 주세요" }, { status: 400 });
  try { return NextResponse.json(await ingestConversions(createServiceRoleClient(), ctx.partner.id, rows)); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
