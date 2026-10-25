"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { DISH_CATEGORY_LABELS } from "@/types/database";
import type { DishCategory, SortOption } from "@/types/database";

/* ───── 타입 ───── */
type MallPrice = { platform: string; price: number; url: string; image_url: string | null };
type ReviewStats = { avgRating: number; avgConsumption: number; count: number };

type ProductItem = {
  id: string;
  name: string;
  manufacturer: string | null;
  calories: number | null;
  protein_g: number | null;
  fat_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  fiber_g: number | null;
  match_score: number;
  reasons: string[];
  reason_detail: string | null;
  dish_keyword: string;
  dish_category: string | null;
  product_prices: MallPrice[];
  review_stats: ReviewStats | null;
};

type DishGroup = {
  dish_name: string;
  dish_category: string;
  total_in_group: number;
  representative: ProductItem;
  products: ProductItem[];
};

type ApiResponse = {
  groups: DishGroup[];
  total_groups: number;
  total_products: number;
  page: number;
  has_more: boolean;
};

/* ───── 상수 ───── */
const CONCERN_LABELS: Record<string, string> = {
  gut_health: "장건강", skin: "피부건강", weight: "체중관리", energy: "활력충전",
};

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "score", label: "추천순" },
  { value: "price_asc", label: "가격 낮은순" },
  { value: "price_desc", label: "가격 높은순" },
  { value: "protein_desc", label: "단백질순" },
  { value: "calories_asc", label: "칼로리 낮은순" },
];

const PLATFORM_LABELS: Record<string, string> = {
  kurly: "컬리", oasis: "오아시스", homeplus: "홈플러스", "11st": "11번가",
};
const PLATFORM_COLORS: Record<string, string> = {
  kurly: "border-purple-300 text-purple-700 bg-purple-50",
  oasis: "border-green-300 text-green-700 bg-green-50",
  homeplus: "border-orange-300 text-orange-700 bg-orange-50",
  "11st": "border-red-300 text-red-700 bg-red-50",
};

const NUTRITION_PRESETS = {
  protein_min: [
    { label: "고단백 20g+", value: 20 },
    { label: "초고단백 30g+", value: 30 },
  ],
  calories_max: [
    { label: "저칼로리 200↓", value: 200 },
    { label: "초저칼 100↓", value: 100 },
  ],
  sodium_max: [
    { label: "저나트륨 300↓", value: 300 },
    { label: "초저나트륨 120↓", value: 120 },
  ],
  sugar_max: [
    { label: "저당 5g↓", value: 5 },
    { label: "무설탕 1g↓", value: 1 },
  ],
  fiber_min: [
    { label: "고섬유 5g+", value: 5 },
  ],
};

const CATEGORY_FILTERS: DishCategory[] = [
  "soup", "noodle", "rice", "grill", "stew", "side",
  "seafood", "snack", "salad", "beverage", "supplement", "powder",
];

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
        <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 text-right text-muted shrink-0">{Math.round(value)}{unit}</span>
    </div>
  );
}

