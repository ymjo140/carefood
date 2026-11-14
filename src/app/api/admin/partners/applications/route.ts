import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { adminOnly } from "@/lib/actor-server";
import { APPLICATION_STATUS, NEXT_STATUS, type ApplicationStatus } from "@/lib/partner/apply";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLS = "id, company_name, representative, email, phone, website, business_number, business_type, product_count, message, status, review_note, reviewed_at, created_at";

/** GET /api/admin/partners/applications[?done=1] — 입점 신청: 처리할 것(새 신청·연락함, 오래된 것부터) 또는 끝난 것(최근 50개) */
export async function GET(req: NextRequest) {
  await connection();
  const denied = await adminOnly(); if (denied) return denied;
  const sb: Sb = createServiceRoleClient();
  const done = req.nextUrl.searchParams.get("done") === "1";
  const q = sb.from("vendor_applications").select(COLS);
  const { data, error } = done
    ? await q.in("status", ["approved", "rejected"]).order("reviewed_at", { ascending: false }).limit(50)
    : await q.in("status", ["pending", "contacted"]).order("created_at", { ascending: true }).limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ applications: data || [] });
}

/** PATCH /api/admin/partners/applications — {id, status: contacted|approved|rejected, note?} 읽은 상태에서 갈 수 있을 때만 (조건부 update) */
export async function PATCH(req: NextRequest) {
  const denied = await adminOnly(); if (denied) return denied;
  const b = await req.json().catch(() => null);
  if (!b || !UUID.test(String(b.id))) return NextResponse.json({ error: "신청을 골라 주세요" }, { status: 400 });
  const to = String(b.status) as ApplicationStatus;
  if (!(APPLICATION_STATUS as readonly string[]).includes(to)) return NextResponse.json({ error: "상태를 골라 주세요" }, { status: 400 });
  const note = String(b.note ?? "").trim().slice(0, 500) || null;
  if (to === "rejected" && !note) return NextResponse.json({ error: "입점하지 않는 이유를 적어 주세요. 신청한 업체에 안내할 때 써요" }, { status: 400 });
  const from = (Object.keys(NEXT_STATUS) as ApplicationStatus[]).filter((s) => NEXT_STATUS[s].includes(to));
  const sb: Sb = createServiceRoleClient();
  const { data, error } = await sb.from("vendor_applications").update({ status: to, review_note: note, reviewed_at: new Date().toISOString() })
    .eq("id", b.id).in("status", from).select("id, status");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "그새 다른 관리자가 처리했어요. 새로 불러와 주세요" }, { status: 409 });
  return NextResponse.json({ application: data[0] });
}
