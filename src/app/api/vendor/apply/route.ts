import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { limitRequest } from "@/lib/rate-limit";
import { parseApplication } from "@/lib/partner/apply";

/**
 * POST /api/vendor/apply — 입점 신청 (로그인 없이). 값은 lib/partner/apply.ts parseApplication 으로 읽는다.
 * 고칠 칸이 있으면 400 {error, field}. 관리자는 관리 > 입점 맨 위 '입점 신청'에서 본다
 */
export async function POST(req: NextRequest) {
  const limited = await limitRequest(req, "report");
  if (limited) return limited;
  const body = await req.json().catch(() => null);
  const r = parseApplication(body);
  if (!r.ok) return NextResponse.json({ error: r.error, field: r.field }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { data, error } = await sb.from("vendor_applications").insert({ ...r.value, status: "pending" }).select("id").single();
  if (error) {
    console.error("입점 신청을 저장하지 못했어요:", error.message);
    return NextResponse.json({ error: "신청을 보내지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
  return NextResponse.json({ success: true, id: data.id });
}
