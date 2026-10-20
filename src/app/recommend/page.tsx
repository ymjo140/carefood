"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

/* ───── 타입 ───── */
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
  product_prices: { platform: string; price: number; url: string; image_url: string | null }[];
};

type CurationGroup = {
  title: string;
  description: string;
  emoji: string;
  productIds: string[];
};

type OnboardingProfile = {
  persona: string;
  ordererRelation: string;
  conditions: string[];
  allergies: string[];
  pregnancyStage: string;
  healthGoal: string;
  tastes: { salty: number; sweet: number; spicy: number; fatty: number };
};

/* ───── 상수 ───── */
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

/* ───── 제품 카드 ───── */
function ProductCard({ product }: { product: RecommendedProduct }) {
  const prices = product.product_prices?.filter((p) => p.price > 0) || [];
  const bestPrice = prices.length > 0 ? Math.min(...prices.map((p) => p.price)) : null;
  const imageUrl = prices.find((p) => p.image_url)?.image_url;

  return (
    <div className="bg-card rounded-xl border border-border p-4 hover:border-primary/30 transition-colors">
      {/* 매칭 점수 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-1 flex-wrap">
          {product.reasons.slice(0, 3).map((r) => (
            <span key={r} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              {r}
            </span>
          ))}
        </div>
        <span className="text-xs font-bold text-primary">{product.match_score}점</span>
      </div>

      {/* 이미지 + 이름 */}
      <div className="flex gap-3 mb-3">
        {imageUrl && (
          <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-border">
            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="min-w-0">
          <Link href={`/products/${product.id}`}>
            <h3 className="font-bold text-sm leading-tight line-clamp-2 hover:text-primary transition-colors cursor-pointer">
              {product.name}
            </h3>
          </Link>
          {product.manufacturer && (
            <p className="text-xs text-muted mt-0.5 truncate">{product.manufacturer}</p>
          )}
        </div>
      </div>

      {/* 영양 */}
      <div className="space-y-1 mb-3">
        <NutritionBar label="칼로리" value={product.calories} max={800} unit="kcal" />
        <NutritionBar label="나트륨" value={product.sodium_mg} max={2000} unit="mg" />
        <NutritionBar label="당류" value={product.sugar_g} max={30} unit="g" />
        <NutritionBar label="단백질" value={product.protein_g} max={30} unit="g" />
      </div>

      {/* 가격 */}
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
      <div className="flex items-center gap-2 mb-1">
        <span className="text-2xl">{group.emoji}</span>
        <h2 className="text-lg font-bold">{group.title}</h2>
      </div>
      <p className="text-sm text-muted mb-4">{group.description}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groupProducts.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}

/* ───── 메인 ───── */
export default function RecommendPage() {
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
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

    const parsed: OnboardingProfile = JSON.parse(saved);
    setProfile(parsed);

    (async () => {
      try {
        const res = await fetch("/api/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            persona: parsed.persona,
            conditions: parsed.conditions,
            allergies: parsed.allergies,
            pregnancyStage: parsed.pregnancyStage,
            healthGoal: parsed.healthGoal,
            tastes: parsed.tastes,
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
      <div className="max-w-6xl mx-auto px-4 py-16 text-center">
        <div className="inline-block w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
        <p className="text-muted">맞춤 추천을 분석하고 있습니다...</p>
        <p className="text-xs text-muted mt-1">건강 조건과 맛 선호도를 기반으로 안전한 식품을 찾고 있어요</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-lg font-bold mb-2">😢 {error}</p>
        <Link href="/onboarding" className="text-primary hover:underline text-sm">
          온보딩 시작하기 →
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* 프로필 요약 */}
      {profile && (
        <div className="bg-card rounded-2xl border border-border p-5 mb-8">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold">
                {PERSONA_LABELS[profile.persona] || profile.persona} 맞춤 추천
              </h1>
              <p className="text-sm text-muted mt-1">
                {profile.conditions.length > 0
                  ? `건강 조건: ${profile.conditions.join(", ")} · `
                  : ""}
                맛 선호 — 짠맛 {profile.tastes.salty} · 단맛 {profile.tastes.sweet} · 매운맛{" "}
                {profile.tastes.spicy} · 기름진맛 {profile.tastes.fatty}
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
      )}

      {/* 큐레이션 그룹 */}
      {groups.length > 0 ? (
        groups.map((g) => (
          <CurationSection key={g.title} group={g} products={products} />
        ))
      ) : products.length > 0 ? (
        <>
          <h2 className="text-lg font-bold mb-4">추천 제품</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
