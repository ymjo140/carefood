import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canAct, getPartnerContext, readOnly } from "@/lib/partner/auth";
import { loadSettings, parseSettings, saveSettings, setNotify } from "@/lib/partner/settings";

/** GET /api/partner/settings[?as=slug] — 업체 정보·계좌(끝 4자리)·담당자·내 알림. can_edit: 대표만 업체 정보를 고친다 */
export async function GET(req: NextRequest) {
  await connection();
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  try {
    const s = await loadSettings(createServiceRoleClient(), ctx.partner.id, ctx.role === "admin" ? null : ctx.userId);
    return NextResponse.json({ ...s, role: ctx.role, can_edit: canAct(ctx) && ctx.role === "owner", read_only: !canAct(ctx) });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

/** PATCH /api/partner/settings — 업체 정보 고치기 (대표만). 보낸 칸만 바꾸고, bank_account 를 보내지 않으면 계좌는 그대로 */
export async function PATCH(req: NextRequest) {
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  if (!canAct(ctx)) return readOnly();
  if (ctx.role !== "owner") return NextResponse.json({ error: "업체 정보는 대표 담당자만 고칠 수 있어요" }, { status: 403 });
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") return NextResponse.json({ error: "고칠 내용을 보내 주세요" }, { status: 400 });
  const r = parseSettings(b as Record<string, unknown>);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  const sb = createServiceRoleClient();
  try {
    await saveSettings(sb, ctx.partner.id, ctx.userId, r.patch);
    return NextResponse.json({ ...(await loadSettings(sb, ctx.partner.id, ctx.userId)), role: ctx.role, can_edit: true, read_only: false });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

/** POST /api/partner/settings — {notify_orders: boolean} 내 새 주문 알림 켜기·끄기 (담당자 누구나, 자기 것만) */
export async function POST(req: NextRequest) {
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  if (ctx.role === "admin") return readOnly();
  const b = await req.json().catch(() => null);
  if (typeof b?.notify_orders !== "boolean") return NextResponse.json({ error: "notify_orders 를 true·false 로 보내 주세요" }, { status: 400 });
  try {
    await setNotify(createServiceRoleClient(), ctx.partner.id, ctx.userId, b.notify_orders);
    return NextResponse.json({ notify_orders: b.notify_orders });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
