import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/** POST /api/community/copy — 식단 복사 카운트 증가 */
export async function POST(request: NextRequest) {
  try {
    const { plan_id } = await request.json();
    if (!plan_id) return NextResponse.json({ error: "plan_id 필수" }, { status: 400 });

    const sb = createServiceRoleClient() as any;
    const { data: plan } = await sb
      .from("shared_meal_plans")
      .select("copy_count")
      .eq("id", plan_id)
      .single();

    if (plan) {
      await sb
        .from("shared_meal_plans")
        .update({ copy_count: (plan.copy_count || 0) + 1 })
        .eq("id", plan_id);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}
