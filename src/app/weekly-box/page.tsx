"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

/* ───── 타입 ───── */
type CellData = {
  product_id?: string;
  name?: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  sodium_mg?: number;
  price?: number;
  platform?: string;
  url?: string;
  type?: "product" | "eating_out";
} | null;

type GridData = Record<string, Record<string, CellData>>;

type SavedPlan = {
  id: string;
  title: string;
  tags: string[];
  total_price: number;
  avg_daily_calories: number;
  avg_daily_protein: number;
  product_count: number;
  eating_out_count: number;
  updated_at: string;
};

const DAYS = [
  { key: "mon", label: "월" },
  { key: "tue", label: "화" },
  { key: "wed", label: "수" },
  { key: "thu", label: "목" },
  { key: "fri", label: "금" },
  { key: "sat", label: "토" },
  { key: "sun", label: "일" },
];

const MEALS = [
  { key: "breakfast", label: "아침", emoji: "☀️", color: "#E8A830" },
  { key: "lunch", label: "점심", emoji: "🌤️", color: "#D47040" },
  { key: "dinner", label: "저녁", emoji: "🌙", color: "#6870C8" },
  { key: "supplement", label: "간식", emoji: "🍪", color: "#48A870" },
];

const CONCERN_LABELS: Record<string, string> = {
  gut_health: "장건강", skin: "피부건강", weight: "체중관리", energy: "활력충전",
  balanced: "균형식단", weight_loss: "체중관리", muscle: "근력강화",
  diabetes: "당뇨관심", blood_pressure: "혈압관심", kidney: "신장관심",
};

const SERVICE_NAMES: Record<string, string> = {
  greating: "그리팅", yundiet: "윤식단", sixmeal: "식스밀",
  designmeal: "디자인밀", makesalad: "메이크샐러드",
  "11st": "11번가", kurly: "컬리", oasis: "오아시스", homeplus: "홈플러스",
};

const NUM = { fontFamily: "'Outfit', sans-serif", fontVariantNumeric: "tabular-nums" as const };

function getUserId(): string | null {
  try { return localStorage.getItem("carefood_anon_id") || null; } catch { return null; }
}

function emptyGrid(): GridData {
  const g: GridData = {};
  for (const d of DAYS) {
    g[d.key] = {};
    for (const m of MEALS) g[d.key][m.key] = null;
  }
  return g;
}

