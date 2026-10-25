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
  { value: "price_asc", label: "낮은 가격순" },
  { value: "price_desc", label: "높은 가격순" },
  { value: "protein_desc", label: "고단백순" },
  { value: "calories_asc", label: "저칼로리순" },
];

const PLATFORM_LABELS: Record<string, string> = {
  kurly: "컬리", oasis: "오아시스", homeplus: "홈플러스", "11st": "11번가",
};

const PLATFORM_COLORS: Record<string, string> = {
  kurly: "text-purple-600",
  oasis: "text-green-600",
  homeplus: "text-orange-600",
  "11st": "text-red-500",
};

const NUTRITION_PRESETS = {
  protein_min: [
    { label: "고단백 20g+", value: 20 },
    { label: "초고단백 30g+", value: 30 },
  ],
  calories_max: [
    { label: "200kcal 이하", value: 200 },
    { label: "100kcal 이하", value: 100 },
  ],
  sodium_max: [
    { label: "300mg 이하", value: 300 },
    { label: "120mg 이하", value: 120 },
  ],
  sugar_max: [
    { label: "5g 이하", value: 5 },
    { label: "무설탕", value: 1 },
  ],
  fiber_min: [
    { label: "고섬유 5g+", value: 5 },
  ],
};

const CATEGORY_FILTERS: DishCategory[] = [
  "soup", "noodle", "rice", "grill", "stew", "side",
  "seafood", "snack", "salad", "beverage", "supplement", "powder",
];

const PRICE_PRESETS = [
  { label: "1만원 이하", min: 0, max: 10000 },
  { label: "1~3만원", min: 10000, max: 30000 },
  { label: "3~5만원", min: 30000, max: 50000 },
  { label: "5~10만원", min: 50000, max: 100000 },
  { label: "10만원 이상", min: 100000, max: 0 },
];

function formatPrice(price: number): string {
  return price.toLocaleString("ko-KR") + "원";
}

/* ───── 점수 뱃지 ───── */
function ScoreBadge({ score }: { score: number }) {
  const color = score >= 90 ? "bg-primary text-white"
    : score >= 75 ? "bg-primary/80 text-white"
    : "bg-primary/50 text-white";
  return (
    <span className={`inline-flex items-center justify-center text-[11px] font-bold rounded-md px-1.5 py-0.5 leading-none ${color}`}
      style={{ minHeight: "unset", minWidth: "unset" }}>
      {score}점
    </span>
  );
}

/* ───── 영양 인라인 ───── */
function NutritionPills({ product }: { product: ProductItem }) {
  const items: { label: string; value: string }[] = [];
  if (product.calories != null) items.push({ label: "칼로리", value: `${Math.round(product.calories)}kcal` });
  if (product.protein_g != null) items.push({ label: "단백질", value: `${Math.round(product.protein_g)}g` });
  if (product.sodium_mg != null) items.push({ label: "나트륨", value: `${Math.round(product.sodium_mg)}mg` });
  if (product.sugar_g != null) items.push({ label: "당류", value: `${Math.round(product.sugar_g)}g` });

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {items.map((it) => (
        <span key={it.label} className="text-xs text-muted">
          <span className="text-foreground/70 font-medium">{it.label}</span>{" "}
          {it.value}
        </span>
      ))}
    </div>
  );
}

