import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { user_id, daily_calories, daily_protein_g, max_sodium_mg, max_sugar_g } = body;

  if (!user_id) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { error } = await (supabase as any)
    .from("daily_nutrition_goals")
    .upsert(
      {
        user_id,
        daily_calories: daily_calories || 2000,
        daily_protein_g: daily_protein_g || 60,
        max_sodium_mg: max_sodium_mg || 2000,
        max_sugar_g: max_sugar_g || 50,
      },
      { onConflict: "user_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
