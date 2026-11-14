import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canAct, getPartnerContext, readOnly } from "@/lib/partner/auth";
import { decideAgency } from "@/lib/partner/agency";
import { limitRequest } from "@/lib/rate-limit";

export const maxDuration = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/partner/agency/:id[?as=slug] — {action: "confirm" | "return", note?} 반영하기·돌려보내기 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const limited = await limitRequest(req, "upload");
  if (limited) return limited;
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  if (!canAct(ctx)) return readOnly();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "파일을 찾지 못했어요" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  if (b?.action !== "confirm" && b?.action !== "return") return NextResponse.json({ error: "반영할지 돌려보낼지 골라 주세요" }, { status: 400 });
  try {
    const r = await decideAgency(createServiceRoleClient(), ctx.partner, id, b.action, String(b.note || "").trim(), ctx.userId);
    if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });
    return NextResponse.json({ ok: true, result: r.result || null });
  } catch (e) {
    console.error("대행 파일을 처리하지 못했어요:", id, (e as Error).message);
    return NextResponse.json({ error: "처리하지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
}
