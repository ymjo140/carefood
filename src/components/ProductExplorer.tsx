"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import type { ProductWithPrices, TasteLevel, DishCategory } from "@/types/database";
import { DISH_CATEGORY_LABELS } from "@/types/database";
import { useFavorites } from "@/hooks/useFavorites";

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

type SortOption = "recommend" | "taste_desc" | "nutrition_desc" | "price_asc" | "price_desc" | "protein_desc" | "calories_asc" | "name";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UserProfile = Record<string, any> | null;

/* ───── 상수 ───── */
const TASTE_CONFIG = [
  { key: "salty" as const, label: "짠맛" },
  { key: "sweet" as const, label: "단맛" },
  { key: "spicy" as const, label: "매운맛" },
  { key: "fatty" as const, label: "고소한맛" },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "recommend", label: "추천순" },
  { value: "taste_desc", label: "맛순" },
  { value: "nutrition_desc", label: "영양순" },
  { value: "price_asc", label: "낮은 가격순" },
  { value: "price_desc", label: "높은 가격순" },
  { value: "protein_desc", label: "고단백순" },
  { value: "calories_asc", label: "저칼로리순" },
];

const GOAL_LABELS: Record<string, string> = {
  balanced: "균형식단", weight_loss: "체중관리", muscle: "근력강화",
  gut_health: "장건강", skin: "피부건강", energy: "활력충전",
  diabetes: "당뇨관심", blood_pressure: "혈압관심", kidney: "신장관심",
};

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

/* ───── 음식 종류 ───── */
const CATEGORY_FILTERS: DishCategory[] = [
  "set", "soup", "noodle", "rice", "grill", "stew", "side",
  "seafood", "salad", "dairy", "bread", "snack", "beverage", "supplement", "powder",
];

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

const PER100G_PRESETS = {
  per100g_sugar_max: [
    { label: "저당 5g↓", value: 5 },
    { label: "극저당 2g↓", value: 2 },
  ],
  per100g_sodium_max: [
    { label: "저염 300mg↓", value: 300 },
    { label: "극저염 150mg↓", value: 150 },
  ],
  per100g_protein_min: [
    { label: "고단백 15g+", value: 15 },
    { label: "초고단백 25g+", value: 25 },
  ],
  per100g_calories_max: [
    { label: "저칼 150kcal↓", value: 150 },
    { label: "극저칼 80kcal↓", value: 80 },
  ],
};

/* ───── 매크로 색상 ───── */
const MACRO_COLORS = {
  protein: { bar: "#4A8FD4", bg: "rgba(74,143,212,0.08)" },
  carbs: { bar: "#D4960A", bg: "rgba(212,150,10,0.08)" },
  fat: { bar: "#D46A3A", bg: "rgba(212,106,58,0.08)" },
  sodium: { bar: "#8A6EBF", bg: "rgba(138,110,191,0.08)" },
};

/* ───── 칩 버튼 ───── */
function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
        active
          ? "bg-primary text-white font-medium"
          : "bg-surface border border-border text-foreground/70 hover:border-primary/30"
      }`}
      style={{ minHeight: "28px", minWidth: "unset" }}
    >
      {label}
    </button>
  );
}

/* ───── 매크로 미니 바 ───── */
function MacroMiniBars({ protein, carbs, fat, sodium }: {
  protein: number | null; carbs: number | null; fat: number | null; sodium: number | null;
}) {
  const items = [
    { label: "단백", value: protein, max: 80, color: MACRO_COLORS.protein },
    { label: "탄수", value: carbs, max: 260, color: MACRO_COLORS.carbs },
    { label: "지방", value: fat, max: 60, color: MACRO_COLORS.fat },
    { label: "Na", value: sodium, max: 2000, color: MACRO_COLORS.sodium },
  ];
  if (items.every(i => i.value == null)) return null;
  return (
    <div className="flex gap-1.5 mt-2">
      {items.map(item => {
        const ratio = item.value != null ? Math.min((item.value / item.max) * 100, 100) : 0;
        return (
          <div key={item.label} className="flex-1 min-w-0">
            <div className="h-[4px] rounded-full overflow-hidden" style={{ background: item.color.bg }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${ratio}%`, background: item.color.bar }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ───── 건강점수 원형 배지 ───── */
function HealthBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const color = score >= 80 ? "#22A860" : score >= 60 ? "#C4870A" : "#9C9A90";
  const bg = score >= 80 ? "rgba(34,168,96,0.1)" : score >= 60 ? "rgba(196,135,10,0.1)" : "rgba(156,154,144,0.08)";
  const r = 14;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  return (
    <div className="relative w-[38px] h-[38px] shrink-0" title={`건강점수 ${score}`}>
      <svg viewBox="0 0 36 36" width="38" height="38">
        <circle cx="18" cy="18" r={r} fill={bg} stroke="none" />
        <circle cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="2.5"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 18 18)" style={{ transition: "stroke-dashoffset 0.4s" }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold"
        style={{ fontFamily: "'Outfit', sans-serif", color }}>{score}</span>
    </div>
  );
}

/* ───── 필터 상태 ───── */
type NutritionFilters = {
  protein_min: number;
  calories_max: number;
  sodium_max: number;
  sugar_max: number;
  fiber_min: number;
  // 100g당 기준
  per100g_sugar_max: number;
  per100g_sodium_max: number;
  per100g_protein_min: number;
  per100g_calories_max: number;
  // 건강 점수
  health_min: number;
};

const INITIAL_NUTRITION: NutritionFilters = {
  protein_min: 0, calories_max: 0, sodium_max: 0, sugar_max: 0, fiber_min: 0,
  per100g_sugar_max: 0, per100g_sodium_max: 0, per100g_protein_min: 0, per100g_calories_max: 0,
  health_min: 0,
};

