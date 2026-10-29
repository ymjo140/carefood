import { NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/odm — ODM 수요 기반 제품 스펙 제안
 *
 * 전체 사용자 영양 갭 집계 → 시장 공급 갭 분석 → 제품 개발 기회 도출
 *
 * 투자자/제조사에게 보여줄 핵심 데이터:
 * "우리 사용자의 72%가 단백질 부족인데, 고단백+고섬유 제품은 시장에 16개뿐"
 */

export async function GET() {
  await connection();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  // ── 1. 사용자 영양 갭 집계 (최근 14일) ──
  const { data: diaryEntries } = await sb
    .from("meal_diary")
    .select("user_id, date, calories, protein_g, fiber_g, sodium_mg, sugar_g, carbs_g, fat_g")
    .gte("date", new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10));

  // 일별 합산
  const userDaily: Record<string, Record<string, {
    cal: number; protein: number; fiber: number; sodium: number; sugar: number;
  }>> = {};

  for (const e of (diaryEntries || [])) {
    if (!userDaily[e.user_id]) userDaily[e.user_id] = {};
    if (!userDaily[e.user_id][e.date]) {
      userDaily[e.user_id][e.date] = { cal: 0, protein: 0, fiber: 0, sodium: 0, sugar: 0 };
    }
    const d = userDaily[e.user_id][e.date];
    d.cal += Number(e.calories || 0);
    d.protein += Number(e.protein_g || 0);
    d.fiber += Number(e.fiber_g || 0);
    d.sodium += Number(e.sodium_mg || 0);
    d.sugar += Number(e.sugar_g || 0);
  }

  // 유저별 평균
  const userAvgs: { protein: number; fiber: number; sodium: number; sugar: number; cal: number }[] = [];
  for (const [, days] of Object.entries(userDaily)) {
    const dayValues = Object.values(days);
    if (dayValues.length < 2) continue;
    const n = dayValues.length;
    userAvgs.push({
      cal: Math.round(dayValues.reduce((s, d) => s + d.cal, 0) / n),
      protein: Math.round(dayValues.reduce((s, d) => s + d.protein, 0) / n * 10) / 10,
      fiber: Math.round(dayValues.reduce((s, d) => s + d.fiber, 0) / n * 10) / 10,
      sodium: Math.round(dayValues.reduce((s, d) => s + d.sodium, 0) / n),
      sugar: Math.round(dayValues.reduce((s, d) => s + d.sugar, 0) / n * 10) / 10,
    });
  }

  const activeUsers = userAvgs.length;
  const nutritionGaps = {
    low_protein: { count: userAvgs.filter(u => u.protein < 50).length, pct: 0, threshold: "50g 미만" },
    low_fiber: { count: userAvgs.filter(u => u.fiber < 15).length, pct: 0, threshold: "15g 미만" },
    high_sodium: { count: userAvgs.filter(u => u.sodium > 2000).length, pct: 0, threshold: "2000mg 초과" },
    high_sugar: { count: userAvgs.filter(u => u.sugar > 50).length, pct: 0, threshold: "50g 초과" },
    low_cal: { count: userAvgs.filter(u => u.cal < 1500).length, pct: 0, threshold: "1500kcal 미만" },
  };
  for (const [, v] of Object.entries(nutritionGaps)) {
    v.pct = activeUsers > 0 ? Math.round(v.count / activeUsers * 100) : 0;
  }

  // ── 2. 제품 공급 분석 ──
  type SpecRow = { spec: string; label: string; supply: number; avg_score: number; demand_pct: number; gap_score: number };

  const specQueries: { spec: string; label: string; demandKey: keyof typeof nutritionGaps; filter: string }[] = [
    { spec: "high_protein", label: "고단백 (20g+)", demandKey: "low_protein", filter: "protein_g >= 20" },
    { spec: "ultra_high_protein", label: "초고단백 (30g+)", demandKey: "low_protein", filter: "protein_g >= 30" },
    { spec: "high_fiber", label: "고식이섬유 (5g+)", demandKey: "low_fiber", filter: "fiber_g >= 5" },
    { spec: "ultra_high_fiber", label: "초고식이섬유 (10g+)", demandKey: "low_fiber", filter: "fiber_g >= 10" },
    { spec: "low_sodium", label: "저나트륨 (<300mg)", demandKey: "high_sodium", filter: "sodium_mg < 300" },
    { spec: "low_sugar", label: "저당 (<3g)", demandKey: "high_sugar", filter: "sugar_g < 3" },
  ];

  const supplyAnalysis: SpecRow[] = [];
  for (const sq of specQueries) {
    const { count } = await sb
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("is_purchasable", true)
      .or(sq.filter.includes(">=") ?
        `${sq.filter.split(" >= ")[0]}.gte.${sq.filter.split(" >= ")[1]}` :
        `${sq.filter.split(" < ")[0]}.lt.${sq.filter.split(" < ")[1]}`);

    supplyAnalysis.push({
      spec: sq.spec,
      label: sq.label,
      supply: count || 0,
      avg_score: 0,
      demand_pct: nutritionGaps[sq.demandKey].pct,
      gap_score: 0,
    });
  }

  // 복합 스펙 (직접 쿼리)
  const { count: protFiberCount } = await sb
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("is_purchasable", true)
    .gte("protein_g", 15)
    .gte("fiber_g", 3);

  const { count: protLowSugarCount } = await sb
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("is_purchasable", true)
    .gte("protein_g", 20)
    .lt("sugar_g", 5);

  const { count: protLowSodiumCount } = await sb
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("is_purchasable", true)
    .gte("protein_g", 20)
    .lt("sodium_mg", 300);

  supplyAnalysis.push(
    { spec: "protein_fiber", label: "고단백+고섬유", supply: protFiberCount || 0, avg_score: 0, demand_pct: Math.max(nutritionGaps.low_protein.pct, nutritionGaps.low_fiber.pct), gap_score: 0 },
    { spec: "protein_low_sugar", label: "고단백+저당", supply: protLowSugarCount || 0, avg_score: 0, demand_pct: nutritionGaps.low_protein.pct, gap_score: 0 },
    { spec: "protein_low_sodium", label: "고단백+저나트륨", supply: protLowSodiumCount || 0, avg_score: 0, demand_pct: nutritionGaps.low_protein.pct, gap_score: 0 },
  );

  // Gap Score = 수요% / log(공급+1) — 높을수록 기회 큼
  for (const s of supplyAnalysis) {
    s.gap_score = Math.round(s.demand_pct / Math.max(Math.log2(s.supply + 1), 0.1) * 10) / 10;
  }
  supplyAnalysis.sort((a, b) => b.gap_score - a.gap_score);

  // ── 3. ODM 제안 스펙 Top5 ──
  const odmSuggestions = supplyAnalysis
    .filter(s => s.gap_score > 0)
    .slice(0, 5)
    .map((s, i) => ({
      rank: i + 1,
      spec: s.label,
      reason: `사용자 ${s.demand_pct}%가 해당 영양소 부족, 시장 공급 ${s.supply}개`,
      gap_score: s.gap_score,
      suggested_targets: getSuggestedTargets(s.spec),
    }));

  // ── 4. 관심사별 사용자 분포 ──
  const { data: profiles } = await sb
    .from("user_profiles")
    .select("concerns, diet_type, age_group, gender");

  const concernCounts: Record<string, number> = {};
  const dietCounts: Record<string, number> = {};
  const ageCounts: Record<string, number> = {};
  for (const p of (profiles || [])) {
    for (const c of (p.concerns || [])) {
      concernCounts[c] = (concernCounts[c] || 0) + 1;
    }
    if (p.diet_type) dietCounts[p.diet_type] = (dietCounts[p.diet_type] || 0) + 1;
    if (p.age_group) ageCounts[p.age_group] = (ageCounts[p.age_group] || 0) + 1;
  }

  return NextResponse.json({
    activeUsers,
    totalProfiles: profiles?.length || 0,
    nutritionGaps,
    supplyAnalysis,
    odmSuggestions,
    userDemographics: { concerns: concernCounts, dietTypes: dietCounts, ageGroups: ageCounts },
    generatedAt: new Date().toISOString(),
  });
}

