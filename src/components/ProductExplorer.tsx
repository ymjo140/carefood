"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import type { ProductWithPrices, TasteLevel, DishCategory } from "@/types/database";
import { DISH_CATEGORY_LABELS } from "@/types/database";
import { useFavorites } from "@/hooks/useFavorites";
import { Badge, Button, Card, Chip, cn, EmptyState, Icon, IconButton, Input, Kcal, MACRO_META, Notice, Price, ProgressBar, SearchField, SectionHeader, Sheet, SkeletonList, Tabs, TextLink, type BadgeTone, type Macro } from "@/components/ui";

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
const TASTE_BENCHMARKS: Record<string, Record<number, string>> = {
  salty: { 2: "흰밥", 4: "계란찜", 6: "김치찌개", 8: "라면", 10: "간장게장" },
  sweet: { 2: "우유", 4: "식빵", 6: "콜라", 8: "아이스크림", 10: "초콜릿" },
  spicy: { 2: "짜장면", 4: "김치", 6: "떡볶이", 8: "신라면", 10: "불닭볶음면" },
  fatty: { 2: "닭가슴살", 4: "두부", 6: "계란찜", 8: "삼겹살", 10: "버터" },
};

function getTasteBenchmarkLabel(key: string, level: number): string {
  if (level === 0) return "전체";
  const benchmarks = TASTE_BENCHMARKS[key];
  if (!benchmarks) return `${level}`;
  // 정확히 일치하는 벤치마크
  if (benchmarks[level]) return `${benchmarks[level]} 정도`;
  // 가장 가까운 벤치마크
  const levels = Object.keys(benchmarks).map(Number).sort((a, b) => a - b);
  let closest = levels[0];
  for (const l of levels) { if (Math.abs(l - level) < Math.abs(closest - level)) closest = l; }
  return `${benchmarks[closest]} 정도`;
}

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

/* ───── 매크로 미니 바 (100g당 값의 하루 기준 대비) ───── */
function MacroMiniBars({ protein, carbs, fat, sodium }: {
  protein: number | null; carbs: number | null; fat: number | null; sodium: number | null;
}) {
  const items: { macro: Macro; value: number | null; max: number }[] = [
    { macro: "protein", value: protein, max: 80 },
    { macro: "carbs", value: carbs, max: 260 },
    { macro: "fat", value: fat, max: 60 },
    { macro: "sodium", value: sodium, max: 2000 },
  ];
  if (items.every(i => i.value == null)) return null;
  return (
    <div className="flex gap-1.5 mt-2.5">
      {items.map(item => (
        <ProgressBar key={item.macro} className="flex-1 min-w-0 h-1" value={item.value ?? 0} max={item.max}
          tone={item.macro} label={`${MACRO_META[item.macro].label} 하루 기준 대비`} />
      ))}
    </div>
  );
}

/* ───── 건강점수 원형 배지 ───── */
const HEALTH_TONE = {
  high: { stroke: "stroke-positive", text: "text-positive" },
  mid: { stroke: "stroke-brand", text: "text-brand-ink" },
  low: { stroke: "stroke-ink-3", text: "text-ink-2" },
} as const;

function HealthBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const tone = score >= 80 ? HEALTH_TONE.high : score >= 60 ? HEALTH_TONE.mid : HEALTH_TONE.low;
  const r = 15;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  return (
    <div className="relative size-10 shrink-0" title={`건강점수 ${score}`}>
      <svg viewBox="0 0 36 36" className="size-10" aria-hidden="true">
        <circle cx="18" cy="18" r={r} className="fill-sunken" />
        <circle cx="18" cy="18" r={r} fill="none" className={cn(tone.stroke, "transition-[stroke-dashoffset] duration-420 ease-out")} strokeWidth="2.5"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" transform="rotate(-90 18 18)" />
      </svg>
      <span className={cn("absolute inset-0 flex items-center justify-center num text-caption font-bold", tone.text)}>{score}</span>
      <span className="sr-only">건강점수 {score}점</span>
    </div>
  );
}

