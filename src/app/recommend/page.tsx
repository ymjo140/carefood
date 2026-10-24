"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

/* ───── 타입 ───── */
type ReviewStats = {
  avgRating: number;
  avgConsumption: number;
  count: number;
};

type RecommendedProduct = {
  id: string;
  name: string;
  manufacturer: string | null;
  calories: number | null;
  protein_g: number | null;
  fat_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  fiber_g: number | null;
  carbs_g: number | null;
  cholesterol_mg: number | null;
  saturated_fat_g: number | null;
  serving_size_g: number | null;
  spicy_score: number;
  match_score: number;
  reasons: string[];
  reason_detail: string | null;
  product_prices: { platform: string; price: number; url: string; image_url: string | null }[];
  review_stats: ReviewStats | null;
};

type CurationGroup = {
  title: string;
  description: string;
  emoji: string;
  productIds: string[];
};

/* ───── 상수 ───── */
const CONCERN_LABELS: Record<string, string> = {
  gut_health: "장건강",
  skin: "피부건강",
  weight: "체중관리",
  energy: "활력충전",
};

const SENSITIVITY_LABELS: Record<number, string> = {
  1: "둔감",
  2: "보통",
  3: "예민",
};

// 레거시 폴백
const PERSONA_LABELS: Record<string, string> = {
  elderly: "어르신",
  patient: "환자",
  pregnant: "산모",
  general: "일반",
};

const PLATFORM_LABELS: Record<string, string> = {
  kurly: "컬리",
  oasis: "오아시스",
  homeplus: "홈플러스",
  "11st": "11번가",
  danawa: "다나와",
};

const PLATFORM_COLORS: Record<string, string> = {
  kurly: "border-purple-300 text-purple-700 bg-purple-50",
  oasis: "border-green-300 text-green-700 bg-green-50",
  homeplus: "border-orange-300 text-orange-700 bg-orange-50",
  "11st": "border-red-300 text-red-700 bg-red-50",
  danawa: "border-blue-300 text-blue-700 bg-blue-50",
};

function formatPrice(price: number): string {
  return price.toLocaleString("ko-KR") + "원";
}

/* ───── 영양 바 ───── */
function NutritionBar({ label, value, max, unit }: { label: string; value: number | null; max: number; unit: string }) {
  if (value === null || value === undefined) return null;
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-14 text-muted shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
        <div className="h-full bg-primary/60 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 text-right text-muted shrink-0">
        {Math.round(value)}{unit}
      </span>
    </div>
  );
}

/* ───── 별점 표시 ───── */
function Stars({ rating, size = "text-xs" }: { rating: number; size?: string }) {
  return (
    <span className={`${size} tracking-tight`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= Math.round(rating) ? "text-yellow-400" : "text-border"}>
          ★
        </span>
      ))}
    </span>
  );
}