function getSuggestedTargets(spec: string): Record<string, string> {
  const targets: Record<string, Record<string, string>> = {
    protein_fiber: { protein_g: "≥20g", fiber_g: "≥5g", calories: "300-500kcal", sodium_mg: "<500mg", format: "도시락/샐러드" },
    ultra_high_protein: { protein_g: "≥30g", calories: "250-400kcal", sugar_g: "<5g", format: "간편식/바/쉐이크" },
    ultra_high_fiber: { fiber_g: "≥10g", calories: "200-400kcal", sodium_mg: "<400mg", format: "시리얼/스무디/간식" },
    protein_low_sugar: { protein_g: "≥20g", sugar_g: "<3g", calories: "200-400kcal", format: "닭가슴살/프로틴바" },
    protein_low_sodium: { protein_g: "≥20g", sodium_mg: "<200mg", calories: "300-500kcal", format: "샐러드/그릴" },
    high_protein: { protein_g: "≥20g", calories: "300-500kcal", format: "도시락/간편식" },
    high_fiber: { fiber_g: "≥5g", calories: "200-400kcal", format: "시리얼/샐러드" },
    low_sodium: { sodium_mg: "<300mg", calories: "300-500kcal", format: "무염 도시락" },
    low_sugar: { sugar_g: "<3g", calories: "200-400kcal", format: "저당 간식" },
  };
  return targets[spec] || { note: "추가 분석 필요" };
}
