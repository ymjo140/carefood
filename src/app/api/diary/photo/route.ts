import { NextRequest, NextResponse } from "next/server";
import { limitRequest } from "@/lib/rate-limit";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { searchDishes } from "@/lib/dishes";
import { getActorId, noActor } from "@/lib/actor-server";

/**
 * POST /api/diary/photo — 사진으로 음식 후보 찾기 (식단 기록)
 * 사진은 분석에만 쓰고 저장하지 않는다.
 */
/**
 * 순서: Claude Vision(ANTHROPIC_API_KEY 가 있으면 — 한식에 강함) → HuggingFace Food-101(HF_TOKEN 이 있으면, 서양 음식 101종)
 * 둘 다 없으면 configured:false — 화면은 검색·직접 입력으로 안내한다.
 * 인식한 이름은 대표 메뉴(common_foods) + 식약처 음식 830개(dishes.json) + 제품 이름에 맞춰 후보로 돌려준다.
 */
export async function POST(req: NextRequest) {
  const limited = await limitRequest(req, "photo");
  if (limited) return limited;
  try {
    // 외부 AI 호출 비용이 드는 API — 사이트에서 발급한 쿠키가 있는 요청만
    if (!(await getActorId())) return noActor();
    const { image } = await req.json();

    if (!image || typeof image !== "string" || !image.startsWith("data:image/") || image.length > 3_000_000) {
      return NextResponse.json({ error: "사진을 읽지 못했어요" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const hfToken = process.env.HF_TOKEN;
    if (!apiKey && !hfToken) {
      return NextResponse.json({ recognized: [], matched: { commonFoods: [], products: [] }, hasAI: false, configured: false });
    }

    let recognizedFoods: { name: string; confidence: number }[] = [];
    let failed = false;
    if (apiKey) {
      try { recognizedFoods = await recognizeWithClaude(image, apiKey); }
      catch (e) { console.error("Claude Vision error:", e); failed = true; }
    }
    if (recognizedFoods.length === 0 && hfToken) {
      try { recognizedFoods = await recognizeWithHuggingFace(image); failed = false; }
      catch (e) { console.error("HuggingFace error:", e); failed = true; }
    }
    if (failed && recognizedFoods.length === 0) {
      return NextResponse.json({ error: "사진을 분석하지 못했어요. 잠시 뒤 다시 시도하거나 검색으로 추가해 주세요" }, { status: 502 });
    }

    // DB 매칭
    const matched = await matchFoodsFromDB(recognizedFoods);

    return NextResponse.json({
      recognized: recognizedFoods,
      matched,
      hasAI: true,
      configured: true,
    });
  } catch (e) {
    console.error("Photo API error:", e);
    return NextResponse.json({ error: "사진을 분석하지 못했어요. 다시 시도해 주세요" }, { status: 500 });
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

  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    Authorization: `Bearer ${process.env.HF_TOKEN}`,
  };

  // HF Inference 는 router 주소로 옮겨졌고 토큰이 필요하다
  const response = await fetch(
    "https://router.huggingface.co/hf-inference/models/nateraw/food",
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
      model: process.env.PHOTO_MODEL || "claude-haiku-5-5",
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
              text: `이 사진에 보이는 음식을 한국어 일반 메뉴 이름으로 알려주세요 (예: 김치찌개, 쌀밥, 제육볶음, 닭가슴살 샐러드).
한 접시에 여러 음식이 있으면 각각, 가장 확실한 것부터 최대 5개.
포장 제품이면 포장에 적힌 제품명을 그대로 적어 주세요.
JSON 배열로만 응답하세요. 다른 텍스트 없이 순수 JSON만:
[{"name": "음식명", "confidence": 0.0~1.0}]

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
    const pattern = `%${String(food.name || "").replace(/[%_,()]/g, "")}%`;
    if (pattern === "%%") continue;

    // common_foods 검색
    const { data: common } = await (sb as any)
      .from("common_foods")
      .select("id, name, icon, category, serving_desc, serving_size_g, calories, protein_g, carbs_g, fat_g, sodium_mg")
      .or(`name.ilike.${pattern},aliases.ilike.${pattern}`)
      .limit(3);

    for (const c of common || []) {
      if (!allCommon.has(c.id)) allCommon.set(c.id, c);
    }
    // 식약처 음식 830개 — 1인분 영양이 있는 일반 메뉴 (상위 2개)
    for (const d of searchDishes(food.name, 2)) {
      if (![...allCommon.values()].some((c) => (c as { name: string }).name.replace(/\s/g, "") === d.name.replace(/\s/g, ""))) allCommon.set(d.id, d);
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
