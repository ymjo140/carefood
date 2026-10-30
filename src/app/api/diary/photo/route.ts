import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * POST /api/diary/photo
 * 사진 기반 음식 인식 API
 *
 * 1단계: HuggingFace Food-101 모델로 음식 분류 (무료, 자체 호스팅 가능)
 * 2단계: 분류 결과를 한국어 매핑 → common_foods / products DB 매칭
 * 3단계: 없으면 빈 결과 → 사용자가 직접 입력
 *
 * 폴백: HF 안 되면 ANTHROPIC_API_KEY로 Claude Vision 사용
 */
export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();

    if (!image) {
      return NextResponse.json({ error: "image required" }, { status: 400 });
    }

    let recognizedFoods: { name: string; confidence: number }[] = [];

    // 1순위: HuggingFace Food-101 (무료)
    try {
      recognizedFoods = await recognizeWithHuggingFace(image);
    } catch (e) {
      console.error("HuggingFace error:", e);

      // 2순위 폴백: Claude Vision (API 키 있을 때만)
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        try {
          recognizedFoods = await recognizeWithClaude(image, apiKey);
        } catch (e2) {
          console.error("Claude Vision fallback error:", e2);
        }
      }
    }

    // DB 매칭
    const matched = await matchFoodsFromDB(recognizedFoods);

    return NextResponse.json({
      recognized: recognizedFoods,
      matched,
      hasAI: true,
    });
  } catch (e) {
    console.error("Photo API error:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다" }, { status: 500 });
  }
}

// Food-101 영어 라벨 → 한국어 매핑 (101개 카테고리)
const FOOD101_KR_MAP: Record<string, string> = {
  apple_pie: "애플파이",
  baby_back_ribs: "바비큐 립",
  baklava: "바클라바",
  beef_carpaccio: "비프 카르파치오",
  beef_tartare: "육회",
  beet_salad: "비트 샐러드",
  beignets: "베니에",
  bibimbap: "비빔밥",
  bread_pudding: "브레드 푸딩",
  breakfast_burrito: "브렉퍼스트 부리토",
  bruschetta: "브루스케타",
  caesar_salad: "시저 샐러드",
  cannoli: "카놀리",
  caprese_salad: "카프레제 샐러드",
  carrot_cake: "당근 케이크",
  ceviche: "세비체",
  cheese_plate: "치즈 플레이트",
  cheesecake: "치즈케이크",
  chicken_curry: "치킨 카레",
  chicken_quesadilla: "치킨 케사디아",
  chicken_wings: "치킨 윙",
  chocolate_cake: "초콜릿 케이크",
  chocolate_mousse: "초콜릿 무스",
  churros: "츄러스",
  clam_chowder: "클램 차우더",
  club_sandwich: "클럽 샌드위치",
  crab_cakes: "크랩 케이크",
  creme_brulee: "크렘 브륄레",
  croque_madame: "크로크 마담",
  cup_cakes: "컵케이크",
  deviled_eggs: "데블드 에그",
  donuts: "도넛",
  dumplings: "만두",
  edamame: "에다마메",
  eggs_benedict: "에그 베네딕트",
  escargots: "에스카르고",
  falafel: "팔라펠",
  filet_mignon: "필레미뇽",
  fish_and_chips: "피쉬 앤 칩스",
  foie_gras: "푸아그라",
  french_fries: "감자튀김",
  french_onion_soup: "프렌치 어니언 수프",
  french_toast: "프렌치 토스트",
  fried_calamari: "오징어 튀김",
  fried_rice: "볶음밥",
  frozen_yogurt: "프로즌 요거트",
  garlic_bread: "마늘빵",
  gnocchi: "뇨끼",
  greek_salad: "그릭 샐러드",
  grilled_cheese_sandwich: "그릴드 치즈 샌드위치",
  grilled_salmon: "연어 구이",
  guacamole: "과카몰리",
  gyoza: "교자",
  hamburger: "햄버거",
  hot_and_sour_soup: "산라탕",
  hot_dog: "핫도그",
  huevos_rancheros: "우에보스 란체로스",
  hummus: "후무스",
  ice_cream: "아이스크림",
  lasagna: "라자냐",
  lobster_bisque: "랍스터 비스크",
  lobster_roll_sandwich: "랍스터 롤",
  macaroni_and_cheese: "맥앤치즈",
  macarons: "마카롱",
  miso_soup: "된장국",
  mussels: "홍합 요리",
  nachos: "나초",
  omelette: "오믈렛",
  onion_rings: "어니언 링",
  oysters: "굴",
  pad_thai: "팟타이",
  paella: "빠에야",
  pancakes: "팬케이크",
  panna_cotta: "판나코타",
  peking_duck: "베이징 덕",
  pho: "쌀국수",
  pizza: "피자",
  pork_chop: "돈까스",
  poutine: "푸틴",
  prime_rib: "프라임 립",
  pulled_pork_sandwich: "풀드포크 샌드위치",
  ramen: "라면",
  ravioli: "라비올리",
  red_velvet_cake: "레드벨벳 케이크",
  risotto: "리조또",
  samosa: "사모사",
  sashimi: "사시미",
  scallops: "관자 요리",
  seaweed_salad: "해초 샐러드",
  shrimp_and_grits: "새우 앤 그릿",
  spaghetti_bolognese: "스파게티 볼로네제",
  spaghetti_carbonara: "스파게티 카르보나라",
  spring_rolls: "스프링 롤",
  steak: "스테이크",
  strawberry_shortcake: "딸기 쇼트케이크",
  sushi: "초밥",
  tacos: "타코",
  takoyaki: "타코야키",
  tiramisu: "티라미수",
  tuna_tartare: "참치 타르타르",
  waffles: "와플",
};

/**
 * HuggingFace Inference API로 음식 분류
 * 모델: nateraw/food (Food-101 ViT classifier, 101 카테고리)
 * 무료 tier: ~30,000 requests/month
 */
async function recognizeWithHuggingFace(
  base64Image: string
): Promise<{ name: string; confidence: number }[]> {
  // base64 → binary Buffer
  const imageData = base64Image.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(imageData, "base64");

  const hfToken = process.env.HF_TOKEN; // 선택사항 (public 모델)
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
  };
  if (hfToken) {
    headers["Authorization"] = `Bearer ${hfToken}`;
  }

  const response = await fetch(
    "https://api-inference.huggingface.co/models/nateraw/food",
    {
      method: "POST",
      headers,
      body: buffer,
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`HuggingFace API error: ${response.status} ${errText}`);
  }

  const results: { label: string; score: number }[] = await response.json();

  // 상위 5개만, confidence 0.05 이상만
  return results
    .filter((r) => r.score >= 0.05)
    .slice(0, 5)
    .map((r) => ({
      name: FOOD101_KR_MAP[r.label] || r.label.replace(/_/g, " "),
      confidence: Math.round(r.score * 100) / 100,
    }));
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