/* ───── 제품 카드 (그룹 내 하위) ───── */
function SubProductCard({ product }: { product: ProductItem }) {
  const prices = product.product_prices?.filter((p) => p.price > 0) || [];
  const bestPrice = prices.length > 0 ? Math.min(...prices.map((p) => p.price)) : null;

  return (
    <div className="flex items-start gap-3 py-3 border-t border-border/50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Link href={`/products/${product.id}`}
            className="text-sm font-medium hover:text-primary transition-colors truncate">
            {product.name}
          </Link>
          <ScoreBadge score={product.match_score} />
        </div>
        {product.manufacturer && (
          <p className="text-xs text-muted mt-0.5">{product.manufacturer}</p>
        )}
        <div className="mt-1.5">
          <NutritionPills product={product} />
        </div>
      </div>
      {bestPrice && (
        <div className="shrink-0 text-right">
          <span className="text-sm font-bold">{formatPrice(bestPrice)}</span>
          <div className="flex gap-1.5 mt-1 justify-end">
            {prices.slice(0, 2).map((pp) => (
              <a key={pp.platform} href={pp.url} target="_blank" rel="noopener noreferrer"
                className={`text-[11px] hover:underline ${PLATFORM_COLORS[pp.platform] || "text-muted"}`}
                style={{ minHeight: "unset", minWidth: "unset" }}>
                {PLATFORM_LABELS[pp.platform] || pp.platform}
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
  const extraCount = group.total_in_group - 1;

  return (
    <article className="bg-card border border-border rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
      <div className="p-4 sm:p-5">
        <div className="flex gap-4">
          {/* 이미지 */}
          {imageUrl ? (
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-lg overflow-hidden shrink-0 bg-surface">
              <img src={imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
            </div>
          ) : (
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-lg shrink-0 bg-surface flex items-center justify-center">
              <svg className="w-8 h-8 text-muted/40" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/>
              </svg>
            </div>
          )}

          {/* 제품 정보 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/products/${rep.id}`}
                  className="text-base font-bold leading-snug hover:text-primary transition-colors line-clamp-2">
                  {rep.name}
                </Link>
                {rep.manufacturer && (
                  <p className="text-xs text-muted mt-0.5">{rep.manufacturer}</p>
                )}
              </div>
              <ScoreBadge score={rep.match_score} />
            </div>

            {/* 추천 이유 */}
            {rep.reason_detail && (
              <p className="text-xs text-primary mt-2 leading-relaxed">{rep.reason_detail}</p>
            )}

            {/* 태그 */}
            {rep.reasons.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-2">
                {rep.reasons.slice(0, 4).map((r) => (
                  <span key={r} className="text-[11px] px-2 py-0.5 rounded bg-primary/8 text-primary/80 font-medium"
                    style={{ minHeight: "unset", minWidth: "unset" }}>
                    {r}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 하단: 영양 + 가격 */}
        <div className="mt-3 pt-3 border-t border-border/50 flex items-end justify-between gap-4">
          <NutritionPills product={rep} />
          <div className="shrink-0 text-right">
            {bestPrice ? (
              <>
                <span className="text-lg font-bold">{formatPrice(bestPrice)}</span>
                <div className="flex gap-2 mt-0.5 justify-end">
                  {prices.slice(0, 3).map((pp) => pp.url ? (
                    <a key={pp.platform} href={pp.url} target="_blank" rel="noopener noreferrer"
                      className={`text-[11px] hover:underline ${PLATFORM_COLORS[pp.platform] || "text-muted"}`}
                      style={{ minHeight: "unset", minWidth: "unset" }}>
                      {PLATFORM_LABELS[pp.platform] || pp.platform} {formatPrice(pp.price)}
                    </a>
                  ) : null)}
                </div>
              </>
            ) : (
              <span className="text-xs text-muted">가격 수집 중</span>
            )}
          </div>
        </div>
      </div>

      {/* 더보기 */}
      {extraCount > 0 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full px-5 py-2.5 text-sm text-muted hover:text-primary hover:bg-surface/50 transition-colors flex items-center justify-center gap-1 border-t border-border/50"
          >
            {expanded ? "접기" : `같은 메뉴 ${extraCount}개 더보기`}
            <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="currentColor"
              style={{ minHeight: "unset", minWidth: "unset" }}>
              <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
            </svg>
          </button>

          {expanded && (
            <div className="px-5 pb-4">
              {group.products.slice(1).map((p) => (
                <SubProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </>
      )}
    </article>
  );
}

/* ───── 필터 패널 ───── */
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

function FilterPanel({
  filters,
  onFilterChange,
}: {
  filters: FilterState;
  onFilterChange: (f: FilterState) => void;
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

  const isPricePresetActive = (p: typeof PRICE_PRESETS[number]) =>
    filters.price_min === p.min && filters.price_max === p.max && (p.min > 0 || p.max > 0);

  return (
    <div className="space-y-5">
      {/* 음식 종류 */}
      <section>
        <h3 className="text-[13px] font-bold text-foreground mb-2.5">음식 종류</h3>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_FILTERS.map((cat) => (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                filters.dish_categories.includes(cat)
                  ? "bg-foreground text-card font-medium"
                  : "bg-surface text-foreground/70 hover:bg-border"
              }`}
              style={{ minHeight: "32px", minWidth: "unset" }}
            >
              {DISH_CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </section>

      {/* 가격대 */}
      <section>
        <h3 className="text-[13px] font-bold text-foreground mb-2.5">가격대</h3>
        <div className="flex items-center gap-1.5 mb-2">
          <input
            type="number"
            value={filters.price_min || ""}
            onChange={(e) => updateFilter("price_min", Number(e.target.value) || 0)}
            placeholder="최소"
            className="w-[72px] px-2 py-1 rounded border border-border bg-card text-xs text-center focus:outline-none focus:border-primary"
            style={{ minHeight: "28px" }}
          />
          <span className="text-xs text-muted">~</span>
          <input
            type="number"
            value={filters.price_max || ""}
            onChange={(e) => updateFilter("price_max", Number(e.target.value) || 0)}
            placeholder="최대"
            className="w-[72px] px-2 py-1 rounded border border-border bg-card text-xs text-center focus:outline-none focus:border-primary"
            style={{ minHeight: "28px" }}
          />
          <span className="text-[11px] text-muted">원</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRICE_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                if (isPricePresetActive(p)) {
                  updateFilter("price_min", 0);
                  updateFilter("price_max", 0);
                } else {
                  onFilterChange({ ...filters, price_min: p.min, price_max: p.max });
                }
              }}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                isPricePresetActive(p)
                  ? "bg-foreground text-card font-medium"
                  : "bg-surface text-foreground/70 hover:bg-border"
              }`}
              style={{ minHeight: "32px", minWidth: "unset" }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* 영양 조건 */}
      <section>
        <h3 className="text-[13px] font-bold text-foreground mb-2.5">영양 조건</h3>
        <div className="space-y-3">
          {([
            { key: "protein_min" as const, label: "단백질", unit: "g", op: "≥", presets: NUTRITION_PRESETS.protein_min },
            { key: "calories_max" as const, label: "칼로리", unit: "kcal", op: "≤", presets: NUTRITION_PRESETS.calories_max },
            { key: "sodium_max" as const, label: "나트륨", unit: "mg", op: "≤", presets: NUTRITION_PRESETS.sodium_max },
            { key: "sugar_max" as const, label: "당류", unit: "g", op: "≤", presets: NUTRITION_PRESETS.sugar_max },
            { key: "fiber_min" as const, label: "식이섬유", unit: "g", op: "≥", presets: NUTRITION_PRESETS.fiber_min },
          ]).map((n) => (
            <div key={n.key}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-xs font-medium text-foreground/80">{n.label}</span>
                <span className="text-[11px] text-muted">{n.op}</span>
                <input
                  type="number"
                  value={filters[n.key] || ""}
                  onChange={(e) => updateFilter(n.key, Number(e.target.value) || 0)}
                  placeholder="0"
                  className="w-16 px-2 py-1 rounded-md border border-border bg-card text-xs text-center focus:outline-none focus:border-primary"
                  style={{ minHeight: "28px" }}
                />
                <span className="text-[11px] text-muted">{n.unit}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {n.presets.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => updateFilter(n.key, filters[n.key] === p.value ? 0 : p.value)}
                    className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${
                      filters[n.key] === p.value
                        ? "bg-primary/15 text-primary font-medium"
                        : "bg-surface text-muted hover:text-foreground/70"
                    }`}
                    style={{ minHeight: "24px", minWidth: "unset" }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 초기화 */}
      <button
        onClick={() => onFilterChange(INITIAL_FILTERS)}
        className="w-full py-2 text-xs text-muted hover:text-foreground transition-colors"
        style={{ minHeight: "36px" }}
      >
        필터 초기화
      </button>
    </div>
  );
}

/* ───── 메인 페이지 ───── */
export default function RecommendPage() {
  return (
    <Suspense fallback={
      <div className="max-w-6xl mx-auto px-4 py-16 text-center">
        <div className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-3" />
        <p className="text-sm text-muted">적합도 분석 중...</p>
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

  useEffect(() => {
    setPage(1);
    fetchGroups(1);
  }, [fetchGroups]);

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
      <div className="max-w-6xl mx-auto px-4 py-16 text-center">
        <div className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-3" />
        <p className="text-sm text-muted">맞춤 추천 분석 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-base font-bold mb-2">{error}</p>
        <Link href="/onboarding" className="text-primary hover:underline text-sm">온보딩 시작하기 →</Link>
      </div>
    );
  }

  const concernLabels = ((profile?.concerns as string[]) || []).map((c) => CONCERN_LABELS[c] || c).join(" · ");
  const activeFilterCount = filters.dish_categories.length
    + (filters.price_min > 0 || filters.price_max > 0 ? 1 : 0)
    + (filters.protein_min > 0 ? 1 : 0)
    + (filters.calories_max > 0 ? 1 : 0)
    + (filters.sodium_max > 0 ? 1 : 0)
    + (filters.sugar_max > 0 ? 1 : 0)
    + (filters.fiber_min > 0 ? 1 : 0);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5">
      {/* 헤더 */}
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold leading-tight">
            {concernLabels || "맞춤"} 추천
          </h1>
          <p className="text-xs text-muted mt-1">
            {totalProducts.toLocaleString()}개 제품 · {totalGroups.toLocaleString()}개 메뉴
          </p>
        </div>
        <Link href="/onboarding"
          className="text-xs text-muted hover:text-primary transition-colors shrink-0"
          style={{ minHeight: "unset", minWidth: "unset" }}>
          프로필 수정 →
        </Link>
      </div>

      {/* 정렬 + 모바일 필터 토글 */}
      <div className="flex items-center gap-2 mb-4 sticky top-0 z-30 bg-background py-2 -mx-4 px-4 sm:-mx-6 sm:px-6 border-b border-border/50">
        <button
          onClick={() => setMobileFilterOpen(true)}
          className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface text-xs font-medium hover:bg-border transition-colors shrink-0"
          style={{ minHeight: "32px", minWidth: "unset" }}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"
            style={{ minHeight: "unset", minWidth: "unset" }}>
            <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z" />
          </svg>
          필터{activeFilterCount > 0 && <span className="text-primary font-bold">({activeFilterCount})</span>}
        </button>

        <div className="flex gap-1 overflow-x-auto no-scrollbar flex-1">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSortBy(opt.value)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                sortBy === opt.value
                  ? "bg-foreground text-card"
                  : "text-muted hover:text-foreground"
              }`}
              style={{ minHeight: "32px", minWidth: "unset" }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 모바일 필터 오버레이 */}
      {mobileFilterOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileFilterOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl max-h-[75vh] overflow-y-auto">
            <div className="sticky top-0 bg-card px-5 pt-4 pb-3 border-b border-border/50 flex items-center justify-between">
              <h2 className="font-bold text-base">필터</h2>
              <button onClick={() => setMobileFilterOpen(false)} className="text-muted hover:text-foreground p-1"
                style={{ minHeight: "32px", minWidth: "32px" }}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"
                  style={{ minHeight: "unset", minWidth: "unset" }}>
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            </div>
            <div className="p-5">
              <FilterPanel filters={filters} onFilterChange={(f) => { setFilters(f); setMobileFilterOpen(false); }} />
            </div>
          </div>
        </div>
      )}

      {/* 메인 레이아웃 */}
      <div className="flex gap-8">
        {/* 데스크톱 사이드바 */}
        <aside className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-14 pt-2">
            <FilterPanel filters={filters} onFilterChange={setFilters} />
          </div>
        </aside>

        {/* 그룹 목록 */}
        <main className="flex-1 min-w-0">
          {groups.length > 0 ? (
            <div className="space-y-3">
              {groups.map((g, i) => (
                <DishGroupCard key={`${g.dish_name}-${i}`} group={g} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20 text-muted">
              <p className="text-base mb-1">조건에 맞는 제품이 없습니다</p>
              <p className="text-sm">필터를 조정하거나 프로필을 수정해보세요.</p>
            </div>
          )}

          {hasMore && (
            <div ref={observerRef} className="py-8 text-center">
              {loadingMore && (
                <div className="inline-block w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              )}
            </div>
          )}

          {!hasMore && groups.length > 0 && (
            <p className="text-center text-xs text-muted py-8">
              모든 추천을 확인했습니다
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
