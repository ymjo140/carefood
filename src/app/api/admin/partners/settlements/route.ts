import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { adminOnly, getAdminUser } from "@/lib/actor-server";
import { closeMonth, markPaid, settlementMonths } from "@/lib/partner/settlement";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/admin/partners/settlements?partner_id= — 달별 지금 숫자와 마감해 둔 숫자 */
export async function GET(req: NextRequest) {
  await connection();
  const denied = await adminOnly(); if (denied) return denied;
  const id = req.nextUrl.searchParams.get("partner_id") || "";
  if (!UUID.test(id)) return NextResponse.json({ error: "업체를 골라 주세요" }, { status: 400 });
  try { return NextResponse.json({ months: await settlementMonths(createServiceRoleClient(), id) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

/** POST /api/admin/partners/settlements — {partner_id, month, action: "close" | "paid", note?} */
export async function POST(req: NextRequest) {
  const denied = await adminOnly(); if (denied) return denied;
  const b = await req.json().catch(() => null);
  const id = String(b?.partner_id || "");
  const month = String(b?.month || "");
  if (!UUID.test(id)) return NextResponse.json({ error: "업체를 골라 주세요" }, { status: 400 });
  const sb = createServiceRoleClient();
  try {
    if (b?.action === "close") {
      const admin = await getAdminUser();
      return NextResponse.json({ settlement: await closeMonth(sb, id, month, admin?.id ?? null) });
    }
    if (b?.action === "paid") {
      await markPaid(sb, id, month, typeof b?.note === "string" ? b.note : null);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "action 은 close 또는 paid 예요" }, { status: 400 });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
