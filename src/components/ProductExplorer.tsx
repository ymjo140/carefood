"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { ProductWithPrices, TasteLevel } from "@/types/database";

/* ───── 타입 ───── */
type TasteFilters = {
  salty: TasteLevel | 0;
  sweet: TasteLevel | 0;
  spicy: TasteLevel | 0;
  fatty: TasteLevel | 0;
};

type ApiResponse = {
  products: ProductWithPrices[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type SortOption = "name" | "price_asc" | "price_desc" | "protein_desc" | "calories_asc";

/* ───── 상수 ───── */
const TASTE_CONFIG = [
  { key: "salty" as const, label: "짠맛" },
  { key: "sweet" as const, label: "단맛" },
  { key: "spicy" as const, label: "매운맛" },
  { key: "fatty" as const, label: "기름진맛" },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "name", label: "이름순" },
  { value: "price_asc", label: "낮은 가격순" },
  { value: "price_desc", label: "높은 가격순" },
  { value: "protein_desc", label: "고단백순" },
  { value: "calories_asc", label: "저칼로리순" },
];

function formatPrice(price: number): string {
  return price.toLocaleString("ko-KR") + "원";
}

const PLATFORM_LABELS: Record<string, string> = {
  kurly: "컬리", oasis: "오아시스", homeplus: "홈플러스", "11st": "11번가", danawa: "다나와",
};
const PLATFORM_COLORS: Record<string, string> = {
  kurly: "text-purple-600", oasis: "text-green-600",
  homeplus: "text-orange-600", "11st": "text-red-500", danawa: "text-blue-600",
};

const PURPOSE_OPTIONS = [
  { key: "gut_health", label: "장건강" },
  { key: "skin", label: "피부건강" },
  { key: "weight", label: "체중관리" },
  { key: "muscle", label: "근력/운동" },
  { key: "immunity", label: "면역력" },
  { key: "bone", label: "뼈건강" },
  { key: "eye", label: "눈건강" },
];

const INGREDIENT_OPTIONS = [
  { key: "probiotics", label: "유산균" },
  { key: "collagen", label: "콜라겐" },
  { key: "prebiotic", label: "식이섬유" },
  { key: "vitamin", label: "비타민" },
  { key: "omega3", label: "오메가3" },
  { key: "calcium", label: "칼슘" },
  { key: "iron", label: "철분" },
  { key: "zinc", label: "아연" },
  { key: "lutein", label: "루테인" },
];

const ALL_TAG_LABELS: Record<string, string> = {};
[...PURPOSE_OPTIONS, ...INGREDIENT_OPTIONS,
  { key: "protein", label: "고단백" },
  { key: "sugar_free", label: "무설탕" },
  { key: "diet", label: "다이어트" },
].forEach(t => { ALL_TAG_LABELS[t.key] = t.label; });

const PRICE_PRESETS = [
  { label: "1만원 이하", min: 0, max: 10000 },
  { label: "1~3만원", min: 10000, max: 30000 },
  { label: "3~5만원", min: 30000, max: 50000 },
  { label: "5~10만원", min: 50000, max: 100000 },
  { label: "10만원 이상", min: 100000, max: 0 },
];

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

/* ───── 칩 버튼 ───── */
function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
        active
          ? "bg-foreground text-card font-medium"
          : "bg-surface text-foreground/70 hover:bg-border"
      }`}
      style={{ minHeight: "28px", minWidth: "unset" }}
    >
      {label}
    </button>
  );
}

/* ───── 필터 상태 ───── */
type NutritionFilters = {
  protein_min: number;
  calories_max: number;
  sodium_max: number;
  sugar_max: number;
  fiber_min: number;
};

const INITIAL_NUTRITION: NutritionFilters = {
  protein_min: 0, calories_max: 0, sodium_max: 0, sugar_max: 0, fiber_min: 0,
};

/* ───── 사이드바 필터 패널 ───── */
function FilterPanel({
  purposes, onPurposeToggle,
  ingredients, onIngredientToggle,
  priceMin, priceMax, onPriceChange,
  nutrition, onNutritionChange,
  tastes, onTasteChange,
  hasPriceOnly, onHasPriceOnlyChange,
  onReset,
}: {
  purposes: string[];
  onPurposeToggle: (key: string) => void;
  ingredients: string[];
  onIngredientToggle: (key: string) => void;
  priceMin: number;
  priceMax: number;
  onPriceChange: (min: number, max: number) => void;
  nutrition: NutritionFilters;
  onNutritionChange: (n: NutritionFilters) => void;
  tastes: TasteFilters;
  onTasteChange: (t: TasteFilters) => void;
  hasPriceOnly: boolean;
  onHasPriceOnlyChange: (v: boolean) => void;
  onReset: () => void;
}) {
  const isPriceActive = (p: typeof PRICE_PRESETS[number]) =>
    priceMin === p.min && priceMax === p.max && (p.min > 0 || p.max > 0);

  const updateNutrition = <K extends keyof NutritionFilters>(key: K, value: number) => {
    onNutritionChange({ ...nutrition, [key]: value });
  };

  return (
    <div className="space-y-5">
      {/* 목적 */}
      <section>
        <h3 className="text-[13px] font-bold text-foreground mb-2">목적</h3>
        <div className="flex flex-wrap gap-1.5">
          {PURPOSE_OPTIONS.map(opt => (
            <Chip key={opt.key} label={opt.label}
              active={purposes.includes(opt.key)}
              onClick={() => onPurposeToggle(opt.key)} />
          ))}
        </div>
      </section>

      {/* 성분 */}
      <section>
        <h3 className="text-[13px] font-bold text-foreground mb-2">성분</h3>
        <div className="flex flex-wrap gap-1.5">
          {INGREDIENT_OPTIONS.map(opt => (
            <Chip key={opt.key} label={opt.label}
              active={ingredients.includes(opt.key)}
              onClick={() => onIngredientToggle(opt.key)} />
          ))}
        </div>
      </section>

      {/* 가격대 */}
      <section>
        <h3 className="text-[13px] font-bold text-foreground mb-2">가격대</h3>
        <div className="flex items-center gap-1.5 mb-2">
          <input
            type="number"
            value={priceMin || ""}
            onChange={e => onPriceChange(Number(e.target.value) || 0, priceMax)}
            placeholder="최소"
            className="w-[72px] px-2 py-1 rounded border border-border bg-card text-xs text-center focus:outline-none focus:border-primary"
            style={{ minHeight: "28px" }}
          />
          <span className="text-xs text-muted">~</span>
          <input
            type="number"
            value={priceMax || ""}
            onChange={e => onPriceChange(priceMin, Number(e.target.value) || 0)}
            placeholder="최대"
            className="w-[72px] px-2 py-1 rounded border border-border bg-card text-xs text-center focus:outline-none focus:border-primary"
            style={{ minHeight: "28px" }}
          />
          <span className="text-[11px] text-muted">원</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRICE_PRESETS.map(p => (
            <Chip key={p.label} label={p.label}
              active={isPriceActive(p)}
              onClick={() => {
                if (isPriceActive(p)) onPriceChange(0, 0);
                else onPriceChange(p.min, p.max);
              }} />
          ))}
        </div>
      </section>

      {/* 영양 조건 */}
      <section>
        <h3 className="text-[13px] font-bold text-foreground mb-2">영양 조건</h3>
        <div className="space-y-3">
          {([
            { key: "protein_min" as const, label: "단백질", unit: "g", op: "≥", presets: NUTRITION_PRESETS.protein_min },
            { key: "calories_max" as const, label: "칼로리", unit: "kcal", op: "≤", presets: NUTRITION_PRESETS.calories_max },
            { key: "sodium_max" as const, label: "나트륨", unit: "mg", op: "≤", presets: NUTRITION_PRESETS.sodium_max },
            { key: "sugar_max" as const, label: "당류", unit: "g", op: "≤", presets: NUTRITION_PRESETS.sugar_max },
            { key: "fiber_min" as const, label: "식이섬유", unit: "g", op: "≥", presets: NUTRITION_PRESETS.fiber_min },
          ]).map(n => (
            <div key={n.key}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-medium text-foreground/80">{n.label}</span>
                <span className="text-[11px] text-muted">{n.op}</span>
                <input
                  type="number"
                  value={nutrition[n.key] || ""}
                  onChange={e => updateNutrition(n.key, Number(e.target.value) || 0)}
                  placeholder="0"
                  className="w-14 px-2 py-0.5 rounded border border-border bg-card text-xs text-center focus:outline-none focus:border-primary"
                  style={{ minHeight: "24px" }}
                />
                <span className="text-[11px] text-muted">{n.unit}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {n.presets.map(p => (
                  <button key={p.label}
                    onClick={() => updateNutrition(n.key, nutrition[n.key] === p.value ? 0 : p.value)}
                    className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${
                      nutrition[n.key] === p.value
                        ? "bg-primary/15 text-primary font-medium"
                        : "bg-surface text-muted hover:text-foreground/70"
                    }`}
                    style={{ minHeight: "22px", minWidth: "unset" }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 맛 */}
      <section>
        <h3 className="text-[13px] font-bold text-foreground mb-2">맛</h3>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {TASTE_CONFIG.map(taste => (
            <div key={taste.key}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[11px] font-medium">{taste.label}</span>
                <span className="text-[10px] text-muted">
                  {tastes[taste.key] === 0 ? "전체" : `${tastes[taste.key]}단계`}
                </span>
              </div>
              <input
                type="range" min={0} max={10} step={1}
                value={tastes[taste.key]}
                onChange={e => onTasteChange({ ...tastes, [taste.key]: Number(e.target.value) as TasteLevel | 0 })}
                className="w-full accent-primary"
                style={{ minHeight: "unset" }}
              />
            </div>
          ))}
        </div>
      </section>

      {/* 구매 가능만 */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={hasPriceOnly}
          onChange={e => onHasPriceOnlyChange(e.target.checked)}
          className="w-4 h-4 rounded border-border accent-primary"
          style={{ minHeight: "16px", minWidth: "16px" }} />
        <span className="text-xs text-muted">구매 가능한 제품만</span>
      </label>

      {/* 초기화 */}
      <button onClick={onReset}
        className="w-full py-2 text-xs text-muted hover:text-foreground transition-colors"
        style={{ minHeight: "32px" }}>
        필터 초기화
      </button>
    </div>
  );
}