/* ───── 사이드바 필터 패널 ───── */
function FilterPanel({
  categories, onCategoryToggle,
  purposes, onPurposeToggle,
  ingredients, onIngredientToggle,
  priceMin, priceMax, onPriceChange,
  nutrition, onNutritionChange,
  tastes, onTasteChange,
  hasPriceOnly, onHasPriceOnlyChange,
  onReset,
}: {
  categories: DishCategory[];
  onCategoryToggle: (key: DishCategory) => void;
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
      {/* 음식 종류 */}
      <section>
        <h3 className="text-[13px] font-bold text-foreground mb-2">음식 종류</h3>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_FILTERS.map(cat => (
            <Chip key={cat} label={DISH_CATEGORY_LABELS[cat]}
              active={categories.includes(cat)}
              onClick={() => onCategoryToggle(cat)} />
          ))}
        </div>
      </section>

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

      {/* 100g당 영양 기준 */}
      <section>
        <h3 className="text-[13px] font-bold text-foreground mb-2">100g당 기준</h3>
        <p className="text-[10px] text-muted mb-2">제품 크기와 무관하게 영양 밀도로 비교</p>
        <div className="space-y-3">
          {([
            { key: "per100g_sugar_max" as const, label: "당류", unit: "g", op: "≤", presets: PER100G_PRESETS.per100g_sugar_max },
            { key: "per100g_sodium_max" as const, label: "나트륨", unit: "mg", op: "≤", presets: PER100G_PRESETS.per100g_sodium_max },
            { key: "per100g_protein_min" as const, label: "단백질", unit: "g", op: "≥", presets: PER100G_PRESETS.per100g_protein_min },
            { key: "per100g_calories_max" as const, label: "칼로리", unit: "kcal", op: "≤", presets: PER100G_PRESETS.per100g_calories_max },
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
                <span className="text-[11px] text-muted">{n.unit}/100g</span>
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

      {/* 건강 점수 */}
      <section>
        <h3 className="text-[13px] font-bold text-foreground mb-2">건강 점수</h3>
        <div className="flex flex-wrap gap-1">
          {[
            { label: "60점+", value: 60 },
            { label: "70점+ (우수)", value: 70 },
            { label: "80점+ (최상)", value: 80 },
          ].map(p => (
            <button key={p.value}
              onClick={() => updateNutrition("health_min", nutrition.health_min === p.value ? 0 : p.value)}
              className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${
                nutrition.health_min === p.value
                  ? "bg-green-600/15 text-green-700 dark:text-green-400 font-medium"
                  : "bg-surface text-muted hover:text-foreground/70"
              }`}
              style={{ minHeight: "22px", minWidth: "unset" }}
            >
              {p.label}
            </button>
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

/* ───── 제품 카드 (리디자인: 건강점수 배지 + 매크로 미니 바) ───── */
function ProductCard({ product, isFavorite, onToggleFavorite }: {
  product: ProductWithPrices;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
}) {
  const prices = product.product_prices?.filter(p => p.price && p.price > 0) || [];
  const bestPrice = prices.length > 0 ? Math.min(...prices.map(p => p.price!)) : null;
  const imageUrl = (product as ProductWithPrices & { image_url?: string }).image_url || prices.find(p => p.image_url)?.image_url;
  const matchScore = (product as ProductWithPrices & { match_score?: number }).match_score;
  const tasteScore = (product as ProductWithPrices & { taste_score?: number }).taste_score;
  const nutritionScore = (product as ProductWithPrices & { nutrition_score?: number }).nutrition_score;
  const matchReasons = (product as ProductWithPrices & { match_reasons?: string[] }).match_reasons;

  return (
    <article className="bg-card border border-border rounded-2xl p-4 hover:shadow-md transition-all flex gap-4 relative">
      {/* 이미지 */}
      {imageUrl ? (
        <div className="w-[90px] h-[90px] sm:w-[110px] sm:h-[110px] rounded-xl overflow-hidden shrink-0 bg-surface">
          <img src={imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
      ) : (
        <div className="w-[90px] h-[90px] sm:w-[110px] sm:h-[110px] rounded-xl shrink-0 bg-surface flex items-center justify-center">
          <svg className="w-8 h-8 text-border" viewBox="0 0 24 24" fill="currentColor"
            style={{ minHeight: "unset", minWidth: "unset" }}>
            <path d="M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11 8.76l1-1.36 1 1.36L15.38 12 17 10.83 14.92 8H20v6z"/>
          </svg>
        </div>
      )}

      {/* 즐겨찾기 버튼 */}
      <button
        onClick={(e) => { e.preventDefault(); onToggleFavorite(product.id); }}
        className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-surface transition-colors z-10"
        style={{ minHeight: "28px", minWidth: "28px" }}
        title={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
      >
        <svg className={`w-4 h-4 ${isFavorite ? "text-red-500 fill-red-500" : "text-muted"}`}
          viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}
          style={{ minHeight: "unset", minWidth: "unset" }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>

      {/* 정보 */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* 제목 + 건강점수 배지 */}
        <div className="flex items-start gap-2 mb-1 pr-6">
          <div className="flex-1 min-w-0">
            <Link href={`/products/${product.id}`}
              className="text-[15px] font-bold leading-snug hover:text-primary transition-colors line-clamp-2">
              {product.name}
            </Link>
            {product.manufacturer && (
              <p className="text-[11px] text-muted mt-0.5 truncate">{product.manufacturer}</p>
            )}
          </div>
          {matchScore == null && <HealthBadge score={product.health_score} />}
        </div>

        {/* 3가지 점수 + 태그 */}
        <div className="flex flex-wrap items-center gap-1 mb-1.5">
          {matchScore != null && (
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
              matchScore >= 80 ? "bg-primary text-white"
              : matchScore >= 60 ? "bg-primary/70 text-white"
              : "bg-primary/40 text-white"
            }`} style={{ minHeight: "unset", minWidth: "unset" }}>
              매칭 {matchScore}점
            </span>
          )}
          {tasteScore != null && (
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[#D4A843]/15 text-[#D4A843] font-semibold"
              style={{ minHeight: "unset", minWidth: "unset" }}>
              맛 {tasteScore}
            </span>
          )}
          {nutritionScore != null && (
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[#E06030]/15 text-[#E06030] font-semibold"
              style={{ minHeight: "unset", minWidth: "unset" }}>
              영양 {nutritionScore}
            </span>
          )}
          {matchReasons?.slice(0, 3).map((r: string) => (
            <span key={r} className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium"
              style={{ minHeight: "unset", minWidth: "unset" }}>
              {r}
            </span>
          ))}
          {!matchReasons?.length && product.functional_tags?.slice(0, 2).map((t: string) => (
            <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-primary/8 text-primary/80 font-medium"
              style={{ minHeight: "unset", minWidth: "unset" }}>
              {ALL_TAG_LABELS[t] || t}
            </span>
          ))}
        </div>

        {/* 칼로리 + 가격 행 */}
        <div className="flex items-baseline justify-between mt-auto">
          {product.calories != null && (
            <span className="text-xs text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "14px", fontWeight: 600, color: "var(--color-foreground)" }}>
                {Math.round(product.calories)}
              </span>
              <span className="ml-0.5">kcal</span>
            </span>
          )}
          {bestPrice ? (
            <span style={{ fontFamily: "'Outfit', sans-serif", fontVariantNumeric: "tabular-nums" }}
              className="text-base font-bold">
              {formatPrice(bestPrice)}
            </span>
          ) : (
            <span className="text-[11px] text-muted">가격 수집 중</span>
          )}
        </div>

        {/* 매크로 미니 바 */}
        <MacroMiniBars
          protein={product.protein_g}
          carbs={(product as ProductWithPrices & { carbs_g?: number | null }).carbs_g ?? null}
          fat={(product as ProductWithPrices & { fat_g?: number | null }).fat_g ?? null}
          sodium={product.sodium_mg}
        />
      </div>
    </article>
  );
}

/* ───── 메인 컴포넌트 ───── */
export default function ProductExplorer() {
  const { isFavorite, toggleFavorite } = useFavorites();
  const [tastes, setTastes] = useState<TasteFilters>({ salty: 0, sweet: 0, spicy: 0, fatty: 0 });
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<DishCategory[]>([]);
  const [selectedPurposes, setSelectedPurposes] = useState<string[]>([]);
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  const [hasPriceOnly, setHasPriceOnly] = useState(true);
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(0);
  const [nutrition, setNutrition] = useState<NutritionFilters>(INITIAL_NUTRITION);
  const [sortBy, setSortBy] = useState<SortOption>("recommend"); // 기본: 추천순
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // 프로필 로드
  useEffect(() => {
    try {
      const raw = localStorage.getItem("carefood_profile");
      if (raw) {
        const p = JSON.parse(raw);
        setProfile(p);
      }
    } catch { /* */ }
    setProfileLoaded(true);
  }, []);

  // 프로필 요약 (상단 칩 표시용)
  const profileSummary = useMemo(() => {
    if (!profile) return null;
    const goals = (profile.goals || profile.concerns || []) as string[];
    const labels = goals.map((g: string) => GOAL_LABELS[g] || g).filter(Boolean);
    return labels.length > 0 ? labels.join(" · ") : null;
  }, [profile]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tastes.salty) params.set("salty", String(tastes.salty));
      if (tastes.sweet) params.set("sweet", String(tastes.sweet));
      if (tastes.spicy) params.set("spicy", String(tastes.spicy));
      if (tastes.fatty) params.set("fatty", String(tastes.fatty));
      if (search) params.set("q", search);
      if (selectedCategories.length > 0) params.set("dish_category", selectedCategories.join(","));
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
      if (nutrition.per100g_sugar_max > 0) params.set("per100g_sugar_max", String(nutrition.per100g_sugar_max));
      if (nutrition.per100g_sodium_max > 0) params.set("per100g_sodium_max", String(nutrition.per100g_sodium_max));
      if (nutrition.per100g_protein_min > 0) params.set("per100g_protein_min", String(nutrition.per100g_protein_min));
      if (nutrition.per100g_calories_max > 0) params.set("per100g_calories_max", String(nutrition.per100g_calories_max));
      if (nutrition.health_min > 0) params.set("health_min", String(nutrition.health_min));
      const needsProfile = ["recommend", "taste_desc", "nutrition_desc"].includes(sortBy);
      params.set("sort", needsProfile ? "recommend" : sortBy);
      params.set("page", String(page));
      params.set("limit", "20");

      let res: Response;
      if (needsProfile && profile) {
        // 추천/맛/영양순: POST로 프로필 전송 → 3가지 점수 계산
        res = await fetch(`/api/products?${params.toString()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            concerns: profile.concerns || [],
            goals: profile.goals || [],
            conditions: profile.conditions || [],
            sensitivity: profile.sensitivity || { digestive: 2, additive: 2 },
            tastes: profile.tastes || { salty: 5, sweet: 5, spicy: 5, fatty: 5 },
            nutrition_goals: profile.nutrition_goals || undefined,
          }),
        });
      } else {
        res = await fetch(`/api/products?${params.toString()}`);
      }
      if (!res.ok) throw new Error("Failed to fetch");
      const json: ApiResponse = await res.json();

      // 맛순/영양순: 클라이언트에서 재정렬
      if (sortBy === "taste_desc" && json.products) {
        json.products.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
          ((b as { taste_score?: number }).taste_score ?? 0) - ((a as { taste_score?: number }).taste_score ?? 0)
        );
      } else if (sortBy === "nutrition_desc" && json.products) {
        json.products.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
          ((b as { nutrition_score?: number }).nutrition_score ?? 0) - ((a as { nutrition_score?: number }).nutrition_score ?? 0)
        );
      }

      setData(json);
    } catch (err) {
      console.error("Failed to fetch products:", err);
    } finally {
      setLoading(false);
    }
  }, [tastes, search, selectedCategories, selectedPurposes, selectedIngredients, hasPriceOnly, priceMin, priceMax, nutrition, sortBy, page, profile]);

  useEffect(() => { if (profileLoaded) fetchProducts(); }, [profileLoaded, fetchProducts]);

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
    setSelectedCategories([]); setSelectedPurposes([]); setSelectedIngredients([]);
    setHasPriceOnly(false); setPriceMin(0); setPriceMax(0);
    setNutrition(INITIAL_NUTRITION); setPage(1);
  };

  const activeFilterCount = selectedCategories.length + selectedPurposes.length + selectedIngredients.length
    + (priceMin > 0 || priceMax > 0 ? 1 : 0)
    + Object.values(nutrition).filter(v => v > 0).length
    + Object.values(tastes).filter(v => v > 0).length
    + (hasPriceOnly ? 1 : 0);

  return (
    <div>
      {/* 프로필 요약 칩 */}
      {profileSummary && (
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
            <span className="text-xs font-medium text-primary">{profileSummary}</span>
          </div>
          <Link href="/onboarding" className="text-[11px] text-muted hover:text-primary transition-colors">수정</Link>
        </div>
      )}
      {!profile && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-surface border border-border/50">
          <span className="text-xs text-muted">프로필을 설정하면 맞춤 추천을 받을 수 있어요</span>
          <Link href="/onboarding" className="text-xs text-primary font-medium hover:underline shrink-0">설정하기</Link>
        </div>
      )}

      {/* 검색 */}
      <form onSubmit={handleSearch} className="mb-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              style={{ minHeight: "unset", minWidth: "unset" }}>
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input type="text" value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="제품명으로 검색 (예: 닭가슴살, 샐러드...)"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <button type="submit"
            className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary-dark transition-colors">
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
                sortBy === opt.value ? "bg-primary text-white" : "text-muted hover:text-foreground"
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
                categories={selectedCategories} onCategoryToggle={k => { setSelectedCategories(prev => prev.includes(k) ? prev.filter(c => c !== k) : [...prev, k]); setPage(1); }}
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
              categories={selectedCategories} onCategoryToggle={k => { setSelectedCategories(prev => prev.includes(k) ? prev.filter(c => c !== k) : [...prev, k]); setPage(1); }}
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
            {data ? (
              <><span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 600 }} className="text-foreground">{(data.total ?? 0).toLocaleString()}</span>개 제품{search && <span className="text-muted"> · &quot;{search}&quot; 검색 결과</span>}</>
            ) : "로딩 중..."}
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
                  <ProductCard key={product.id} product={product}
                    isFavorite={isFavorite(product.id)}
                    onToggleFavorite={toggleFavorite} />
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
