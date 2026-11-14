import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPartnerContext } from "@/lib/partner/auth";
import { clearDemo, seedDemo } from "@/lib/partner/demo";
import { limitRequest } from "@/lib/rate-limit";

export const maxDuration = 60;

/**
 * 예시 데이터 — 테스트 업체(is_demo)만 (lib/partner/demo.ts)
 * POST   → 엑셀·API·대행 예시와 예시 주문을 만든다 (예시 주문은 지우고 다시 만든다)
 * DELETE → 예시 주문·예시 제품·기다리는 예시 대행을 지운다
 * 테스트 업체는 관리자 보기(?as=)에서도 할 수 있다 — 흐름을 확인하는 곳이라서.
 */
async function demoCtx(req: NextRequest) {
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  if (!ctx.partner.is_demo) return NextResponse.json({ error: "예시 데이터는 테스트 업체에서만 만들 수 있어요" }, { status: 403 });
  return ctx;
}

export async function POST(req: NextRequest) {
  await connection();
  const limited = await limitRequest(req, "upload");
  if (limited) return limited;
  const ctx = await demoCtx(req);
  if (ctx instanceof NextResponse) return ctx;
  try { return NextResponse.json(await seedDemo(createServiceRoleClient(), ctx.partner, ctx.userId)); }
  catch (e) {
    console.error("예시 데이터를 만들지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "예시 데이터를 만들지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  await connection();
  const ctx = await demoCtx(req);
  if (ctx instanceof NextResponse) return ctx;
  try { return NextResponse.json(await clearDemo(createServiceRoleClient(), ctx.partner.id)); }
  catch (e) {
    console.error("예시 데이터를 지우지 못했어요:", (e as Error).message);
    return NextResponse.json({ error: "예시 데이터를 지우지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
}
