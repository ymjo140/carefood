"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { ProductWithPrices, TasteLevel } from "@/types/database";

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

const TASTE_CONFIG = [
  { key: "salty" as const, label: "짠맛" },
  { key: "sweet" as const, label: "단맛" },
  { key: "spicy" as const, label: "매운맛" },
  { key: "fatty" as const, label: "기름진맛" },
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

/* ───── 목적 필터 ───── */
const PURPOSE_OPTIONS = [
  { key: "gut_health", label: "장건강" },
  { key: "skin", label: "피부건강" },
  { key: "weight", label: "체중관리" },
  { key: "muscle", label: "근력/운동" },
  { key: "immunity", label: "면역력" },
  { key: "bone", label: "뼈건강" },
  { key: "eye", label: "눈건강" },
];

/* ───── 성분 필터 ───── */
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

// 태그 라벨 lookup (카드에서 사용)
const ALL_TAG_LABELS: Record<string, string> = {};
[...PURPOSE_OPTIONS, ...INGREDIENT_OPTIONS,
  { key: "protein", label: "고단백" },
  { key: "sugar_free", label: "무설탕" },
  { key: "diet", label: "다이어트" },
].forEach(t => { ALL_TAG_LABELS[t.key] = t.label; });

/* ───── 가격 프리셋 ───── */
const PRICE_PRESETS = [
  { label: "1만원 이하", min: 0, max: 10000 },
  { label: "3만원 이하", min: 0, max: 30000 },
  { label: "5만원 이하", min: 0, max: 50000 },
  { label: "10만원 이상", min: 100000, max: 0 },
];

/* ───── 영양바 ───── */
function NutritionBar({ label, value, max, unit }: { label: string; value: number | null; max: number; unit: string }) {
  if (value === null || value === undefined) return null;
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-14 text-muted shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
        <div className="h-full bg-primary/60 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 text-right text-muted shrink-0">{Math.round(value)}{unit}</span>
    </div>
  );
}

