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

function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] || platform;
}

function NutritionBar({
  label,
  value,
  max,
  unit,
}: {
  label: string;
  value: number | null;
  max: number;
  unit: string;
}) {
  if (value === null || value === undefined) return null;
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-14 text-muted shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
        <div
          className="h-full bg-primary/60 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-16 text-right text-muted shrink-0">
        {Math.round(value)}
        {unit}
      </span>
    </div>
  );
}

const TAG_OPTIONS = [
  { key: "probiotics", label: "유산균" },
  { key: "collagen", label: "콜라겐" },
  { key: "protein", label: "프로틴" },
  { key: "vitamin", label: "비타민" },
  { key: "omega3", label: "오메가3" },
  { key: "prebiotic", label: "식이섬유" },
  { key: "diet", label: "다이어트" },
  { key: "sugar_free", label: "무설탕" },
  { key: "calcium", label: "칼슘" },
  { key: "iron", label: "철분" },
];

export default function ProductExplorer() {
  const [filters, setFilters] = useState<TasteFilters>({
    salty: 0,
    sweet: 0,
    spicy: 0,
    fatty: 0,
  });
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [hasPriceOnly, setHasPriceOnly] = useState(false);
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
      if (selectedTag) params.set("tag", selectedTag);
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
  }, [filters, search, selectedTag, page]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const toggleFilter = (key: keyof TasteFilters, level: TasteLevel) => {
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key] === level ? 0 : level,
    }));
    setPage(1);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({ salty: 0, sweet: 0, spicy: 0, fatty: 0 });
    setSearch("");
    setSearchInput("");
    setSelectedTag(null);
    setHasPriceOnly(false);
    setPage(1);
  };

  const hasActiveFilters =
    Object.values(filters).some((v) => v > 0) || search || selectedTag || hasPriceOnly;

  return (
    <div>
      {/* 검색 */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="제품명으로 검색 (예: 햇반, 닭가슴살, 두부...)"
            className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="submit"
            className="px-5 py-2.5 bg-primary text-white rounded-full text-sm font-bold hover:bg-primary-dark transition-colors"
          >
            검색
          </button>
        </div>
      </form>

      {/* 맛 필터 */}
      <div className="bg-card rounded-2xl border border-border p-5 mb-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-extrabold text-sm">맛 필터</h2>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-muted hover:text-foreground transition-colors"
            >
              초기화
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          {TASTE_CONFIG.map((taste) => (
            <div key={taste.key}>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-xs font-medium">{taste.label}</span>
              </div>
              <div className="flex gap-1.5">
                {([1, 2, 3, 4, 5] as TasteLevel[]).map((level) => (
                  <button
                    key={level}
                    onClick={() => toggleFilter(taste.key, level)}
                    className={`w-7 h-7 rounded-lg border text-xs font-medium transition-colors ${
                      filters[taste.key] === level
                        ? "bg-primary text-white border-primary"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 기능성 성분 필터 */}
      <div className="bg-card rounded-2xl border border-border p-5 mb-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 className="font-extrabold text-sm mb-3">성분 필터</h2>
        <div className="flex flex-wrap gap-2">
          {TAG_OPTIONS.map((tag) => (
            <button
              key={tag.key}
              onClick={() => {
                setSelectedTag(selectedTag === tag.key ? null : tag.key);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                selectedTag === tag.key
                  ? "bg-primary text-white"
                  : "bg-surface border border-border hover:border-primary/30"
              }`}
            >
              {tag.label}
            </button>
          ))}
        </div>

        {/* 구매 가능만 토글 */}
        <label className="flex items-center gap-2 mt-3 cursor-pointer">
          <input
            type="checkbox"
            checked={hasPriceOnly}
            onChange={(e) => {
              setHasPriceOnly(e.target.checked);
              setPage(1);
            }}
            className="w-4 h-4 rounded border-border accent-primary"
          />
          <span className="text-xs text-muted">구매 가능한 제품만 보기</span>
        </label>
      </div>

      {/* 결과 카운트 */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted">
          {data ? (
            <>
              총{" "}
              <span className="font-bold text-foreground">
                {(data.total ?? 0).toLocaleString()}
              </span>
              개 제품
            </>
          ) : (
            "로딩 중..."
          )}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.products
            .filter((product) => !hasPriceOnly || (product.product_prices?.length ?? 0) > 0)
            .map((product) => {
              const prices = product.product_prices?.filter(
                (p) => p.price && p.price > 0
              );
              const bestPrice =
                prices && prices.length > 0
                  ? Math.min(...prices.map((p) => p.price!))
                  : null;

              return (
                <div
                  key={product.id}
                  className="bg-card rounded-2xl border border-border p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-primary/30 hover:shadow-md transition-all"
                >
                  {/* 헤더 */}
                  <div className="mb-3">
                    <Link href={`/products/${product.id}`}>
                      <h3 className="font-bold text-sm leading-tight line-clamp-2 hover:text-primary transition-colors cursor-pointer">
                        {product.name}
                      </h3>
                    </Link>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {product.manufacturer && (
                        <span className="text-xs text-muted truncate max-w-[140px]">
                          {product.manufacturer}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 영양정보 */}
                  <div className="space-y-1.5 mb-3">
                    <NutritionBar
                      label="칼로리"
                      value={product.calories}
                      max={800}
                      unit="kcal"
                    />
                    <NutritionBar
                      label="나트륨"
                      value={product.sodium_mg}
                      max={2000}
                      unit="mg"
                    />
                    <NutritionBar
                      label="당류"
                      value={product.sugar_g}
                      max={30}
                      unit="g"
                    />
                    <NutritionBar
                      label="지방"
                      value={product.fat_g}
                      max={30}
                      unit="g"
                    />
                    <NutritionBar
                      label="단백질"
                      value={product.protein_g}
                      max={30}
                      unit="g"
                    />
                  </div>

                  {/* 기능성 태그 */}
                  {product.functional_tags && product.functional_tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {product.functional_tags.slice(0, 4).map((t: string) => {
                        const tagInfo = TAG_OPTIONS.find((o) => o.key === t);
                        return (
                          <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/5 text-primary border border-primary/10 font-medium">
                            {tagInfo?.label || t}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* 가격 */}
                  {bestPrice ? (
                    <div className="flex items-center justify-between pt-3 border-t border-border">
                      <span className="text-lg font-bold text-primary">
                        {formatPrice(bestPrice)}
                      </span>
                      <div className="flex gap-1 flex-wrap justify-end">
                        {prices!.map((pp) =>
                          pp.url ? (
                            <a
                              key={pp.platform}
                              href={pp.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors hover:opacity-80 ${
                                PLATFORM_COLORS[pp.platform] ||
                                "bg-card border-border"
                              }`}
                            >
                              {platformLabel(pp.platform)}{" "}
                              {formatPrice(pp.price!)}
                            </a>
                          ) : null
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="pt-3 border-t border-border">
                      <span className="text-xs text-muted">
                        가격 정보 수집 중
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 페이지네이션 */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-2 rounded-lg border border-border text-sm disabled:opacity-30 hover:border-primary/50 transition-colors"
              >
                이전
              </button>
              <span className="text-sm text-muted px-3">
                {data.page} / {data.totalPages}
              </span>
              <button
                onClick={() =>
                  setPage((p) => Math.min(data.totalPages, p + 1))
                }
                disabled={page >= data.totalPages}
                className="px-3 py-2 rounded-lg border border-border text-sm disabled:opacity-30 hover:border-primary/50 transition-colors"
              >
                다음
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-16 text-muted">
          <p className="text-lg mb-2">조건에 맞는 제품이 없습니다</p>
          <p className="text-sm">
            필터를 조정하거나 다른 검색어를 사용해보세요.
          </p>
        </div>
      )}
    </div>
  );
}