/* ───── 제품 카드 (이미지 + 정보) ───── */
function ProductCard({ product }: { product: ProductWithPrices }) {
  const prices = product.product_prices?.filter(p => p.price && p.price > 0) || [];
  const bestPrice = prices.length > 0 ? Math.min(...prices.map(p => p.price!)) : null;
  const imageUrl = prices.find(p => p.image_url)?.image_url;

  return (
    <article className="border border-border rounded-xl p-4 hover:shadow-sm transition-all flex gap-4">
      {/* 이미지 */}
      {imageUrl ? (
        <div className="w-[100px] h-[100px] sm:w-[120px] sm:h-[120px] rounded-lg overflow-hidden shrink-0 bg-surface">
          <img src={imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
      ) : (
        <div className="w-[100px] h-[100px] sm:w-[120px] sm:h-[120px] rounded-lg shrink-0 bg-surface flex items-center justify-center">
          <svg className="w-10 h-10 text-border" viewBox="0 0 24 24" fill="currentColor"
            style={{ minHeight: "unset", minWidth: "unset" }}>
            <path d="M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11 8.76l1-1.36 1 1.36L15.38 12 17 10.83 14.92 8H20v6z"/>
          </svg>
        </div>
      )}

      {/* 정보 */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="mb-1">
          <Link href={`/products/${product.id}`}
            className="text-[15px] font-bold leading-snug hover:text-primary transition-colors line-clamp-2">
            {product.name}
          </Link>
          {product.manufacturer && (
            <p className="text-xs text-muted mt-0.5 truncate">{product.manufacturer}</p>
          )}
        </div>

        {/* 태그 */}
        {product.functional_tags && product.functional_tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {product.functional_tags.slice(0, 4).map((t: string) => (
              <span key={t} className="text-[11px] px-2 py-0.5 rounded bg-primary/8 text-primary/80 font-medium"
                style={{ minHeight: "unset", minWidth: "unset" }}>
                {ALL_TAG_LABELS[t] || t}
              </span>
            ))}
          </div>
        )}

        {/* 영양 인라인 */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-auto">
          {product.calories != null && (
            <span className="text-xs text-muted"><span className="text-foreground/70 font-medium">칼로리</span> {Math.round(product.calories)}kcal</span>
          )}
          {product.protein_g != null && (
            <span className="text-xs text-muted"><span className="text-foreground/70 font-medium">단백질</span> {Math.round(product.protein_g)}g</span>
          )}
          {product.sodium_mg != null && (
            <span className="text-xs text-muted"><span className="text-foreground/70 font-medium">나트륨</span> {Math.round(product.sodium_mg)}mg</span>
          )}
          {product.sugar_g != null && (
            <span className="text-xs text-muted"><span className="text-foreground/70 font-medium">당류</span> {Math.round(product.sugar_g)}g</span>
          )}
        </div>

        {/* 가격 */}
        <div className="flex items-end justify-between pt-2 border-t border-border/50 mt-2">
          {bestPrice ? (
            <>
              <span className="text-lg font-bold">{formatPrice(bestPrice)}</span>
              <div className="flex gap-2 flex-wrap justify-end">
                {prices.slice(0, 3).map(pp => pp.url ? (
                  <a key={pp.platform} href={pp.url} target="_blank" rel="noopener noreferrer"
                    className={`text-[11px] hover:underline ${PLATFORM_COLORS[pp.platform] || "text-muted"}`}
                    style={{ minHeight: "unset", minWidth: "unset" }}>
                    {PLATFORM_LABELS[pp.platform] || pp.platform} {formatPrice(pp.price!)}
                  </a>
                ) : null)}
              </div>
            </>
          ) : (
            <span className="text-xs text-muted">가격 정보 수집 중</span>
          )}
        </div>
      </div>
    </article>
  );
}

/* ───── 메인 컴포넌트 ───── */
export default function ProductExplorer() {
  const [tastes, setTastes] = useState<TasteFilters>({ salty: 0, sweet: 0, spicy: 0, fatty: 0 });
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selectedPurposes, setSelectedPurposes] = useState<string[]>([]);
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  const [hasPriceOnly, setHasPriceOnly] = useState(true);
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(0);
  const [nutrition, setNutrition] = useState<NutritionFilters>(INITIAL_NUTRITION);
  const [sortBy, setSortBy] = useState<SortOption>("name");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tastes.salty) params.set("salty", String(tastes.salty));
      if (tastes.sweet) params.set("sweet", String(tastes.sweet));
      if (tastes.spicy) params.set("spicy", String(tastes.spicy));
      if (tastes.fatty) params.set("fatty", String(tastes.fatty));
      if (search) params.set("q", search);
      if (selectedPurposes.length > 0) params.set("purpose", selectedPurposes.join(","));
      if (selectedIngredients.length > 0) params.set("tags", selectedIngredients.join(","));
      if (hasPriceOnly) params.set("hasPrice", "1");
      if (priceMin > 0) params.set("price_min", String(priceMin));
      if (priceMax > 0) params.set("price_max", String(priceMax));
      if (nutrition.protein_min > 0) params.set("protein_min", String(nutrition.protein_min));
      if (nutrition.calories_max > 0) params.set("calories_max", String(nutrition.calories_max));
      if (nutrition.sodium_max > 0) params.set("sodium_max", String(nutrition.sodium_max));
      if (nutrition.sugar_max > 0) params.set("sugar_max", String(nutrition.sugar_max));
      if (nutrition.fiber_min > 0) params.set("fiber_min", String(nutrition.fiber_min));
      params.set("sort", sortBy);
      params.set("page", String(page));
      params.set("limit", "20");

      const res = await fetch(`/api/products?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json: ApiResponse = await res.json();
      setData(json);
    } catch (err) {
      console.error("Failed to fetch products:", err);
    } finally {
      setLoading(false);
    }
  }, [tastes, search, selectedPurposes, selectedIngredients, hasPriceOnly, priceMin, priceMax, nutrition, sortBy, page]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const toggleList = (list: string[], key: string) =>
    list.includes(key) ? list.filter(k => k !== key) : [...list, key];

  const resetAll = () => {
    setTastes({ salty: 0, sweet: 0, spicy: 0, fatty: 0 });
    setSearch(""); setSearchInput("");
    setSelectedPurposes([]); setSelectedIngredients([]);
    setHasPriceOnly(false); setPriceMin(0); setPriceMax(0);
    setNutrition(INITIAL_NUTRITION); setPage(1);
  };

  const activeFilterCount = selectedPurposes.length + selectedIngredients.length
    + (priceMin > 0 || priceMax > 0 ? 1 : 0)
    + Object.values(nutrition).filter(v => v > 0).length
    + Object.values(tastes).filter(v => v > 0).length
    + (hasPriceOnly ? 1 : 0);

  return (
    <div>
      {/* 검색 */}
      <form onSubmit={handleSearch} className="mb-4">
        <div className="flex gap-2">
          <input type="text" value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="제품명으로 검색 (예: 햇반, 닭가슴살, 두부...)"
            className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <button type="submit"
            className="px-5 py-2.5 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary-dark transition-colors">
            검색
          </button>
        </div>
      </form>

      {/* 모바일 필터 + 정렬 */}
      <div className="flex items-center gap-2 mb-4 sticky top-0 z-30 bg-background py-2 border-b border-border/50">
        <button
          onClick={() => setMobileFilterOpen(true)}
          className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface text-xs font-medium hover:bg-border transition-colors shrink-0"
          style={{ minHeight: "32px", minWidth: "unset" }}>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"
            style={{ minHeight: "unset", minWidth: "unset" }}>
            <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z" />
          </svg>
          필터{activeFilterCount > 0 && <span className="text-primary font-bold">({activeFilterCount})</span>}
        </button>

        <div className="flex gap-1 overflow-x-auto no-scrollbar flex-1">
          {SORT_OPTIONS.map(opt => (
            <button key={opt.value}
              onClick={() => { setSortBy(opt.value); setPage(1); }}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                sortBy === opt.value ? "bg-foreground text-card" : "text-muted hover:text-foreground"
              }`}
              style={{ minHeight: "32px", minWidth: "unset" }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 모바일 필터 바텀시트 */}
      {mobileFilterOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileFilterOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-card px-5 pt-4 pb-3 border-b border-border/50 flex items-center justify-between">
              <h2 className="font-bold text-base">필터</h2>
              <button onClick={() => setMobileFilterOpen(false)} className="text-muted hover:text-foreground p-1"
                style={{ minHeight: "32px", minWidth: "32px" }}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" style={{ minHeight: "unset", minWidth: "unset" }}>
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            </div>
            <div className="p-5">
              <FilterPanel
                purposes={selectedPurposes} onPurposeToggle={k => { setSelectedPurposes(toggleList(selectedPurposes, k)); setPage(1); }}
                ingredients={selectedIngredients} onIngredientToggle={k => { setSelectedIngredients(toggleList(selectedIngredients, k)); setPage(1); }}
                priceMin={priceMin} priceMax={priceMax} onPriceChange={(min, max) => { setPriceMin(min); setPriceMax(max); setPage(1); }}
                nutrition={nutrition} onNutritionChange={n => { setNutrition(n); setPage(1); }}
                tastes={tastes} onTasteChange={t => { setTastes(t); setPage(1); }}
                hasPriceOnly={hasPriceOnly} onHasPriceOnlyChange={v => { setHasPriceOnly(v); setPage(1); }}
                onReset={() => { resetAll(); setMobileFilterOpen(false); }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 메인 레이아웃: 사이드바 + 제품 목록 */}
      <div className="flex gap-8">
        {/* 데스크톱 사이드바 */}
        <aside className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-14 pt-2">
            <FilterPanel
              purposes={selectedPurposes} onPurposeToggle={k => { setSelectedPurposes(toggleList(selectedPurposes, k)); setPage(1); }}
              ingredients={selectedIngredients} onIngredientToggle={k => { setSelectedIngredients(toggleList(selectedIngredients, k)); setPage(1); }}
              priceMin={priceMin} priceMax={priceMax} onPriceChange={(min, max) => { setPriceMin(min); setPriceMax(max); setPage(1); }}
              nutrition={nutrition} onNutritionChange={n => { setNutrition(n); setPage(1); }}
              tastes={tastes} onTasteChange={t => { setTastes(t); setPage(1); }}
              hasPriceOnly={hasPriceOnly} onHasPriceOnlyChange={v => { setHasPriceOnly(v); setPage(1); }}
              onReset={resetAll}
            />
          </div>
        </aside>

        {/* 제품 목록 */}
        <main className="flex-1 min-w-0">
          <p className="text-sm text-muted mb-3">
            {data ? <>총 <span className="font-bold text-foreground">{(data.total ?? 0).toLocaleString()}</span>개 제품</> : "로딩 중..."}
          </p>

          {loading && !data ? (
            <div className="text-center py-16 text-muted">
              <div className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-3" />
              <p className="text-sm">제품을 불러오는 중...</p>
            </div>
          ) : data?.products?.length ? (
            <>
              <div className="flex flex-col gap-3">
                {data.products.map(product => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {data.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                    className="px-3 py-2 rounded-lg border border-border text-sm disabled:opacity-30 hover:border-primary/50 transition-colors">
                    이전
                  </button>
                  <span className="text-sm text-muted px-3">{data.page} / {data.totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page >= data.totalPages}
                    className="px-3 py-2 rounded-lg border border-border text-sm disabled:opacity-30 hover:border-primary/50 transition-colors">
                    다음
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16 text-muted">
              <p className="text-base mb-1">조건에 맞는 제품이 없습니다</p>
              <p className="text-sm">필터를 조정하거나 다른 검색어를 사용해보세요.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