/* ───── 필터 구역 ───── */
function FilterGroup({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-label font-bold text-ink">{title}</h3>
        {description && <p className="text-caption text-ink-2 mt-0.5">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/* ───── 영양 조건 한 줄 ───── */
function NutritionRow({ label, op, unit, value, presets, onChange }: {
  label: string; op: string; unit: string; value: number;
  presets: { label: string; value: number }[]; onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-label font-medium text-ink w-16 shrink-0">{label}</span>
        <span className="text-caption text-ink-2 shrink-0">{op}</span>
        <Input type="number" inputMode="numeric" value={value || ""} placeholder="0" aria-label={`${label} ${op}`}
          onChange={e => onChange(Number(e.target.value) || 0)} className="w-20 min-w-0 text-center num" />
        <span className="text-caption text-ink-2 shrink-0">{unit}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map(p => (
          <Chip key={p.label} size="sm" selected={value === p.value} onClick={() => onChange(value === p.value ? 0 : p.value)}>{p.label}</Chip>
        ))}
      </div>
    </div>
  );
}

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
  onReset?: () => void;
}) {
  const isPriceActive = (p: typeof PRICE_PRESETS[number]) =>
    priceMin === p.min && priceMax === p.max && (p.min > 0 || p.max > 0);

  const updateNutrition = <K extends keyof NutritionFilters>(key: K, value: number) => {
    onNutritionChange({ ...nutrition, [key]: value });
  };

  return (
    <div className="flex flex-col gap-6">
      <FilterGroup title="음식 종류">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_FILTERS.map(cat => (
            <Chip key={cat} size="sm" selected={categories.includes(cat)} onClick={() => onCategoryToggle(cat)}>
              {DISH_CATEGORY_LABELS[cat]}
            </Chip>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="목적">
        <div className="flex flex-wrap gap-1.5">
          {PURPOSE_OPTIONS.map(opt => (
            <Chip key={opt.key} size="sm" selected={purposes.includes(opt.key)} onClick={() => onPurposeToggle(opt.key)}>{opt.label}</Chip>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="성분">
        <div className="flex flex-wrap gap-1.5">
          {INGREDIENT_OPTIONS.map(opt => (
            <Chip key={opt.key} size="sm" selected={ingredients.includes(opt.key)} onClick={() => onIngredientToggle(opt.key)}>{opt.label}</Chip>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="가격대">
        <div className="flex items-center gap-2">
          <Input type="number" inputMode="numeric" value={priceMin || ""} placeholder="최소" aria-label="최소 가격"
            onChange={e => onPriceChange(Number(e.target.value) || 0, priceMax)} className="flex-1 min-w-0 text-center num" />
          <span className="text-caption text-ink-2">~</span>
          <Input type="number" inputMode="numeric" value={priceMax || ""} placeholder="최대" aria-label="최대 가격"
            onChange={e => onPriceChange(priceMin, Number(e.target.value) || 0)} className="flex-1 min-w-0 text-center num" />
          <span className="text-caption text-ink-2">원</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRICE_PRESETS.map(p => (
            <Chip key={p.label} size="sm" selected={isPriceActive(p)}
              onClick={() => { if (isPriceActive(p)) onPriceChange(0, 0); else onPriceChange(p.min, p.max); }}>
              {p.label}
            </Chip>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="영양 조건" description="1회 제공량 기준">
        <div className="flex flex-col gap-4">
          {([
            { key: "protein_min" as const, label: "단백질", unit: "g", op: "≥", presets: NUTRITION_PRESETS.protein_min },
            { key: "calories_max" as const, label: "칼로리", unit: "kcal", op: "≤", presets: NUTRITION_PRESETS.calories_max },
            { key: "sodium_max" as const, label: "나트륨", unit: "mg", op: "≤", presets: NUTRITION_PRESETS.sodium_max },
            { key: "sugar_max" as const, label: "당류", unit: "g", op: "≤", presets: NUTRITION_PRESETS.sugar_max },
            // 식이섬유 거르기는 뺐다 — DB 에 믿을 만한 값이 없다(2026-11 정리). URL 의 fiber_min 은 계속 받는다
          ]).map(n => (
            <NutritionRow key={n.key} label={n.label} op={n.op} unit={n.unit} value={nutrition[n.key]} presets={n.presets}
              onChange={v => updateNutrition(n.key, v)} />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="100g당 기준" description="제품 크기와 무관하게 영양 밀도로 비교">
        <div className="flex flex-col gap-4">
          {([
            { key: "per100g_sugar_max" as const, label: "당류", unit: "g", op: "≤", presets: PER100G_PRESETS.per100g_sugar_max },
            { key: "per100g_sodium_max" as const, label: "나트륨", unit: "mg", op: "≤", presets: PER100G_PRESETS.per100g_sodium_max },
            { key: "per100g_protein_min" as const, label: "단백질", unit: "g", op: "≥", presets: PER100G_PRESETS.per100g_protein_min },
            { key: "per100g_calories_max" as const, label: "칼로리", unit: "kcal", op: "≤", presets: PER100G_PRESETS.per100g_calories_max },
          ]).map(n => (
            <NutritionRow key={n.key} label={n.label} op={n.op} unit={n.unit} value={nutrition[n.key]} presets={n.presets}
              onChange={v => updateNutrition(n.key, v)} />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="건강 점수">
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: "60점 이상", value: 60 },
            { label: "70점 이상 (우수)", value: 70 },
            { label: "80점 이상 (최상)", value: 80 },
          ].map(p => (
            <Chip key={p.value} size="sm" selected={nutrition.health_min === p.value}
              onClick={() => updateNutrition("health_min", nutrition.health_min === p.value ? 0 : p.value)}>
              {p.label}
            </Chip>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="맛">
        <div className="flex flex-col gap-3">
          {TASTE_CONFIG.map(taste => (
            <div key={taste.key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-label font-medium text-ink">{taste.label}</span>
                <span className={cn("text-caption", tastes[taste.key] ? "text-brand-ink font-medium" : "text-ink-2")}>
                  {getTasteBenchmarkLabel(taste.key, tastes[taste.key])}
                </span>
              </div>
              <input
                type="range" min={0} max={10} step={1}
                value={tastes[taste.key]}
                aria-label={taste.label}
                onChange={e => onTasteChange({ ...tastes, [taste.key]: Number(e.target.value) as TasteLevel | 0 })}
                className="ds-range"
              />
            </div>
          ))}
        </div>
      </FilterGroup>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={hasPriceOnly} onChange={e => onHasPriceOnlyChange(e.target.checked)} className="ds-check" />
        <span className="text-label text-ink">구매 가능한 제품만</span>
      </label>

      {onReset && (
        <Button variant="ghost" size="sm" block icon="refresh" onClick={onReset}>필터 초기화하기</Button>
      )}
    </div>
  );
}

/* ───── 제품 카드 ───── */
function scoreTone(s: number): BadgeTone {
  return s >= 80 ? "positive" : s >= 60 ? "brand" : "neutral";
}

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
  const href = `/products/${product.id}`;

  return (
    <Card className="flex gap-4 relative">
      {/* 이미지 */}
      <Link href={href} tabIndex={-1} aria-hidden="true" className="size-22 sm:size-28 rounded-md overflow-hidden shrink-0 bg-sunken">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {imageUrl ? <img src={imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" /> : null}
      </Link>

      {/* 즐겨찾기 */}
      <IconButton
        icon="heart" size="sm" active={isFavorite}
        label={isFavorite ? "즐겨찾기 해제하기" : "즐겨찾기에 추가하기"}
        onClick={(e) => { e.preventDefault(); onToggleFavorite(product.id); }}
        className="absolute top-2 right-2 z-10"
      />

      {/* 정보 */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-start gap-2 mb-1.5 pr-8">
          <div className="flex-1 min-w-0">
            <Link href={href} className="block py-1 text-body font-bold text-ink hover:text-brand-ink transition-colors line-clamp-2">
              {product.name}
            </Link>
            {product.manufacturer && (
              <p className="text-caption text-ink-2 mt-0.5 truncate">{product.manufacturer}</p>
            )}
          </div>
          {matchScore == null && <HealthBadge score={product.health_score} />}
        </div>

        {/* 점수 + 태그 */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {matchScore != null && <Badge tone={scoreTone(matchScore)} className="font-bold">매칭 <span className="num">{matchScore}</span>점</Badge>}
          {tasteScore != null && <Badge>맛 <span className="num">{tasteScore}</span></Badge>}
          {nutritionScore != null && <Badge>영양 <span className="num">{nutritionScore}</span></Badge>}
          {matchReasons?.slice(0, 3).map((r: string) => <Badge key={r} tone="brand">{r}</Badge>)}
          {!matchReasons?.length && product.functional_tags?.slice(0, 2).map((t: string) => (
            <Badge key={t} tone="brand">{ALL_TAG_LABELS[t] || t}</Badge>
          ))}
        </div>

        {/* 칼로리 + 가격 */}
        <div className="flex items-baseline justify-between gap-3 mt-auto">
          {product.calories != null ? <Kcal value={product.calories} className="text-label" /> : <span />}
          {bestPrice ? (
            <Price value={bestPrice} className="text-body" />
          ) : (
            <span className="text-caption text-ink-3">가격 수집 중</span>
          )}
        </div>

        <MacroMiniBars
          protein={product.protein_g}
          carbs={(product as ProductWithPrices & { carbs_g?: number | null }).carbs_g ?? null}
          fat={(product as ProductWithPrices & { fat_g?: number | null }).fat_g ?? null}
          sodium={product.sodium_mg}
        />
      </div>
    </Card>
  );
}

/* ───── 메인 컴포넌트 ─────
 * variant="home": 홈 아래쪽 '전체 제품' — 검색 줄·프로필 안내는 홈 위쪽이 맡는다
 * variant="page": /products 검색 결과 — 주소의 q·cat·protein_min·kind·focus 로 시작한다 (홈 검색 줄·카테고리에서 들어옴)
 */
export default function ProductExplorer({ variant = "page" }: { variant?: "page" | "home" }) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const [kind, setKind] = useState<"meal_service" | null>(null);
  const [error, setError] = useState(false);
  const [autoFocus, setAutoFocus] = useState(false);
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
    } catch { /* */ } // ds-allow: 로컬 프로필 읽기
    if (variant === "page") {
      // 홈 검색 줄·카테고리에서 넘어온 조건
      const sp = new URLSearchParams(window.location.search);
      const q = sp.get("q");
      if (q) { setSearch(q); setSearchInput(q); }
      const cat = (sp.get("cat") || "").split(",").filter((c): c is DishCategory => c in DISH_CATEGORY_LABELS);
      if (cat.length) setSelectedCategories(cat);
      const proteinMin = Number(sp.get("protein_min") || 0);
      if (proteinMin > 0) setNutrition((n) => ({ ...n, protein_min: proteinMin }));
      if (sp.get("kind") === "meal_service") setKind("meal_service");
      setAutoFocus(sp.has("focus"));
    }
    setProfileLoaded(true);
  }, [variant]);

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
      if (kind) params.set("kind", kind);
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
      // 알레르기 필터 (프로필에서 자동 적용)
      const userAllergies: string[] = profile?.allergies || [];
      if (userAllergies.length > 0) params.set("allergies", userAllergies.join(","));
      const needsProfile = ["recommend", "taste_desc", "nutrition_desc"].includes(sortBy);
      params.set("sort", needsProfile ? "recommend" : sortBy);
      if (needsProfile) params.set("rank", sortBy); // 서버가 후보 전체를 이 기준으로 정렬한다
      params.set("page", String(page));
      params.set("limit", "20");

      let res: Response;
      if (needsProfile && profile) {
        // 추천/맛/영양순: POST로 프로필 전송 → 3가지 점수 계산
        res = await fetch(`/api/products?${params.toString()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // 홈 추천과 같은 프로필 그대로 — 서버가 lib/recommend 로 같은 점수를 매긴다
          body: JSON.stringify(profile),
        });
      } else {
        res = await fetch(`/api/products?${params.toString()}`);
      }
      if (!res.ok) throw new Error(`제품 목록 ${res.status}`);
      const json: ApiResponse = await res.json();

      setData(json);
      setError(false);
    } catch (err) {
      console.error("제품 목록을 불러오지 못했어요:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [tastes, search, selectedCategories, selectedPurposes, selectedIngredients, hasPriceOnly, kind, priceMin, priceMax, nutrition, sortBy, page, profile]);

  useEffect(() => { if (profileLoaded) fetchProducts(); }, [profileLoaded, fetchProducts]);

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
    // 뒤로 갔다 와도 같은 검색이 남게 주소에 적어 둔다
    if (variant === "page") {
      const sp = new URLSearchParams(window.location.search);
      sp.delete("focus");
      if (searchInput) sp.set("q", searchInput); else sp.delete("q");
      const qs = sp.toString();
      window.history.replaceState(null, "", qs ? `/products?${qs}` : "/products");
    }
  };

  const toggleList = (list: string[], key: string) =>
    list.includes(key) ? list.filter(k => k !== key) : [...list, key];

  const resetAll = () => {
    setTastes({ salty: 0, sweet: 0, spicy: 0, fatty: 0 });
    setSearch(""); setSearchInput("");
    setSelectedCategories([]); setSelectedPurposes([]); setSelectedIngredients([]);
    setHasPriceOnly(false); setPriceMin(0); setPriceMax(0); setKind(null);
    setNutrition(INITIAL_NUTRITION); setPage(1);
  };

  const activeFilterCount = selectedCategories.length + selectedPurposes.length + selectedIngredients.length
    + (kind ? 1 : 0)
    + (priceMin > 0 || priceMax > 0 ? 1 : 0)
    + Object.values(nutrition).filter(v => v > 0).length
    + Object.values(tastes).filter(v => v > 0).length
    + (hasPriceOnly ? 1 : 0);

  const filterProps = {
    categories: selectedCategories,
    onCategoryToggle: (k: DishCategory) => { setSelectedCategories(prev => prev.includes(k) ? prev.filter(c => c !== k) : [...prev, k]); setPage(1); },
    purposes: selectedPurposes,
    onPurposeToggle: (k: string) => { setSelectedPurposes(toggleList(selectedPurposes, k)); setPage(1); },
    ingredients: selectedIngredients,
    onIngredientToggle: (k: string) => { setSelectedIngredients(toggleList(selectedIngredients, k)); setPage(1); },
    priceMin, priceMax,
    onPriceChange: (min: number, max: number) => { setPriceMin(min); setPriceMax(max); setPage(1); },
    nutrition,
    onNutritionChange: (n: NutritionFilters) => { setNutrition(n); setPage(1); },
    tastes,
    onTasteChange: (t: TasteFilters) => { setTastes(t); setPage(1); },
    hasPriceOnly,
    onHasPriceOnlyChange: (v: boolean) => { setHasPriceOnly(v); setPage(1); },
  };

  return (
    <div>
      {variant === "page" && (
        <>
          {/* 프로필 요약 */}
          {profileSummary && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Badge tone="brand">{profileSummary}</Badge>
              <TextLink href="/onboarding" className="text-caption">수정하기</TextLink>
            </div>
          )}
          {profileLoaded && !profile && (
            <Notice className="mb-3">
              프로필을 설정하면 맞춤 추천을 받을 수 있어요{" "}
              <TextLink href="/onboarding">설정하기</TextLink>
            </Notice>
          )}

          {/* 검색 */}
          <div className="mb-4">
            <SearchField value={searchInput} onChange={setSearchInput} onSubmit={handleSearch} autoFocus={autoFocus}
              placeholder="제품명으로 검색 (예: 닭가슴살, 샐러드)" />
          </div>
        </>
      )}
      {variant === "home" && <SectionHeader title="전체 제품" className="mb-1" />}

      {/* 필터 + 정렬 */}
      <div className="flex items-center gap-2 mb-4 sticky top-14 z-30 bg-canvas py-2 border-b border-line">
        <Button variant="secondary" size="sm" icon="filter" className="lg:hidden shrink-0" onClick={() => setMobileFilterOpen(true)}>
          필터{activeFilterCount > 0 && <span className="num text-brand-ink">{activeFilterCount}</span>}
        </Button>
        {kind && (
          <Chip size="sm" selected className="shrink-0" aria-label="건강식단 서비스 조건 빼기" onClick={() => { setKind(null); setPage(1); }}>
            건강식단 서비스 <Icon name="close" size={14} />
          </Chip>
        )}
        <Tabs label="정렬" className="flex-1 min-w-0" value={sortBy}
          onChange={(v) => { setSortBy(v); setPage(1); }}
          items={SORT_OPTIONS.map(o => ({ value: o.value, label: o.label }))} />
      </div>

      {/* 모바일 필터 시트 */}
      <Sheet
        open={mobileFilterOpen}
        onClose={() => setMobileFilterOpen(false)}
        title="필터"
        footer={
          <>
            <Button variant="secondary" block onClick={() => { resetAll(); setMobileFilterOpen(false); }}>초기화하기</Button>
            <Button block onClick={() => setMobileFilterOpen(false)}>결과 보기</Button>
          </>
        }
      >
        <FilterPanel {...filterProps} />
      </Sheet>

      {/* 사이드바 + 제품 목록 */}
      <div className="flex gap-8">
        <aside className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-32 pt-2 max-h-[calc(100dvh-9rem)] overflow-y-auto pr-2">
            <FilterPanel {...filterProps} onReset={resetAll} />
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <p className="text-label text-ink-2 mb-3">
            {data ? (
              <><span className="num font-bold text-ink">{(data.total ?? 0).toLocaleString()}</span>개 제품{search && <> · &quot;{search}&quot; 검색 결과</>}</>
            ) : error ? "" : "불러오는 중"}
          </p>

          {error && !loading ? (
            <Card className="flex flex-col items-start gap-3">
              <p className="text-label text-ink">제품 목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요</p>
              <Button variant="secondary" size="sm" icon="refresh" onClick={fetchProducts}>다시 불러오기</Button>
            </Card>
          ) : loading && !data ? (
            <SkeletonList rows={5} />
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
                <nav aria-label="페이지" className="flex items-center justify-center gap-3 mt-8">
                  <Button variant="secondary" size="sm" icon="chevron-left" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>이전</Button>
                  <span className="num text-label text-ink-2">{data.page} / {data.totalPages}</span>
                  <Button variant="secondary" size="sm" iconRight="chevron-right" onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page >= data.totalPages}>다음</Button>
                </nav>
              )}
            </>
          ) : (
            <EmptyState
              title="조건에 맞는 제품이 없어요"
              description="필터를 줄이거나 다른 검색어로 찾아보세요"
              action={<Button variant="secondary" size="sm" icon="refresh" onClick={resetAll}>필터 초기화하기</Button>}
            />
          )}
        </div>
      </div>
    </div>
  );
}
