"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Badge, Button, Card, Chip, ChipRow, ConfirmSheet, IconLink, Sheet, EmptyState, Field, Icon, IconButton, Input, Kcal, LinkButton, ListRow, MacroGrid, MealSlot, Page, PageHeader, PageLoading, SectionHeader, Spinner, Tabs, buttonClass, cn, useToast, SkeletonList, QuickRating, Notice, TextLink,
} from "@/components/ui";
import { getClientActorId } from "@/lib/actor-client";
import { addDays, kstHour, monthDay, todayKst, weekday } from "@/lib/day";
import { defaultServingG } from "@/lib/serving";
import { NextMeal, pickNextMeal, type NextCandidate } from "./NextMeal";
import PushPrompt from "@/components/PushPrompt";

/* ── 타입 ── */
type DiaryEntry = {
  id: string;
  meal_type: string;
  food_name: string;
  product_id: string | null;
  serving_g: number | null;
  serving_multiplier: number | null;
  calories: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  fiber_g: number | null;
  memo: string | null;
};

type RecentMeal = {
  food_name: string;
  product_id: string | null;
  serving_g: number | null;
  calories: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  fiber_g: number | null;
};

type DiaryData = {
  date: string;
  byMeal: Record<string, DiaryEntry[]>;
  totals: {
    calories: number;
    protein_g: number;
    fat_g: number;
    carbs_g: number;
    sugar_g: number;
    sodium_mg: number;
    fiber_g: number;
  };
  goals: {
    daily_calories: number;
    daily_protein_g: number;
    max_sodium_mg: number;
    max_sugar_g: number;
  } | null;
  mealCount: number;
};

type SearchResult = {
  id: string;
  name: string;
  manufacturer: string | null;
  calories: number | null;
  protein_g: number | null;
  serving_size_g: number | null;
  meal_role?: string | null;
  nutrient_base_g?: number | null;
};

/** 영양 정보가 하나도 없는 제품(열량·단백질 모두 0·없음)은 기록 검색에서 뺀다 — 0kcal 로 기록된다 */
const hasNutrition = (p: SearchResult) => (Number(p.calories) || 0) > 0 || (Number(p.protein_g) || 0) > 0;

type CommonFood = {
  id: string;
  name: string;
  icon?: string;
  category: string;
  serving_desc: string;
  serving_size_g: number | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  sodium_mg: number | null;
  sugar_g: number | null;
};

/* ── 끼니 설정 ── */
const MEAL_TYPES = [
  { key: "breakfast", label: "아침" },
  { key: "lunch", label: "점심" },
  { key: "dinner", label: "저녁" },
  { key: "snack", label: "간식" },
];

/* 주간 스트립 막대 — 목표 대비 비율에 따른 고정 클래스 */
const WEEK_BAR = { good: "bg-positive", mid: "bg-brand", low: "bg-ink-3" } as const;

/* 영양 갭 점 색 */
function gapDot(nutrient: string) {
  if (nutrient.includes("protein")) return "bg-protein";
  if (nutrient.includes("sodium")) return "bg-sodium";
  if (nutrient.includes("fat")) return "bg-fat";
  return "bg-carbs";
}

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

/* ── 경고 임계값 (1끼 기준) ── */
const MEAL_THRESHOLDS = {
  sodium_mg: 800,
  fat_g: 25,
  carbs_g: 100,
  protein_g: 60,
};

function getUserId(): string {
  // 서버가 발급한 쿠키의 id — API 는 이 값을 받지 않고 쿠키로 직접 확인한다
  return getClientActorId() || "";
}

function formatDate(dateStr: string): string {
  const { month, date } = monthDay(dateStr);
  return `${month}월 ${date}일 (${DAY_NAMES[weekday(dateStr)]})`;
}

/** 끼니별 영양소 경고 판단 — 가장 문제되는 영양소 하나 반환 */
function getMealAlert(entries: DiaryEntry[]): { nutrient: string; label: string; cssClass: string } | null {
  const sums = {
    sodium_mg: entries.reduce((s, e) => s + (e.sodium_mg || 0), 0),
    fat_g: entries.reduce((s, e) => s + (e.fat_g || 0), 0),
    carbs_g: entries.reduce((s, e) => s + (e.carbs_g || 0), 0),
  };
  // 가장 많이 초과한 영양소
  if (sums.sodium_mg > MEAL_THRESHOLDS.sodium_mg) return { nutrient: "sodium", label: "나트륨 높음", cssClass: "alert-sodium" };
  if (sums.fat_g > MEAL_THRESHOLDS.fat_g) return { nutrient: "fat", label: "지방 높음", cssClass: "alert-fat" };
  if (sums.carbs_g > MEAL_THRESHOLDS.carbs_g) return { nutrient: "carbs", label: "탄수화물 높음", cssClass: "alert-carbs" };
  return null;
}

/* ── 제품 리스트 (공통) ── */
function ProductList({ items, onSelect, multiplier = 1 }: { items: SearchResult[]; onSelect: (p: SearchResult) => void; multiplier?: number }) {
  return (
    <div className="flex flex-col max-h-60 overflow-y-auto -mx-3">
      {items.map((p) => {
        // 기록될 양 그대로 보여 준다 — 1회 제공량을 모르면(즐겨찾기·식단 리스트) 100g 당
        const known = p.serving_size_g != null || p.meal_role != null;
        const g = known ? defaultServingG(p) * multiplier : null;
        const kcal = p.calories != null ? Math.round((Number(p.calories) * (g ?? 100)) / (Number(p.nutrient_base_g) || 100)) : null;
        const pro = p.protein_g != null ? Math.round((Number(p.protein_g) * (g ?? 100)) / (Number(p.nutrient_base_g) || 100) * 10) / 10 : null;
        return (
        <ListRow
          key={p.id}
          onClick={() => onSelect(p)}
          title={p.name}
          meta={
            <span className="flex flex-wrap gap-x-2">
              {p.manufacturer && <span>{p.manufacturer}</span>}
              <span>{g != null ? <><span className="num">{Math.round(g)}</span>g</> : "100g당"}</span>
              {kcal != null && <span><span className="num">{kcal}</span>kcal</span>}
              {pro != null && <span>단백질 <span className="num">{pro}</span>g</span>}
            </span>
          }
          trailing={<span className="text-label font-bold text-brand-ink">추가</span>}
        />
        );
      })}
    </div>
  );
}