/* ───── 제품 검색/선택 모달 ───── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ProductRow({ p, onSelect }: { p: any; onSelect: (cell: CellData) => void }) {
  const prices = p.product_prices?.filter((pp: { price: number }) => pp.price > 0) || [];
  const best = prices[0];
  return (
    <button onClick={() => onSelect({
      product_id: p.id, name: p.name,
      calories: p.calories, protein_g: p.protein_g,
      price: best?.price, platform: best?.platform, url: best?.url, type: "product",
    })}
      className="w-full text-left p-3 rounded-xl hover:bg-[var(--color-surface)] transition-colors flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-[var(--color-surface)] flex items-center justify-center text-lg shrink-0">🍱</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold line-clamp-1">{p.name}</p>
        <p className="text-[11px] text-muted mt-0.5">
          <span style={NUM}>{p.calories || 0}</span>kcal · 단백질 <span style={NUM}>{Math.round(p.protein_g || 0)}</span>g
        </p>
      </div>
      {best && <span className="text-sm font-bold shrink-0" style={NUM}>{best.price.toLocaleString()}원</span>}
    </button>
  );
}

function ProductSearchModal({ onSelect, onClose, onEatingOut }: {
  onSelect: (product: CellData) => void;
  onClose: () => void;
  onEatingOut: () => void;
}) {
  const [tab, setTab] = useState<"favorites" | "recent" | "search">("favorites");
  const [query, setQuery] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [results, setResults] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [recentProducts, setRecentProducts] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [favoriteProducts, setFavoriteProducts] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [loadingFavorites, setLoadingFavorites] = useState(true);

  useEffect(() => {
    const loadFavs = async () => {
      const userId = getUserId();
      if (!userId) { setLoadingFavorites(false); return; }
      try {
        const res = await fetch(`/api/favorites?user_id=${userId}`);
        const data = await res.json();
        setFavoriteProducts((data.favorites || []).map((f: { product_id: string; name: string; calories?: number; protein_g?: number; best_price?: number; image_url?: string }) => ({
          id: f.product_id, name: f.name, calories: f.calories, protein_g: f.protein_g,
          product_prices: f.best_price ? [{ price: f.best_price, platform: "", url: "", image_url: f.image_url }] : [],
        })));
      } catch { /* */ }
      finally { setLoadingFavorites(false); }
    };
    loadFavs();
  }, []);

  useEffect(() => {
    const loadRecent = async () => {
      const userId = getUserId();
      if (!userId) { setLoadingRecent(false); return; }
      try {
        const res = await fetch(`/api/interactions?user_id=${userId}`);
        const data = await res.json();
        const allIds = [...new Set([...(data.clicked_product_ids || []), ...(data.viewed_product_ids || [])])].slice(0, 20);
        if (allIds.length === 0) { setLoadingRecent(false); return; }
        const productRes = await fetch(`/api/products?limit=20&hasPrice=1`);
        const productData = await productRes.json();
        const productMap = new Map((productData.products || []).map((p: { id: string }) => [p.id, p]));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const recent: any[] = [];
        for (const id of allIds) { const p = productMap.get(id); if (p) recent.push(p); }
        setRecentProducts(recent.length < 5 ? productData.products?.slice(0, 10) || [] : recent);
      } catch { /* */ }
      finally { setLoadingRecent(false); }
    };
    loadRecent();
  }, []);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true); setTab("search");
    try {
      const res = await fetch(`/api/products?q=${encodeURIComponent(query)}&hasPrice=1&limit=15`);
      const data = await res.json();
      setResults(data.products || []);
    } catch { /* */ }
    finally { setSearching(false); }
  };

  const displayProducts = tab === "search" ? results : tab === "favorites" ? favoriteProducts : recentProducts;
  const isLoading = tab === "search" ? searching : tab === "favorites" ? loadingFavorites : loadingRecent;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[var(--color-card)] rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-sm">제품 추가</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground" style={{ minHeight: "32px", minWidth: "32px" }}>✕</button>
        </div>
        <div className="px-4 pt-3">
          <div className="flex gap-2">
            <input type="text" value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && search()}
              placeholder="제품 검색..."
              className="flex-1 px-3 py-2 rounded-xl border border-border text-sm focus:outline-none focus:border-primary" />
            <button onClick={search} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold" style={{ minHeight: "36px" }}>검색</button>
          </div>
        </div>
        <div className="px-4 pt-2 pb-1 flex items-center justify-between">
          <div className="flex gap-1">
            {(["favorites", "recent", ...(results.length > 0 ? ["search"] : [])] as const).map(t => (
              <button key={t} onClick={() => setTab(t as typeof tab)}
                className={`text-xs px-2.5 py-1 rounded-full transition-colors ${tab === t ? "bg-foreground text-[var(--color-card)]" : "text-muted hover:text-foreground"}`}
                style={{ minHeight: "26px", minWidth: "unset" }}>
                {t === "favorites" ? "♥ 즐겨찾기" : t === "recent" ? "최근 본" : `검색 (${results.length})`}
              </button>
            ))}
          </div>
          <button onClick={onEatingOut} className="text-[11px] text-muted hover:text-foreground" style={{ minHeight: "unset", minWidth: "unset" }}>🍴 외식</button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {isLoading ? (
            <p className="text-sm text-muted text-center py-6">로딩 중...</p>
          ) : displayProducts.length > 0 ? (
            displayProducts.map((p) => <ProductRow key={p.id} p={p} onSelect={onSelect} />)
          ) : (
            <p className="text-sm text-muted text-center py-6">
              {tab === "favorites" ? "즐겨찾기한 제품이 없습니다." : tab === "recent" ? "최근 본 제품이 없습니다." : "결과가 없습니다"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───── 메인 ───── */
export default function WeeklyBoxPage() {
  const [grid, setGrid] = useState<GridData>(emptyGrid());
  const [activeDay, setActiveDay] = useState("mon");
  const [planId, setPlanId] = useState<string | null>(null);
  const [planTitle, setPlanTitle] = useState("새 식단");
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [searchModal, setSearchModal] = useState<{ day: string; meal: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [precomputed, setPrecomputed] = useState<{ grid: GridData; title: string } | null>(null);
  const [preloading, setPreloading] = useState(false);
  const [preloadError, setPreloadError] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    const userId = getUserId();
    if (!userId) return;
    try {
      const res = await fetch(`/api/meal-plans?user_id=${userId}`);
      const data = await res.json();
      setSavedPlans(data.plans || []);
    } catch { /* */ }
  }, []);

  useEffect(() => { loadPlans().finally(() => setLoading(false)); }, [loadPlans]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fetchAndBuildGrid = async (): Promise<{ grid: GridData; title: string } | null> => {
    const profileRaw = localStorage.getItem("carefood_profile");
    if (!profileRaw) return null;
    const profile = JSON.parse(profileRaw);
    let healthConditions: string[] = [];
    try { const h = localStorage.getItem("carefood_health"); if (h) healthConditions = JSON.parse(h).conditions || []; } catch { /* */ }

    const res = await fetch("/api/weekly-box", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        concerns: profile.concerns || [], conditions: [...new Set([...(profile.conditions || []), ...healthConditions])],
        goals: profile.goals || [], allergies: profile.allergies || [],
        sensitivity: profile.sensitivity || { digestive: 2, additive: 2 },
        tastes: profile.tastes || { salty: 5, sweet: 5, spicy: 5, fatty: 5 },
        budget: 100000, mealsPerDay: profile.meals_per_day || 3, supplementsPerDay: 1,
        user_id: getUserId() || undefined, nutrition_goals: profile.nutrition_goals || undefined,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.box?.days || data.box.days.length === 0) return null;

    const newGrid = emptyGrid();
    const dayKeys = DAYS.map(d => d.key);
    for (let i = 0; i < data.box.days.length && i < 7; i++) {
      const dayData = data.box.days[i];
      const dayKey = dayKeys[i];
      for (const m of (dayData.meals || [])) {
        const slot = m.slot_type || "lunch";
        newGrid[dayKey][slot] = {
          product_id: m.product_id, name: m.name, calories: m.calories,
          protein_g: m.protein_g, price: m.best_price,
          platform: m.health_source || m.prices?.[0]?.platform, url: m.prices?.[0]?.url, type: "product",
        };
      }
      const supplements = dayData.supplements || [];
      if (supplements.length > 0) {
        const s = supplements[0];
        newGrid[dayKey].supplement = {
          product_id: s.product_id, name: s.name, calories: s.calories,
          protein_g: s.protein_g, price: s.best_price,
          platform: s.prices?.[0]?.platform, url: s.prices?.[0]?.url, type: "product",
        };
      }
    }
    const goalLabels = (profile.goals || profile.concerns || []).map((c: string) => CONCERN_LABELS[c] || c);
    return { grid: newGrid, title: (goalLabels.length > 0 ? goalLabels.join(" · ") : "맞춤") + " 식단" };
  };

  useEffect(() => {
    const preload = async () => {
      const profileRaw = localStorage.getItem("carefood_profile");
      if (!profileRaw) { setPreloadError("프로필 없음"); return; }
      setPreloading(true);
      try {
        const result = await fetchAndBuildGrid();
        if (result) setPrecomputed(result); else setPreloadError("추천 생성 실패");
      } catch { setPreloadError("추천 로드 실패"); }
      finally { setPreloading(false); }
    };
    preload();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generatePlan = async () => {
    if (precomputed) {
      setGrid(precomputed.grid); setPlanTitle(precomputed.title); setPlanId(null);
      setPrecomputed(null); setPreloading(true);
      fetchAndBuildGrid().then(r => { if (r) setPrecomputed(r); setPreloading(false); }).catch(() => setPreloading(false));
      return;
    }
    setGenerating(true);
    try {
      const result = await fetchAndBuildGrid();
      if (!result) { alert("식단을 생성할 수 없습니다. 프로필을 확인하세요."); return; }
      setGrid(result.grid); setPlanTitle(result.title); setPlanId(null);
    } catch { alert("식단 생성 중 오류가 발생했습니다."); }
    finally { setGenerating(false); }
  };

  const savePlan = async () => {
    const userId = getUserId(); if (!userId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/meal-plans", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, id: planId, title: planTitle, grid }),
      });
      const data = await res.json();
      if (data.ok) { setPlanId(data.id); loadPlans(); }
    } catch { /* */ }
    finally { setSaving(false); }
  };

  const loadPlan = async (id: string) => {
    const userId = getUserId(); if (!userId) return;
    try {
      const res = await fetch(`/api/meal-plans/load?id=${id}&user_id=${userId}`);
      const data = await res.json();
      if (data.plan) { setGrid(data.plan.grid || emptyGrid()); setPlanTitle(data.plan.title); setPlanId(data.plan.id); }
    } catch { /* */ }
  };

  const updateCell = (day: string, meal: string, cell: CellData) => {
    setGrid(prev => ({ ...prev, [day]: { ...prev[day], [meal]: cell } }));
  };

  // ── 통계 계산 ──
  const stats = (() => {
    let totalPrice = 0, totalCal = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0, totalSodium = 0;
    let products = 0, eatingOut = 0;
    const perDay: Record<string, number> = {};
    const healthServices = ["greating", "yundiet", "sixmeal", "designmeal", "makesalad"];
    const serviceMap: Record<string, { count: number; cost: number }> = {};

    for (const d of DAYS) {
      let dayCal = 0;
      for (const m of MEALS) {
        const cell = grid[d.key]?.[m.key];
        if (!cell) continue;
        if (cell.type === "eating_out") { eatingOut++; continue; }
        if (cell.product_id) {
          products++;
          totalPrice += cell.price || 0;
          totalCal += cell.calories || 0;
          totalProtein += cell.protein_g || 0;
          totalCarbs += cell.carbs_g || 0;
          totalFat += cell.fat_g || 0;
          totalSodium += cell.sodium_mg || 0;
          dayCal += cell.calories || 0;
          const svc = cell.platform || "기타";
          if (!serviceMap[svc]) serviceMap[svc] = { count: 0, cost: 0 };
          serviceMap[svc].count++;
          serviceMap[svc].cost += cell.price || 0;
        }
      }
      perDay[d.key] = dayCal;
    }

    const filledDays = Object.values(perDay).filter(c => c > 0).length || 1;
    const serviceMix = Object.entries(serviceMap)
      .map(([key, v]) => ({ key, name: SERVICE_NAMES[key] || key, isHealth: healthServices.includes(key), ...v }))
      .sort((a, b) => b.count - a.count);

    return {
      totalPrice, avgCal: Math.round(totalCal / filledDays),
      avgProtein: Math.round(totalProtein / filledDays), avgCarbs: Math.round(totalCarbs / filledDays),
      avgFat: Math.round(totalFat / filledDays), avgSodium: Math.round(totalSodium / filledDays),
      products, eatingOut, perDay, serviceMix,
      monthlyEstimate: Math.round(totalPrice * 4.3),
      goalPct: Math.min(100, Math.round((totalCal / filledDays / 2000) * 100)),
    };
  })();

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const activeDayMeals = grid[activeDay] || {};
  const activeDayCal = stats.perDay[activeDay] || 0;
  const activeDayLabel = DAYS.find(d => d.key === activeDay)?.label || "";
  const filledMeals = Object.values(activeDayMeals).filter(c => c && c.product_id).length;

  return (
    <div className="max-w-[430px] mx-auto px-4 py-4 pb-36">
      {/* ── 헤더 ── */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex-1 min-w-0">
          <input type="text" value={planTitle} onChange={e => setPlanTitle(e.target.value)}
            className="text-xl font-extrabold bg-transparent border-none outline-none w-full" placeholder="식단 이름" />
          <p className="text-xs text-muted mt-0.5">AI가 영양 밸런스 맞춰 7일 구성</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={generatePlan} disabled={generating}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 ${precomputed ? "bg-primary text-white" : "bg-[var(--color-surface)] text-foreground/80 hover:bg-border"}`}
            style={{ minHeight: "36px" }}>
            {generating ? "생성 중..." : precomputed ? "✨ AI 채우기" : preloading ? "⏳ 준비 중..." : "✨ AI 채우기"}
          </button>
          <button onClick={savePlan} disabled={saving || stats.products === 0}
            className="px-3 py-2 bg-primary text-white rounded-xl text-xs font-bold disabled:opacity-40" style={{ minHeight: "36px" }}>
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>

      {/* ── 주간 요약 대시보드 ── */}
      {stats.products > 0 && (
        <div className="bg-[var(--color-card)] rounded-[20px] p-5 shadow-[0_1px_4px_rgba(28,27,24,0.06)] mb-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[32px] font-extrabold leading-none" style={NUM}>{stats.avgCal.toLocaleString()}</div>
              <div className="text-[11px] text-muted mt-1">7일 평균 kcal/일</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold" style={{ ...NUM, color: stats.goalPct >= 80 ? "#2EA860" : "#D48A20" }}>{stats.goalPct}%</div>
              <div className="text-[11px] text-muted">목표 달성률</div>
            </div>
            <div className="text-right">
              <div className="text-[22px] font-bold text-primary" style={NUM}>{stats.totalPrice.toLocaleString()}<span className="text-xs text-muted font-normal">원</span></div>
              <div className="text-[11px] text-muted">주간 예상 비용</div>
            </div>
          </div>

          {/* 매크로 4종 컬러 셀 */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "단백질", val: stats.avgProtein, unit: "g", color: "#4A8FD4", bg: "rgba(74,143,212,0.08)", pct: Math.min(100, Math.round((stats.avgProtein / 80) * 100)) },
              { label: "탄수화물", val: stats.avgCarbs, unit: "g", color: "#D4960A", bg: "rgba(212,150,10,0.08)", pct: Math.min(100, Math.round((stats.avgCarbs / 260) * 100)) },
              { label: "지방", val: stats.avgFat, unit: "g", color: "#D46A3A", bg: "rgba(212,106,58,0.08)", pct: Math.min(100, Math.round((stats.avgFat / 60) * 100)) },
              { label: "나트륨", val: stats.avgSodium, unit: "mg", color: "#8A6EBF", bg: "rgba(138,110,191,0.08)", pct: Math.min(100, Math.round((stats.avgSodium / 2000) * 100)) },
            ].map(m => (
              <div key={m.label} className="flex flex-col items-center gap-[5px] py-2 px-1 rounded-xl" style={{ background: m.bg }}>
                <div className="text-[15px] font-bold leading-none" style={{ ...NUM, color: m.color }}>
                  {m.val.toLocaleString()}<span className="text-[10px] font-medium">{m.unit}</span>
                </div>
                <div className="w-full h-[5px] rounded-full overflow-hidden" style={{ background: "var(--color-border)" }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${m.pct}%`, background: m.color }} />
                </div>
                <div className="text-[10px] text-muted font-medium">{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 요일 탭 ── */}
      <div className="flex gap-1 mb-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {DAYS.map(d => {
          const dayCal = stats.perDay[d.key] || 0;
          const isActive = d.key === activeDay;
          return (
            <button key={d.key} onClick={() => setActiveDay(d.key)}
              className={`flex-1 min-w-[48px] flex flex-col items-center gap-1 py-2 pb-2.5 rounded-[14px] transition-all border-none ${isActive ? "bg-primary text-white" : "bg-transparent hover:bg-primary/8"}`}
              style={{ minHeight: "unset", minWidth: "unset" }}>
              <span className={`text-[11px] font-semibold tracking-wide ${isActive ? "text-white" : ""}`}>{d.label}</span>
              <span className={`text-[10px] font-semibold ${isActive ? "text-white/80" : "text-muted"}`} style={NUM}>
                {dayCal > 0 ? dayCal.toLocaleString() : "—"}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── 섹션 라벨 ── */}
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-[13px] font-bold text-foreground/80">{activeDayLabel}요일 식단</span>
        <span className="text-[11px] text-muted">{filledMeals}/{MEALS.length}끼{activeDayCal > 0 ? ` · ${activeDayCal.toLocaleString()}kcal` : ""}</span>
      </div>

      {/* ── 끼니 카드 ── */}
      {MEALS.map(meal => {
        const cell = activeDayMeals[meal.key];
        const isEmpty = !cell || !cell.product_id;
        const isEatingOut = cell?.type === "eating_out";

        return (
          <div key={meal.key}
            className={`bg-[var(--color-card)] rounded-[18px] shadow-[0_1px_4px_rgba(28,27,24,0.06)] mb-2.5 overflow-hidden transition-all ${isEmpty && !isEatingOut ? "opacity-60" : ""}`}
            style={{ borderLeft: `4px solid ${meal.color}` }}>
            <div className="p-3.5 flex flex-col gap-2">
              {/* 상단: 끼니 라벨 + 칼로리 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{meal.emoji}</span>
                  <span className="text-sm font-bold">{meal.label}</span>
                </div>
                {!isEmpty && !isEatingOut && (
                  <div className="text-[15px] font-bold text-primary" style={NUM}>
                    {cell?.calories || 0} <span className="text-[10px] text-muted font-medium">kcal</span>
                  </div>
                )}
              </div>

              {isEatingOut ? (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">🍴 외식</span>
                  <button onClick={() => updateCell(activeDay, meal.key, null)}
                    className="text-[10px] text-muted hover:text-foreground" style={{ minHeight: "unset", minWidth: "unset" }}>취소</button>
                </div>
              ) : !isEmpty ? (
                <>
                  <div className="text-[13px] font-semibold">{cell?.name}</div>
                  {/* 출처 태그 + 서빙 */}
                  <div className="flex items-center gap-2 text-[10px] text-muted">
                    {cell?.platform && SERVICE_NAMES[cell.platform] && (
                      <span className="px-1.5 py-0.5 rounded-md text-[9px] font-semibold" style={{ background: "var(--gold-glow, rgba(196,135,10,0.12))", color: "var(--color-primary)" }}>
                        {SERVICE_NAMES[cell.platform]}
                      </span>
                    )}
                    {cell?.price && <span style={NUM}>{cell.price.toLocaleString()}원</span>}
                  </div>
                  {/* 매크로 도트 */}
                  <div className="flex gap-2">
                    {[
                      { v: cell?.protein_g, u: "g", c: "#4A8FD4" },
                      { v: cell?.carbs_g, u: "g", c: "#D4960A" },
                      { v: cell?.fat_g, u: "g", c: "#D46A3A" },
                      { v: cell?.sodium_mg, u: "mg", c: "#8A6EBF" },
                    ].filter(m => m.v).map((m, i) => (
                      <div key={i} className="flex items-center gap-1 text-[10px] font-semibold" style={NUM}>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: m.c }} />
                        {m.v}{m.u}
                      </div>
                    ))}
                  </div>
                  {/* 교체/삭제 */}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setSearchModal({ day: activeDay, meal: meal.key })}
                      className="text-[10px] text-primary hover:underline" style={{ minHeight: "unset", minWidth: "unset" }}>교체</button>
                    <button onClick={() => updateCell(activeDay, meal.key, null)}
                      className="text-[10px] text-muted hover:text-foreground" style={{ minHeight: "unset", minWidth: "unset" }}>삭제</button>
                  </div>
                </>
              ) : (
                <button onClick={() => setSearchModal({ day: activeDay, meal: meal.key })}
                  className="text-xs text-muted hover:text-primary py-2 transition-colors text-left" style={{ minHeight: "unset", minWidth: "unset" }}>
                  + 제품 추가 또는 AI 추천 받기
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* ── 서비스 믹스 ── */}
      {stats.products > 0 && stats.serviceMix.length > 0 && (
        <div className="bg-[var(--color-card)] rounded-[18px] p-4 shadow-[0_1px_4px_rgba(28,27,24,0.06)] mt-4 mb-4">
          <p className="text-xs font-bold mb-3">서비스 구성</p>
          <div className="space-y-2">
            {stats.serviceMix.map(svc => (
              <div key={svc.key} className="flex items-center gap-2 text-xs">
                <span className="w-16 truncate shrink-0 font-medium">{svc.name}</span>
                <div className="flex-1 h-3 bg-[var(--color-surface)] rounded overflow-hidden">
                  <div className={`h-full rounded ${svc.isHealth ? "bg-primary/40" : "bg-muted/30"}`}
                    style={{ width: `${stats.products > 0 ? Math.round((svc.count / stats.products) * 100) : 0}%` }} />
                </div>
                <span className="text-[10px] text-muted w-10 text-right shrink-0" style={NUM}>{svc.count}끼</span>
                <span className="text-[10px] text-muted w-16 text-right shrink-0" style={NUM}>{svc.cost.toLocaleString()}원</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-3 pt-2 border-t border-border text-xs">
            <span className="font-bold">월 예상</span>
            <span className="font-bold text-primary" style={NUM}>{stats.monthlyEstimate.toLocaleString()}원</span>
          </div>
        </div>
      )}

      {/* ── 저장된 식단 목록 ── */}
      <div className="mt-4">
        <p className="text-xs font-bold mb-3 px-1">내 식단 목록</p>
        <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
          {savedPlans.map(p => (
            <button key={p.id} onClick={() => loadPlan(p.id)}
              className={`min-w-[160px] text-left border rounded-xl p-3 shrink-0 transition-colors ${planId === p.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
              <h3 className="text-xs font-bold mb-0.5 line-clamp-1">{p.title}</h3>
              <p className="text-[10px] text-muted">
                <span style={NUM}>{p.product_count}</span>개 · <span style={NUM}>{p.total_price.toLocaleString()}</span>원
              </p>
              <p className="text-[10px] text-muted">
                일 <span style={NUM}>{p.avg_daily_calories}</span>kcal · 단백질 <span style={NUM}>{p.avg_daily_protein}</span>g
              </p>
            </button>
          ))}
          <button onClick={() => { setGrid(emptyGrid()); setPlanId(null); setPlanTitle("새 식단"); }}
            className="min-w-[100px] border border-dashed border-border rounded-xl p-3 shrink-0 flex flex-col items-center justify-center text-muted hover:border-primary/30 hover:text-primary transition-colors">
            <span className="text-xl mb-1">+</span>
            <span className="text-[10px]">새 식단</span>
          </button>
        </div>
      </div>

      {/* ── 하단 고정 CTA ── */}
      {stats.products > 0 && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-[var(--color-background)] z-10"
          style={{ padding: `12px max(16px, env(safe-area-inset-right, 0px)) max(16px, env(safe-area-inset-bottom, 16px)) max(16px, env(safe-area-inset-left, 0px))` }}>
          <div className="max-w-[430px] mx-auto flex items-center gap-3">
            <div className="flex-1">
              <div className="text-[12px] text-muted">{stats.products}끼 · {stats.serviceMix.filter(s => s.isHealth).length}개 서비스</div>
              <div className="text-lg font-bold" style={NUM}>{stats.totalPrice.toLocaleString()}<span className="text-xs text-muted font-normal">원</span></div>
            </div>
            <button onClick={() => {
              const orderItems: { day: string; slot: string; product_name: string; product_id?: string }[] = [];
              for (const [day, slots] of Object.entries(grid)) {
                for (const [slot, cell] of Object.entries(slots)) {
                  if (cell && cell.name) orderItems.push({ day, slot, product_name: cell.name, product_id: cell.product_id || undefined });
                }
              }
              if (orderItems.length > 0) { localStorage.setItem("carefood_order_items", JSON.stringify(orderItems)); window.location.href = "/order"; }
            }}
              className="shrink-0 px-7 py-3.5 rounded-2xl bg-primary text-white text-sm font-bold shadow-[0_2px_10px_rgba(196,135,10,0.3)] hover:-translate-y-0.5 transition-all"
              style={{ minHeight: "44px" }}>
              이 식단 주문하기
            </button>
          </div>
        </div>
      )}

      {/* ── 제품 검색 모달 ── */}
      {searchModal && (
        <ProductSearchModal
          onSelect={(product) => { updateCell(searchModal.day, searchModal.meal, product); setSearchModal(null); }}
          onClose={() => setSearchModal(null)}
          onEatingOut={() => { updateCell(searchModal.day, searchModal.meal, { type: "eating_out" }); setSearchModal(null); }}
        />
      )}
    </div>
  );
}
