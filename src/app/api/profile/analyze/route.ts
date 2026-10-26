import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * POST /api/profile/analyze
 * 사용자 행동 데이터를 분석해서 자동 태그 추론
 * 클라이언트에서 주기적으로 호출 (5회 이상 행동 누적 시)
 */

// 필터 패턴 → 태그 매핑
const FILTER_TAG_MAP: Record<string, string> = {
  // 필터 키워드 → 행동 태그
  "sugar_max": "low_sugar_pref",
  "per100g_sugar_max": "low_sugar_density_pref",
  "protein_min": "high_protein_interest",
  "per100g_protein_min": "high_protein_density_pref",
  "calories_max": "low_calorie_pref",
  "per100g_calories_max": "low_calorie_density_pref",
  "sodium_max": "low_sodium_pref",
  "fiber_min": "high_fiber_interest",
  "hasPrice": "price_conscious",
};

// 검색 키워드 → 태그 매핑
const SEARCH_TAG_PATTERNS: [RegExp, string][] = [
  [/닭가슴살|프로틴|단백질/, "high_protein_interest"],
  [/다이어트|저칼|칼로리/, "diet_interest"],
  [/유산균|프로바이오틱/, "probiotics_interest"],
  [/콜라겐/, "collagen_interest"],
  [/비타민/, "vitamin_interest"],
  [/무설탕|저당|당뇨/, "low_sugar_pref"],
  [/글루텐프리|글루텐/, "gluten_free_pref"],
  [/비건|채식|식물성/, "vegetarian_interest"],
];

export async function POST(request: NextRequest) {
  try {
    const { user_id } = await request.json();
    if (!user_id) {
      return NextResponse.json({ error: "user_id 필수" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // 최근 30일 행동 가져오기
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: interactions } = await (supabase as any)
      .from("user_interactions")
      .select("action, metadata, created_at")
      .eq("user_id", user_id)
      .gte("created_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(500) as { data: { action: string; metadata: Record<string, unknown>; created_at: string }[] | null };

    if (!interactions || interactions.length < 3) {
      return NextResponse.json({ tags: [], message: "데이터 부족 (최소 3회 행동 필요)" });
    }

    // 태그별 근거 카운트
    const tagEvidence: Record<string, number> = {};

    for (const interaction of interactions) {
      const meta = interaction.metadata || {};

      if (interaction.action === "filter_use") {
        // 필터 사용 패턴 분석
        const filters = meta.filters as Record<string, unknown> | undefined;
        if (filters) {
          for (const [filterKey, tagName] of Object.entries(FILTER_TAG_MAP)) {
            const val = filters[filterKey];
            if (val && val !== 0 && val !== "0" && val !== false) {
              tagEvidence[tagName] = (tagEvidence[tagName] || 0) + 1;
            }
          }
        }
      }

      if (interaction.action === "search") {
        // 검색어 패턴 분석
        const query = (meta.query as string) || "";
        for (const [pattern, tagName] of SEARCH_TAG_PATTERNS) {
          if (pattern.test(query)) {
            tagEvidence[tagName] = (tagEvidence[tagName] || 0) + 2; // 검색은 가중치 2
          }
        }
      }

      // 가격 클릭 → 가격 민감
      if (interaction.action === "click_price") {
        const price = meta.price as number;
        if (price && price < 5000) {
          tagEvidence["budget_conscious"] = (tagEvidence["budget_conscious"] || 0) + 1;
        }
      }
    }

    // 근거 2회 이상인 태그만 저장
    const confirmedTags = Object.entries(tagEvidence)
      .filter(([, count]) => count >= 2)
      .map(([tag, count]) => ({
        tag,
        confidence: Math.min(count / 10, 1.0), // 최대 1.0
        evidence_count: count,
      }));

    // user_behavior_tags에 upsert
    for (const t of confirmedTags) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("user_behavior_tags")
        .upsert({
          user_id,
          tag: t.tag,
          confidence: t.confidence,
          evidence_count: t.evidence_count,
          last_evidence_at: new Date().toISOString(),
        }, { onConflict: "user_id,tag" });
    }

    // user_profiles의 auto_tags도 업데이트
    const autoTags: Record<string, number> = {};
    for (const t of confirmedTags) {
      autoTags[t.tag] = t.confidence;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("user_profiles")
      .update({ auto_tags: autoTags, updated_at: new Date().toISOString() })
      .eq("user_id", user_id);

    return NextResponse.json({
      tags: confirmedTags,
      total_interactions_analyzed: interactions.length,
    });
  } catch (err) {
    console.error("Profile analyze error:", err);
    return NextResponse.json({ error: "분석 중 오류" }, { status: 500 });
  }
}
