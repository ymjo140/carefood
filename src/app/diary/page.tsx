"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";

/* ── 타입 ── */
type DiaryEntry = {
  id: string;
  meal_type: string;
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
  memo: string | null;
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
};

type CommonFood = {
  id: string;
  name: string;
  icon: string;
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
  { key: "breakfast", label: "아침", emoji: "☀️", icon: "sun", color: "var(--meal-breakfast)" },
  { key: "lunch", label: "점심", emoji: "🌤️", icon: "noon", color: "var(--meal-lunch)" },
  { key: "dinner", label: "저녁", emoji: "🌙", icon: "moon", color: "var(--meal-dinner)" },
  { key: "snack", label: "간식", emoji: "🍪", icon: "snack", color: "var(--meal-snack)" },
];

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

/* ── 경고 임계값 (1끼 기준) ── */
const MEAL_THRESHOLDS = {
  sodium_mg: 800,
  fat_g: 25,
  carbs_g: 100,
  protein_g: 60,
};

function getUserId(): string {
  try {
    const profile = localStorage.getItem("carefood_profile");
    if (profile) {
      const p = JSON.parse(profile);
      if (p.user_id) return p.user_id;
    }
    let id = localStorage.getItem("carefood_anon_id");
    if (!id) {
      id = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem("carefood_anon_id", id);
    }
    return id;
  } catch {
    return `anon_${Date.now()}`;
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_NAMES[d.getDay()]})`;
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

/* ── SVG 아이콘 ── */
function MealIcon({ type, color }: { type: string; color: string }) {
  const props = { viewBox: "0 0 24 24", width: 20, height: 20, fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round" as const };
  switch (type) {
    case "sun": return <svg {...props}><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41"/></svg>;
    case "noon": return <svg {...props}><circle cx="12" cy="12" r="5"/><path d="M12 1v3m0 16v3"/></svg>;
    case "moon": return <svg {...props}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
    case "snack": return <svg {...props}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
    default: return null;
  }
}

/* ── 제품 리스트 (공통) ── */
function ProductList({ items, onSelect }: { items: SearchResult[]; onSelect: (p: SearchResult) => void }) {
  return (
    <div className="space-y-1 max-h-52 overflow-y-auto">
      {items.map((p) => (
        <button
          key={p.id}
          onClick={() => onSelect(p)}
          className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-card transition-colors flex items-center justify-between gap-2"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{p.name}</p>
            <div className="flex gap-2 text-[10px] text-muted">
              {p.manufacturer && <span>{p.manufacturer}</span>}
              {p.calories != null && <span>{p.calories}kcal</span>}
              {p.protein_g != null && <span>단백질 {p.protein_g}g</span>}
            </div>
          </div>
          <span className="text-primary text-xs shrink-0">+ 추가</span>
        </button>
      ))}
    </div>
  );
}

/* ── 칼로리 링 SVG ── */
function CalorieRing({ consumed, goal }: { consumed: number; goal: number }) {
  const r = 84;
  const circumference = 2 * Math.PI * r;
  const ratio = Math.min(consumed / goal, 1.2);
  const offset = circumference - ratio * circumference;
  const remaining = Math.max(goal - consumed, 0);
  const isOver = consumed > goal;

  return (
    <div className="relative" style={{ width: 200, height: 200 }}>
      <svg viewBox="0 0 200 200" width="200" height="200">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--ring-start)" />
            <stop offset="100%" stopColor="var(--ring-end)" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r={r} fill="none" stroke="var(--ring-track)" strokeWidth="14" />
        <circle
          cx="100" cy="100" r={r} fill="none"
          stroke={isOver ? "var(--accent)" : "url(#ringGrad)"}
          strokeWidth="14" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 100 100)"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="leading-none tracking-tight"
          style={{ fontFamily: "var(--font-outfit), sans-serif", fontSize: 44, fontWeight: 800, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em" }}
        >
          {isOver ? `+${consumed - goal}` : remaining}
        </span>
        <span className="text-[13px] text-muted font-medium mt-0.5">
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
  const [addingMeal, setAddingMeal] = useState<string | null>(null);
  const [addTab, setAddTab] = useState<"search" | "favorites" | "weekly" | "manual" | "photo">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [commonFoods, setCommonFoods] = useState<CommonFood[]>([]);
  const [searching, setSearching] = useState(false);
  const [manualForm, setManualForm] = useState({ food_name: "", calories: "", protein_g: "", serving_g: "" });
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoAnalyzing, setPhotoAnalyzing] = useState(false);
  const [photoResults, setPhotoResults] = useState<{
    recognized: { name: string; confidence: number }[];
    matched: {
      commonFoods: CommonFood[];
      products: SearchResult[];
    };
    hasAI: boolean;
  } | null>(null);
  const [userId, setUserId] = useState("");
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

  /* ── 초기화 ── */
  useEffect(() => {
    setUserId(getUserId());
    setDate(new Date().toISOString().slice(0, 10));
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
          }).catch(() => {});
        }
      }
    } catch { /* */ }
  }, [userId]);

  /* ── 데이터 페칭 ── */
  const fetchDiary = useCallback(async () => {
    if (!userId || !date) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/diary?date=${date}&user_id=${userId}`);
      const d = await res.json();
      setData(d);
    } catch { /* */ }
    setLoading(false);
  }, [date, userId]);

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
    } catch { /* */ }
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
    } catch { /* */ }
  }, []);

  useEffect(() => { if (addTab === "favorites") loadFavorites(); }, [addTab, loadFavorites]);

  const loadWeeklyTrend = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/diary/weekly?user_id=${userId}`);
      if (res.ok) setWeeklyTrend(await res.json());
    } catch { /* */ }
  }, [userId]);

  useEffect(() => { loadWeeklyTrend(); }, [loadWeeklyTrend]);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/community/group-buy/suggest?user_id=${userId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setGapSuggestions(d); })
      .catch(() => {});
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
      setSearchResults(prodData.products || []);
      setCommonFoods(foodData.foods || []);
    } catch { /* */ }
    setSearching(false);
  };

  const addFromProduct = async (product: SearchResult) => {
    if (!addingMeal) return;
    await fetch("/api/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId, date, meal_type: addingMeal,
        product_id: product.id, food_name: product.name,
        serving_g: product.serving_size_g || 100,
      }),
    });
    setAddingMeal(null);
    setSearchQuery("");
    setSearchResults([]);
    setCommonFoods([]);
    fetchDiary();
    loadWeeklyTrend();
  };

  // 일반 음식(외식)으로 기록 추가
  const addFromCommonFood = async (food: CommonFood) => {
    if (!addingMeal) return;
    await fetch("/api/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId, date, meal_type: addingMeal,
        food_name: food.name,
        serving_g: food.serving_size_g || 100,
        calories: food.calories,
        protein_g: food.protein_g,
        carbs_g: food.carbs_g,
        fat_g: food.fat_g,
        sodium_mg: food.sodium_mg,
        sugar_g: food.sugar_g,
      }),
    });
    setAddingMeal(null);
    setSearchQuery("");
    setSearchResults([]);
    setCommonFoods([]);
    fetchDiary();
    loadWeeklyTrend();
  };

  const addManual = async () => {
    if (!addingMeal || !manualForm.food_name) return;
    await fetch("/api/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId, date, meal_type: addingMeal,
        food_name: manualForm.food_name,
        calories: manualForm.calories ? Number(manualForm.calories) : null,
        protein_g: manualForm.protein_g ? Number(manualForm.protein_g) : null,
        serving_g: manualForm.serving_g ? Number(manualForm.serving_g) : null,
      }),
    });
    setAddingMeal(null);
    setAddTab("search");
    setManualForm({ food_name: "", calories: "", protein_g: "", serving_g: "" });
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
      setPhotoResults(data);
    } catch {
      setPhotoResults({ recognized: [], matched: { commonFoods: [], products: [] }, hasAI: false });
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
    await fetch(`/api/diary?id=${id}`, { method: "DELETE" });
    fetchDiary();
  };

  /* ── 날짜 이동 ── */
  const moveDate = (days: number) => {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().slice(0, 10));
  };

  const todayStr = typeof window !== "undefined" ? new Date().toISOString().slice(0, 10) : "";
  const isToday = date === todayStr;

  /* ── 주간 스트립 데이터 ── */
  const weekDays = useMemo(() => {
    if (!date) return [];
    const goalCal = data?.goals?.daily_calories || weeklyTrend?.goalCalories || 2000;
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(date + "T00:00:00");
      d.setDate(d.getDate() + (i - 3));
      const ds = d.toISOString().slice(0, 10);
      const trendDay = weeklyTrend?.days.find(td => td.date === ds);
      const cal = trendDay?.calories || 0;
      const count = trendDay?.count || 0;
      const ratio = goalCal > 0 ? cal / goalCal : 0;
      const isFuture = ds > todayStr;
      return { dateStr: ds, day: d.getDate(), dow: DAY_NAMES[d.getDay()], cal, count, ratio, isFuture, isActive: ds === date };
    });
  }, [date, weeklyTrend, data, todayStr]);

  /* ── 계산 ── */
  const goalCalories = data?.goals?.daily_calories || 2000;
  const goalProtein = data?.goals?.daily_protein_g || 80;
  const maxSodium = data?.goals?.max_sodium_mg || 2000;
  const consumed = data?.totals.calories || 0;
  const filledCount = data ? Object.values(data.byMeal).filter(arr => arr.length > 0).length : 0;

  // 첫 번째 빈 슬롯에 추천 표시 (저녁 우선)
  const firstEmptySlot = useMemo(() => {
    if (!data) return null;
    const priority = ["dinner", "lunch", "breakfast", "snack"];
    for (const key of priority) {
      if (!data.byMeal[key] || data.byMeal[key].length === 0) return key;
    }
    return null;
  }, [data]);

  const topSuggestion = gapSuggestions?.suggestions?.[0] || null;
  const topGap = gapSuggestions?.gaps?.[0] || null;

  /* ══════════════════ RENDER ══════════════════ */
  if (!date) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-[430px] mx-auto px-4 py-3 pb-24">

      {/* ━━ 주간 캘린더 스트립 ━━ */}
      <div className="flex items-center gap-0.5 mb-5">
        <button onClick={() => moveDate(-7)} className="w-7 h-7 rounded-full flex items-center justify-center text-muted hover:text-primary transition-colors shrink-0" aria-label="이전 주">
          ‹
        </button>
        <div className="flex flex-1 gap-1">
          {weekDays.map((wd) => {
            const barColor = wd.count === 0 ? "transparent" : wd.ratio > 0.9 ? "var(--success)" : wd.ratio > 0.5 ? "var(--primary)" : "var(--accent)";
            return (
              <button
                key={wd.dateStr}
                onClick={() => setDate(wd.dateStr)}
                className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-2xl transition-all ${
                  wd.isActive ? "bg-primary text-white" : wd.isFuture ? "opacity-50" : "hover:bg-primary/8"
                }`}
              >
                <span className={`text-[10px] font-medium ${wd.isActive ? "text-white/80" : "text-muted"}`} style={{ letterSpacing: "0.05em" }}>
                  {wd.dow}
                </span>
                <span className="text-[15px] font-bold leading-none" style={{ fontFamily: "var(--font-outfit), sans-serif" }}>
                  {wd.day}
                </span>
                <div className={`w-1.5 rounded-sm overflow-hidden flex flex-col-reverse ${wd.isActive ? "bg-white/25" : "bg-border"}`} style={{ height: 20 }}>
                  <div className="w-full rounded-sm transition-all" style={{ height: `${Math.max(wd.ratio * 100, wd.count > 0 ? 15 : 0)}%`, background: wd.isActive && wd.count > 0 ? "#fff" : barColor }} />
                </div>
              </button>
            );
          })}
        </div>
        <button onClick={() => moveDate(7)} className="w-7 h-7 rounded-full flex items-center justify-center text-muted hover:text-primary transition-colors shrink-0" aria-label="다음 주">
          ›
        </button>
      </div>

      {/* ━━ 대시보드 카드 (칼로리 링 + 매크로) ━━ */}
      <div className="bg-card rounded-3xl p-6 shadow-[0_1px_4px_rgba(0,0,0,0.06)] mb-5">
        <div className="flex flex-col items-center mb-5">
          <CalorieRing consumed={consumed} goal={goalCalories} />
          <p className="text-xs text-muted mt-4" style={{ fontVariantNumeric: "tabular-nums" }}>
            섭취 <b className="text-foreground font-bold">{consumed.toLocaleString()}</b> / 목표 <b className="text-foreground font-bold">{goalCalories.toLocaleString()}</b> kcal
          </p>
        </div>

        {/* 매크로 4종 */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "단백질", value: data?.totals.protein_g || 0, unit: "g", goal: goalProtein, color: "var(--macro-protein)", bg: "var(--macro-protein-bg)" },
            { label: "탄수화물", value: data?.totals.carbs_g || 0, unit: "g", goal: 300, color: "var(--macro-carbs)", bg: "var(--macro-carbs-bg)" },
            { label: "지방", value: data?.totals.fat_g || 0, unit: "g", goal: 65, color: "var(--macro-fat)", bg: "var(--macro-fat-bg)" },
            { label: "나트륨", value: data?.totals.sodium_mg || 0, unit: "mg", goal: maxSodium, color: "var(--macro-sodium)", bg: "var(--macro-sodium-bg)" },
          ].map((m) => {
            const pct = Math.min((m.value / m.goal) * 100, 100);
            return (
              <div key={m.label} className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl" style={{ background: m.bg }}>
                <span className="font-bold leading-none" style={{ fontFamily: "var(--font-outfit), sans-serif", fontSize: 18, color: m.color, fontVariantNumeric: "tabular-nums" }}>
                  {m.value}<span className="text-[11px] font-medium">{m.unit}</span>
                </span>
                <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--ring-track)" }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: m.color }} />
                </div>
                <span className="text-[11px] text-muted font-medium">{m.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ━━ 섹션 라벨 ━━ */}
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-[13px] font-bold text-foreground/70">
          {isToday ? "오늘의 식사" : formatDate(date)}
        </span>
        <span className="text-[12px] text-muted font-semibold" style={{ fontFamily: "var(--font-outfit), sans-serif" }}>
          {filledCount}/4 기록
        </span>
      </div>

      {/* ━━ 끼니별 카드 ━━ */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-2.5">
          {MEAL_TYPES.map((meal) => {
            const entries = data?.byMeal[meal.key] || [];
            const mealCal = entries.reduce((s, e) => s + (e.calories || 0), 0);
            const alert = entries.length > 0 ? getMealAlert(entries) : null;
            const isEmpty = entries.length === 0;
            const showSuggestion = isEmpty && meal.key === firstEmptySlot && topSuggestion;
            const firstEntryTime = entries[0]?.memo; // placeholder

            // 경고 스타일
            const alertBg = alert ? `var(--macro-${alert.nutrient}-bg)` : undefined;
            const alertBorder = alert ? `var(--macro-${alert.nutrient})` : "transparent";

            return (
              <div key={meal.key}>
                <div
                  className={`bg-card rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.06)] transition-all ${isEmpty && !showSuggestion ? "opacity-60" : ""}`}
                  style={{
                    borderLeft: `4px solid ${alertBorder}`,
                    background: alertBg || "var(--card)",
                  }}
                >
                  {/* 끼니 헤더 */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `color-mix(in srgb, ${meal.color} 12%, transparent)` }}>
                      <MealIcon type={meal.icon} color={meal.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-bold">{meal.label}</div>
                      <div className="text-[11px] mt-0.5" style={{ color: alert ? `var(--macro-${alert.nutrient})` : "var(--muted)", fontWeight: alert ? 600 : 400 }}>
                        {alert ? alert.label : isEmpty ? (showSuggestion ? "추천이 있어요" : "탭해서 기록하기") : formatDate(date).split(" ")[1]}
                      </div>
                    </div>
                    {mealCal > 0 && (
                      <span className="text-primary font-bold shrink-0" style={{ fontFamily: "var(--font-outfit), sans-serif", fontSize: 16, fontVariantNumeric: "tabular-nums" }}>
                        {Math.round(mealCal)} <span className="text-[11px] font-medium text-muted">kcal</span>
                      </span>
                    )}
                    <button
                      onClick={() => {
                        setAddingMeal(addingMeal === meal.key ? null : meal.key);
                        setAddTab("search"); setSearchQuery(""); setSearchResults([]);
                      }}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-primary hover:bg-primary/10 transition-colors text-lg font-bold shrink-0"
                    >
                      +
                    </button>
                  </div>

                  {/* 기록된 음식 */}
                  {entries.length > 0 && (
                    <div className="border-t" style={{ borderColor: "var(--border)" }}>
                      {entries.map((e) => (
                        <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 group" style={{ borderBottom: "1px solid var(--border)" }}>
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: "var(--surface)" }}>
                            {meal.emoji}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold truncate">{e.food_name}</p>
                            <div className="flex gap-2 text-[11px] text-muted mt-0.5" style={{ fontVariantNumeric: "tabular-nums" }}>
                              {e.serving_g != null && <span>{e.serving_g}g</span>}
                              {e.protein_g != null && <span>단백질 {e.protein_g}g</span>}
                              {e.sodium_mg != null && e.sodium_mg > 600 && <span style={{ color: "var(--macro-sodium)", fontWeight: 600 }}>나트륨 {e.sodium_mg}mg</span>}
                              {e.fat_g != null && e.fat_g > 15 && !e.sodium_mg && <span>지방 {e.fat_g}g</span>}
                            </div>
                          </div>
                          <span className="text-[14px] font-semibold shrink-0" style={{ fontFamily: "var(--font-outfit), sans-serif", fontVariantNumeric: "tabular-nums" }}>
                            {e.calories || 0}
                          </span>
                          <button onClick={() => deleteEntry(e.id)} className="text-muted hover:text-accent opacity-0 group-hover:opacity-100 transition-all text-xs px-1">✕</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 추가 모드 (탭) */}
                  {addingMeal === meal.key && (
                    <div className="border-t" style={{ borderColor: "var(--border)" }}>
                      <div className="flex border-b" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                        {([
                          { key: "search" as const, label: "검색" },
                          { key: "photo" as const, label: "📷 사진" },
                          { key: "favorites" as const, label: `즐겨찾기${favorites.length > 0 ? ` (${favorites.length})` : ""}` },
                          { key: "weekly" as const, label: `식단박스${weeklyItems.length > 0 ? ` (${weeklyItems.length})` : ""}` },
                          { key: "manual" as const, label: "직접 입력" },
                        ]).map((tab) => (
                          <button
                            key={tab.key}
                            onClick={() => setAddTab(tab.key)}
                            className={`flex-1 py-2 text-[11px] font-medium transition-colors ${
                              addTab === tab.key ? "text-primary border-b-2 border-primary" : "text-muted hover:text-foreground"
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                      <div className="p-4" style={{ background: "color-mix(in srgb, var(--surface) 50%, transparent)" }}>
                        {addTab === "search" && (
                          <>
                            <div className="relative mb-3">
                              <input
                                type="text" value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); searchProducts(e.target.value); }}
                                placeholder="제품명 검색 (예: 닭가슴살, 샐러드...)"
                                className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm focus:border-primary focus:outline-none"
                                autoFocus
                              />
                              {searching && <div className="absolute right-3 top-3"><div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>}
                            </div>
                            {/* 일반 음식 결과 */}
                            {commonFoods.length > 0 && (
                              <div className="mb-3">
                                <div className="text-[10px] font-bold text-muted uppercase tracking-wider px-1 mb-1.5">외식 · 일반 음식</div>
                                <div className="space-y-1">
                                  {commonFoods.map((food) => (
                                    <button key={food.id} onClick={() => addFromCommonFood(food)}
                                      className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-card transition-colors flex items-center gap-3">
                                      <span className="text-xl shrink-0">{food.icon}</span>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold">{food.name}</p>
                                        <div className="flex gap-2 text-[10px] text-muted mt-0.5" style={{fontFamily: "'Outfit', sans-serif"}}>
                                          <span>{food.serving_desc}</span>
                                          {food.calories != null && <span>{food.calories}kcal</span>}
                                          {food.protein_g != null && <span>단백질 {food.protein_g}g</span>}
                                        </div>
                                      </div>
                                      <span className="text-xs text-primary font-bold shrink-0">+ 기록</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* 제품 결과 */}
                            {searchResults.length > 0 && (
                              <div>
                                {commonFoods.length > 0 && <div className="text-[10px] font-bold text-muted uppercase tracking-wider px-1 mb-1.5">제품</div>}
                                <ProductList items={searchResults} onSelect={addFromProduct} />
                              </div>
                            )}
                            {searchQuery && searchResults.length === 0 && commonFoods.length === 0 && !searching && <p className="text-xs text-muted text-center py-3">검색 결과가 없어요</p>}
                          </>
                        )}
                        {addTab === "favorites" && (
                          favorites.length > 0 ? <ProductList items={favorites} onSelect={addFromProduct} /> : (
                            <div className="text-center py-6"><p className="text-2xl mb-2">♡</p><p className="text-xs text-muted">즐겨찾기한 제품이 없어요</p></div>
                          )
                        )}
                        {addTab === "weekly" && (
                          weeklyItems.length > 0 ? <ProductList items={weeklyItems} onSelect={addFromProduct} /> : (
                            <div className="text-center py-6"><p className="text-2xl mb-2">📦</p><p className="text-xs text-muted">주간 식단 박스를 먼저 만들어보세요</p><Link href="/weekly-box" className="text-[10px] text-primary mt-1 inline-block">주간 박스 만들기 →</Link></div>
                          )
                        )}
                        {addTab === "photo" && (
                          <div>
                            {!photoPreview ? (
                              <div className="text-center py-6">
                                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4">
                                  <svg className="w-10 h-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                                  </svg>
                                </div>
                                <p className="text-sm font-bold mb-1">음식 사진으로 기록하기</p>
                                <p className="text-xs text-muted mb-4">사진을 찍거나 갤러리에서 선택하세요</p>
                                <div className="flex gap-2 justify-center">
                                  <label className="cursor-pointer px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:brightness-110 transition-all flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                                    </svg>
                                    촬영
                                    <input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="hidden" />
                                  </label>
                                  <label className="cursor-pointer px-4 py-2.5 bg-card border border-border rounded-xl text-sm font-medium hover:bg-surface transition-all flex items-center gap-2">
                                    <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                                    </svg>
                                    갤러리
                                    <input type="file" accept="image/*" onChange={handlePhotoCapture} className="hidden" />
                                  </label>
                                </div>
                              </div>
                            ) : (
                              <div>
                                {/* 사진 미리보기 */}
                                <div className="relative mb-3">
                                  <img src={photoPreview} alt="음식 사진" className="w-full h-48 object-cover rounded-xl" />
                                  <button
                                    onClick={resetPhoto}
                                    className="absolute top-2 right-2 w-7 h-7 bg-black/50 text-white rounded-full flex items-center justify-center text-xs hover:bg-black/70"
                                  >
                                    ✕
                                  </button>
                                  {photoAnalyzing && (
                                    <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center">
                                      <div className="bg-card rounded-xl px-4 py-3 flex items-center gap-2">
                                        <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                        <span className="text-sm font-medium">음식 분석 중...</span>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* AI 인식 결과 */}
                                {photoResults && (
                                  <div>
                                    {photoResults.recognized.length > 0 && (
                                      <div className="mb-3">
                                        <div className="flex items-center gap-1.5 mb-2">
                                          <span className="text-xs font-bold text-primary">AI 인식 결과</span>
                                          <span className="text-[10px] text-muted">
                                            {photoResults.recognized.map((r) => r.name).join(", ")}
                                          </span>
                                        </div>
                                      </div>
                                    )}

                                    {/* 매칭된 일반 음식 */}
                                    {photoResults.matched.commonFoods.length > 0 && (
                                      <div className="mb-3">
                                        <div className="text-[10px] font-bold text-muted uppercase tracking-wider px-1 mb-1.5">매칭된 음식</div>
                                        <div className="space-y-1">
                                          {photoResults.matched.commonFoods.map((food) => (
                                            <button key={food.id} onClick={() => { addFromCommonFood(food); resetPhoto(); }}
                                              className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-card transition-colors flex items-center gap-3">
                                              <span className="text-xl shrink-0">{food.icon}</span>
                                              <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold">{food.name}</p>
                                                <div className="flex gap-2 text-[10px] text-muted mt-0.5" style={{ fontFamily: "'Outfit', sans-serif" }}>
                                                  <span>{food.serving_desc}</span>
                                                  {food.calories != null && <span>{food.calories}kcal</span>}
                                                </div>
                                              </div>
                                              <span className="text-xs text-primary font-bold shrink-0">+ 기록</span>
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* 매칭된 제품 */}
                                    {photoResults.matched.products.length > 0 && (
                                      <div className="mb-3">
                                        <div className="text-[10px] font-bold text-muted uppercase tracking-wider px-1 mb-1.5">매칭된 제품</div>
                                        <ProductList items={photoResults.matched.products} onSelect={(p) => { addFromProduct(p); resetPhoto(); }} />
                                      </div>
                                    )}

                                    {/* 결과 없음 / AI 없음 → 검색 or 직접 입력 유도 */}
                                    {photoResults.matched.commonFoods.length === 0 && photoResults.matched.products.length === 0 && (
                                      <div className="text-center py-4">
                                        <p className="text-sm text-muted mb-3">
                                          {photoResults.hasAI
                                            ? "매칭되는 음식을 찾지 못했어요"
                                            : "사진이 저장되었어요. 음식을 선택해주세요"}
                                        </p>
                                        <div className="flex gap-2 justify-center">
                                          <button
                                            onClick={() => setAddTab("search")}
                                            className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold"
                                          >
                                            검색으로 추가
                                          </button>
                                          <button
                                            onClick={() => setAddTab("manual")}
                                            className="px-4 py-2 bg-card border border-border rounded-xl text-sm font-medium"
                                          >
                                            직접 입력
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* 다시 찍기 */}
                                {!photoAnalyzing && (
                                  <label className="cursor-pointer block text-center mt-3 text-xs text-muted hover:text-foreground transition-colors">
                                    다른 사진으로 변경
                                    <input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="hidden" />
                                  </label>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        {addTab === "manual" && (
                          <>
                            <div className="space-y-2 mb-3">
                              <input type="text" value={manualForm.food_name} onChange={(e) => setManualForm({ ...manualForm, food_name: e.target.value })} placeholder="음식 이름" className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm focus:border-primary focus:outline-none" autoFocus />
                              <div className="grid grid-cols-3 gap-2">
                                <input type="number" value={manualForm.calories} onChange={(e) => setManualForm({ ...manualForm, calories: e.target.value })} placeholder="칼로리" className="px-2 py-2 rounded-lg bg-background border border-border text-xs focus:border-primary focus:outline-none text-center" />
                                <input type="number" value={manualForm.protein_g} onChange={(e) => setManualForm({ ...manualForm, protein_g: e.target.value })} placeholder="단백질(g)" className="px-2 py-2 rounded-lg bg-background border border-border text-xs focus:border-primary focus:outline-none text-center" />
                                <input type="number" value={manualForm.serving_g} onChange={(e) => setManualForm({ ...manualForm, serving_g: e.target.value })} placeholder="양(g)" className="px-2 py-2 rounded-lg bg-background border border-border text-xs focus:border-primary focus:outline-none text-center" />
                              </div>
                            </div>
                            <button onClick={addManual} disabled={!manualForm.food_name} className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-40">추가</button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 빈 슬롯 추천 카드 */}
                {showSuggestion && addingMeal !== meal.key && (
                  <div
                    className="mt-2 rounded-2xl p-4 cursor-pointer transition-all hover:shadow-lg"
                    style={{ background: "linear-gradient(135deg, var(--primary-light), var(--card))", border: "1.5px solid var(--primary)" }}
                    onClick={() => { setAddingMeal(meal.key); setAddTab("search"); }}
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="var(--primary)" strokeWidth={2.5} strokeLinecap="round">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                      </svg>
                      <span className="text-[10px] font-bold text-primary tracking-wider uppercase">{meal.label} 추천</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-card shadow-sm flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                        {topGap?.label?.slice(0, 3) || "추천"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-bold truncate">{topSuggestion.product_name}</p>
                        <p className="text-[11px] text-foreground/60 mt-0.5 line-clamp-1">{topSuggestion.reason || `${topGap?.label || ""} 보충에 적합해요`}</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); addFromProduct({ id: topSuggestion.product_id, name: topSuggestion.product_name, manufacturer: null, calories: null, protein_g: null, serving_size_g: null }); }}
                        className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center text-xl shrink-0 shadow-md"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ━━ 영양 갭 알림 ━━ */}
      {topGap && (
        <Link href="/products" className="flex items-center gap-3.5 px-4 py-4 mt-4 bg-card rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:shadow-lg transition-all">
          <div className="w-2 h-2 rounded-full shrink-0" style={{
            background: topGap.nutrient.includes("protein") ? "var(--macro-protein)"
              : topGap.nutrient.includes("sodium") ? "var(--macro-sodium)"
              : topGap.nutrient.includes("fat") ? "var(--macro-fat)"
              : "var(--macro-carbs)"
          }} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold">{topGap.label} {Math.round(topGap.target - topGap.current)}{topGap.nutrient.includes("sodium") ? "mg" : "g"} 더 채우면 목표 달성</p>
            <p className="text-[11px] text-muted mt-0.5">탭해서 추천 제품 보기</p>
          </div>
          <span className="text-muted text-base shrink-0">›</span>
        </Link>
      )}

      {/* ━━ 주간 리포트 배너 ━━ */}
      <Link href="/diary/report"
        className="flex items-center justify-between bg-primary/8 border border-primary/20 rounded-2xl px-4 py-3 mt-4 hover:bg-primary/12 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-lg">📊</span>
          <div>
            <p className="text-sm font-bold">주간 영양 리포트</p>
            <p className="text-[10px] text-muted">이번 주 영양 밸런스를 확인하세요</p>
          </div>
        </div>
        <span className="text-xs text-primary font-bold">보기 →</span>
      </Link>

      {/* ━━ 스트릭 ━━ */}
      {weeklyTrend && weeklyTrend.days.filter(d => d.count > 0).length > 0 && (
        <div className="flex items-center justify-center gap-2 mt-5 py-2 px-5 rounded-full bg-primary/8 w-fit mx-auto">
          <span className="text-[14px]" style={{ fontFamily: "var(--font-outfit), sans-serif", fontWeight: 700, color: "var(--primary)" }}>
            🔥 {weeklyTrend.days.filter(d => d.count > 0).length}일
          </span>
          <span className="text-[12px] text-foreground/60">연속 기록</span>
        </div>
      )}

      {/* ━━ 하단 안내 ━━ */}
      <div className="mt-6 text-center">
        <p className="text-xs text-muted">34만 식품 DB에서 검색하면 영양 정보가 자동으로 채워져요</p>
      </div>
    </div>
  );
}
