import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/common-foods?q=라면
 * 일반 음식(외식) 영양정보 검색 — name과 aliases 동시 ILIKE
 */
export async function GET(request: NextRequest) {
  await connection();
  const q = request.nextUrl.searchParams.get("q");
  if (!q || q.length < 1) return NextResponse.json({ foods: [] });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const pattern = `%${q}%`;
  const { data } = await sb
    .from("common_foods")
    .select(
      "id, name, icon, category, serving_desc, serving_size_g, calories, protein_g, carbs_g, fat_g, sodium_mg, sugar_g"
    )
    .or(`name.ilike.${pattern},aliases.ilike.${pattern}`)
    .limit(5);

  return NextResponse.json({ foods: data || [] });
}
