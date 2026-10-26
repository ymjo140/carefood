import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/** GET /api/meal-plans/load?id=xxx&user_id=xxx */
export async function GET(request: NextRequest) {
  await connection();
  const id = request.nextUrl.searchParams.get("id");
  const userId = request.nextUrl.searchParams.get("user_id");
  if (!id || !userId) return NextResponse.json({ error: "id, user_id 필수" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  const { data: plan, error } = await sb
    .from("saved_meal_plans")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plan });
}
