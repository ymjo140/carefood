"use client";

import { useImpressions } from "@/lib/impressions";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "@/components/ui/AppLink";
import type { ProductWithPrices, TasteLevel } from "@/types/database";
import { FOOD_TYPES, FOOD_TYPE_LABEL, legacyFoodTypes, type FoodType } from "@/lib/food-types";
import { useFavorites } from "@/hooks/useFavorites";
import { defaultServingG, scaleNutrient } from "@/lib/serving";
import { platformLabel } from "@/lib/platforms";
import { Badge, Button, Card, Chip, cn, Disclosure, EmptyState, Icon, IconButton, Input, dailyRefNote, Kcal, MacroBars, Notice, Price, ProductImage, RangeInput, SearchField, SectionHeader, Sheet, SkeletonList, Tabs, TextLink, type BadgeTone } from "@/components/ui";

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
  /** 추천순 기본 목록 — 한 끼·반찬만 (api/products mealsOnly) */
  meals_only?: boolean;
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

/* ───── 목적 — 영양 조건 바로가기 ─────
 * 효능이 아니라 숫자 조건이다. 고르면 영양 조건(1회분)이 채워지고, 영양 조건에서 값을 바꾸면 풀린다.
 * (예전 '목적'·'성분'은 기능 태그로 걸렀는데 태그가 붙은 제품이 4%뿐이라 뺐다 — 2026-11-21)
 */
const GOAL_SHORTCUTS = [
  { key: "weight", label: "체중 관리", field: "calories_max", value: 400, rule: "1회 400kcal 이하" },
  { key: "protein", label: "단백질 챙기기", field: "protein_min", value: 20, rule: "1회 단백질 20g 이상" },
  { key: "sugar", label: "당 줄이기", field: "sugar_max", value: 5, rule: "1회 당류 5g 이하" },
  { key: "sodium", label: "싱겁게", field: "sodium_max", value: 600, rule: "1회 나트륨 600mg 이하" },
] as const;

/** 제품 카드의 기능 태그 이름 (functional_tags — 있는 제품만) */
const ALL_TAG_LABELS: Record<string, string> = {
  probiotics: "유산균", collagen: "콜라겐", prebiotic: "식이섬유", vitamin: "비타민", omega3: "오메가3",
  calcium: "칼슘", iron: "철분", zinc: "아연", lutein: "루테인", protein: "고단백", sugar_free: "무설탕", diet: "다이어트",
};

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
  // 100g당 기준
  per100g_sugar_max: number;
  per100g_sodium_max: number;
  per100g_protein_min: number;
  per100g_calories_max: number;
};

const INITIAL_NUTRITION: NutritionFilters = {
  protein_min: 0, calories_max: 0, sodium_max: 0, sugar_max: 0,
  per100g_sugar_max: 0, per100g_sodium_max: 0, per100g_protein_min: 0, per100g_calories_max: 0,
};

/** 영양 조건 한 줄씩 — 요약·고른 조건 칩·입력 줄이 같은 목록을 쓴다 */
const NUTRITION_FIELDS: { key: keyof NutritionFilters; label: string; unit: string; op: "≥" | "≤"; per100: boolean; presets: { label: string; value: number }[] }[] = [
  { key: "protein_min", label: "단백질", unit: "g", op: "≥", per100: false, presets: NUTRITION_PRESETS.protein_min },
  { key: "calories_max", label: "칼로리", unit: "kcal", op: "≤", per100: false, presets: NUTRITION_PRESETS.calories_max },
  { key: "sodium_max", label: "나트륨", unit: "mg", op: "≤", per100: false, presets: NUTRITION_PRESETS.sodium_max },
  { key: "sugar_max", label: "당류", unit: "g", op: "≤", per100: false, presets: NUTRITION_PRESETS.sugar_max },
  { key: "per100g_protein_min", label: "단백질", unit: "g", op: "≥", per100: true, presets: PER100G_PRESETS.per100g_protein_min },
  { key: "per100g_calories_max", label: "칼로리", unit: "kcal", op: "≤", per100: true, presets: PER100G_PRESETS.per100g_calories_max },
  { key: "per100g_sodium_max", label: "나트륨", unit: "mg", op: "≤", per100: true, presets: PER100G_PRESETS.per100g_sodium_max },
  { key: "per100g_sugar_max", label: "당류", unit: "g", op: "≤", per100: true, presets: PER100G_PRESETS.per100g_sugar_max },
];

