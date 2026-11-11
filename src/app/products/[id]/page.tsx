import { notFound } from "next/navigation";
import { PLATFORM_LABELS, AFFILIATE_PLATFORMS, COUPANG_DISCLOSURE } from "@/lib/platforms";
import type { Metadata } from "next";
import { cache } from "react";
import { createServiceRoleClient } from "@/lib/supabase/server";
import ProductTasteSection from "@/components/ProductTasteSection";
import MealLogButton from "@/components/MealLogButton";
import ProductViewTracker from "@/components/ProductViewTracker";
import ProductReviews from "@/components/ProductReviews";
import FavoriteButton from "@/components/FavoriteButton";
import TrackableLink from "@/components/TrackableLink";
import { checkedLabel, usablePrices } from "@/lib/prices";
import AllergenWarning from "@/components/AllergenWarning";
import {
  Page, SectionHeader, Card, Badge, Icon, MacroStat, Stat, EmptyState, Notice, Thumb, Price,
  TextLink, buttonClass, cn,
} from "@/components/ui";

// 동적 라우트 — DB 조회 필요
export const instant = false;

/* ── 제품 메타데이터 캐시 ── */
const getProductMeta = cache(async (id: string) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { data } = await sb
    .from("products")
    .select("id, name, manufacturer, health_score, calories, protein_g, sodium_mg, category_large")
    .eq("id", id)
    .single();
  return data as { id: string; name: string; manufacturer: string | null; health_score: number | null; calories: number | null; protein_g: number | null; sodium_mg: number | null; category_large: string | null } | null;
});

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  const product = await getProductMeta(id);

  if (!product) {
    return { title: "제품을 찾을 수 없어요" };
  }

  const title = product.name;
  const desc = [
    product.manufacturer && `${product.manufacturer}`,
    product.health_score && `건강점수 ${product.health_score}`,
    product.calories != null && `${product.calories}kcal`,
    product.protein_g != null && `단백질 ${product.protein_g}g`,
  ].filter(Boolean).join(" · ");

  return {
    title,
    description: `${title} — ${desc}. 영양 성분 분석, 가격 비교, 맛 평가를 확인하세요.`,
    openGraph: {
      title: `${title} | 케어푸드`,
      description: desc,
    },
  };
}

/* ───── 타입 ───── */
type PriceInfo = {
  platform: string;
  price: number;
  url: string;
  image_url: string | null;
  last_crawled_at: string | null;
};


/* ───── 건강점수 게이지 ───── */
const SCORE_TONE = {
  good: { stroke: "stroke-positive", text: "text-positive" },
  mid: { stroke: "stroke-brand", text: "text-brand-ink" },
  low: { stroke: "stroke-danger", text: "text-danger" },
} as const;

function HealthScoreGauge({ score }: { score: number }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(score / 100, 1);
  const offset = circ * (1 - pct);
  const tone = SCORE_TONE[score >= 80 ? "good" : score >= 60 ? "mid" : "low"];
  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <div className="relative size-14">
        <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
          <circle cx="28" cy="28" r={r} fill="none" className="stroke-line" strokeWidth="5" />
          <circle cx="28" cy="28" r={r} fill="none" className={tone.stroke} strokeWidth="5"
            strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
            transform="rotate(-90 28 28)" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("num text-body font-bold", tone.text)}>{score}</span>
        </div>
      </div>
      <span className="text-caption text-ink-2">건강 점수</span>
    </div>
  );
}

function fmtNum(v: number): string {
  return v % 1 === 0 ? v.toLocaleString("ko-KR") : v.toFixed(1);
}

