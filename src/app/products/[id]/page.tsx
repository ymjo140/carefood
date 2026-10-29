import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { cache } from "react";
import { createServiceRoleClient } from "@/lib/supabase/server";
import ProductTasteSection from "@/components/ProductTasteSection";
import MealLogButton from "@/components/MealLogButton";
import ProductViewTracker from "@/components/ProductViewTracker";
import ProductReviews from "@/components/ProductReviews";
import FavoriteButton from "@/components/FavoriteButton";
import TrackableLink from "@/components/TrackableLink";

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
    return { title: "제품을 찾을 수 없습니다" };
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
};

const PLATFORM_LABELS: Record<string, string> = {
  kurly: "컬리",
  oasis: "오아시스",
  homeplus: "홈플러스",
  "11st": "11번가",
  danawa: "다나와",
  greating: "그리팅",
  yundiet: "윤식단",
  sixmeal: "식스밀",
  designmeal: "디자인밀",
  makesalad: "메이크샐러드",
};

const PLATFORM_COLORS: Record<string, string> = {
  kurly: "bg-purple-600 hover:bg-purple-700",
  oasis: "bg-green-600 hover:bg-green-700",
  homeplus: "bg-orange-600 hover:bg-orange-700",
  "11st": "bg-red-600 hover:bg-red-700",
  danawa: "bg-blue-600 hover:bg-blue-700",
  greating: "bg-emerald-600 hover:bg-emerald-700",
  yundiet: "bg-amber-600 hover:bg-amber-700",
  sixmeal: "bg-rose-600 hover:bg-rose-700",
  designmeal: "bg-teal-600 hover:bg-teal-700",
  makesalad: "bg-lime-600 hover:bg-lime-700",
};

function formatPrice(price: number): string {
  return price.toLocaleString("ko-KR") + "원";
}

/* ───── 영양 행 ───── */
function NutritionRow({
  label,
  value,
  unit,
  dailyMax,
  highlight,
  per100g,
}: {
  label: string;
  value: number | null;
  unit: string;
  dailyMax?: number;
  highlight?: "good" | "warn" | "danger";
  per100g?: number | null;
}) {
  if (value === null || value === undefined) return null;
  const pct = dailyMax ? Math.min((value / dailyMax) * 100, 100) : 0;
  const colorClass =
    highlight === "good"
      ? "text-green-600"
      : highlight === "warn"
        ? "text-orange-600"
        : highlight === "danger"
          ? "text-red-600"
          : "";

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2.5 px-4 text-sm font-medium">{label}</td>
      <td className={`py-2.5 px-2 text-sm text-right tabular-nums ${colorClass}`}>
        {value % 1 === 0 ? value : value.toFixed(1)}
        {unit}
      </td>
      <td className="py-2.5 px-2 text-xs text-right tabular-nums text-muted">
        {per100g != null ? (
          <>{per100g % 1 === 0 ? per100g : per100g.toFixed(1)}</>
        ) : "—"}
      </td>
      {dailyMax ? (
        <td className="py-2.5 pl-2 pr-4 w-24">
          <div className="h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                pct > 80
                  ? "bg-red-400"
                  : pct > 50
                    ? "bg-orange-400"
                    : "bg-primary"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] text-muted">{Math.round(pct)}%</span>
        </td>
      ) : (
        <td className="py-2.5 pl-2 pr-4 w-24" />
      )}
    </tr>
  );
}