/** "단백질 20g 이상" · "100g당 당류 5g 이하" */
function nutritionText(f: (typeof NUTRITION_FIELDS)[number], v: number) {
  return `${f.per100 ? "100g당 " : ""}${f.label} ${v.toLocaleString()}${f.unit} ${f.op === "≥" ? "이상" : "이하"}`;
}

/* ───── 매크로 미니 바 (100g당 값의 하루 기준 대비) ───── */
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

/* ───── 필터 패널 — 묶음마다 접고, 누르면 펼쳐 고른다 (넓은 화면 왼쪽 열 · 휴대폰 시트 같은 구성) ───── */
function FilterPanel({
  types, onTypeToggle,
  priceMin, priceMax, onPriceChange,
  nutrition, onNutritionChange,
  tastes, onTasteChange,
  onReset,
}: {
  types: FoodType[];
  onTypeToggle: (key: FoodType) => void;
  priceMin: number;
  priceMax: number;
  onPriceChange: (min: number, max: number) => void;
  nutrition: NutritionFilters;
  onNutritionChange: (n: NutritionFilters) => void;
  tastes: TasteFilters;
  onTasteChange: (t: TasteFilters) => void;
  onReset?: () => void;
}) {
  const [basis, setBasis] = useState<"serving" | "per100">("serving");
  const isPriceActive = (p: typeof PRICE_PRESETS[number]) =>
    priceMin === p.min && priceMax === p.max && (p.min > 0 || p.max > 0);
  const priceLabel = PRICE_PRESETS.find(isPriceActive)?.label
    ?? (priceMin > 0 || priceMax > 0 ? `${priceMin ? priceMin.toLocaleString() : ""}~${priceMax ? priceMax.toLocaleString() : ""}원` : null);

  const goals = GOAL_SHORTCUTS.filter((g) => nutrition[g.field] === g.value);
  const nutritionOn = NUTRITION_FIELDS.filter((f) => nutrition[f.key] > 0);
  const tastesOn = TASTE_CONFIG.filter((t) => tastes[t.key] > 0);

  const toggleGoal = (g: (typeof GOAL_SHORTCUTS)[number]) =>
    onNutritionChange({ ...nutrition, [g.field]: nutrition[g.field] === g.value ? 0 : g.value });

  return (
    <div className="flex flex-col border-t border-line">
      <Disclosure title="음식 종류" defaultOpen
        summary={types.length ? types.map((t) => FOOD_TYPE_LABEL[t]).join(" · ") : "전체"} active={types.length > 0}>
        <div className="flex flex-wrap gap-1.5">
          {FOOD_TYPES.map((t) => (
            <Chip key={t.key} size="sm" selected={types.includes(t.key)} onClick={() => onTypeToggle(t.key)}>{t.label}</Chip>
          ))}
        </div>
      </Disclosure>

      <Disclosure title="목적" summary={goals.length ? goals.map((g) => g.label).join(" · ") : "전체"} active={goals.length > 0}>
        <div className="flex flex-wrap gap-1.5">
          {GOAL_SHORTCUTS.map((g) => (
            <Chip key={g.key} size="sm" selected={nutrition[g.field] === g.value} onClick={() => toggleGoal(g)}>{g.label}</Chip>
          ))}
        </div>
        <p className="text-caption text-ink-2 mt-2">
          고르면 영양 조건이 채워져요{goals.length > 0 && <> · {goals.map((g) => `${g.label} = ${g.rule}`).join(" · ")}</>}
        </p>
      </Disclosure>

      <Disclosure title="영양 조건" summary={nutritionOn.length ? nutritionOn.map((f) => nutritionText(f, nutrition[f.key])).join(" · ") : "전체"}
        active={nutritionOn.length > 0}>
        <Tabs variant="line" label="영양 기준" className="mb-3" value={basis} onChange={setBasis}
          items={[{ value: "serving", label: "1회분" }, { value: "per100", label: "100g당" }]} />
        <div className="flex flex-col gap-4">
          {NUTRITION_FIELDS.filter((f) => f.per100 === (basis === "per100")).map((f) => (
            <NutritionRow key={f.key} label={f.label} op={f.op} unit={f.unit} value={nutrition[f.key]} presets={f.presets}
              onChange={(v) => onNutritionChange({ ...nutrition, [f.key]: v })} />
          ))}
        </div>
      </Disclosure>

      <Disclosure title="맛" summary={tastesOn.length ? tastesOn.map((t) => `${t.label} ${getTasteBenchmarkLabel(t.key, tastes[t.key])}`).join(" · ") : "전체"}
        active={tastesOn.length > 0}>
        <div className="flex flex-col gap-3">
          {TASTE_CONFIG.map(taste => (
            <div key={taste.key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-label font-medium text-ink">{taste.label}</span>
                <span className={cn("text-caption", tastes[taste.key] ? "text-brand-ink font-medium" : "text-ink-2")}>
                  {getTasteBenchmarkLabel(taste.key, tastes[taste.key])}
                </span>
              </div>
              <RangeInput min={0} max={10} step={1} value={tastes[taste.key]} aria-label={taste.label}
                onChange={e => onTasteChange({ ...tastes, [taste.key]: Number(e.target.value) as TasteLevel | 0 })} />
            </div>
          ))}
          <p className="text-caption text-ink-2">맛은 영양값과 이름으로 짐작한 값이에요</p>
        </div>
      </Disclosure>

      <Disclosure title="가격대" summary={priceLabel ?? "전체"} active={!!priceLabel}>
        <div className="flex flex-col gap-2">
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
        </div>
      </Disclosure>

      {onReset && (
        <Button variant="ghost" size="sm" block icon="refresh" className="mt-3" onClick={onReset}>필터 초기화하기</Button>
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
  const matchReasons = (product as ProductWithPrices & { match_reasons?: string[] }).match_reasons;
  const reasons = matchReasons?.length ? matchReasons.slice(0, 3) : (product.functional_tags || []).slice(0, 2).map((t: string) => ALL_TAG_LABELS[t] || t);
  const href = `/products/${product.id}`;
  // 상세와 같은 기준 — DB 영양값은 nutrient_base_g(보통 100g) 당이라, 1회 먹는 양으로 바꿔 보인다 (lib/serving.ts)
  //  예전에는 100g 당 값을 그대로 보여 목록 133kcal · 상세 465kcal(1회 350g)처럼 달랐다
  const extra = product as ProductWithPrices & { carbs_g?: number | null; fat_g?: number | null; nutrient_base_g?: number | null; meal_role?: string | null };
  const servingG = defaultServingG(product as ProductWithPrices & { meal_role?: string | null });
  const baseG = Number(extra.nutrient_base_g) > 0 ? Number(extra.nutrient_base_g) : 100;
  const per = (v: number | null | undefined) => scaleNutrient(v, servingG, baseG);
  const kcal = per(product.calories);
  const servingNote = servingG === baseG ? `${baseG}g 당` : `1회 ${servingG}g`;

  return (
    <Card className="flex gap-4 relative">
      {/* 이미지 */}
      <Link href={href} tabIndex={-1} aria-hidden="true" className="size-22 sm:size-28 rounded-md overflow-hidden shrink-0">
        <ProductImage src={imageUrl} />
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
            <Link href={href} data-ds-allow-break className="block py-1 text-body font-bold text-ink hover:text-brand-ink transition-colors line-clamp-2">
              {product.name}
            </Link>
            {product.manufacturer && (
              <p className="text-caption text-ink-2 mt-0.5 truncate">{platformLabel(product.manufacturer)}</p>
            )}
          </div>
          {matchScore == null && <HealthBadge score={product.health_score} />}
        </div>

        {/* 적합도 하나 + 이유는 글자 한 줄 (배지를 줄줄이 늘어놓지 않는다 — 맛·영양 점수는 상세에서) */}
        {(matchScore != null || reasons.length > 0) && (
          <div className="flex items-center gap-2 mb-2 min-w-0">
            {matchScore != null && <Badge tone={scoreTone(matchScore)} className="font-bold shrink-0">적합도 <span className="num">{matchScore}</span></Badge>}
            {reasons.length > 0 && <p className="text-caption text-ink-2 truncate">{reasons.join(" · ")}</p>}
          </div>
        )}

        {/* 칼로리 + 가격 */}
        <div className="flex items-baseline justify-between gap-3 mt-auto">
          {kcal != null ? (
            <span className="flex items-baseline gap-1.5 min-w-0">
              <Kcal value={Math.round(kcal)} className="text-label" />
              <span className="text-caption text-ink-2 whitespace-nowrap">{servingNote}</span>
            </span>
          ) : <span />}
          {bestPrice ? (
            <Price value={bestPrice} className="text-body" />
          ) : (
            <span className="text-caption text-ink-3">가격 수집 중</span>
          )}
        </div>

        <MacroBars className="mt-2.5"
          values={{ protein: per(product.protein_g), carbs: per(extra.carbs_g), fat: per(extra.fat_g), sodium: per(product.sodium_mg) }}
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
  // 음식 종류 (lib/food-types — 홈 카테고리와 같은 이름·조건)
  const [types, setTypes] = useState<FoodType[]>([]);
  const seen = useImpressions("product_list");
  const [error, setError] = useState(false);
  const [autoFocus, setAutoFocus] = useState(false);
  const [tastes, setTastes] = useState<TasteFilters>({ salty: 0, sweet: 0, spicy: 0, fatty: 0 });
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  // 가격이 있는 제품만 — 가격 비교가 목적이라 늘 켜 둔다 (11/15, 끄는 선택지를 뺐다)
  const hasPriceOnly = true;
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
      // type (예전 주소의 role · kind · cat 도 음식 종류로 바꿔 읽는다)
      const t = legacyFoodTypes(sp);
      if (t.length) setTypes(t);
      const proteinMin = Number(sp.get("protein_min") || 0);
      if (proteinMin > 0) setNutrition((n) => ({ ...n, protein_min: proteinMin }));
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

  // 필터를 빨리 바꾸면 늦게 온 앞 응답이 덮지 않게 — 마지막 요청만 반영
  const reqNo = useRef(0);
  const fetchProducts = useCallback(async () => {
    const n = ++reqNo.current;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tastes.salty) params.set("salty", String(tastes.salty));
      if (tastes.sweet) params.set("sweet", String(tastes.sweet));
      if (tastes.spicy) params.set("spicy", String(tastes.spicy));
      if (tastes.fatty) params.set("fatty", String(tastes.fatty));
      if (search) params.set("q", search);
      if (types.length > 0) params.set("type", types.join(","));
      if (hasPriceOnly) params.set("hasPrice", "1");
      if (priceMin > 0) params.set("price_min", String(priceMin));
      if (priceMax > 0) params.set("price_max", String(priceMax));
      if (nutrition.protein_min > 0) params.set("protein_min", String(nutrition.protein_min));
      if (nutrition.calories_max > 0) params.set("calories_max", String(nutrition.calories_max));
      if (nutrition.sodium_max > 0) params.set("sodium_max", String(nutrition.sodium_max));
      if (nutrition.sugar_max > 0) params.set("sugar_max", String(nutrition.sugar_max));
      if (nutrition.per100g_sugar_max > 0) params.set("per100g_sugar_max", String(nutrition.per100g_sugar_max));
      if (nutrition.per100g_sodium_max > 0) params.set("per100g_sodium_max", String(nutrition.per100g_sodium_max));
      if (nutrition.per100g_protein_min > 0) params.set("per100g_protein_min", String(nutrition.per100g_protein_min));
      if (nutrition.per100g_calories_max > 0) params.set("per100g_calories_max", String(nutrition.per100g_calories_max));
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
      if (n !== reqNo.current) return;
      setData(json);
      setError(false);
    } catch (err) {
      console.error("제품 목록을 불러오지 못했어요:", err);
      if (n === reqNo.current) setError(true);
    } finally {
      if (n === reqNo.current) setLoading(false);
    }
  }, [tastes, search, types, hasPriceOnly, priceMin, priceMax, nutrition, sortBy, page, profile]);

  useEffect(() => { if (profileLoaded) fetchProducts(); }, [profileLoaded, fetchProducts]);

  // 쪽을 넘기면 목록 맨 위로 — 아래 '다음'을 누르면 화면이 그대로 아래에 머물러 바뀐 줄 몰랐다
  const listTop = useRef<HTMLDivElement>(null);
  const goPage = (n: number) => { setPage(n); listTop.current?.scrollIntoView({ block: "start" }); };

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

  const resetAll = () => {
    setTastes({ salty: 0, sweet: 0, spicy: 0, fatty: 0 });
    setSearch(""); setSearchInput("");
    setTypes([]);
    setPriceMin(0); setPriceMax(0);
    setNutrition(INITIAL_NUTRITION); setPage(1);
  };

  // 고른 조건 — 목록 위 한 줄(눌러서 빼기)과 필터 버튼 숫자가 같은 목록을 쓴다
  const applied: { key: string; label: string; clear: () => void }[] = [
    ...types.map((t) => ({ key: `type-${t}`, label: FOOD_TYPE_LABEL[t], clear: () => setTypes((p) => p.filter((x) => x !== t)) })),
    ...NUTRITION_FIELDS.filter((f) => nutrition[f.key] > 0).map((f) => {
      const goal = GOAL_SHORTCUTS.find((g) => g.field === f.key && g.value === nutrition[f.key]);
      return { key: f.key, label: goal ? goal.label : nutritionText(f, nutrition[f.key]), clear: () => setNutrition((n) => ({ ...n, [f.key]: 0 })) };
    }),
    ...TASTE_CONFIG.filter((t) => tastes[t.key] > 0).map((t) => ({
      key: `taste-${t.key}`, label: `${t.label} ${getTasteBenchmarkLabel(t.key, tastes[t.key])}`, clear: () => setTastes((x) => ({ ...x, [t.key]: 0 })),
    })),
    ...(priceMin > 0 || priceMax > 0 ? [{
      key: "price", label: `${priceMin ? priceMin.toLocaleString() : ""}~${priceMax ? priceMax.toLocaleString() : ""}원`, clear: () => { setPriceMin(0); setPriceMax(0); },
    }] : []),
  ];
  const activeFilterCount = applied.length;

  const filterProps = {
    types,
    onTypeToggle: (k: FoodType) => { setTypes(prev => prev.includes(k) ? prev.filter(c => c !== k) : [...prev, k]); setPage(1); },
    priceMin, priceMax,
    onPriceChange: (min: number, max: number) => { setPriceMin(min); setPriceMax(max); setPage(1); },
    nutrition,
    onNutritionChange: (n: NutritionFilters) => { setNutrition(n); setPage(1); },
    tastes,
    onTasteChange: (t: TasteFilters) => { setTastes(t); setPage(1); },
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
              placeholder="제품명 검색 (예: 닭가슴살)" />
          </div>
        </>
      )}
      {variant === "home" && <SectionHeader title="전체 제품" className="mb-1" />}

      {/* 필터 + 정렬 */}
      <div className="flex items-center gap-2 mb-4 sticky top-14 z-30 bg-canvas py-2 border-b border-line">
        <Button variant="secondary" size="sm" icon="filter" className="lg:hidden shrink-0" onClick={() => setMobileFilterOpen(true)}>
          필터{activeFilterCount > 0 && <span className="num text-brand-ink">{activeFilterCount}</span>}
        </Button>
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
            <Button block onClick={() => setMobileFilterOpen(false)}>{data ? `${(data.total ?? 0).toLocaleString()}개 보기` : "결과 보기"}</Button>
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
          {applied.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {applied.map((a) => (
                <Chip key={a.key} size="sm" aria-label={`${a.label} 조건 빼기`} onClick={() => { a.clear(); setPage(1); }}>
                  {a.label} <Icon name="close" size={14} />
                </Chip>
              ))}
            </div>
          )}
          <p className="text-label text-ink-2 mb-1">
            {data ? (
              <><span className="num font-bold text-ink">{(data.total ?? 0).toLocaleString()}</span>개 {data.meals_only ? "한 끼·반찬" : "제품"}{search && <> · &quot;{search}&quot; 검색 결과</>}</>
            ) : error ? "" : "불러오는 중"}
          </p>
          <p className="text-caption text-ink-2 mb-3">{dailyRefNote()}</p>

          {error && !loading ? (
            <Card className="flex flex-col items-start gap-3">
              <p className="text-label text-ink">제품 목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요</p>
              <Button variant="secondary" size="sm" icon="refresh" onClick={fetchProducts}>다시 불러오기</Button>
            </Card>
          ) : loading && !data ? (
            <SkeletonList rows={5} />
          ) : data?.products?.length ? (
            <>
              <div ref={listTop} aria-busy={loading} className={cn("flex flex-col gap-3 scroll-mt-32 transition-opacity duration-150", loading && "opacity-60")}>
                {data.products.map(product => (
                  <div key={product.id} ref={seen(product.id)}>
                    <ProductCard product={product}
                      isFavorite={isFavorite(product.id)}
                      onToggleFavorite={toggleFavorite} />
                  </div>
                ))}
              </div>

              {data.totalPages > 1 && (
                <nav aria-label="페이지" className="flex items-center justify-center gap-3 mt-8">
                  <Button variant="secondary" size="sm" icon="chevron-left" onClick={() => goPage(Math.max(1, page - 1))} disabled={page <= 1}>이전</Button>
                  <span className="num text-label text-ink-2">{data.page} / {data.totalPages}</span>
                  <Button variant="secondary" size="sm" iconRight="chevron-right" onClick={() => goPage(Math.min(data.totalPages, page + 1))} disabled={page >= data.totalPages}>다음</Button>
                </nav>
              )}
            </>
          ) : (
            <EmptyState
              title="조건에 맞는 제품이 없어요"
              description="가격이 있는 제품만 보여 드려요. 필터를 줄이거나 다른 검색어로 찾아보세요"
              action={<Button variant="secondary" size="sm" icon="refresh" onClick={resetAll}>필터 초기화하기</Button>}
            />
          )}
        </div>
      </div>
    </div>
  );
}