/* ── 일반 음식 리스트 ── */
function CommonFoodList({ items, onSelect }: { items: CommonFood[]; onSelect: (f: CommonFood) => void }) {
  return (
    <div className="flex flex-col -mx-3">
      {items.map((food) => (
        <ListRow
          key={food.id}
          onClick={() => onSelect(food)}
          title={food.name}
          meta={
            <span className="flex flex-wrap gap-x-2">
              <span>{food.serving_desc}</span>
              {food.calories != null && <span><span className="num">{food.calories}</span>kcal</span>}
              {food.protein_g != null && <span>단백질 <span className="num">{food.protein_g}</span>g</span>}
            </span>
          }
          trailing={<span className="text-label font-bold text-brand-ink">기록</span>}
        />
      ))}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-caption font-bold text-ink-2 mb-1.5">{children}</p>;
}

/* ── 칼로리 링 ── */
function CalorieRing({ consumed, goal }: { consumed: number; goal: number }) {
  const r = 84;
  const circumference = 2 * Math.PI * r;
  const ratio = Math.min(consumed / goal, 1.2);
  const offset = circumference - ratio * circumference;
  const remaining = Math.max(goal - consumed, 0);
  const isOver = consumed > goal;

  return (
    <div className="relative size-[200px]">
      <svg viewBox="0 0 200 200" width="200" height="200" aria-hidden="true">
        <circle cx="100" cy="100" r={r} fill="none" strokeWidth="14" className="stroke-sunken" />
        <circle
          cx="100" cy="100" r={r} fill="none"
          className={cn("transition-[stroke-dashoffset] duration-420 ease-out", isOver ? "stroke-danger" : "stroke-brand")}
          strokeWidth="14" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 100 100)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num text-display font-bold text-ink leading-none">
          <span className="highlight">{isOver ? `+${consumed - goal}` : remaining}</span>
        </span>
        <span className="text-label text-ink-2 mt-1">
          {isOver ? "kcal 초과" : "kcal 남음"}
        </span>
      </div>
    </div>
  );
}