/* ───── 메인 ───── */
export default async function ProductDetailPage(props: PageProps<"/products/[id]">) {
  const params = await props.params;
  const productId = params.id;

  const supabase = createServiceRoleClient();

  // 제품 데이터
  type ProductRow = {
    id: string; name: string; manufacturer: string | null;
    food_code: string | null; food_type: string | null;
    category_large: string | null; meal_type: string | null;
    serving_size_g: number | null; calories: number | null;
    protein_g: number | null; fat_g: number | null;
    saturated_fat_g: number | null; trans_fat_g: number | null;
    carbs_g: number | null; sugar_g: number | null;
    fiber_g: number | null; sodium_mg: number | null;
    cholesterol_mg: number | null; ingredients_raw: string | null;
    spicy_score: number; is_active: boolean;
    health_score: number | null;
    source: string | null;
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
    .select("platform, price, url, image_url")
    .eq("product_id", productId) as { data: PriceInfo[] | null };

  const sortedPrices: PriceInfo[] = (prices || [])
    .filter((p) => p.price > 0)
    .sort((a, b) => a.price - b.price);

  const bestPrice = sortedPrices.length > 0 ? sortedPrices[0].price : null;
  const imageUrl = sortedPrices.find((p) => p.image_url)?.image_url;

  // 건강식단서비스 제품이면 원본 상품 페이지 URL 조회
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

  // 원재료 데이터 (food_reports에서)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: foodReport } = await (supabase as any)
    .from("food_reports")
    .select("ingredients")
    .eq("matched_product_id", productId)
    .not("ingredients", "is", null)
    .limit(1)
    .maybeSingle() as { data: { ingredients: string[] } | null };

  const ingredients: string[] = foodReport?.ingredients || [];

  // 안전 정보 계산
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

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <ProductViewTracker productId={product.id} />
      {/* 뒤로가기 */}
      <Link href="/products" className="text-sm text-muted hover:text-primary transition-colors mb-6 inline-block">
        ← 제품 목록으로
      </Link>

      {/* 헤더 */}
      <div className="flex gap-5 mb-8">
        {imageUrl && (
          <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-xl overflow-hidden shrink-0 bg-border">
            <img src={imageUrl} alt={product.name} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold leading-tight">{product.name}</h1>
            <div className="flex items-center gap-1 shrink-0">
              <FavoriteButton productId={product.id} />
              <MealLogButton productId={product.id} />
            </div>
          </div>
          {product.manufacturer && (
            <>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm text-muted">{
                  product.category_large === "건강식단서비스"
                    ? ({ greating: "그리팅", yundiet: "윤식단", sixmeal: "식스밀", designmeal: "디자인밀", makesalad: "메이크샐러드" }[product.manufacturer] || product.manufacturer)
                    : product.manufacturer
                }</p>
                {product.category_large === "건강식단서비스" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">건강식단 서비스</span>
                )}
              </div>
              {product.category_large === "건강식단서비스" && originalProductUrl && (
                <TrackableLink
                  href={originalProductUrl}
                  productId={product.id}
                  platform={product.manufacturer || "health_meal"}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-dark transition-colors mt-0.5"
                >
                  원본 상품 페이지 →
                </TrackableLink>
              )}
            </>
          )}
          {product.food_type && product.category_large !== "건강식단서비스" && (
            <p className="text-xs text-muted mt-0.5">{product.food_type}</p>
          )}
          {product.health_score != null && (
            <div className="mt-2 flex items-center gap-2">
              <span className={`text-sm px-2.5 py-1 rounded-lg font-bold ${
                product.health_score >= 70 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : product.health_score >= 50 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
              }`}>
                건강 점수 {product.health_score}
              </span>
              <span className="text-xs text-muted">
                {product.health_score >= 70 ? "영양 균형 우수" : product.health_score >= 50 ? "보통" : "주의 필요"}
              </span>
            </div>
          )}
          {bestPrice && (
            <p className="text-2xl font-bold text-primary mt-3">
              {formatPrice(bestPrice)}
              {sortedPrices.length > 1 && (
                <span className="text-xs text-muted font-normal ml-2">
                  최저가 ({PLATFORM_LABELS[sortedPrices[0].platform] || sortedPrices[0].platform})
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* 구매 링크 */}
      {sortedPrices.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-extrabold mb-3">구매처 비교</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sortedPrices.map((pp) => (
              <TrackableLink
                key={pp.platform}
                href={pp.url}
                productId={product.id}
                platform={pp.platform}
                className={`flex items-center justify-between px-4 py-3 rounded-xl text-white text-sm font-medium transition-colors ${
                  PLATFORM_COLORS[pp.platform] || "bg-gray-600 hover:bg-gray-700"
                }`}
              >
                <span>{PLATFORM_LABELS[pp.platform] || pp.platform}</span>
                <span>{formatPrice(pp.price)}</span>
              </TrackableLink>
            ))}
          </div>
        </section>
      )}

      {/* 안전 정보 */}
      {safetyNotes.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-extrabold mb-3">건강 안전 정보</h2>
          <div className="bg-card rounded-2xl border border-border p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-2">
            {safetyNotes.map((note) => (
              <div key={note.text} className="flex items-start gap-2 text-sm">
                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${note.type === "good" ? "bg-green-500" : "bg-orange-500"}`} />
                <span>{note.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 원재료 */}
      {ingredients.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-extrabold mb-3">원재료</h2>
          <div className="border border-border rounded-xl p-4">
            <div className="flex flex-wrap gap-1.5">
              {ingredients.map((ing: string) => (
                <span key={ing} className="text-xs px-2.5 py-1 rounded-full bg-surface text-foreground/70"
                  style={{ minHeight: "unset", minWidth: "unset" }}>
                  {ing}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-muted mt-3">
              출처: 식품안전나라 품목제조보고
            </p>
          </div>
        </section>
      )}

      {/* 맛·영양 이중 프로필 */}
      <ProductTasteSection
        productId={productId}
        productName={product.name}
        nutrition={{
          calories: product.calories,
          protein_g: product.protein_g,
          carbs_g: product.carbs_g,
          fat_g: product.fat_g,
          fiber_g: product.fiber_g,
          sodium_mg: product.sodium_mg,
        }}
      />

      {/* 건강 프로필 연동 리뷰 */}
      <ProductReviews productId={productId} />

      {/* 영양 성분표 */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-extrabold">영양 성분</h2>
          {product.serving_size_g && (
            <span className="text-xs text-muted">1회 제공량 {product.serving_size_g}g 기준</span>
          )}
        </div>
        {(() => {
          // 100g당 환산 계산
          const s = product.serving_size_g;
          const per100 = (v: number | null) => (v != null && s && s > 0) ? Math.round((v / s) * 100 * 10) / 10 : null;

          return (
            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-surface/50">
                    <th className="text-left py-2 px-4 text-xs text-muted font-medium">항목</th>
                    <th className="text-right py-2 px-2 text-xs text-muted font-medium">
                      {s ? `${s}g당` : "함량"}
                    </th>
                    <th className="text-right py-2 px-2 text-xs text-muted font-medium">100g당</th>
                    <th className="text-left py-2 pl-2 pr-4 text-xs text-muted font-medium w-24">일일</th>
                  </tr>
                </thead>
                <tbody>
                  <NutritionRow label="칼로리" value={product.calories} unit="kcal" dailyMax={2000} per100g={per100(product.calories)} />
                  <NutritionRow label="탄수화물" value={product.carbs_g} unit="g" dailyMax={324} per100g={per100(product.carbs_g)} />
                  <NutritionRow label="당류" value={product.sugar_g} unit="g" dailyMax={50} per100g={per100(product.sugar_g)}
                    highlight={product.sugar_g !== null && product.sugar_g > 15 ? "warn" : product.sugar_g !== null && product.sugar_g < 5 ? "good" : undefined} />
                  <NutritionRow label="단백질" value={product.protein_g} unit="g" dailyMax={55} per100g={per100(product.protein_g)}
                    highlight={product.protein_g !== null && product.protein_g >= 15 ? "good" : undefined} />
                  <NutritionRow label="지방" value={product.fat_g} unit="g" dailyMax={54} per100g={per100(product.fat_g)} />
                  <NutritionRow label="포화지방" value={product.saturated_fat_g} unit="g" dailyMax={15} per100g={per100(product.saturated_fat_g)}
                    highlight={product.saturated_fat_g !== null && product.saturated_fat_g > 10 ? "warn" : undefined} />
                  <NutritionRow label="나트륨" value={product.sodium_mg} unit="mg" dailyMax={2000} per100g={per100(product.sodium_mg)}
                    highlight={product.sodium_mg !== null && product.sodium_mg > 1000 ? "danger" : product.sodium_mg !== null && product.sodium_mg < 400 ? "good" : undefined} />
                  <NutritionRow label="콜레스테롤" value={product.cholesterol_mg} unit="mg" dailyMax={300} per100g={per100(product.cholesterol_mg)} />
                  <NutritionRow label="식이섬유" value={product.fiber_g} unit="g" dailyMax={25} per100g={per100(product.fiber_g)} />
                </tbody>
              </table>
            </div>
          );
        })()}
        <p className="text-[10px] text-muted mt-2">
          * 일일기준치: 성인 2,000kcal 기준 · 100g당 수치로 제품 간 비교 가능
        </p>
      </section>

      {/* 원재료 */}
      {product.ingredients_raw && (
        <section className="mb-8">
          <h2 className="text-sm font-extrabold mb-3">원재료</h2>
          <div className="bg-card rounded-2xl border border-border p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-sm text-muted leading-relaxed">{product.ingredients_raw}</p>
          </div>
        </section>
      )}

      {/* 신뢰 배지 */}
      <section className="mb-8">
        <div className="flex gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-muted bg-card border border-border rounded-full px-3 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/40" /> 식약처 MFDS 데이터
          </div>
          {product.food_code && (
            <div className="flex items-center gap-1.5 text-xs text-muted bg-card border border-border rounded-full px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/40" /> 식품코드 {product.food_code}
            </div>
          )}
        </div>
      </section>

      {/* 하단 면책 */}
      <div className="text-[10px] text-muted text-center py-6 border-t border-border">
        본 정보는 식약처 영양성분 데이터베이스를 기반으로 하며, 의학적 진단·치료·처방을 대체하지 않습니다. 질환이 있는 경우 반드시 의사와 상담하세요.
      </div>
    </div>
  );
}
