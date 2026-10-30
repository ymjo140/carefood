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
  kurly: "컬리", oasis: "오아시스", homeplus: "홈플러스", "11st": "11번가",
  danawa: "다나와", greating: "그리팅", yundiet: "윤식단", sixmeal: "식스밀",
  designmeal: "디자인밀", makesalad: "메이크샐러드",
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

/* ───── 건강점수 게이지 ───── */
function HealthScoreGauge({ score }: { score: number }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(score / 100, 1);
  const offset = circ * (1 - pct);
  const color = score >= 80 ? "#2EA860" : score >= 60 ? "#C4870A" : "#D04040";
  return (
    <div className="relative shrink-0" style={{ width: 56, height: 56 }}>
      <svg viewBox="0 0 56 56" width="56" height="56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--border)" strokeWidth="5" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          transform="rotate(-90 28 28)" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-[family-name:var(--font-outfit)] text-base font-bold" style={{ color }}>{score}</span>
      </div>
    </div>
  );
}

/* ───── 매크로 컬러 바 ───── */
function MacroBar({ label, value, unit, dailyMax, cssVar }: {
  label: string; value: number; unit: string; dailyMax: number; cssVar: string;
}) {
  const pct = Math.min((value / dailyMax) * 100, 100);
  const isHigh = pct > 70;
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="text-sm font-medium w-16 shrink-0">{label}</span>
      <div className="flex-1 min-w-0">
        <div className="h-2 rounded-full overflow-hidden" style={{ background: `var(--${cssVar}-bg)` }}>
          <div className="h-full rounded-full transition-all" style={{
            width: `${pct}%`,
            background: `var(--${cssVar})`,
            opacity: isHigh ? 1 : 0.75,
          }} />
        </div>
      </div>
      <span className="font-[family-name:var(--font-outfit)] text-sm font-semibold tabular-nums w-14 text-right"
        style={{ color: isHigh ? `var(--${cssVar})` : undefined }}>
        {value % 1 === 0 ? value : value.toFixed(1)}{unit}
      </span>
      <span className="font-[family-name:var(--font-outfit)] text-xs tabular-nums w-10 text-right"
        style={{ color: isHigh ? `var(--${cssVar})` : "var(--muted)" }}>
        {Math.round(pct)}%
      </span>
    </div>
  );
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

  const bestPrice = sortedPrices.length > 0 ? sortedPrices[0] : null;
  const imageUrl = sortedPrices.find((p) => p.image_url)?.image_url;

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

  // 매크로 경고 판단
  const sodiumHigh = product.sodium_mg != null && product.sodium_mg > 1000;
  const fatHigh = product.fat_g != null && product.fat_g > 25;
  const sugarHigh = product.sugar_g != null && product.sugar_g > 15;

  // 서빙 기준 100g 환산
  const s = product.serving_size_g;
  const per100 = (v: number | null) => (v != null && s && s > 0) ? Math.round((v / s) * 100 * 10) / 10 : null;

  const mfrLabel = product.category_large === "건강식단서비스"
    ? ({ greating: "그리팅", yundiet: "윤식단", sixmeal: "식스밀", designmeal: "디자인밀", makesalad: "메이크샐러드" }[product.manufacturer || ""] || product.manufacturer)
    : product.manufacturer;

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <ProductViewTracker productId={product.id} />

      <Link href="/products" className="text-sm text-muted hover:text-primary transition-colors mb-5 inline-block">
        ← 제품 목록
      </Link>

      {/* ── 헤더: 이미지 + 제품명 + 건강점수 게이지 ── */}
      <div className="flex gap-4 mb-6">
        {imageUrl && (
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden shrink-0 bg-border">
            <img src={imageUrl} alt={product.name} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-lg sm:text-xl font-extrabold leading-tight">{product.name}</h1>
              {mfrLabel && (
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-sm text-muted">{mfrLabel}</p>
                  {product.category_large === "건강식단서비스" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">건강식단</span>
                  )}
                </div>
              )}
              {product.category_large === "건강식단서비스" && originalProductUrl && (
                <TrackableLink href={originalProductUrl} productId={product.id} platform={product.manufacturer || "health_meal"}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-dark transition-colors mt-0.5">
                  원본 상품 페이지 →
                </TrackableLink>
              )}
            </div>
            {product.health_score != null && (
              <HealthScoreGauge score={product.health_score} />
            )}
          </div>
        </div>
      </div>

      {/* ── 액션 바 ── */}
      <div className="flex items-center gap-2 mb-6">
        <FavoriteButton productId={product.id} />
        <MealLogButton productId={product.id} />
        {product.food_type && product.category_large !== "건강식단서비스" && (
          <span className="text-xs text-muted ml-auto">{product.food_type}</span>
        )}
      </div>

      {/* ── 칼로리 + 매크로 컬러 바 ── */}
      {product.calories != null || product.protein_g != null ? (
        <section className="bg-card border border-border rounded-2xl p-5 mb-5" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="font-[family-name:var(--font-outfit)] text-3xl font-extrabold tabular-nums">
                {product.calories ?? "—"}
              </span>
              <span className="text-sm text-muted ml-1">kcal</span>
            </div>
            {s && <span className="text-xs text-muted">1회 제공량 {s}g</span>}
          </div>

          <div className="divide-y divide-border/50">
            {product.protein_g != null && (
              <MacroBar label="단백질" value={product.protein_g} unit="g" dailyMax={80} cssVar="macro-protein" />
            )}
            {product.carbs_g != null && (
              <MacroBar label="탄수화물" value={product.carbs_g} unit="g" dailyMax={260} cssVar="macro-carbs" />
            )}
            {product.fat_g != null && (
              <MacroBar label="지방" value={product.fat_g} unit="g" dailyMax={60} cssVar="macro-fat" />
            )}
            {product.sodium_mg != null && (
              <MacroBar label="나트륨" value={product.sodium_mg} unit="mg" dailyMax={2000} cssVar="macro-sodium" />
            )}
          </div>

          {/* 경고 태그 */}
          {(sodiumHigh || fatHigh || sugarHigh) && (
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border/50">
              {sodiumHigh && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "var(--macro-sodium-bg)", color: "var(--macro-sodium)" }}>나트륨 주의</span>
              )}
              {fatHigh && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "var(--macro-fat-bg)", color: "var(--macro-fat)" }}>지방 높음</span>
              )}
              {sugarHigh && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "var(--macro-carbs-bg)", color: "var(--macro-carbs)" }}>당류 높음</span>
              )}
            </div>
          )}

          <p className="text-[10px] text-muted mt-3">* 1일 기준치: 2,000kcal 성인 기준</p>
        </section>
      ) : (
        <div className="border border-border rounded-2xl p-6 text-center mb-5">
          <p className="text-sm font-medium mb-1">영양 정보 수집 중</p>
          <p className="text-xs text-muted">해당 제품의 상세 영양 성분을 수집하고 있습니다.</p>
        </div>
      )}

      {/* ── 상세 영양 성분표 (접는 형태) ── */}
      {(product.saturated_fat_g != null || product.cholesterol_mg != null || product.fiber_g != null || product.sugar_g != null) && (
        <details className="mb-5 group">
          <summary className="text-xs font-bold text-muted cursor-pointer hover:text-foreground transition-colors py-2 flex items-center gap-1">
            <span>상세 영양 성분표</span>
            <span className="group-open:rotate-180 transition-transform text-[10px]">▼</span>
          </summary>
          <div className="border border-border rounded-xl overflow-hidden mt-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface/50">
                  <th className="text-left py-2 px-4 text-xs text-muted font-medium">항목</th>
                  <th className="text-right py-2 px-3 text-xs text-muted font-medium">{s ? `${s}g당` : "함량"}</th>
                  <th className="text-right py-2 px-3 text-xs text-muted font-medium">100g당</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "칼로리", val: product.calories, unit: "kcal" },
                  { label: "탄수화물", val: product.carbs_g, unit: "g" },
                  { label: "당류", val: product.sugar_g, unit: "g" },
                  { label: "단백질", val: product.protein_g, unit: "g" },
                  { label: "지방", val: product.fat_g, unit: "g" },
                  { label: "포화지방", val: product.saturated_fat_g, unit: "g" },
                  { label: "트랜스지방", val: product.trans_fat_g, unit: "g" },
                  { label: "콜레스테롤", val: product.cholesterol_mg, unit: "mg" },
                  { label: "나트륨", val: product.sodium_mg, unit: "mg" },
                  { label: "식이섬유", val: product.fiber_g, unit: "g" },
                ].filter(r => r.val != null).map(r => (
                  <tr key={r.label} className="border-b border-border/50 last:border-0">
                    <td className="py-2 px-4 font-medium">{r.label}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-[family-name:var(--font-outfit)]">
                      {r.val! % 1 === 0 ? r.val : r.val!.toFixed(1)}{r.unit}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-muted font-[family-name:var(--font-outfit)]">
                      {per100(r.val!) != null ? (per100(r.val!)! % 1 === 0 ? per100(r.val!) : per100(r.val!)!.toFixed(1)) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* ── 건강 안전 정보 ── */}
      {safetyNotes.length > 0 && (
        <section className="mb-5">
          <h2 className="text-sm font-extrabold mb-2">건강 안전 정보</h2>
          <div className="bg-card rounded-xl border border-border p-4 space-y-2" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            {safetyNotes.map((note) => (
              <div key={note.text} className="flex items-start gap-2 text-sm">
                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${note.type === "good" ? "bg-green-500" : "bg-orange-500"}`} />
                <span>{note.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 원재료 (food_reports) ── */}
      {ingredients.length > 0 && (
        <section className="mb-5">
          <h2 className="text-sm font-extrabold mb-2">원재료</h2>
          <div className="border border-border rounded-xl p-4">
            <div className="flex flex-wrap gap-1.5">
              {ingredients.map((ing: string) => (
                <span key={ing} className="text-xs px-2.5 py-1 rounded-full bg-surface text-foreground/70"
                  style={{ minHeight: "unset", minWidth: "unset" }}>
                  {ing}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-muted mt-3">출처: 식품안전나라 품목제조보고</p>
          </div>
        </section>
      )}

      {/* ── 맛·영양 이중 프로필 ── */}
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

      {/* ── 건강 프로필 연동 리뷰 ── */}
      <ProductReviews productId={productId} />

      {/* ── 가격 비교 ── */}
      {sortedPrices.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-extrabold mb-3">구매처 비교</h2>
          <div className="bg-card border border-border rounded-2xl overflow-hidden" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            {/* 최저가 강조 */}
            {bestPrice && (
              <div className="px-5 py-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-primary font-bold uppercase tracking-wider">최저가</span>
                    <p className="font-[family-name:var(--font-outfit)] text-2xl font-extrabold text-primary tabular-nums mt-0.5">
                      {formatPrice(bestPrice.price)}
                    </p>
                  </div>
                  <TrackableLink href={bestPrice.url} productId={product.id} platform={bestPrice.platform}
                    className="bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-primary-dark transition-colors">
                    {PLATFORM_LABELS[bestPrice.platform] || bestPrice.platform}에서 구매
                  </TrackableLink>
                </div>
              </div>
            )}
            {/* 다른 플랫폼 */}
            {sortedPrices.length > 1 && (
              <div className="divide-y divide-border/50">
                {sortedPrices.slice(1).map((pp) => (
                  <TrackableLink key={pp.platform} href={pp.url} productId={product.id} platform={pp.platform}
                    className="flex items-center justify-between px-5 py-3 hover:bg-surface/50 transition-colors">
                    <span className="text-sm">{PLATFORM_LABELS[pp.platform] || pp.platform}</span>
                    <span className="font-[family-name:var(--font-outfit)] text-sm font-semibold tabular-nums">{formatPrice(pp.price)}</span>
                  </TrackableLink>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── 원재료 (원본 텍스트) ── */}
      {product.ingredients_raw && (
        <section className="mb-6">
          <h2 className="text-sm font-extrabold mb-2">원재료 (전문)</h2>
          <div className="bg-card rounded-xl border border-border p-4" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <p className="text-sm text-muted leading-relaxed">{product.ingredients_raw}</p>
          </div>
        </section>
      )}

      {/* ── 신뢰 배지 ── */}
      <section className="mb-6">
        <div className="flex gap-2 flex-wrap">
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

      {/* ── 면책 ── */}
      <div className="text-[10px] text-muted text-center py-6 border-t border-border">
        본 정보는 식약처 영양성분 데이터베이스를 기반으로 하며, 의학적 진단·치료·처방을 대체하지 않습니다. 질환이 있는 경우 반드시 의사와 상담하세요.
      </div>
    </div>
  );
}
