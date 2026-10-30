import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * POST /api/diary/photo
 * 사진 기반 음식 인식 API
 *
 * 1단계: ANTHROPIC_API_KEY가 있으면 Claude Vision으로 음식 인식
 * 2단계: 인식된 음식명으로 common_foods / products DB 매칭
 * 3단계: 없으면 빈 결과 → 사용자가 직접 입력
 */
export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();

    if (!image) {
      return NextResponse.json({ error: "image required" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    // AI 인식 결과
    let recognizedFoods: { name: string; confidence: number }[] = [];

    if (apiKey) {
      // Claude Vision API로 음식 인식
      try {
        recognizedFoods = await recognizeWithClaude(image, apiKey);
      } catch (e) {
        console.error("Claude Vision error:", e);
      }
    }

    // DB 매칭: common_foods + products에서 검색
    const matched = await matchFoodsFromDB(recognizedFoods);

    return NextResponse.json({
      recognized: recognizedFoods,
      matched,
      hasAI: !!apiKey,
    });
  } catch (e) {
    console.error("Photo API error:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다" }, { status: 500 });
  }
}

async function recognizeWithClaude(
  base64Image: string,
  apiKey: string
): Promise<{ name: string; confidence: number }[]> {
  // base64 데이터에서 prefix 제거
  const imageData = base64Image.replace(/^data:image\/\w+;base64,/, "");
  const mediaType = base64Image.match(/^data:(image\/\w+);/)?.[1] || "image/jpeg";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: imageData,
              },
            },
            {
              type: "text",
              text: `이 사진에서 음식을 인식해주세요. 한국어 음식 이름으로 답해주세요.
JSON 배열로만 응답하세요. 다른 텍스트 없이 순수 JSON만:
[{"name": "음식명", "confidence": 0.0~1.0}]

예시: [{"name": "김치찌개", "confidence": 0.95}, {"name": "밥", "confidence": 0.9}]

음식이 아니면 빈 배열: []`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const result = await response.json();
  const text = result.content?.[0]?.text || "[]";

  // JSON 파싱 (마크다운 코드블록 제거)
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return [];
  }
}

async function matchFoodsFromDB(
  recognized: { name: string; confidence: number }[]
): Promise<{
  commonFoods: Array<{
    id: string;
    name: string;
    icon: string;
    category: string;
    serving_desc: string;
    serving_size_g: number;
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    sodium_mg: number | null;
  }>;
  products: Array<{
    id: string;
    name: string;
    brand: string;
    image_url: string | null;
    calories: number | null;
    protein_g: number | null;
    serving_size_g: number | null;
  }>;
}> {
  if (recognized.length === 0) {
    return { commonFoods: [], products: [] };
  }

  const sb = createServiceRoleClient() as ReturnType<typeof createServiceRoleClient> & { from: (...args: unknown[]) => unknown };

  const allCommon: Map<string, unknown> = new Map();
  const allProducts: Map<string, unknown> = new Map();

  for (const food of recognized.slice(0, 5)) {
    const pattern = `%${food.name}%`;

    // common_foods 검색
    const { data: common } = await (sb as any)
      .from("common_foods")
      .select("id, name, icon, category, serving_desc, serving_size_g, calories, protein_g, carbs_g, fat_g, sodium_mg")
      .or(`name.ilike.${pattern},aliases.ilike.${pattern}`)
      .limit(3);

    for (const c of common || []) {
      if (!allCommon.has(c.id)) allCommon.set(c.id, c);
    }

    // products 검색
    const { data: products } = await (sb as any)
      .from("products")
      .select("id, name, brand, image_url, calories, protein_g, serving_size_g")
      .ilike("name", pattern)
      .limit(3);

    for (const p of products || []) {
      if (!allProducts.has(p.id)) allProducts.set(p.id, p);
    }
  }

  return {
    commonFoods: Array.from(allCommon.values()) as any[],
    products: Array.from(allProducts.values()) as any[],
  };
}