/* ───── 제품 카드 ───── */
function ProductCard({ product }: { product: RecommendedProduct }) {
  const prices = product.product_prices?.filter((p) => p.price > 0) || [];
  const bestPrice = prices.length > 0 ? Math.min(...prices.map((p) => p.price)) : null;
  const imageUrl = prices.find((p) => p.image_url)?.image_url;

  return (
    <div className="bg-card rounded-2xl border border-border p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-primary/30 hover:shadow-md transition-all">
      {/* 이미지 + 이름 + 점수 */}
      <div className="flex gap-3 mb-3">
        {imageUrl && (
          <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-border">
            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <Link href={`/products/${product.id}`}>
              <h3 className="font-bold text-sm leading-tight line-clamp-2 hover:text-primary transition-colors cursor-pointer">
                {product.name}
              </h3>
            </Link>
            <span className="shrink-0 text-[10px] font-bold text-white bg-primary rounded-full w-7 h-7 flex items-center justify-center">
              {product.match_score}
            </span>
          </div>
          {product.manufacturer && (
            <p className="text-xs text-muted mt-0.5 truncate">{product.manufacturer}</p>
          )}
          {/* 맛평가 통계 */}
          {product.review_stats && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <Stars rating={product.review_stats.avgRating} />
              <span className="text-[10px] text-muted">
                {product.review_stats.avgRating} ({product.review_stats.count})
              </span>
              <span className="text-[10px] text-muted">
                · 섭취율 {product.review_stats.avgConsumption}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 개인화 이유 — 왜 이 제품인지 한 줄 */}
      {product.reason_detail && (
        <div className="bg-primary/5 rounded-lg px-3 py-2 mb-3">
          <p className="text-xs text-primary">
            {product.reason_detail}
          </p>
        </div>
      )}

      {/* 추천 태그 */}
      <div className="flex gap-1 flex-wrap mb-3">
        {product.reasons.slice(0, 4).map((r) => (
          <span key={r} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            {r}
          </span>
        ))}
      </div>

      {/* 영양 (축약) */}
      <div className="space-y-1 mb-3">
        <NutritionBar label="칼로리" value={product.calories} max={800} unit="kcal" />
        <NutritionBar label="나트륨" value={product.sodium_mg} max={2000} unit="mg" />
        <NutritionBar label="당류" value={product.sugar_g} max={30} unit="g" />
        <NutritionBar label="단백질" value={product.protein_g} max={30} unit="g" />
      </div>

      {/* 가격 + 구매 */}
      {bestPrice ? (
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <span className="text-lg font-bold text-primary">{formatPrice(bestPrice)}</span>
          <div className="flex gap-1 flex-wrap justify-end">
            {prices.slice(0, 3).map((pp) =>
              pp.url ? (
                <a
                  key={pp.platform}
                  href={pp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors hover:opacity-80 ${
                    PLATFORM_COLORS[pp.platform] || "bg-card border-border"
                  }`}
                >
                  {PLATFORM_LABELS[pp.platform] || pp.platform} {formatPrice(pp.price)}
                </a>
              ) : null
            )}
          </div>
        </div>
      ) : (
        <div className="pt-3 border-t border-border">
          <span className="text-xs text-muted">가격 정보 수집 중</span>
        </div>
      )}

      {/* 신뢰 배지 */}
      <div className="flex gap-2 mt-2 pt-2">
        <span className="text-[10px] text-muted flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />식약처 데이터
        </span>
        {prices.length > 1 && (
          <span className="text-[10px] text-muted flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />{prices.length}곳 가격비교
          </span>
        )}
      </div>
    </div>
  );
}

/* ───── 큐레이션 섹션 ───── */
function CurationSection({
  group,
  products,
}: {
  group: CurationGroup;
  products: RecommendedProduct[];
}) {
  const groupProducts = products.filter((p) => group.productIds.includes(p.id));
  if (groupProducts.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="bg-surface rounded-2xl p-5 mb-4">
        <h2 className="text-lg font-extrabold mb-1">{group.title}</h2>
        <p className="text-sm text-muted">{group.description}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {groupProducts.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}

/* ───── 프로필 요약 컴포넌트 ───── */
function ProfileSummary({ profile }: { profile: any }) {
  // v2 이너케어 프로필
  if (profile.concerns && profile.concerns.length > 0) {
    const concernLabels = profile.concerns.map((c: string) => CONCERN_LABELS[c] || c).join(" · ");
    const sensitivity = profile.sensitivity || { digestive: 2, additive: 2 };
    return (
      <div className="bg-card rounded-2xl border border-border p-5 mb-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-extrabold">
              {concernLabels} 맞춤 추천
            </h1>
            <p className="text-sm text-muted mt-1">
              소화 {SENSITIVITY_LABELS[sensitivity.digestive as number] || "보통"} · 첨가물 {SENSITIVITY_LABELS[sensitivity.additive as number] || "보통"} · 맛 선호 — 짠맛 {profile.tastes?.salty || 3} · 단맛 {profile.tastes?.sweet || 3} · 매운맛 {profile.tastes?.spicy || 3} · 기름진맛 {profile.tastes?.fatty || 3}
            </p>
          </div>
          <Link
            href="/onboarding"
            className="text-sm text-muted hover:text-primary transition-colors shrink-0"
          >
            프로필 수정 →
          </Link>
        </div>
      </div>
    );
  }

  // v1 레거시 프로필 (하위호환)
  return (
    <div className="bg-card rounded-2xl border border-border p-5 mb-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-extrabold">
            {PERSONA_LABELS[profile.persona] || profile.persona} 추천
          </h1>
          <p className="text-sm text-muted mt-1">
            {profile.conditions?.length > 0
              ? `건강 조건: ${profile.conditions.join(", ")} · `
              : ""}
            맛 선호 — 짠맛 {profile.tastes?.salty || 3} · 단맛 {profile.tastes?.sweet || 3} · 매운맛{" "}
            {profile.tastes?.spicy || 3} · 기름진맛 {profile.tastes?.fatty || 3}
          </p>
        </div>
        <Link
          href="/onboarding"
          className="text-sm text-muted hover:text-primary transition-colors shrink-0"
        >
          프로필 수정 →
        </Link>
      </div>
    </div>
  );
}

/* ───── 메인 ───── */
export default function RecommendPage() {
  const [profile, setProfile] = useState<any>(null);
  const [products, setProducts] = useState<RecommendedProduct[]>([]);
  const [groups, setGroups] = useState<CurationGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("carefood_profile");
    if (!saved) {
      setError("프로필이 없습니다. 온보딩을 먼저 완료해주세요.");
      setLoading(false);
      return;
    }

    const parsed = JSON.parse(saved);
    setProfile(parsed);

    // 건강검진 데이터에서 자동 감지된 질환 conditions 병합
    let healthConditions: string[] = [];
    try {
      const healthRaw = localStorage.getItem("carefood_health");
      if (healthRaw) {
        const healthData = JSON.parse(healthRaw);
        healthConditions = healthData.conditions || [];
      }
    } catch { /* silent */ }
    const mergedConditions = [...new Set([
      ...(parsed.conditions || []),
      ...healthConditions,
    ])];

    (async () => {
      try {
        const res = await fetch("/api/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // v2 이너케어
            concerns: parsed.concerns || [],
            sensitivity: parsed.sensitivity || { digestive: 2, additive: 2 },
            // 건강검진 자동 감지 + 온보딩 conditions 병합
            conditions: mergedConditions,
            allergies: parsed.allergies || [],
            tastes: parsed.tastes || { salty: 3, sweet: 3, spicy: 3, fatty: 3 },
          }),
        });

        if (!res.ok) throw new Error("추천 API 오류");
        const data = await res.json();
        setProducts(data.recommendations || []);
        setGroups(data.curationGroups || []);
      } catch (err) {
        setError("추천 결과를 불러오지 못했습니다.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="inline-block w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
        <p className="text-muted">적합도 분석 중...</p>
        <p className="text-xs text-muted mt-1">건강 관심사와 성분 데이터를 기반으로 식품을 매칭하고 있어요</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-lg font-extrabold mb-2">{error}</p>
        <Link href="/onboarding" className="text-primary hover:underline text-sm">
          온보딩 시작하기 →
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* 프로필 요약 */}
      {profile && <ProfileSummary profile={profile} />}

      {/* 큐레이션 그룹 */}
      {groups.length > 0 ? (
        groups.map((g) => (
          <CurationSection key={g.title} group={g} products={products} />
        ))
      ) : products.length > 0 ? (
        <>
          <h2 className="text-lg font-extrabold mb-4">추천 제품</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-16 text-muted">
          <p className="text-lg mb-2">조건에 맞는 제품이 없습니다</p>
          <p className="text-sm mb-4">필터 조건을 넓혀서 다시 시도해보세요.</p>
          <Link href="/onboarding" className="text-primary hover:underline text-sm">
            프로필 수정하기 →
          </Link>
        </div>
      )}

      {/* 전체 탐색 유도 */}
      <div className="mt-12 text-center py-8 border-t border-border">
        <p className="text-sm text-muted mb-3">더 많은 제품을 직접 탐색하고 싶다면</p>
        <Link
          href="/products"
          className="text-primary font-medium hover:underline"
        >
          전체 제품 둘러보기 →
        </Link>
      </div>
    </div>
  );
}
