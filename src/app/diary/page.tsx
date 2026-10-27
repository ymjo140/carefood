"use client";

import { useEffect, useState, useCallback } from "react";
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

const MEAL_TYPES = [
  { key: "breakfast", label: "아침", emoji: "🌅", time: "07:00 - 09:00" },
  { key: "lunch", label: "점심", emoji: "☀️", time: "12:00 - 13:00" },
  { key: "dinner", label: "저녁", emoji: "🌙", time: "18:00 - 19:00" },
  { key: "snack", label: "간식", emoji: "🍪", time: "" },
];

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
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
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

/* ── 메인 ── */
export default function DiaryPage() {
  const [date, setDate] = useState("");
  const [data, setData] = useState<DiaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingMeal, setAddingMeal] = useState<string | null>(null);
  const [addTab, setAddTab] = useState<"search" | "favorites" | "weekly" | "manual">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [manualForm, setManualForm] = useState({ food_name: "", calories: "", protein_g: "", serving_g: "" });
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

  useEffect(() => {
    setUserId(getUserId());
    setDate(new Date().toISOString().slice(0, 10));
  }, []);

  // 영양 목표 가져오기 (프로필에서)
  useEffect(() => {
    if (!userId) return;
    try {
      const profile = localStorage.getItem("carefood_profile");
      if (profile) {
        const p = JSON.parse(profile);
        if (p.nutrition_goals) {
          // daily_nutrition_goals에 저장
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

  // 즐겨찾기 로드
  const loadFavorites = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/favorites?user_id=${userId}`);
      if (res.ok) {
        const d = await res.json();
        setFavorites((d.favorites || []).map((f: any) => ({
          id: f.product_id,
          name: f.name,
          manufacturer: f.manufacturer,
          calories: f.calories,
          protein_g: f.protein_g,
          serving_size_g: null,
        })));
      }
    } catch { /* */ }
  }, [userId]);

  // 주간 식단 박스 로드 (localStorage에 저장된 최근 결과)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("carefood_weekly_box");
      if (saved) {
        const box = JSON.parse(saved);
        // weekly box 결과에서 제품 목록 추출
        const items: SearchResult[] = [];
        const seen = new Set<string>();
        for (const day of box.days || []) {
          for (const slot of Object.values(day.slots || {}) as any[]) {
            if (slot?.product_id && !seen.has(slot.product_id)) {
              seen.add(slot.product_id);
              items.push({
                id: slot.product_id,
                name: slot.name || slot.product_name || "알 수 없음",
                manufacturer: slot.manufacturer || slot.source || null,
                calories: slot.calories || null,
                protein_g: slot.protein_g || null,
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

  // 주간 추이 로드
  const loadWeeklyTrend = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/diary/weekly?user_id=${userId}`);
      if (res.ok) setWeeklyTrend(await res.json());
    } catch { /* */ }
  }, [userId]);

  useEffect(() => { loadWeeklyTrend(); }, [loadWeeklyTrend]);

  // 영양 갭 기반 공구 추천
  useEffect(() => {
    if (!userId) return;
    fetch(`/api/community/group-buy/suggest?user_id=${userId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setGapSuggestions(d); })
      .catch(() => {});
  }, [userId]);

  // 제품 검색
  const searchProducts = async (q: string) => {
    if (q.length < 1) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/products?search=${encodeURIComponent(q)}&limit=8&sort=health_desc`);
      const d = await res.json();
      setSearchResults(d.products || []);
    } catch { /* */ }
    setSearching(false);
  };

  // 제품으로 기록 추가
  const addFromProduct = async (product: SearchResult) => {
    if (!addingMeal) return;
    await fetch("/api/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        date,
        meal_type: addingMeal,
        product_id: product.id,
        food_name: product.name,
        serving_g: product.serving_size_g || 100,
      }),
    });
    setAddingMeal(null);
    setSearchQuery("");
    setSearchResults([]);
    fetchDiary();
    loadWeeklyTrend();
  };

  // 직접 입력으로 기록 추가
  const addManual = async () => {
    if (!addingMeal || !manualForm.food_name) return;
    await fetch("/api/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        date,
        meal_type: addingMeal,
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

  // 기록 삭제
  const deleteEntry = async (id: string) => {
    await fetch(`/api/diary?id=${id}`, { method: "DELETE" });
    fetchDiary();
  };

  // 날짜 이동
  const moveDate = (days: number) => {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().slice(0, 10));
  };

  const todayStr = typeof window !== "undefined" ? new Date().toISOString().slice(0, 10) : "";
  const isToday = date === todayStr;

  // 영양 달성률 계산
  const goalCalories = data?.goals?.daily_calories || 2000;
  const calRatio = data ? Math.min((data.totals.calories / goalCalories) * 100, 100) : 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-extrabold">식단 다이어리</h1>
        <Link href="/products" className="text-xs text-primary hover:text-primary-dark transition-colors">
          제품 탐색 →
        </Link>
      </div>

      {!date ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (<>
      {/* 날짜 선택 */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <button onClick={() => moveDate(-1)} className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center hover:bg-surface transition-colors text-sm">
          ←
        </button>
        <button
          onClick={() => {
            const input = document.createElement("input");
            input.type = "date";
            input.value = date;
            input.onchange = (e) => setDate((e.target as HTMLInputElement).value);
            input.showPicker?.();
            input.click();
          }}
          className="text-center"
        >
          <p className="font-bold">{formatDate(date)}</p>
          {isToday && <p className="text-[10px] text-primary">오늘</p>}
        </button>
        <button onClick={() => moveDate(1)} disabled={isToday} className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center hover:bg-surface transition-colors text-sm disabled:opacity-30">
          →
        </button>
      </div>

      {/* 일일 영양 요약 */}
      {data && (
        <div className="bg-card rounded-2xl p-4 mb-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold">오늘의 영양</p>
            <p className="text-xs text-muted">{data.mealCount}개 기록</p>
          </div>

          {/* 칼로리 바 */}
          <div className="mb-3">
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium">{data.totals.calories}kcal</span>
              <span className="text-muted">/ {goalCalories}kcal</span>
            </div>
            <div className="h-2.5 bg-surface rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${calRatio > 90 ? "bg-accent" : "bg-primary"}`}
                style={{ width: `${calRatio}%` }}
              />
            </div>
          </div>

          {/* 매크로 */}
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: "단백질", value: `${data.totals.protein_g}g`, color: "text-blue-500" },
              { label: "탄수화물", value: `${data.totals.carbs_g}g`, color: "text-yellow-500" },
              { label: "지방", value: `${data.totals.fat_g}g`, color: "text-red-400" },
              { label: "나트륨", value: `${data.totals.sodium_mg}mg`, color: "text-purple-400" },
            ].map((m) => (
              <div key={m.label}>
                <p className={`text-sm font-bold ${m.color}`}>{m.value}</p>
                <p className="text-[10px] text-muted">{m.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 끼니별 기록 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {MEAL_TYPES.map((meal) => {
            const entries = data?.byMeal[meal.key] || [];
            const mealCal = entries.reduce((s, e) => s + (e.calories || 0), 0);
            return (
              <div key={meal.key} className="bg-card rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                {/* 끼니 헤더 */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{meal.emoji}</span>
                    <div>
                      <span className="font-bold text-sm">{meal.label}</span>
                      {meal.time && <span className="text-[10px] text-muted ml-2">{meal.time}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {mealCal > 0 && <span className="text-xs text-muted">{Math.round(mealCal)}kcal</span>}
                    <button
                      onClick={() => {
                        setAddingMeal(addingMeal === meal.key ? null : meal.key);
                        setAddTab("search");
                        setSearchQuery("");
                        setSearchResults([]);
                      }}
                      className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors text-sm font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* 기록된 음식 */}
                {entries.length > 0 && (
                  <div className="divide-y divide-border/30">
                    {entries.map((e) => (
                      <div key={e.id} className="flex items-center justify-between px-4 py-2.5 group">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{e.food_name}</p>
                          <div className="flex gap-2 text-[10px] text-muted mt-0.5">
                            {e.calories != null && <span>{e.calories}kcal</span>}
                            {e.protein_g != null && <span>단백질 {e.protein_g}g</span>}
                            {e.serving_g != null && <span>{e.serving_g}g</span>}
                          </div>
                        </div>
                        <button
                          onClick={() => deleteEntry(e.id)}
                          className="text-muted hover:text-accent opacity-0 group-hover:opacity-100 transition-all text-xs px-1"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {entries.length === 0 && addingMeal !== meal.key && (
                  <button
                    onClick={() => {
                      setAddingMeal(meal.key);
                      setAddTab("search");
                    }}
                    className="w-full px-4 py-4 text-sm text-muted hover:text-foreground hover:bg-surface/50 transition-colors"
                  >
                    + 식사 기록하기
                  </button>
                )}

                {/* 추가 모드 */}
                {addingMeal === meal.key && (
                  <div className="border-t border-border/50">
                    {/* 탭 */}
                    <div className="flex border-b border-border/50 bg-surface/30">
                      {([
                        { key: "search" as const, label: "검색" },
                        { key: "favorites" as const, label: `즐겨찾기${favorites.length > 0 ? ` (${favorites.length})` : ""}` },
                        { key: "weekly" as const, label: `식단박스${weeklyItems.length > 0 ? ` (${weeklyItems.length})` : ""}` },
                        { key: "manual" as const, label: "직접 입력" },
                      ]).map((tab) => (
                        <button
                          key={tab.key}
                          onClick={() => setAddTab(tab.key)}
                          className={`flex-1 py-2 text-[11px] font-medium transition-colors ${
                            addTab === tab.key
                              ? "text-primary border-b-2 border-primary"
                              : "text-muted hover:text-foreground"
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="p-4 bg-surface/50">
                      {/* 검색 탭 */}
                      {addTab === "search" && (
                        <>
                          <div className="relative mb-3">
                            <input
                              type="text"
                              value={searchQuery}
                              onChange={(e) => {
                                setSearchQuery(e.target.value);
                                searchProducts(e.target.value);
                              }}
                              placeholder="제품명 검색 (예: 닭가슴살, 샐러드...)"
                              className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm focus:border-primary focus:outline-none"
                              autoFocus
                            />
                            {searching && (
                              <div className="absolute right-3 top-3">
                                <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                              </div>
                            )}
                          </div>
                          {searchResults.length > 0 && (
                            <ProductList items={searchResults} onSelect={addFromProduct} />
                          )}
                          {searchQuery && searchResults.length === 0 && !searching && (
                            <p className="text-xs text-muted text-center py-3">검색 결과가 없어요</p>
                          )}
                        </>
                      )}

                      {/* 즐겨찾기 탭 */}
                      {addTab === "favorites" && (
                        favorites.length > 0 ? (
                          <ProductList items={favorites} onSelect={addFromProduct} />
                        ) : (
                          <div className="text-center py-6">
                            <p className="text-2xl mb-2">♡</p>
                            <p className="text-xs text-muted">즐겨찾기한 제품이 없어요</p>
                            <p className="text-[10px] text-muted mt-1">제품 탐색에서 ♡를 눌러 추가해보세요</p>
                          </div>
                        )
                      )}

                      {/* 주간 식단 박스 탭 */}
                      {addTab === "weekly" && (
                        weeklyItems.length > 0 ? (
                          <ProductList items={weeklyItems} onSelect={addFromProduct} />
                        ) : (
                          <div className="text-center py-6">
                            <p className="text-2xl mb-2">📦</p>
                            <p className="text-xs text-muted">주간 식단 박스를 먼저 만들어보세요</p>
                            <a href="/weekly-box" className="text-[10px] text-primary mt-1 inline-block">주간 박스 만들기 →</a>
                          </div>
                        )
                      )}

                      {/* 직접 입력 탭 */}
                      {addTab === "manual" && (
                        <>
                          <div className="space-y-2 mb-3">
                            <input
                              type="text"
                              value={manualForm.food_name}
                              onChange={(e) => setManualForm({ ...manualForm, food_name: e.target.value })}
                              placeholder="음식 이름"
                              className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm focus:border-primary focus:outline-none"
                              autoFocus
                            />
                            <div className="grid grid-cols-3 gap-2">
                              <input
                                type="number"
                                value={manualForm.calories}
                                onChange={(e) => setManualForm({ ...manualForm, calories: e.target.value })}
                                placeholder="칼로리"
                                className="px-2 py-2 rounded-lg bg-background border border-border text-xs focus:border-primary focus:outline-none text-center"
                              />
                              <input
                                type="number"
                                value={manualForm.protein_g}
                                onChange={(e) => setManualForm({ ...manualForm, protein_g: e.target.value })}
                                placeholder="단백질(g)"
                                className="px-2 py-2 rounded-lg bg-background border border-border text-xs focus:border-primary focus:outline-none text-center"
                              />
                              <input
                                type="number"
                                value={manualForm.serving_g}
                                onChange={(e) => setManualForm({ ...manualForm, serving_g: e.target.value })}
                                placeholder="양(g)"
                                className="px-2 py-2 rounded-lg bg-background border border-border text-xs focus:border-primary focus:outline-none text-center"
                              />
                            </div>
                          </div>
                          <button
                            onClick={addManual}
                            disabled={!manualForm.food_name}
                            className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-40"
                          >
                            추가
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── 주간 영양 추이 ── */}
      {weeklyTrend && weeklyTrend.days.some(d => d.count > 0) && (
        <section className="mt-8">
          <h2 className="text-sm font-bold mb-3">📈 최근 7일 영양 추이</h2>

          {/* 칼로리 바 차트 */}
          <div className="bg-card rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-3">
            <div className="flex items-end justify-between gap-1" style={{ height: 100 }}>
              {weeklyTrend.days.map((d) => {
                const maxCal = Math.max(...weeklyTrend.days.map(x => x.calories), weeklyTrend.goalCalories);
                const h = maxCal > 0 ? (d.calories / maxCal) * 100 : 0;
                const goalH = maxCal > 0 ? (weeklyTrend.goalCalories / maxCal) * 100 : 0;
                const isOver = d.calories > weeklyTrend.goalCalories;
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5">
                    {d.count > 0 && (
                      <span className="text-[9px] text-muted">{d.calories}</span>
                    )}
                    <div className="w-full relative" style={{ height: 80 }}>
                      {/* 목표 라인 */}
                      <div
                        className="absolute w-full border-t border-dashed border-primary/30"
                        style={{ bottom: `${goalH * 0.8}%` }}
                      />
                      {/* 바 */}
                      <div
                        className={`absolute bottom-0 w-full rounded-t transition-all ${
                          d.count === 0 ? "bg-border/20" : isOver ? "bg-accent/40" : "bg-primary/40"
                        }`}
                        style={{ height: `${d.count > 0 ? Math.max(h * 0.8, 4) : 4}%` }}
                      />
                    </div>
                    <span className={`text-[9px] ${d.date === date ? "font-bold text-primary" : "text-muted"}`}>
                      {d.dayOfWeek}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-muted">
              <span>목표: {weeklyTrend.goalCalories}kcal</span>
              {weeklyTrend.weeklyAvg && (
                <span>7일 평균: {weeklyTrend.weeklyAvg.calories}kcal</span>
              )}
            </div>
          </div>

          {/* 주간 평균 */}
          {weeklyTrend.weeklyAvg && (
            <div className="bg-card rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-xs font-bold mb-2">주간 평균</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-lg font-extrabold">{weeklyTrend.weeklyAvg.calories}</p>
                  <p className="text-[10px] text-muted">kcal/일</p>
                </div>
                <div>
                  <p className="text-lg font-extrabold">{weeklyTrend.weeklyAvg.protein_g}g</p>
                  <p className="text-[10px] text-muted">단백질/일</p>
                </div>
                <div>
                  <p className={`text-lg font-extrabold ${
                    weeklyTrend.weeklyAvg.goalAchievement >= 80 && weeklyTrend.weeklyAvg.goalAchievement <= 110
                      ? "text-green-500" : "text-accent"
                  }`}>
                    {weeklyTrend.weeklyAvg.goalAchievement}%
                  </p>
                  <p className="text-[10px] text-muted">목표 달성률</p>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── 영양 갭 기반 공구 추천 ── */}
      {gapSuggestions && gapSuggestions.gaps.length > 0 && gapSuggestions.suggestions.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold mb-1">🛒 이번 주 부족한 영양소 공구</h2>
          <p className="text-[10px] text-muted mb-3">식단 기록 기반으로 부족한 영양소를 채울 제품을 추천해요</p>

          {/* 영양 갭 요약 */}
          <div className="flex gap-2 mb-3 overflow-x-auto no-scrollbar">
            {gapSuggestions.gaps.map((gap) => (
              <div
                key={gap.nutrient}
                className={`shrink-0 px-3 py-2 rounded-xl text-xs ${
                  gap.severity === "critical"
                    ? "bg-accent/10 border border-accent/30 text-accent"
                    : "bg-primary/5 border border-primary/20 text-primary"
                }`}
              >
                <span className="font-bold">{gap.label}</span>
                {gap.nutrient.includes("over") ? (
                  <span className="ml-1">
                    {Math.round(gap.current)}→목표 {Math.round(gap.target)}
                  </span>
                ) : (
                  <span className="ml-1">
                    {Math.round(gap.ratio * 100)}%
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* 추천 제품 */}
          <div className="space-y-2">
            {gapSuggestions.suggestions.map((s) => (
              <div
                key={s.product_id}
                className="bg-card rounded-xl p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                      s.severity === "critical"
                        ? "bg-accent/10 text-accent"
                        : "bg-primary/10 text-primary"
                    }`}>
                      {s.gap_label} 보충
                    </span>
                    {s.health_score && (
                      <span className="text-[9px] text-muted">점수 {s.health_score}</span>
                    )}
                  </div>
                  <p className="text-sm font-medium truncate">{s.product_name}</p>
                  <p className="text-[10px] text-muted">{s.reason}</p>
                </div>
                <div className="shrink-0 text-right">
                  {s.price && (
                    <p className="text-xs font-bold">{s.price.toLocaleString()}원</p>
                  )}
                  <a
                    href={`/products/${s.product_id}`}
                    className="text-[10px] text-primary hover:text-primary-dark"
                  >
                    상세 →
                  </a>
                </div>
              </div>
            ))}
          </div>

          <a
            href="/community"
            className="block mt-3 text-center text-xs text-primary hover:text-primary-dark transition-colors py-2"
          >
            공구 더 보기 →
          </a>
        </section>
      )}

      {/* 하단 안내 */}
      <div className="mt-8 text-center">
        <p className="text-xs text-muted">
          34만 식품 DB에서 검색하면 영양 정보가 자동으로 채워져요
        </p>
      </div>
      </>)}
    </div>
  );
}
