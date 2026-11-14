import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canAct, getPartnerContext, readOnly } from "@/lib/partner/auth";
import { applyTrackingSheet } from "@/lib/partner/fulfil-sheet";
import { limitRequest } from "@/lib/rate-limit";

export const maxDuration = 120;

/**
 * POST /api/partner/orders/tracking[?as=slug] — 송장을 적은 출고 목록(.xlsx, 5MB) 올리기.
 * 형식이 틀린 줄이 있으면 아무것도 바꾸지 않고 줄마다 이유를 돌려준다(blocked). 맞으면 줄마다 발송 처리
 */
export async function POST(req: NextRequest) {
  const limited = await limitRequest(req, "upload");
  if (limited) return limited;
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  if (!canAct(ctx)) return readOnly();
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "파일을 받지 못했어요" }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "엑셀 파일을 골라 주세요" }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name)) return NextResponse.json({ error: "내려받은 출고 목록(.xlsx)으로 올려 주세요" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "5MB 까지 올릴 수 있어요. 나눠서 올려 주세요" }, { status: 413 });
  let buf: ArrayBuffer;
  try { buf = await file.arrayBuffer(); } catch { return NextResponse.json({ error: "파일을 읽지 못했어요" }, { status: 400 }); }
  try {
    const result = await applyTrackingSheet(createServiceRoleClient(), ctx.partner, buf);
    if (result.rows === 0) return NextResponse.json({ error: "'출고 목록' 시트 3행부터 주문이 있어야 해요" }, { status: 400 });
    return NextResponse.json(result);
  } catch (e) {
    const msg = (e as Error).message || "";
    // 읽기 오류(시트·필드 키)는 그대로 알려 주고, 그 밖의 오류는 기록
    if (/시트|필드 키|줄까지/.test(msg)) return NextResponse.json({ error: msg }, { status: 400 });
    console.error("송장 올리기 실패:", msg);
    return NextResponse.json({ error: "송장을 올리지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
}