/* ══════════════════════════ 메인 ══════════════════════════ */
export default function DiaryPage() {
  const [date, setDate] = useState("");
  const [data, setData] = useState<DiaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [addingMeal, setAddingMeal] = useState<string | null>(null);
  const [addTab, setAddTab] = useState<"search" | "favorites" | "weekly" | "manual" | "photo">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [commonFoods, setCommonFoods] = useState<CommonFood[]>([]);
  const [searching, setSearching] = useState(false);
  const [manualForm, setManualForm] = useState({ food_name: "", calories: "", protein_g: "", sodium_mg: "", serving_g: "" });
  // 기록 고치기 — 끼니·양(배수·g)
  const [editing, setEditing] = useState<{ id: string; name: string; meal: string; mult: number; grams: string } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [servingMultiplier, setServingMultiplier] = useState<number>(1);
  const [recentMeals, setRecentMeals] = useState<RecentMeal[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoAnalyzing, setPhotoAnalyzing] = useState(false);
  const [photoResults, setPhotoResults] = useState<{
    recognized: { name: string; confidence: number }[];
    matched: {
      commonFoods: CommonFood[];
      products: SearchResult[];
    };
    hasAI: boolean;
    configured?: boolean; // false = 서버에 사진 인식 키가 없음
    error?: string;
  } | null>(null);
  const [userId, setUserId] = useState("");
  const toast = useToast();
  const showToast = toast.show; // 안정된 함수 — effect 의존성에 toast 객체를 넣지 않는다
  const [favorites, setFavorites] = useState<SearchResult[]>([]);
  const [weeklyItems, setWeeklyItems] = useState<SearchResult[]>([]);
  const [weeklyTrend, setWeeklyTrend] = useState<{
    days: { date: string; label: string; dayOfWeek: string; calories: number; protein_g: number; count: number }[];
    weeklyAvg: { calories: number; protein_g: number; sodium_mg: number; goalAchievement: number } | null;
    goalCalories: number;
  } | null>(null);
  const [gapSuggestions, setGapSuggestions] = useState<{
    gaps: { nutrient: string; label: string; current: number; target: number; ratio: number; severity: string }[];
    suggestions: { nutrient_gap: string; gap_label: string; severity: string; product_id: string; product_name: string; nutrient_value: number; nutrient_unit: string; health_score: number | null; price: number | null; reason: string }[];
  } | null>(null);

  // 내가 맛 평가를 남긴 제품 (product_id → 별점)
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const allEntries = data ? Object.values(data.byMeal).flat() : [];
  const entryProductIds = [...new Set(allEntries.map((e) => e.product_id).filter(Boolean))].sort().join(",");
  useEffect(() => {
    if (!entryProductIds) return;
    fetch(`/api/reviews?mine=1&product_ids=${entryProductIds}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.ratings) setRatings((m) => ({ ...m, ...d.ratings })); })
      .catch(() => {}); // ds-allow: 평가 여부를 못 불러오면 '맛 어땠어요?'를 그대로 보여 준다
  }, [entryProductIds]);

  // 로그인 여부 — 기록이 쌓이면 '다른 기기에서도 보려면 로그인' 안내
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  useEffect(() => {
    import("@/lib/supabase/client")
      .then(({ createClient }) => createClient().auth.getUser())
      .then(({ data }) => setLoggedIn(!!data.user))
      .catch(() => setLoggedIn(null)); // ds-allow: 확인 못 하면 안내를 띄우지 않음
  }, []);

  /* ── 초기화 ── */
  useEffect(() => {
    setUserId(getUserId());
    setDate(todayKst());
  }, []);

  useEffect(() => {
    if (!userId) return;
    try {
      const profile = localStorage.getItem("carefood_profile");
      if (profile) {
        const p = JSON.parse(profile);
        if (p.nutrition_goals) {
          fetch("/api/diary/goals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: userId,
              daily_calories: p.nutrition_goals.dailyCalories,
              daily_protein_g: p.nutrition_goals.dailyProteinG,
              max_sodium_mg: p.nutrition_goals.maxSodiumMg,
              max_sugar_g: p.nutrition_goals.maxSugarG,
            }),
          }).catch(() => {}); // ds-allow: 목표 동기화는 다음 방문 때 다시 시도
        }
      }
    } catch { /* */ } // ds-allow: 로컬 프로필 읽기
  }, [userId]);

  /* ── 데이터 페칭 ── */
  const fetchDiary = useCallback(async () => {
    if (!userId || !date) return;
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/diary?date=${date}&user_id=${userId}`);
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      setData(d);
    } catch {
      setLoadError(true);
      showToast("식단 기록을 불러오지 못했어요", { tone: "danger" });
    }
    setLoading(false);
  }, [date, userId, showToast]);

  useEffect(() => { fetchDiary(); }, [fetchDiary]);

  const loadFavorites = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/favorites?user_id=${userId}`);
      if (res.ok) {
        const d = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setFavorites((d.favorites || []).map((f: any) => ({
          id: f.product_id, name: f.name, manufacturer: f.manufacturer,
          calories: f.calories, protein_g: f.protein_g, serving_size_g: null,
        })));
      }
    } catch { /* */ } // ds-allow: 보조 패널(즐겨찾기) 불러오기
  }, [userId]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("carefood_weekly_box");
      if (saved) {
        const box = JSON.parse(saved);
        const items: SearchResult[] = [];
        const seen = new Set<string>();
        for (const day of box.days || []) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const slot of Object.values(day.slots || {}) as any[]) {
            if (slot?.product_id && !seen.has(slot.product_id)) {
              seen.add(slot.product_id);
              items.push({
                id: slot.product_id, name: slot.name || slot.product_name || "알 수 없음",
                manufacturer: slot.manufacturer || slot.source || null,
                calories: slot.calories || null, protein_g: slot.protein_g || null,
                serving_size_g: slot.serving_size_g || null,
              });
            }
          }
        }
        setWeeklyItems(items);
      }
    } catch { /* */ } // ds-allow: 보조 패널(식단 리스트) 불러오기
  }, []);

  // 최근 기록 로드 (다시 먹기)
  const loadRecentMeals = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/diary?user_id=${userId}&recent=true`);
      if (res.ok) {
        const d = await res.json();
        setRecentMeals(d.recent || []);
      }
    } catch { /* */ } // ds-allow: 보조 패널(최근 기록) 불러오기
  }, [userId]);

  useEffect(() => { if (addTab === "favorites") loadFavorites(); }, [addTab, loadFavorites]);
  useEffect(() => { if (addingMeal) loadRecentMeals(); }, [addingMeal, loadRecentMeals]);

  const loadWeeklyTrend = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/diary/weekly?user_id=${userId}`);
      if (res.ok) setWeeklyTrend(await res.json());
    } catch { /* */ } // ds-allow: 보조 패널(주간 추이) 불러오기
  }, [userId]);

  useEffect(() => { loadWeeklyTrend(); }, [loadWeeklyTrend]);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/community/group-buy/suggest?mine=1`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setGapSuggestions(d); })
      .catch(() => {}); // ds-allow: 공구 제안은 없으면 숨김
  }, [userId]);

  /* ── 액션 ── */
  const searchProducts = async (q: string) => {
    if (q.length < 1) { setSearchResults([]); setCommonFoods([]); return; }
    setSearching(true);
    try {
      const [prodRes, foodRes] = await Promise.all([
        fetch(`/api/products?q=${encodeURIComponent(q)}&limit=8&sort=health_desc`),
        fetch(`/api/common-foods?q=${encodeURIComponent(q)}`),
      ]);
      const prodData = await prodRes.json();
      const foodData = await foodRes.json();
      setSearchResults(((prodData.products || []) as SearchResult[]).filter(hasNutrition));
      setCommonFoods(foodData.foods || []);
    } catch {
      toast.show("검색하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
    setSearching(false);
  };

  /** 다음 끼니 후보를 바로 그 끼니에 기록 */
  const logToMeal = async (c: NextCandidate, meal: string) => {
    const res = await fetch("/api/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, meal_type: meal, product_id: c.id, food_name: c.name, serving_multiplier: 1 }), // 양은 서버가 정한다 (lib/serving.ts)
    }).catch(() => null); // ds-allow: 네트워크 실패는 바로 아래 !res?.ok 에서 알림
    if (!res?.ok) { toast.show("기록하지 못했어요. 다시 시도해 주세요", { tone: "danger" }); return; }
    toast.show("식단에 기록했어요");
    fetchDiary();
    loadWeeklyTrend();
  };

  /** 기록한 제품의 맛을 한 번에 — 별점 칸에 저장 (자세한 리뷰는 제품 페이지) */
  const rateTaste = async (productId: string, rating: number) => {
    setRatings((m) => ({ ...m, [productId]: rating }));
    const res = await fetch("/api/reviews", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId, rating }),
    }).catch(() => null); // ds-allow: 네트워크 실패는 바로 아래 !res?.ok 에서 알림
    if (!res?.ok) {
      setRatings((m) => { const n = { ...m }; delete n[productId]; return n; });
      toast.show("맛 평가를 남기지 못했어요. 다시 시도해 주세요", { tone: "danger" });
      return;
    }
    toast.show("맛 평가를 남겼어요");
  };

  const addFromProduct = async (product: SearchResult) => {
    if (!addingMeal) return;
    const res = await fetch("/api/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date, meal_type: addingMeal,
        product_id: product.id, food_name: product.name,
        serving_multiplier: servingMultiplier, // 양(g)·영양값은 서버가 제품 값으로 계산한다
      }),
    }).catch(() => null); // ds-allow: 네트워크 실패는 바로 아래 !res?.ok 에서 알림
    if (!res?.ok) { toast.show("기록하지 못했어요. 다시 시도해 주세요", { tone: "danger" }); return; }
    setAddingMeal(null);
    setSearchQuery("");
    setSearchResults([]);
    setCommonFoods([]);
    setServingMultiplier(1);
    toast.show("식단에 기록했어요");
    fetchDiary();
    loadWeeklyTrend();
  };

  // 일반 음식(외식)으로 기록 추가
  const addFromCommonFood = async (food: CommonFood) => {
    if (!addingMeal) return;
    const res = await fetch("/api/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId, date, meal_type: addingMeal,
        food_name: food.name,
        serving_g: food.serving_size_g || 100,
        serving_multiplier: servingMultiplier,
        calories: food.calories,
        protein_g: food.protein_g,
        carbs_g: food.carbs_g,
        fat_g: food.fat_g,
        sodium_mg: food.sodium_mg,
        sugar_g: food.sugar_g,
      }),
    }).catch(() => null); // ds-allow: 네트워크 실패는 바로 아래 !res?.ok 에서 알림
    if (!res?.ok) { toast.show("기록하지 못했어요. 다시 시도해 주세요", { tone: "danger" }); return; }
    setAddingMeal(null);
    setSearchQuery("");
    setSearchResults([]);
    setCommonFoods([]);
    setServingMultiplier(1);
    toast.show("식단에 기록했어요");
    fetchDiary();
    loadWeeklyTrend();
  };

  // 다시 먹기
  const addFromRecent = async (meal: RecentMeal) => {
    if (!addingMeal) return;
    // 최근 기록 값은 서버가 1인분 기준으로 준다 — 고른 배수는 서버가 한 번만 곱한다. 제품이면 지금 제품 값으로 다시 계산
    const res = await fetch("/api/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId, date, meal_type: addingMeal,
        product_id: meal.product_id,
        food_name: meal.food_name,
        serving_g: meal.serving_g,
        serving_multiplier: servingMultiplier,
        calories: meal.calories,
        protein_g: meal.protein_g,
        carbs_g: meal.carbs_g,
        fat_g: meal.fat_g,
        sodium_mg: meal.sodium_mg,
        sugar_g: meal.sugar_g,
      }),
    }).catch(() => null); // ds-allow: 네트워크 실패는 바로 아래 !res?.ok 에서 알림
    if (!res?.ok) { toast.show("기록하지 못했어요. 다시 시도해 주세요", { tone: "danger" }); return; }
    setAddingMeal(null);
    setServingMultiplier(1);
    toast.show("식단에 기록했어요");
    fetchDiary();
    loadWeeklyTrend();
  };

  const addManual = async () => {
    if (!addingMeal || !manualForm.food_name) return;
    const res = await fetch("/api/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId, date, meal_type: addingMeal,
        food_name: manualForm.food_name,
        calories: manualForm.calories ? Number(manualForm.calories) : null,
        protein_g: manualForm.protein_g ? Number(manualForm.protein_g) : null,
        sodium_mg: manualForm.sodium_mg ? Number(manualForm.sodium_mg) : null,
        serving_g: manualForm.serving_g ? Number(manualForm.serving_g) : null,
      }),
    }).catch(() => null); // ds-allow: 네트워크 실패는 바로 아래 !res?.ok 에서 알림
    if (!res?.ok) { toast.show("기록하지 못했어요. 다시 시도해 주세요", { tone: "danger" }); return; }
    setAddingMeal(null);
    setAddTab("search");
    setManualForm({ food_name: "", calories: "", protein_g: "", sodium_mg: "", serving_g: "" });
    toast.show("식단에 기록했어요");
    fetchDiary();
    loadWeeklyTrend();
  };

  // 사진 촬영/업로드 핸들러
  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 이미지 리사이즈 (최대 800px) + 압축
    const resized = await resizeImage(file, 800);
    setPhotoPreview(resized);
    setPhotoAnalyzing(true);
    setPhotoResults(null);

    try {
      const res = await fetch("/api/diary/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: resized }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPhotoResults(data);
    } catch (err) {
      setPhotoResults({ recognized: [], matched: { commonFoods: [], products: [] }, hasAI: false, configured: true, error: (err as Error).message || "사진을 분석하지 못했어요. 다시 시도해 주세요" });
    } finally {
      setPhotoAnalyzing(false);
    }
  };

  const resizeImage = (file: File, maxSize: number): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let { width, height } = img;
          if (width > maxSize || height > maxSize) {
            if (width > height) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            } else {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const resetPhoto = () => {
    setPhotoPreview(null);
    setPhotoResults(null);
    setPhotoAnalyzing(false);
  };

  const deleteEntry = async (id: string) => {
    const res = await fetch(`/api/diary?id=${id}`, { method: "DELETE" }).catch(() => null); // ds-allow: 실패는 바로 아래에서 알림
    setDeleteConfirmId(null);
    if (!res?.ok) { toast.show("삭제하지 못했어요. 다시 시도해 주세요", { tone: "danger" }); return; }
    toast.show("기록을 삭제했어요");
    fetchDiary();
    loadWeeklyTrend();
  };

  const saveEdit = async () => {
    if (!editing) return;
    const grams = editing.grams.trim() ? Number(editing.grams) : undefined;
    if (grams !== undefined && !(grams >= 1 && grams <= 3000)) { toast.show("양은 1~3000g 사이로 적어 주세요", { tone: "danger" }); return; }
    setEditSaving(true);
    try {
      const res = await fetch("/api/diary", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, meal_type: editing.meal, serving_multiplier: editing.mult, ...(grams !== undefined ? { serving_g: grams } : {}) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error);
      setEditing(null);
      toast.show("기록을 고쳤어요");
      fetchDiary();
      loadWeeklyTrend();
    } catch {
      toast.show("기록을 고치지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setEditSaving(false); }
  };

  /* ── 날짜 이동 ── */
  const moveDate = (days: number) => setDate(addDays(date, days));

  const todayStr = typeof window !== "undefined" ? todayKst() : "";
  const isToday = date === todayStr;

  /* ── 주간 스트립 데이터 ── */
  const weekDays = useMemo(() => {
    if (!date) return [];
    const goalCal = data?.goals?.daily_calories || weeklyTrend?.goalCalories || 2000;
    return Array.from({ length: 7 }, (_, i) => {
      const ds = addDays(date, i - 3);
      const trendDay = weeklyTrend?.days.find(td => td.date === ds);
      const cal = trendDay?.calories || 0;
      const count = trendDay?.count || 0;
      const ratio = goalCal > 0 ? cal / goalCal : 0;
      const isFuture = ds > todayStr;
      return { dateStr: ds, day: monthDay(ds).date, dow: DAY_NAMES[weekday(ds)], cal, count, ratio, isFuture, isActive: ds === date };
    });
  }, [date, weeklyTrend, data, todayStr]);

  /* ── 계산 ── */
  const goalCalories = data?.goals?.daily_calories || 2000;
  const goalProtein = data?.goals?.daily_protein_g || 80;
  const maxSodium = data?.goals?.max_sodium_mg || 2000;
  const consumed = data?.totals.calories || 0;
  const filledCount = data ? Object.values(data.byMeal).filter(arr => arr.length > 0).length : 0;


  const topGap = gapSuggestions?.gaps?.[0] || null;

  /* ══════════════════ RENDER ══════════════════ */
  if (!date) return <PageLoading />;

  const deleteTarget = deleteConfirmId && data
    ? Object.values(data.byMeal).flat().find((e) => e.id === deleteConfirmId) || null
    : null;
  const streakDays = weeklyTrend ? weeklyTrend.days.filter(d => d.count > 0).length : 0;

  /* 음식 추가 패널 (끼니 칸 안) */
  const renderAddPanel = () => (
    <div className="mt-3 -mx-4 -mb-3 border-t border-line">
      <Tabs
        variant="line"
        label="음식 추가 방법"
        value={addTab}
        onChange={setAddTab}
        items={[
          { value: "search", label: "검색" },
          { value: "photo", label: "사진" },
          { value: "favorites", label: "즐겨찾기", count: favorites.length },
          { value: "weekly", label: "식단 리스트", count: weeklyItems.length },
          { value: "manual", label: "직접 입력" },
        ]}
        className="scroll-row"
      />
      <div className="p-4 bg-sunken rounded-b-lg flex flex-col gap-3">
        {/* 섭취량 선택 (모든 탭 공통) */}
        <div className="flex items-center gap-2">
          <span className="text-caption text-ink-2 shrink-0">섭취량</span>
          <div className="flex gap-1.5 scroll-row">
            {[0.5, 1, 1.5, 2].map((m) => (
              <Chip key={m} size="sm" selected={servingMultiplier === m} onClick={() => setServingMultiplier(m)}>
                <span className="num">{m}</span>인분
              </Chip>
            ))}
          </div>
        </div>

        {/* 다시 먹기 (최근 기록) */}
        {recentMeals.length > 0 && addTab === "search" && !searchQuery && (
          <div>
            <GroupLabel>최근 기록</GroupLabel>
            <div className="flex gap-2 scroll-row">
              {recentMeals.slice(0, 5).map((m, i) => (
                <Chip key={i} onClick={() => addFromRecent(m)}>
                  <span className="max-w-[120px] line-clamp-1">{m.food_name}</span>
                  {m.calories != null && <span className="num text-ink-3">{m.calories}kcal</span>}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {addTab === "search" && (
          <>
            <div className="relative">
              <Input
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); searchProducts(e.target.value); }}
                placeholder="제품명 검색 (예: 닭가슴살, 샐러드)"
                aria-label="제품명 검색"
                autoFocus
                className="pr-10"
              />
              {searching && <Spinner size={16} className="absolute right-3 top-3.5" />}
            </div>
            {commonFoods.length > 0 && (
              <div>
                <GroupLabel>외식 · 일반 음식</GroupLabel>
                <CommonFoodList items={commonFoods} onSelect={addFromCommonFood} />
              </div>
            )}
            {searchResults.length > 0 && (
              <div>
                {commonFoods.length > 0 && <GroupLabel>제품</GroupLabel>}
                <ProductList items={searchResults} onSelect={addFromProduct} multiplier={servingMultiplier} />
              </div>
            )}
            {searchQuery && searchResults.length === 0 && commonFoods.length === 0 && !searching && (
              <p className="text-label text-ink-2 text-center py-3">검색 결과가 없어요</p>
            )}
          </>
        )}

        {addTab === "favorites" && (
          favorites.length > 0 ? <ProductList items={favorites} onSelect={addFromProduct} multiplier={servingMultiplier} /> : (
            <EmptyState title="즐겨찾기한 제품이 없어요" description="제품 상세에서 하트를 누르면 여기서 바로 기록할 수 있어요" className="py-6" />
          )
        )}

        {addTab === "weekly" && (
          weeklyItems.length > 0 ? <ProductList items={weeklyItems} onSelect={addFromProduct} multiplier={servingMultiplier} /> : (
            <EmptyState
              title="식단 리스트가 비어 있어요"
              className="py-6"
              action={<LinkButton href="/weekly-box" size="sm" variant="secondary">식단 리스트 만들기</LinkButton>}
            />
          )
        )}

        {addTab === "photo" && (
          <div>
            {!photoPreview ? (
              <div className="flex flex-col items-center text-center py-4">
                <span className="size-16 rounded-full bg-brand-soft text-brand-ink flex items-center justify-center mb-3">
                  <Icon name="camera" size={28} />
                </span>
                <p className="text-body font-bold text-ink">음식 사진으로 기록하기</p>
                <p className="text-label text-ink-2 mb-4">사진을 찍거나 갤러리에서 고르세요</p>
                <div className="flex gap-2 justify-center">
                  <label className={buttonClass({ variant: "primary", className: "cursor-pointer" })}>
                    <Icon name="camera" size={18} />
                    촬영하기
                    <input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="sr-only" />
                  </label>
                  <label className={buttonClass({ variant: "secondary", className: "cursor-pointer" })}>
                    갤러리에서 고르기
                    <input type="file" accept="image/*" onChange={handlePhotoCapture} className="sr-only" />
                  </label>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {/* 사진 미리보기 */}
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoPreview} alt="음식 사진" className="w-full h-48 object-cover rounded-md" />
                  <IconButton icon="close" label="사진 지우기" size="sm" tone="secondary" onClick={resetPhoto} className="absolute top-2 right-2" />
                  {photoAnalyzing && (
                    <div className="absolute inset-0 bg-scrim rounded-md flex items-center justify-center">
                      <div className="bg-surface rounded-md px-4 py-3 flex items-center gap-2 shadow-overlay">
                        <Spinner size={18} />
                        <span className="text-label font-medium text-ink">음식을 분석하고 있어요</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* AI 인식 결과 */}
                {photoResults && (
                  <>
                    {photoResults.recognized.length > 0 && (
                      <p className="text-caption text-ink-2">
                        <span className="font-bold text-brand-ink">AI 인식 결과</span>{" "}
                        {photoResults.recognized.map((r) => r.name).join(", ")}
                      </p>
                    )}

                    {photoResults.matched.commonFoods.length > 0 && (
                      <div>
                        <GroupLabel>찾은 음식</GroupLabel>
                        <CommonFoodList items={photoResults.matched.commonFoods} onSelect={(food) => { addFromCommonFood(food); resetPhoto(); }} />
                      </div>
                    )}

                    {photoResults.matched.products.length > 0 && (
                      <div>
                        <GroupLabel>찾은 제품</GroupLabel>
                        <ProductList items={photoResults.matched.products} onSelect={(p) => { addFromProduct(p); resetPhoto(); }} />
                      </div>
                    )}

                    {photoResults.matched.commonFoods.length === 0 && photoResults.matched.products.length === 0 && (
                      <div className="flex flex-col items-center text-center gap-3 py-2">
                        <p className={cn("text-label", photoResults.error ? "text-danger" : "text-ink-2")}>
                          {photoResults.error
                            ? photoResults.error
                            : photoResults.configured === false
                              ? "사진으로 찾기는 아직 준비 중이에요. 검색이나 직접 입력으로 추가해 주세요"
                              : "사진에서 맞는 음식을 찾지 못했어요"}
                        </p>
                        <div className="flex gap-2 justify-center">
                          <Button size="sm" onClick={() => setAddTab("search")}>검색해서 추가하기</Button>
                          <Button size="sm" variant="secondary" onClick={() => setAddTab("manual")}>직접 입력하기</Button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* 다시 찍기 */}
                {!photoAnalyzing && (
                  <label className="cursor-pointer self-center text-label text-ink-2 hover:text-ink underline underline-offset-4">
                    다른 사진으로 바꾸기
                    <input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="sr-only" />
                  </label>
                )}
              </div>
            )}
          </div>
        )}

        {addTab === "manual" && (
          <div className="flex flex-col gap-3">
            <Field label="음식 이름">
              <Input value={manualForm.food_name} onChange={(e) => setManualForm({ ...manualForm, food_name: e.target.value })} placeholder="예: 김치볶음밥" autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="칼로리">
                <Input type="number" inputMode="numeric" value={manualForm.calories} onChange={(e) => setManualForm({ ...manualForm, calories: e.target.value })} placeholder="kcal" className="text-center" />
              </Field>
              <Field label="단백질">
                <Input type="number" inputMode="decimal" value={manualForm.protein_g} onChange={(e) => setManualForm({ ...manualForm, protein_g: e.target.value })} placeholder="g" className="text-center" />
              </Field>
              <Field label="나트륨">
                <Input type="number" inputMode="numeric" value={manualForm.sodium_mg} onChange={(e) => setManualForm({ ...manualForm, sodium_mg: e.target.value })} placeholder="mg" className="text-center" />
              </Field>
              <Field label="양">
                <Input type="number" inputMode="numeric" value={manualForm.serving_g} onChange={(e) => setManualForm({ ...manualForm, serving_g: e.target.value })} placeholder="g" className="text-center" />
              </Field>
            </div>
            <Button block onClick={addManual} disabled={!manualForm.food_name}>기록하기</Button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Page width="narrow">
      <PageHeader title="식단 기록" description={isToday ? `오늘 · ${formatDate(date)}` : formatDate(date)} />

      {loadError && (
        <EmptyState className="mb-5" title="식단 기록을 불러오지 못했어요" description="아래 숫자는 비어 있는 상태예요"
          action={<Button size="sm" variant="secondary" icon="refresh" onClick={fetchDiary}>다시 불러오기</Button>} />
      )}

      {/* ━━ 주간 캘린더 스트립 ━━ */}
      <div className="flex items-center gap-1 mb-5">
        <IconButton icon="chevron-left" label="이전 주" size="sm" onClick={() => moveDate(-7)} />
        <div className="flex flex-1 gap-1 min-w-0">
          {weekDays.map((wd) => {
            const barClass = wd.ratio > 0.9 ? WEEK_BAR.good : wd.ratio > 0.5 ? WEEK_BAR.mid : WEEK_BAR.low;
            return (
              <button
                key={wd.dateStr}
                type="button"
                onClick={() => setDate(wd.dateStr)}
                aria-pressed={wd.isActive}
                aria-label={`${wd.day}일 ${wd.dow}요일`}
                className={cn(
                  "flex-1 min-w-0 flex flex-col items-center gap-1 py-2 rounded-md transition-colors",
                  wd.isActive ? "bg-brand text-on-brand" : "text-ink hover:bg-sunken",
                  wd.isFuture && !wd.isActive && "opacity-50",
                )}
              >
                <span className={cn("text-caption", wd.isActive ? "text-on-brand" : "text-ink-2")}>{wd.dow}</span>
                <span className="num text-body font-bold leading-none">{wd.day}</span>
                <span className={cn("w-1.5 h-5 rounded-sm overflow-hidden flex flex-col-reverse", wd.isActive ? "bg-on-brand/20" : "bg-sunken")}>
                  {wd.count > 0 && (
                    <span
                      className={cn("w-full rounded-sm transition-colors", wd.isActive ? "bg-on-brand" : barClass)}
                      style={{ height: `${Math.max(wd.ratio * 100, 15)}%` }}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <IconButton icon="chevron-right" label="다음 주" size="sm" onClick={() => moveDate(7)} />
      </div>

      {/* ━━ 오늘 합계 (칼로리 링 + 매크로) ━━ */}
      <Card className="mb-6">
        <div className="flex flex-col items-center mb-5">
          <CalorieRing consumed={consumed} goal={goalCalories} />
          <p className="text-label text-ink-2 mt-3">
            섭취 <span className="num font-bold text-ink">{consumed.toLocaleString()}</span> / 목표 <span className="num font-bold text-ink">{goalCalories.toLocaleString()}</span> kcal
          </p>
        </div>
        <MacroGrid
          values={{
            protein: data?.totals.protein_g || 0,
            carbs: data?.totals.carbs_g || 0,
            fat: data?.totals.fat_g || 0,
            sodium: data?.totals.sodium_mg || 0,
          }}
          targets={{ protein: goalProtein, carbs: 300, fat: 65, sodium: maxSodium }}
        />
      </Card>

      {/* ━━ 첫 기록 뒤 한 번: 알림 켜기 ━━ */}
      {isToday && allEntries.length > 0 && <PushPrompt className="mt-3" />}

      {/* ━━ 기록 직후: 남은 양 + 다음 끼니 후보 ━━ */}
      {isToday && data && allEntries.length > 0 && (() => {
        const filled = Object.fromEntries(Object.entries(data.byMeal).map(([k, v]) => [k, v.length > 0]));
        const { meal, mainLeft } = pickNextMeal(filled, kstHour());
        return (
          <NextMeal
            remainKcal={goalCalories - consumed}
            remainProtein={goalProtein - (data.totals.protein_g || 0)}
            remainSodium={maxSodium - (data.totals.sodium_mg || 0)}
            goalKcal={goalCalories}
            meal={meal} mainLeft={mainLeft}
            exclude={allEntries.map((e) => e.product_id).filter((x): x is string => !!x)}
            onLog={logToMeal}
            version={allEntries.length}
          />
        );
      })()}

      {/* ━━ 끼니별 기록 ━━ */}
      <SectionHeader
        title={isToday ? "오늘의 식사" : formatDate(date)}
        action={<span className="text-caption text-ink-2"><span className="num font-bold text-ink">{filledCount}/4</span> 기록</span>}
      />

      {loading ? (
        <SkeletonList rows={4} thumb={false} />
      ) : (
        <div className="flex flex-col gap-3">
          {MEAL_TYPES.map((meal) => {
            const entries = data?.byMeal[meal.key] || [];
            const mealCal = entries.reduce((s, e) => s + (e.calories || 0), 0);
            const mealAlert = entries.length > 0 ? getMealAlert(entries) : null;
            const isEmpty = entries.length === 0;
            const isAdding = addingMeal === meal.key;
            const toggleAdd = () => {
              setAddingMeal(isAdding ? null : meal.key);
              setAddTab("search"); setSearchQuery(""); setSearchResults([]);
            };

            return (
              <div key={meal.key} className="flex flex-col gap-2">
                {isEmpty && !isAdding ? (
                  <MealSlot meal={meal.key} empty onAdd={toggleAdd} addLabel={`${meal.label} 기록하기`} />
                ) : (
                  <MealSlot
                    meal={meal.key}
                    right={
                      <div className="flex items-center gap-2">
                        {mealAlert && <Badge tone="caution">{mealAlert.label}</Badge>}
                        {mealCal > 0 && <Kcal value={Math.round(mealCal)} className="text-label" />}
                        {entries.length > 0 && !isAdding && (
                          <IconLink icon="share" label={`${meal.label} 피드에 나누기`} className="size-9"
                            href={`/community?compose=meal&date=${date}&meal=${meal.key}`} />
                        )}
                        <IconButton
                          icon={isAdding ? "close" : "plus"}
                          label={isAdding ? "추가 닫기" : `${meal.label}에 음식 추가하기`}
                          size="sm"
                          onClick={toggleAdd}
                          className="-mr-2"
                        />
                      </div>
                    }
                  >
                    {/* 기록된 음식 */}
                    {entries.length > 0 && (
                      <div className="-mx-4 divide-y divide-line border-t border-line mt-2">
                        {entries.map((e) => (
                          <div key={e.id} className="pl-4 pr-2 py-2.5">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-body font-medium text-ink line-clamp-1">
                                {e.product_id
                                  ? <Link href={`/products/${e.product_id}`} className="underline decoration-line-strong underline-offset-4 hover:decoration-ink transition-colors">{e.food_name}</Link>
                                  : e.food_name}
                              </p>
                              <div className="flex flex-wrap gap-x-2 text-caption text-ink-2 mt-0.5">
                                {e.serving_multiplier != null && e.serving_multiplier !== 1 && <span className="font-bold text-brand-ink"><span className="num">{e.serving_multiplier}</span>인분</span>}
                                {e.serving_g != null && <span><span className="num">{e.serving_g}</span>g</span>}
                                {e.protein_g != null && <span>단백질 <span className="num">{e.protein_g}</span>g</span>}
                                {e.sodium_mg != null && e.sodium_mg > 600 && <span className="font-bold text-sodium">나트륨 <span className="num">{e.sodium_mg}</span>mg</span>}
                                {e.fat_g != null && e.fat_g > 15 && !e.sodium_mg && <span>지방 <span className="num">{e.fat_g}</span>g</span>}
                              </div>

                            </div>
                            <span className="num text-label font-bold text-ink shrink-0">{e.calories || 0}</span>
                            <IconButton icon="edit" label={`${e.food_name} 고치기`} size="sm"
                              onClick={() => setEditing({ id: e.id, name: e.food_name, meal: e.meal_type, mult: Number(e.serving_multiplier) || 1, grams: e.serving_g != null ? String(e.serving_g) : "" })} />
                            <IconButton icon="trash" label={`${e.food_name} 삭제하기`} size="sm" onClick={() => setDeleteConfirmId(e.id)} />
                          </div>
                          {e.product_id && ratings[e.product_id] == null && (
                            <QuickRating className="mt-2" onPick={(v) => rateTaste(e.product_id as string, v)} />
                          )}
                          </div>
                        ))}
                      </div>
                    )}

                    {isAdding && renderAddPanel()}
                  </MealSlot>
                )}

              </div>
            );
          })}
        </div>
      )}

      {/* ━━ 영양 갭 알림 ━━ */}
      {topGap && (
        <Link href="/products" className="flex items-center gap-3 px-4 py-3.5 mt-4 rounded-lg border border-line bg-surface hover:border-line-strong transition-colors">
          <span className={cn("size-2 rounded-full shrink-0", gapDot(topGap.nutrient))} aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-label font-bold text-ink">{topGap.label} <span className="num">{Math.round(topGap.target - topGap.current)}</span>{topGap.nutrient.includes("sodium") ? "mg" : "g"} 더 채우면 목표 달성</p>
            <p className="text-caption text-ink-2 mt-0.5">추천 제품 보기</p>
          </div>
          <Icon name="chevron-right" size={18} className="text-ink-3 shrink-0" />
        </Link>
      )}

      {/* ━━ 주간 리포트 ━━ */}
      <Link href="/diary/report" className="flex items-center justify-between gap-3 rounded-lg bg-brand-soft px-4 py-3.5 mt-3 hover:bg-brand-soft/70 transition-colors">
        <div className="min-w-0">
          <p className="text-label font-bold text-ink">주간 영양 리포트</p>
          <p className="text-caption text-ink-2">이번 주 영양 밸런스를 확인하세요</p>
        </div>
        <span className="inline-flex items-center gap-0.5 text-label font-bold text-brand-ink shrink-0">보기 <Icon name="chevron-right" size={16} /></span>
      </Link>

      {/* ━━ 기록한 날 ━━ */}
      {streakDays > 0 && (
        <p className="text-label text-ink-2 text-center mt-5">
          이번 주 <span className="num font-bold text-brand-ink">{streakDays}일</span> 기록했어요
        </p>
      )}

      {/* ━━ 기록이 3일 쌓이면: 기기를 바꿔도 이어 보려면 로그인 ━━ */}
      {loggedIn === false && streakDays >= 3 && (
        <Notice className="mt-4" title="기록이 이 기기에만 묶여 있어요">
          로그인하면 휴대폰을 바꾸거나 다른 기기에서도 이어서 볼 수 있어요.{" "}
          <TextLink href="/login?returnTo=/diary">로그인하기</TextLink>
        </Notice>
      )}

      <p className="text-caption text-ink-3 text-center mt-4">34만 식품 DB에서 검색하면 영양 정보가 자동으로 채워져요</p>

      <ConfirmSheet
        open={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={() => { if (deleteConfirmId) deleteEntry(deleteConfirmId); }}
        title="이 기록을 삭제할까요?"
        description={deleteTarget ? `${deleteTarget.food_name} 기록이 사라져요` : undefined}
        confirmLabel="삭제하기"
      />

      <Sheet open={!!editing} onClose={() => setEditing(null)} title="기록 고치기" description={editing?.name}
        footer={
          <>
            <Button variant="secondary" block onClick={() => setEditing(null)}>취소</Button>
            <Button block loading={editSaving} onClick={saveEdit}>저장하기</Button>
          </>
        }>
        {editing && (
          <div className="flex flex-col gap-5">
            <Field label="끼니">
              <ChipRow>
                {MEAL_TYPES.map((m) => <Chip key={m.key} size="sm" selected={editing.meal === m.key} onClick={() => setEditing({ ...editing, meal: m.key })}>{m.label}</Chip>)}
              </ChipRow>
            </Field>
            <Field label="먹은 양">
              <ChipRow>
                {[0.5, 1, 1.5, 2].map((m) => (
                  <Chip key={m} size="sm" selected={editing.mult === m} onClick={() => setEditing({ ...editing, mult: m })}><span className="num">{m}</span>인분</Chip>
                ))}
              </ChipRow>
            </Field>
            <Field label="1인분 무게 (g)" hint="포장에 적힌 무게와 다르면 먹은 만큼 적어 주세요. 영양값을 다시 계산해요">
              <Input type="number" inputMode="numeric" name="serving_g" value={editing.grams} placeholder="g"
                onChange={(e) => setEditing({ ...editing, grams: e.target.value })} />
            </Field>
          </div>
        )}
      </Sheet>
    </Page>
  );
}