/* ───── 메인 ───── */
export default async function ProductDetailPage(props: PageProps<"/products/[id]">) {
  const params = await props.params;
  const productId = params.id;

  const supabase = createServiceRoleClient();

  type ProductRow = {
    id: string; name: string; manufacturer: string | null;
    food_code: string | null; food_type: string | null;
    category_large: string | null; meal_type: string | null;
    serving_size_g: number | null; calories: number | null;
    nutrient_base_g: number | null; total_weight_g: number | null;
    protein_g: number | null; fat_g: number | null;
    saturated_fat_g: number | null; trans_fat_g: number | null;
    carbs_g: number | null; sugar_g: number | null;
    fiber_g: number | null; sodium_mg: number | null;
    cholesterol_mg: number | null; ingredients_raw: string | null;
    spicy_score: number; is_active: boolean;
    health_score: number | null;
    source: string | null;
    functional_tags: string[] | null; dish_category: string | null; is_purchasable: boolean | null;
  };

  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .single() as { data: ProductRow | null; error: any };

  if (error || !product) {
    notFound();
  }

  // 가격 데이터
  const { data: prices } = await supabase
    .from("v_all_prices" as any)
    .select("platform, price, url, image_url, last_crawled_at")
    .eq("product_id", productId) as { data: PriceInfo[] | null };

  // 0원·오래된 가격 빼고, 몰마다 가장 싼 것 하나, 싼 순 (src/lib/prices.ts)
  const sortedPrices: PriceInfo[] = usablePrices(prices);
  const priceChecked = checkedLabel(sortedPrices);

  const bestPrice = sortedPrices.length > 0 ? sortedPrices[0] : null;
  const imageUrl = sortedPrices.find((p) => p.image_url)?.image_url;

  // 리뷰 맛 체감 데이터 (맛 프로필 보정용)
  const { data: reviewRows } = await (supabase as any)
    .from("product_reviews")
    .select("taste_salty_feel, taste_sweet_feel, taste_spicy_feel, taste_fatty_feel")
    .eq("product_id", productId) as { data: { taste_salty_feel: number | null; taste_sweet_feel: number | null; taste_spicy_feel: number | null; taste_fatty_feel: number | null }[] | null };
  const rr = reviewRows || [];
  const avgTasteField = (field: string) => {
    const valid = rr.filter(r => (r as Record<string, unknown>)[field] != null && ((r as Record<string, unknown>)[field] as number) > 0);
    return valid.length > 0 ? Math.round(valid.reduce((s, r) => s + ((r as Record<string, unknown>)[field] as number), 0) / valid.length * 10) / 10 : 0;
  };
  // 평가가 1건이라도 있으면 건수를 넘긴다 — 2건부터 맛 그림에 반영 (ProductTasteSection)
  const reviewTaste = rr.length >= 1 ? {
    avgSalty: avgTasteField("taste_salty_feel"),
    avgSweet: avgTasteField("taste_sweet_feel"),
    avgSpicy: avgTasteField("taste_spicy_feel"),
    avgFatty: avgTasteField("taste_fatty_feel"),
    reviewCount: rr.length,
  } : undefined;

  // 건강식단서비스 원본 URL
  let originalProductUrl: string | null = null;
  if (product.category_large === "건강식단서비스" && product.manufacturer) {
    const { data: hmProduct } = await (supabase as any)
      .from("health_meal_products")
      .select("product_url")
      .eq("source", product.manufacturer)
      .eq("name", product.name)
      .single();
    originalProductUrl = hmProduct?.product_url || null;
  }

  // 원재료 (food_reports)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: foodReport } = await (supabase as any)
    .from("food_reports")
    .select("ingredients")
    .eq("matched_product_id", productId)
    .not("ingredients", "is", null)
    .limit(1)
    .maybeSingle() as { data: { ingredients: string[] } | null };

  const ingredients: string[] = foodReport?.ingredients || [];

  // 안전 정보
  const safetyNotes: { type: "good" | "warn"; text: string }[] = [];
  if (product.sodium_mg !== null && product.sodium_mg < 400)
    safetyNotes.push({ type: "good", text: "저나트륨 (400mg 미만)" });
  if (product.sodium_mg !== null && product.sodium_mg > 1000)
    safetyNotes.push({ type: "warn", text: "고나트륨 — 나트륨 섭취에 주의가 필요한 분 참고" });
  if (product.sugar_g !== null && product.sugar_g < 5)
    safetyNotes.push({ type: "good", text: "저당 (5g 미만)" });
  if (product.sugar_g !== null && product.sugar_g > 15)
    safetyNotes.push({ type: "warn", text: "높은 당류 — 당류 섭취에 주의가 필요한 분 참고" });
  if (product.protein_g !== null && product.protein_g >= 15)
    safetyNotes.push({ type: "good", text: "고단백 (15g 이상)" });
  if (product.fiber_g !== null && product.fiber_g < 3)
    safetyNotes.push({ type: "good", text: "소화 부담 적음 (저섬유)" });
  if (product.spicy_score >= 3)
    safetyNotes.push({ type: "warn", text: `매운맛 ${product.spicy_score}단계 — 자극에 민감한 분 참고` });

  // ── 영양성분 기준 보정 ──
  // DB 값 = nutrient_base_g(보통 100g) 기준
  // 표시 = serving_size_g(1회 섭취참고량) 기준
  const baseG = product.nutrient_base_g || product.serving_size_g || 100;
  const servingG = product.serving_size_g || baseG;
  const ratio = (baseG > 0 && servingG !== baseG) ? servingG / baseG : 1;

  // 보정된 영양값 (1회 섭취 기준)
  const adj = (v: number | null) => v != null ? Math.round(v * ratio * 100) / 100 : null;
  const displayCal = adj(product.calories);
  const displayProtein = adj(product.protein_g);
  const displayFat = adj(product.fat_g);
  const displayCarbs = adj(product.carbs_g);
  const displaySodium = adj(product.sodium_mg);
  const displaySugar = adj(product.sugar_g);
  const displayFiber = adj(product.fiber_g);
  const displaySatFat = adj(product.saturated_fat_g);
  const displayCholesterol = adj(product.cholesterol_mg);

  // 표시 기준 라벨
  const servingLabel = ratio === 1
    ? (baseG === 100 ? "100g 당" : `1회 제공량 ${servingG}g`)
    : `1회 제공량 ${servingG}g`;

  // 매크로 경고 판단 (보정값 기준)
  const sodiumHigh = displaySodium != null && displaySodium > 1000;
  const fatHigh = displayFat != null && displayFat > 25;
  const sugarHigh = displaySugar != null && displaySugar > 15;

  // 서빙 기준 100g 환산
  const s = servingG;
  const per100 = (v: number | null) => (v != null && s && s > 0) ? Math.round((v / s) * 100 * 10) / 10 : null;

  const mfrLabel = product.category_large === "건강식단서비스"
    ? ({ greating: "그리팅", yundiet: "윤식단", sixmeal: "식스밀", designmeal: "디자인밀", makesalad: "메이크샐러드" }[product.manufacturer || ""] || product.manufacturer)
    : product.manufacturer;

  const macroRows = [
    { macro: "protein" as const, value: displayProtein, target: 80 },
    { macro: "carbs" as const, value: displayCarbs, target: 260 },
    { macro: "fat" as const, value: displayFat, target: 60 },
    { macro: "sodium" as const, value: displaySodium, target: 2000 },
  ];

  const detailRows = [
    { label: "칼로리", val: product.calories, unit: "kcal" },
    { label: "탄수화물", val: displayCarbs, unit: "g" },
    { label: "당류", val: displaySugar, unit: "g" },
    { label: "단백질", val: product.protein_g, unit: "g" },
    { label: "지방", val: displayFat, unit: "g" },
    { label: "포화지방", val: displaySatFat, unit: "g" },
    { label: "트랜스지방", val: adj(product.trans_fat_g), unit: "g" },
    { label: "콜레스테롤", val: displayCholesterol, unit: "mg" },
    { label: "나트륨", val: displaySodium, unit: "mg" },
    { label: "식이섬유", val: displayFiber, unit: "g" },
  ].filter((r): r is { label: string; val: number; unit: string } => r.val != null);

  return (
    <Page width="default">
      <ProductViewTracker productId={product.id} />

      <TextLink href="/products" className="mb-4">
        <Icon name="chevron-left" size={16} /> 제품 목록
      </TextLink>

      {/* ── 헤더: 이미지 + 제품명 + 건강점수 ── */}
      <header className="flex gap-4 items-start mb-5">
        {imageUrl && <Thumb src={imageUrl} alt={product.name} size={88} className="rounded-lg" />}
        <div className="min-w-0 flex-1">
          <h1 className="text-title font-bold text-ink text-balance">{product.name}</h1>
          {mfrLabel && (
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-label text-ink-2">{mfrLabel}</span>
              {product.category_large === "건강식단서비스" && <Badge tone="brand">건강식단</Badge>}
              {product.food_type && product.category_large !== "건강식단서비스" && (
                <span className="text-caption text-ink-3">{product.food_type}</span>
              )}
            </div>
          )}
          {product.category_large === "건강식단서비스" && originalProductUrl && (
            <TrackableLink href={originalProductUrl} productId={product.id} platform={product.manufacturer || "health_meal"} placement="detail_origin"
              className="inline-flex items-center gap-1 min-h-8 text-label font-medium text-brand-ink hover:underline underline-offset-4">
              원본 상품 페이지 <Icon name="external" size={16} />
            </TrackableLink>
          )}
        </div>
        {product.health_score != null && <HealthScoreGauge score={product.health_score} />}
      </header>

      {/* ── 액션 바 ── */}
      <div className="flex items-center gap-2 mb-5">
        <FavoriteButton productId={product.id} />
        <MealLogButton productId={product.id} productName={product.name} />
      </div>

      {/* ── 칼로리 + 영양 타일 ── */}
      {product.calories != null || product.protein_g != null ? (
        <Card className="mb-5">
          <div className="flex items-end justify-between gap-3 mb-4">
            <Stat size="lg" emphasis label="칼로리" value={displayCal != null ? Math.round(displayCal).toLocaleString("ko-KR") : "–"} unit="kcal" />
            {s && <span className="text-caption text-ink-2">{servingLabel}</span>}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {macroRows.map((m) => (
              <MacroStat key={m.macro} macro={m.macro} value={m.value} target={m.target} digits={1} />
            ))}
          </div>

          {(sodiumHigh || fatHigh || sugarHigh) && (
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-line">
              {sodiumHigh && <Badge tone="caution">나트륨 주의</Badge>}
              {fatHigh && <Badge tone="caution">지방 높음</Badge>}
              {sugarHigh && <Badge tone="caution">당류 높음</Badge>}
            </div>
          )}

          <p className="text-caption text-ink-3 mt-3">막대는 1일 기준치 대비 (2,000kcal 성인 기준)</p>
        </Card>
      ) : (
        <EmptyState className="mb-5" title="영양 정보 수집 중" description="해당 제품의 상세 영양 성분을 수집하고 있어요." />
      )}

      {/* ── 상세 영양 성분표 (접는 형태) ── */}
      {(product.saturated_fat_g != null || product.cholesterol_mg != null || product.fiber_g != null || product.sugar_g != null) && (
        <details className="mb-5 group">
          <summary className="flex items-center gap-1 h-11 cursor-pointer text-label font-bold text-ink-2 hover:text-ink transition-colors list-none">
            상세 영양 성분표
            <Icon name="chevron-down" size={16} className="group-open:rotate-180 transition-transform" />
          </summary>
          <div className="rounded-lg border border-line bg-surface overflow-x-auto">
            <table className="w-full text-label">
              <thead>
                <tr className="border-b border-line bg-sunken">
                  <th className="text-left py-2 px-4 text-caption text-ink-2 font-medium">항목</th>
                  <th className="text-right py-2 px-3 text-caption text-ink-2 font-medium">{s ? `${s}g당` : "함량"}</th>
                  <th className="text-right py-2 px-4 text-caption text-ink-2 font-medium">100g당</th>
                </tr>
              </thead>
              <tbody>
                {detailRows.map((r) => {
                  const p100 = per100(r.val);
                  return (
                    <tr key={r.label} className="border-b border-line last:border-0">
                      <td className="py-2 px-4 font-medium text-ink">{r.label}</td>
                      <td className="py-2 px-3 text-right num text-ink">{fmtNum(r.val)}{r.unit}</td>
                      <td className="py-2 px-4 text-right num text-ink-2">{p100 != null ? fmtNum(p100) : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* ── 알레르기 경고 (클라이언트 컴포넌트) ── */}
      <AllergenWarning productName={product.name} />

      {/* ── 건강 안전 정보 ── */}
      {safetyNotes.length > 0 && (
        <section className="mb-6">
          <SectionHeader title="건강 안전 정보" />
          <Card>
            <ul className="flex flex-col gap-2">
              {safetyNotes.map((note) => (
                <li key={note.text} className="flex items-start gap-2 text-label text-ink">
                  <span className={cn("size-2 rounded-full mt-1.5 shrink-0", note.type === "good" ? "bg-positive" : "bg-ink-3")} aria-hidden="true" />
                  <span>{note.text}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {/* ── 원재료 (food_reports) ── */}
      {ingredients.length > 0 && (
        <section className="mb-6">
          <SectionHeader title="원재료" description="출처: 식품안전나라 품목제조보고" />
          <Card>
            <div className="flex flex-wrap gap-1.5">
              {ingredients.map((ing: string) => (
                <Badge key={ing}>{ing}</Badge>
              ))}
            </div>
          </Card>
        </section>
      )}

      {/* ── 맛·영양 이중 프로필 ── */}
      <ProductTasteSection
        productId={productId}
        productName={product.name}
        nutrition={{
          calories: displayCal,
          protein_g: displayProtein,
          carbs_g: displayCarbs,
          fat_g: displayFat,
          fiber_g: displayFiber,
          sugar_g: displaySugar,
          sodium_mg: displaySodium,
          spicy_score: product.spicy_score,
        }}
        reviewTaste={reviewTaste}
        scoreRow={{
          // 목록과 같은 적합도를 내려고 lib/recommend 에 그대로 넘기는 100g 기준 값
          id: product.id, name: product.name, manufacturer: product.manufacturer, health_score: product.health_score,
          functional_tags: product.functional_tags, dish_category: product.dish_category, category_large: product.category_large,
          calories: product.calories, protein_g: product.protein_g, carbs_g: product.carbs_g, fat_g: product.fat_g,
          sugar_g: product.sugar_g, sodium_mg: product.sodium_mg, fiber_g: product.fiber_g, spicy_score: product.spicy_score,
          serving_size_g: product.serving_size_g, nutrient_base_g: product.nutrient_base_g, is_purchasable: product.is_purchasable,
        }}
      />

      {/* ── 건강 프로필 연동 리뷰 ── */}
      <ProductReviews productId={productId} />

      {/* ── 가격 비교 ── */}
      {sortedPrices.length > 0 && (
        <section className="mb-6">
          <SectionHeader title="구매처 비교" />
          <Card padding="none" className="overflow-hidden">
            {bestPrice && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 border-b border-line">
                <div className="flex flex-col gap-1">
                  <Badge tone="brand" className="self-start">최저가</Badge>
                  <Price value={bestPrice.price} className="text-title" />
                </div>
                <TrackableLink href={bestPrice.url} productId={product.id} platform={bestPrice.platform} placement="detail_best"
                  className={buttonClass({ variant: "primary" })}>
                  {PLATFORM_LABELS[bestPrice.platform] || bestPrice.platform}에서 사기
                  <Icon name="external" size={18} />
                </TrackableLink>
              </div>
            )}
            {sortedPrices.length > 1 && (
              <div className="flex flex-col p-1">
                {sortedPrices.slice(1).map((pp) => (
                  <TrackableLink key={pp.platform} href={pp.url} productId={product.id} platform={pp.platform} placement="detail_other"
                    className="flex items-center gap-3 px-3 h-12 rounded-md hover:bg-sunken transition-colors">
                    <span className="flex-1 text-body text-ink">{PLATFORM_LABELS[pp.platform] || pp.platform}</span>
                    <Price value={pp.price} className="text-label" />
                    <Icon name="external" size={16} className="text-ink-3" />
                  </TrackableLink>
                ))}
              </div>
            )}
          </Card>
          <div className="flex flex-col gap-1 mt-2 text-caption text-ink-2">
            {priceChecked && <p>{priceChecked} · 판매처에서 바뀌었을 수 있어요</p>}
            {sortedPrices.some((pp) => AFFILIATE_PLATFORMS.has(pp.platform)) && <p>{COUPANG_DISCLOSURE}</p>}
          </div>
        </section>
      )}

      {/* ── 원재료 (원본 텍스트) ── */}
      {product.ingredients_raw && (
        <section className="mb-6">
          <SectionHeader title="원재료 (전문)" />
          <Card>
            <p className="text-label text-ink-2">{product.ingredients_raw}</p>
          </Card>
        </section>
      )}

      {/* ── 출처 ── */}
      <div className="flex gap-2 flex-wrap mb-6">
        <Badge>식약처 MFDS 데이터</Badge>
        {product.food_code && <Badge>식품코드 {product.food_code}</Badge>}
      </div>

      {/* ── 면책 ── */}
      <Notice>
        본 정보는 식약처 영양성분 데이터베이스를 기반으로 하며, 의학적 진단·치료·처방을 대체하지 않습니다. 질환이 있는 경우 반드시 의사와 상담하세요.
      </Notice>
    </Page>
  );
}
