import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { searchDishes, type CommonFoodRow } from "@/lib/dishes";

/**
 * GET /api/common-foods?q=라면   일반 메뉴 검색 — 대표 메뉴(common_foods, 먹는 단위) 먼저, 이어서 식약처 음식 DB
 * GET /api/common-foods?all=1    대표 메뉴 전체 (외식 메뉴 고르기 목록)
 */
const COLS = "id, name, category, serving_desc, serving_size_g, calories, protein_g, carbs_g, fat_g, sodium_mg, sugar_g";

export async function GET(request: NextRequest) {
  await connection();
  const params = request.nextUrl.searchParams;
  const q = (params.get("q") || "").trim();
  const all = params.get("all") === "1";
  if (!q && !all) return NextResponse.json({ foods: [] });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  if (all) {
    const { data, error } = await sb.from("common_foods").select(COLS).order("category").order("name");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ foods: (data || []).map((f: Omit<CommonFoodRow, "source">) => ({ ...f, source: "curated" })) });
  }

  const pattern = `%${q.replace(/[%_,()]/g, "")}%`;
  const { data, error } = await sb.from("common_foods").select(COLS)
    .or(`name.ilike.${pattern},aliases.ilike.${pattern}`).limit(8);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const curated: CommonFoodRow[] = (data || []).map((f: Omit<CommonFoodRow, "source">) => ({ ...f, source: "curated" }));
  const names = new Set(curated.map(f => f.name.replace(/\s/g, "")));
  const mfds = searchDishes(q, 12).filter(f => !names.has(f.name.replace(/\s/g, "")));
  return NextResponse.json({ foods: [...curated, ...mfds] });
}