/* ───── 칩 버튼 ───── */
function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1 rounded-full transition-colors ${
        active
          ? "bg-foreground text-card font-medium"
          : "bg-surface text-foreground/70 hover:bg-border"
      }`}
      style={{ minHeight: "32px", minWidth: "unset" }}
    >
      {label}
    </button>
  );
}

export default function ProductExplorer() {
  const [filters, setFilters] = useState<TasteFilters>({
    salty: 0, sweet: 0, spicy: 0, fatty: 0,
  });
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selectedPurposes, setSelectedPurposes] = useState<string[]>([]);
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  const [hasPriceOnly, setHasPriceOnly] = useState(false);
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(0);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.salty) params.set("salty", String(filters.salty));
      if (filters.sweet) params.set("sweet", String(filters.sweet));
      if (filters.spicy) params.set("spicy", String(filters.spicy));
      if (filters.fatty) params.set("fatty", String(filters.fatty));
      if (search) params.set("q", search);
      if (selectedPurposes.length > 0) params.set("purpose", selectedPurposes.join(","));
      if (selectedIngredients.length > 0) params.set("tags", selectedIngredients.join(","));
      if (hasPriceOnly) params.set("hasPrice", "1");
      if (priceMin > 0) params.set("price_min", String(priceMin));
      if (priceMax > 0) params.set("price_max", String(priceMax));
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
  }, [filters, search, selectedPurposes, selectedIngredients, hasPriceOnly, priceMin, priceMax, page]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const togglePurpose = (key: string) => {
    setSelectedPurposes(prev =>
      prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
    );
    setPage(1);
  };

  const toggleIngredient = (key: string) => {
    setSelectedIngredients(prev =>
      prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
    );
    setPage(1);
  };

  const setPricePreset = (min: number, max: number) => {
    if (priceMin === min && priceMax === max) {
      setPriceMin(0);
      setPriceMax(0);
    } else {
      setPriceMin(min);
      setPriceMax(max);
    }
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({ salty: 0, sweet: 0, spicy: 0, fatty: 0 });
    setSearch(""); setSearchInput("");
    setSelectedPurposes([]); setSelectedIngredients([]);
    setHasPriceOnly(false); setPriceMin(0); setPriceMax(0);
    setPage(1);
  };

  const hasActiveFilters =
    Object.values(filters).some(v => v > 0) || search ||
    selectedPurposes.length > 0 || selectedIngredients.length > 0 ||
    hasPriceOnly || priceMin > 0 || priceMax > 0;

  return (
    <div>
      {/* 검색 */}
      <form onSubmit={handleSearch} className="mb-5">
        <div className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="제품명으로 검색 (예: 햇반, 닭가슴살, 두부...)"
            className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button type="submit"
            className="px-5 py-2.5 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary-dark transition-colors">
            검색
          </button>
        </div>
      </form>

      {/* 필터 영역 */}
      <div className="border border-border rounded-xl p-4 sm:p-5 mb-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">필터</h2>
          {hasActiveFilters && (
            <button onClick={clearFilters}
              className="text-xs text-muted hover:text-foreground transition-colors"
              style={{ minHeight: "unset", minWidth: "unset" }}>
              초기화
            </button>
          )}
        </div>

        {/* 목적 필터 */}
        <div>
          <h3 className="text-[13px] font-bold text-foreground/80 mb-2">목적</h3>
          <div className="flex flex-wrap gap-1.5">
            {PURPOSE_OPTIONS.map(opt => (
              <Chip key={opt.key} label={opt.label}
                active={selectedPurposes.includes(opt.key)}
                onClick={() => togglePurpose(opt.key)} />
            ))}
          </div>
        </div>

        {/* 성분 필터 */}
        <div>
          <h3 className="text-[13px] font-bold text-foreground/80 mb-2">성분</h3>
          <div className="flex flex-wrap gap-1.5">
            {INGREDIENT_OPTIONS.map(opt => (
              <Chip key={opt.key} label={opt.label}
                active={selectedIngredients.includes(opt.key)}
                onClick={() => toggleIngredient(opt.key)} />
            ))}
          </div>
        </div>

        {/* 가격대 */}
        <div>
          <h3 className="text-[13px] font-bold text-foreground/80 mb-2">가격대</h3>
          <div className="flex flex-wrap gap-1.5">
            {PRICE_PRESETS.map(p => (
              <Chip key={p.label} label={p.label}
                active={priceMin === p.min && priceMax === p.max && (p.min > 0 || p.max > 0)}
                onClick={() => setPricePreset(p.min, p.max)} />
            ))}
          </div>
        </div>

        {/* 맛 필터 */}
        <div>
          <h3 className="text-[13px] font-bold text-foreground/80 mb-2">맛</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
            {TASTE_CONFIG.map(taste => (
              <div key={taste.key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{taste.label}</span>
                  <span className="text-[10px] text-muted">
                    {filters[taste.key] === 0 ? "전체" : `${filters[taste.key]}단계`}
                  </span>
                </div>
                <input
                  type="range" min={0} max={10} step={1}
                  value={filters[taste.key]}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setFilters(prev => ({ ...prev, [taste.key]: val as TasteLevel | 0 }));
                    setPage(1);
                  }}
                  className="w-full accent-primary"
                  style={{ minHeight: "unset" }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* 구매 가능만 */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={hasPriceOnly}
            onChange={(e) => { setHasPriceOnly(e.target.checked); setPage(1); }}
            className="w-4 h-4 rounded border-border accent-primary"
            style={{ minHeight: "16px", minWidth: "16px" }}
          />
          <span className="text-xs text-muted">구매 가능한 제품만 보기</span>
        </label>
      </div>

      {/* 결과 카운트 */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted">
          {data ? (
            <>총 <span className="font-bold text-foreground">{(data.total ?? 0).toLocaleString()}</span>개 제품</>
          ) : "로딩 중..."}
        </p>
      </div>

      {/* 제품 그리드 */}
      {loading && !data ? (
        <div className="text-center py-16 text-muted">
          <div className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-3" />
          <p className="text-sm">제품을 불러오는 중...</p>
        </div>
      ) : data?.products?.length ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.products.map(product => {
              const prices = product.product_prices?.filter(p => p.price && p.price > 0);
              const bestPrice = prices && prices.length > 0
                ? Math.min(...prices.map(p => p.price!)) : null;

              return (
                <article key={product.id}
                  className="bg-card rounded-xl border border-border p-4 hover:shadow-sm transition-all">
                  <div className="mb-3">
                    <Link href={`/products/${product.id}`}>
                      <h3 className="font-bold text-sm leading-tight line-clamp-2 hover:text-primary transition-colors">
                        {product.name}
                      </h3>
                    </Link>
                    {product.manufacturer && (
                      <p className="text-xs text-muted mt-0.5 truncate">{product.manufacturer}</p>
                    )}
                  </div>

                  <div className="space-y-1 mb-3">
                    <NutritionBar label="칼로리" value={product.calories} max={800} unit="kcal" />
                    <NutritionBar label="나트륨" value={product.sodium_mg} max={2000} unit="mg" />
                    <NutritionBar label="당류" value={product.sugar_g} max={30} unit="g" />
                    <NutritionBar label="지방" value={product.fat_g} max={30} unit="g" />
                    <NutritionBar label="단백질" value={product.protein_g} max={30} unit="g" />
                  </div>

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

                  {bestPrice ? (
                    <div className="flex items-center justify-between pt-3 border-t border-border">
                      <span className="text-lg font-bold">{formatPrice(bestPrice)}</span>
                      <div className="flex gap-2 flex-wrap justify-end">
                        {prices!.map(pp => pp.url ? (
                          <a key={pp.platform} href={pp.url} target="_blank" rel="noopener noreferrer"
                            className={`text-[11px] hover:underline ${PLATFORM_COLORS[pp.platform] || "text-muted"}`}
                            style={{ minHeight: "unset", minWidth: "unset" }}>
                            {PLATFORM_LABELS[pp.platform] || pp.platform} {formatPrice(pp.price!)}
                          </a>
                        ) : null)}
                      </div>
                    </div>
                  ) : (
                    <div className="pt-3 border-t border-border">
                      <span className="text-xs text-muted">가격 정보 수집 중</span>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-2 rounded-lg border border-border text-sm disabled:opacity-30 hover:border-primary/50 transition-colors">
                이전
              </button>
              <span className="text-sm text-muted px-3">{data.page} / {data.totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
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
    </div>
  );
}