/* ───── 제품 카드 (컴팩트) ───── */
function ProductCardCompact({ product }: { product: ProductItem }) {
  const prices = product.product_prices?.filter((p) => p.price > 0) || [];
  const bestPrice = prices.length > 0 ? Math.min(...prices.map((p) => p.price)) : null;

  return (
    <div className="bg-card rounded-xl border border-border p-3 hover:border-primary/30 transition-all">
      <div className="flex items-start justify-between gap-2 mb-2">
        <Link href={`/products/${product.id}`}>
          <h4 className="font-bold text-sm leading-tight line-clamp-2 hover:text-primary transition-colors cursor-pointer">
            {product.name}
          </h4>
        </Link>
        <span className="shrink-0 text-[10px] font-bold text-white bg-primary rounded-full w-6 h-6 flex items-center justify-center">
          {product.match_score}
        </span>
      </div>
      {product.manufacturer && (
        <p className="text-xs text-muted mb-2 truncate">{product.manufacturer}</p>
      )}
      <div className="space-y-1 mb-2">
        <NutritionBar label="칼로리" value={product.calories} max={800} unit="kcal" />
        <NutritionBar label="나트륨" value={product.sodium_mg} max={2000} unit="mg" />
        <NutritionBar label="단백질" value={product.protein_g} max={30} unit="g" />
      </div>
      {bestPrice && (
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-sm font-bold text-primary">{formatPrice(bestPrice)}</span>
          <div className="flex gap-1">
            {prices.slice(0, 2).map((pp) => (
              <a key={pp.platform} href={pp.url} target="_blank" rel="noopener noreferrer"
                className={`text-[10px] px-1.5 py-0.5 rounded border ${PLATFORM_COLORS[pp.platform] || "bg-card border-border"}`}>
                {PLATFORM_LABELS[pp.platform] || pp.platform} {formatPrice(pp.price)}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───── 요리 그룹 카드 ───── */
function DishGroupCard({ group }: { group: DishGroup }) {
  const [expanded, setExpanded] = useState(false);
  const rep = group.representative;
  const prices = rep.product_prices?.filter((p) => p.price > 0) || [];
  const bestPrice = prices.length > 0 ? Math.min(...prices.map((p) => p.price)) : null;
  const imageUrl = prices.find((p) => p.image_url)?.image_url;

  return (
    <div className="bg-card rounded-2xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* 대표 제품 */}
      <div className="p-4">
        <div className="flex gap-3 mb-3">
          {imageUrl && (
            <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-surface">
              <img src={imageUrl} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-1">
              <Link href={`/products/${rep.id}`}>
                <h3 className="font-bold text-sm leading-tight line-clamp-2 hover:text-primary transition-colors cursor-pointer">
                  {rep.name}
                </h3>
              </Link>
              <span className="shrink-0 text-[10px] font-bold text-white bg-primary rounded-full w-7 h-7 flex items-center justify-center">
                {rep.match_score}
              </span>
            </div>
            {rep.manufacturer && (
              <p className="text-xs text-muted mt-0.5 truncate">{rep.manufacturer}</p>
            )}
          </div>
        </div>

        {/* 추천 이유 */}
        {rep.reason_detail && (
          <div className="bg-primary/5 rounded-lg px-3 py-2 mb-3">
            <p className="text-xs text-primary">{rep.reason_detail}</p>
          </div>
        )}

        {/* 태그 */}
        <div className="flex gap-1 flex-wrap mb-3">
          {rep.reasons.slice(0, 4).map((r) => (
            <span key={r} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{r}</span>
          ))}
        </div>

        {/* 영양 */}
        <div className="space-y-1 mb-3">
          <NutritionBar label="칼로리" value={rep.calories} max={800} unit="kcal" />
          <NutritionBar label="나트륨" value={rep.sodium_mg} max={2000} unit="mg" />
          <NutritionBar label="당류" value={rep.sugar_g} max={30} unit="g" />
          <NutritionBar label="단백질" value={rep.protein_g} max={30} unit="g" />
        </div>

        {/* 가격 */}
        {bestPrice ? (
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <span className="text-lg font-bold text-primary">{formatPrice(bestPrice)}</span>
            <div className="flex gap-1 flex-wrap justify-end">
              {prices.slice(0, 3).map((pp) => pp.url ? (
                <a key={pp.platform} href={pp.url} target="_blank" rel="noopener noreferrer"
                  className={`text-[10px] px-1.5 py-0.5 rounded border hover:opacity-80 ${PLATFORM_COLORS[pp.platform] || "bg-card border-border"}`}>
                  {PLATFORM_LABELS[pp.platform] || pp.platform} {formatPrice(pp.price)}
                </a>
              ) : null)}
            </div>
          </div>
        ) : (
          <div className="pt-3 border-t border-border">
            <span className="text-xs text-muted">가격 정보 수집 중</span>
          </div>
        )}
      </div>

      {/* 더보기 영역 */}
      {group.total_in_group > 1 && (
        <div className="border-t border-border">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full px-4 py-2.5 text-sm text-primary hover:bg-primary/5 transition-colors flex items-center justify-center gap-1"
          >
            {expanded ? "접기" : `${group.dish_name} ${group.total_in_group - 1}개 더보기`}
            <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="currentColor">
              <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
            </svg>
          </button>

          {expanded && (
            <div className="px-4 pb-4 space-y-3">
              {group.products.slice(1).map((p) => (
                <ProductCardCompact key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ───── 필터 패널 ───── */
function FilterPanel({
  filters,
  onFilterChange,
  className = "",
}: {
  filters: FilterState;
  onFilterChange: (f: FilterState) => void;
  className?: string;
}) {
  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const toggleCategory = (cat: DishCategory) => {
    const current = filters.dish_categories;
    if (current.includes(cat)) {
      updateFilter("dish_categories", current.filter((c) => c !== cat));
    } else {
      updateFilter("dish_categories", [...current, cat]);
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* 음식 종류 */}
      <div>
        <h3 className="font-bold text-sm mb-3">음식 종류</h3>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_FILTERS.map((cat) => (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className={`text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
                filters.dish_categories.includes(cat)
                  ? "bg-primary text-white"
                  : "bg-surface border border-border hover:border-primary/30"
              }`}
            >
              {DISH_CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* 가격대 */}
      <div>
        <h3 className="font-bold text-sm mb-3">가격대</h3>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="최소"
            value={filters.price_min || ""}
            onChange={(e) => updateFilter("price_min", Number(e.target.value) || 0)}
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-card text-sm"
          />
          <span className="text-muted self-center">~</span>
          <input
            type="number"
            placeholder="최대"
            value={filters.price_max || ""}
            onChange={(e) => updateFilter("price_max", Number(e.target.value) || 0)}
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-card text-sm"
          />
        </div>
        <div className="flex gap-1.5 mt-2">
          {[
            { label: "~5천", min: 0, max: 5000 },
            { label: "5천~1만", min: 5000, max: 10000 },
            { label: "1만~2만", min: 10000, max: 20000 },
            { label: "2만~", min: 20000, max: 0 },
          ].map((p) => (
            <button
              key={p.label}
              onClick={() => { updateFilter("price_min", p.min); updateFilter("price_max", p.max); }}
              className="text-[10px] px-2 py-1 rounded-md bg-surface border border-border hover:border-primary/30"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 영양 조건 */}
      <div>
        <h3 className="font-bold text-sm mb-3">영양 조건</h3>
        <div className="space-y-3">
          {[
            { key: "protein_min" as const, label: "단백질", unit: "g", placeholder: "≥", presets: NUTRITION_PRESETS.protein_min },
            { key: "calories_max" as const, label: "칼로리", unit: "kcal", placeholder: "≤", presets: NUTRITION_PRESETS.calories_max },
            { key: "sodium_max" as const, label: "나트륨", unit: "mg", placeholder: "≤", presets: NUTRITION_PRESETS.sodium_max },
            { key: "sugar_max" as const, label: "당류", unit: "g", placeholder: "≤", presets: NUTRITION_PRESETS.sugar_max },
            { key: "fiber_min" as const, label: "식이섬유", unit: "g", placeholder: "≥", presets: NUTRITION_PRESETS.fiber_min },
          ].map((n) => (
            <div key={n.key}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium w-14">{n.label}</span>
                <span className="text-xs text-muted">{n.placeholder}</span>
                <input
                  type="number"
                  value={filters[n.key] || ""}
                  onChange={(e) => updateFilter(n.key, Number(e.target.value) || 0)}
                  placeholder={n.unit}
                  className="w-20 px-2 py-1 rounded-md border border-border bg-card text-xs"
                />
                <span className="text-[10px] text-muted">{n.unit}</span>
              </div>
              <div className="flex gap-1 ml-16">
                {n.presets.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => updateFilter(n.key, p.value)}
                    className={`text-[10px] px-2 py-0.5 rounded-md transition-colors ${
                      filters[n.key] === p.value
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "bg-surface border border-border hover:border-primary/30"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 초기화 */}
      <button
        onClick={() => onFilterChange({
          dish_categories: [], price_min: 0, price_max: 0,
          protein_min: 0, calories_max: 0, sodium_max: 0, sugar_max: 0, fiber_min: 0,
        })}
        className="w-full py-2 text-sm text-muted hover:text-foreground transition-colors border border-border rounded-lg"
      >
        필터 초기화
      </button>
    </div>
  );
}

/* ───── 타입: 필터 상태 ───── */
type FilterState = {
  dish_categories: DishCategory[];
  price_min: number;
  price_max: number;
  protein_min: number;
  calories_max: number;
  sodium_max: number;
  sugar_max: number;
  fiber_min: number;
};

const INITIAL_FILTERS: FilterState = {
  dish_categories: [], price_min: 0, price_max: 0,
  protein_min: 0, calories_max: 0, sodium_max: 0, sugar_max: 0, fiber_min: 0,
};

/* ───── 메인 페이지 ───── */
export default function RecommendPage() {
  return (
    <Suspense fallback={
      <div className="max-w-5xl mx-auto px-4 py-16 text-center">
        <div className="inline-block w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
        <p className="text-muted">적합도 분석 중...</p>
      </div>
    }>
      <RecommendContent />
    </Suspense>
  );
}

function RecommendContent() {
  const searchParams = useSearchParams();
  const familyId = searchParams.get("family");

  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [groups, setGroups] = useState<DishGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalGroups, setTotalGroups] = useState(0);
  const [totalProducts, setTotalProducts] = useState(0);
  const [sortBy, setSortBy] = useState<SortOption>("score");
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const observerRef = useRef<HTMLDivElement>(null);

  // API 호출
  const fetchGroups = useCallback(async (pageNum: number, append: boolean = false) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      const saved = localStorage.getItem("carefood_profile");
      if (!saved && !familyId) {
        setError("프로필이 없습니다. 온보딩을 먼저 완료해주세요.");
        setLoading(false);
        return;
      }

      let profileData: Record<string, unknown> = {};
      if (familyId) {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setError("로그인이 필요합니다."); setLoading(false); return; }
        const famRes = await fetch(`/api/family?userId=${user.id}`);
        const famData = await famRes.json();
        const member = (famData.profiles || []).find((p: Record<string, unknown>) => p.id === familyId);
        if (!member) { setError("가족 프로필을 찾을 수 없습니다."); setLoading(false); return; }
        profileData = member as Record<string, unknown>;
      } else {
        profileData = JSON.parse(saved!);
      }

      if (pageNum === 1) setProfile(profileData);

      // 건강검진 데이터 병합
      let healthConditions: string[] = [];
      try {
        const healthRaw = localStorage.getItem("carefood_health");
        if (healthRaw) healthConditions = JSON.parse(healthRaw).conditions || [];
      } catch { /* */ }

      const concerns = (profileData.concerns as string[]) || [];
      const sensitivity = (profileData.sensitivity as Record<string, number>) || { digestive: 2, additive: 2 };
      const tastes = (profileData.tastes as Record<string, number>) || { salty: 5, sweet: 5, spicy: 5, fatty: 5 };
      const conditions = [...new Set([...((profileData.conditions as string[]) || []), ...healthConditions])];

      const params = new URLSearchParams();
      if (concerns.length > 0) params.set("concerns", concerns.join(","));
      params.set("sensitivity_digestive", String(sensitivity.digestive || 2));
      params.set("sensitivity_additive", String(sensitivity.additive || 2));
      params.set("tastes_salty", String(tastes.salty || 5));
      params.set("tastes_sweet", String(tastes.sweet || 5));
      params.set("tastes_spicy", String(tastes.spicy || 5));
      params.set("tastes_fatty", String(tastes.fatty || 5));
      if (conditions.length > 0) params.set("conditions", conditions.join(","));
      params.set("sort", sortBy);
      params.set("page", String(pageNum));
      params.set("limit", "15");

      // 필터 적용
      if (filters.dish_categories.length > 0) params.set("dish_category", filters.dish_categories.join(","));
      if (filters.price_min > 0) params.set("price_min", String(filters.price_min));
      if (filters.price_max > 0) params.set("price_max", String(filters.price_max));
      if (filters.protein_min > 0) params.set("protein_min", String(filters.protein_min));
      if (filters.calories_max > 0) params.set("calories_max", String(filters.calories_max));
      if (filters.sodium_max > 0) params.set("sodium_max", String(filters.sodium_max));
      if (filters.sugar_max > 0) params.set("sugar_max", String(filters.sugar_max));
      if (filters.fiber_min > 0) params.set("fiber_min", String(filters.fiber_min));

      const res = await fetch(`/api/recommend?${params.toString()}`);
      if (!res.ok) throw new Error("추천 API 오류");
      const data: ApiResponse = await res.json();

      if (append) {
        setGroups((prev) => [...prev, ...data.groups]);
      } else {
        setGroups(data.groups);
      }
      setHasMore(data.has_more);
      setTotalGroups(data.total_groups);
      setTotalProducts(data.total_products);
    } catch {
      if (pageNum === 1) setError("추천 결과를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [familyId, sortBy, filters]);

  // 초기 로드 + 필터/정렬 변경 시 재로드
  useEffect(() => {
    setPage(1);
    fetchGroups(1);
  }, [fetchGroups]);

  // 무한 스크롤
  useEffect(() => {
    if (!observerRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore && hasMore) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchGroups(nextPage, true);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, page, fetchGroups]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center">
        <div className="inline-block w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
        <p className="text-muted">맞춤 추천 분석 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-lg font-extrabold mb-2">{error}</p>
        <Link href="/onboarding" className="text-primary hover:underline text-sm">온보딩 시작하기 →</Link>
      </div>
    );
  }

  const concernLabels = ((profile?.concerns as string[]) || []).map((c) => CONCERN_LABELS[c] || c).join(" · ");
  const activeFilterCount = filters.dish_categories.length
    + (filters.price_min > 0 ? 1 : 0)
    + (filters.price_max > 0 ? 1 : 0)
    + (filters.protein_min > 0 ? 1 : 0)
    + (filters.calories_max > 0 ? 1 : 0)
    + (filters.sodium_max > 0 ? 1 : 0)
    + (filters.sugar_max > 0 ? 1 : 0)
    + (filters.fiber_min > 0 ? 1 : 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* 헤더 */}
      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-extrabold">{concernLabels || "맞춤"} 추천</h1>
            <p className="text-sm text-muted mt-1">
              {totalProducts}개 제품 · {totalGroups}개 메뉴
            </p>
          </div>
          <Link href="/onboarding" className="text-sm text-muted hover:text-primary transition-colors">프로필 수정 →</Link>
        </div>
      </div>

      {/* 모바일 필터 버튼 + 정렬 */}
      <div className="flex items-center gap-2 mb-4 sticky top-14 z-30 bg-background py-2">
        <button
          onClick={() => setMobileFilterOpen(!mobileFilterOpen)}
          className="lg:hidden px-3 py-2 rounded-lg border border-border text-sm hover:border-primary/30 transition-colors flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
          </svg>
          필터{activeFilterCount > 0 && <span className="text-primary font-bold">({activeFilterCount})</span>}
        </button>

        <div className="flex gap-1 overflow-x-auto flex-1">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSortBy(opt.value)}
              className={`shrink-0 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                sortBy === opt.value
                  ? "bg-primary text-white"
                  : "bg-surface border border-border hover:border-primary/30"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 모바일 필터 바텀시트 */}
      {mobileFilterOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileFilterOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-background rounded-t-2xl max-h-[80vh] overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-extrabold text-lg">필터</h2>
              <button onClick={() => setMobileFilterOpen(false)} className="text-muted hover:text-foreground">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            </div>
            <FilterPanel filters={filters} onFilterChange={(f) => { setFilters(f); setMobileFilterOpen(false); }} />
          </div>
        </div>
      )}

      {/* 메인 레이아웃: 필터 사이드바 + 그룹 목록 */}
      <div className="flex gap-6">
        {/* 데스크톱 사이드바 */}
        <aside className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-20">
            <FilterPanel filters={filters} onFilterChange={setFilters} />
          </div>
        </aside>

        {/* 그룹 목록 */}
        <main className="flex-1 min-w-0">
          {groups.length > 0 ? (
            <div className="space-y-4">
              {groups.map((g, i) => (
                <DishGroupCard key={`${g.dish_name}-${i}`} group={g} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 text-muted">
              <p className="text-lg mb-2">조건에 맞는 제품이 없습니다</p>
              <p className="text-sm">필터를 조정하거나 프로필을 수정해보세요.</p>
            </div>
          )}

          {/* 무한 스크롤 트리거 */}
          {hasMore && (
            <div ref={observerRef} className="py-8 text-center">
              {loadingMore && (
                <div className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              )}
            </div>
          )}

          {!hasMore && groups.length > 0 && (
            <p className="text-center text-sm text-muted py-8">
              모든 추천을 확인했습니다
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
