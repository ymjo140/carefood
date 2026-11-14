import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canAct, getPartnerContext, readOnly } from "@/lib/partner/auth";
import { answerInquiry, countInquiries, listPartnerInquiries } from "@/lib/partner/inquiries";
import { loadClaimTerms } from "@/lib/partner/claims-server";

/**
 * GET /api/partner/inquiries?status=open|answered[&page=0][&as=slug] — 주문 문의 (답할 것은 오래된 것부터, 답한 것은 최근 것부터 50개씩)
 * 주문자는 업체마다 다른 가명 번호로만 보인다. read_only: 관리자 보기
 */
export async function GET(req: NextRequest) {
  await connection();
  const sp = req.nextUrl.searchParams;
  const ctx = await getPartnerContext(sp.get("as"));
  if ("error" in ctx) return ctx.error;
  const sb = createServiceRoleClient();
  const answered = sp.get("status") === "answered";
  const page = Math.max(0, Number(sp.get("page")) || 0);
  try {
    const [inquiries, counts] = await Promise.all([listPartnerInquiries(sb, ctx.partner.id, { answered, page }), countInquiries(sb, ctx.partner.id)]);
    return NextResponse.json({ inquiries, counts, page, has_more: answered && inquiries.length === 50, read_only: !canAct(ctx) });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

/** POST /api/partner/inquiries[?as=slug] — {id, answer} 답하기 (한 번만, 금지 표현이 있으면 400) */
export async function POST(req: NextRequest) {
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  if (!canAct(ctx)) return readOnly();
  const b = await req.json().catch(() => null);
  const sb = createServiceRoleClient();
  try {
    const r = await answerInquiry(sb, ctx.partner, ctx.userId, String(b?.id || ""), b?.answer, await loadClaimTerms(sb));
    if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.code === "not_found" ? 404 : r.code === "conflict" ? 409 : 400 });
    return NextResponse.json({ inquiry: r.inquiry });
  } catch (e) {
    console.error("문의에 답하지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "답하지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
}
