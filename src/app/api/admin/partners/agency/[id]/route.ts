import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/actor-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/admin/partners/agency/:id — {action: "cancel"} 업체가 반영하기 전이면 거둬들인다 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "관리자만 거둬들일 수 있어요" }, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "파일을 찾지 못했어요" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  if (b?.action !== "cancel") return NextResponse.json({ error: "할 일을 골라 주세요" }, { status: 400 });
  const { data, error } = await (createServiceRoleClient() as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .from("partner_agency_uploads").update({ status: "canceled", decided_by: admin.id, decided_at: new Date().toISOString(), decided_note: "오늘끼록이 거둬들임" })
    .eq("id", id).eq("status", "waiting").select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "이미 업체가 처리했거나 거둬들인 파일이에요" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
