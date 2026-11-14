import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canAct, getPartnerContext, readOnly } from "@/lib/partner/auth";
import { partnerCloseCollab } from "@/lib/partner/collabs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/partner/collabs/:id[?as=slug] — {action: "cancel"} 답 전에 거둬들이기 · {action: "end"} 받은 협업 끝내기(코드도 멈춤) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  if (!canAct(ctx)) return readOnly();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "제안을 찾지 못했어요" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  if (b?.action !== "cancel" && b?.action !== "end") return NextResponse.json({ error: "할 일을 골라 주세요" }, { status: 400 });
  try {
    if (!(await partnerCloseCollab(createServiceRoleClient(), ctx.partner.id, id, b.action))) return NextResponse.json({ error: "그새 상태가 바뀌었어요. 새로 불러와 주세요" }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("협업을 바꾸지 못했어요:", id, (e as Error).message);
    return NextResponse.json({ error: "처리하지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
}
