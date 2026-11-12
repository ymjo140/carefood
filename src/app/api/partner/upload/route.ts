import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPartnerContext } from "@/lib/partner/auth";
import { readWorkbook } from "@/lib/partner/excel";
import { ingestRows } from "@/lib/partner/ingest";
import { limitRequest } from "@/lib/rate-limit";

export const maxDuration = 60;

/** POST /api/partner/upload[?as=slug] — 엑셀(.xlsx) 한 개, 5MB 까지. 줄마다 검사해 결과를 돌려준다 */
export async function POST(req: NextRequest) {
  const limited = await limitRequest(req, "upload");
  if (limited) return limited;
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "파일을 받지 못했어요" }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "엑셀 파일을 골라 주세요" }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name)) return NextResponse.json({ error: "케어푸드 양식(.xlsx)으로 올려 주세요" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "5MB 까지 올릴 수 있어요. 나눠서 올려 주세요" }, { status: 413 });

  let rows;
  try { rows = (await readWorkbook(await file.arrayBuffer())).rows; }
  catch (e) { return NextResponse.json({ error: (e as Error).message || "엑셀을 읽지 못했어요" }, { status: 400 }); }
  if (rows.length === 0) return NextResponse.json({ error: "'제품' 시트 3행부터 제품을 적어 주세요" }, { status: 400 });

  try {
    const result = await ingestRows(createServiceRoleClient(), ctx.partner, rows, "excel", file.name.slice(0, 120), ctx.userId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
