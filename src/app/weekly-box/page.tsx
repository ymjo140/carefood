"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

/* ───── 타입 ───── */
type CellData = {
  product_id?: string;
  name?: string;
  calories?: number;
  protein_g?: number;
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
  { key: "breakfast", label: "아침", emoji: "🌅" },
  { key: "lunch", label: "점심", emoji: "☀️" },
  { key: "dinner", label: "저녁", emoji: "🌙" },
  { key: "supplement", label: "보조", emoji: "💊" },
];

const CONCERN_LABELS: Record<string, string> = {
  gut_health: "장건강", skin: "피부건강", weight: "체중관리", energy: "활력충전",
};

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

/* ───── 셀 컴포넌트 ───── */
function Cell({ cell, onClear, onSetEatingOut, onAddClick }: {
  cell: CellData;
  onClear: () => void;
  onSetEatingOut: () => void;
  onAddClick: () => void;
}) {
  if (!cell) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-1 cursor-pointer group"
        onClick={onAddClick}>
        <div className="w-7 h-7 rounded-full bg-surface border border-dashed border-border flex items-center justify-center text-border text-sm group-hover:border-primary group-hover:text-primary transition-colors"
          style={{ minHeight: "unset", minWidth: "unset" }}>+</div>
      </div>
    );
  }

  if (cell.type === "eating_out") {
    return (
      <div className="h-full flex items-center justify-center relative group">
        <span className="text-[10px] text-muted bg-surface px-2 py-1 rounded-md">🍴 외식</span>
        <button onClick={onClear}
          className="absolute top-0 right-0 w-4 h-4 rounded-full bg-black/40 text-white text-[8px] items-center justify-center hidden group-hover:flex"
          style={{ minHeight: "unset", minWidth: "unset" }}>×</button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-1.5 relative group cursor-pointer" onClick={onAddClick}>
      <div className="w-full aspect-square rounded-lg bg-surface flex items-center justify-center text-lg mb-1 overflow-hidden">
        🍱
      </div>
      <p className="text-[9px] font-medium leading-tight line-clamp-2 flex-1">{cell.name}</p>
      <p className="text-[8px] text-muted mt-auto">{cell.calories}kcal</p>
      {cell.price && <p className="text-[8px] text-primary font-medium">{cell.price.toLocaleString()}원</p>}
      <button onClick={(e) => { e.stopPropagation(); onClear(); }}
        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/40 text-white text-[8px] items-center justify-center hidden group-hover:flex"
        style={{ minHeight: "unset", minWidth: "unset" }}>×</button>
    </div>
  );
}

/* ───── 제품 검색 모달 ───── */
function ProductSearchModal({ onSelect, onClose, onEatingOut }: {
  onSelect: (product: CellData) => void;
  onClose: () => void;
  onEatingOut: () => void;
}) {
  const [query, setQuery] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/products?q=${encodeURIComponent(query)}&hasPrice=1&limit=10`);
      const data = await res.json();
      setResults(data.products || []);
    } catch { /* */ }
    finally { setSearching(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-sm">제품 추가</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground"
            style={{ minHeight: "32px", minWidth: "32px" }}>✕</button>
        </div>

        <div className="p-4 border-b border-border">
          <div className="flex gap-2 mb-2">
            <input type="text" value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && search()}
              placeholder="제품 검색..."
              className="flex-1 px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary" />
            <button onClick={search} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold"
              style={{ minHeight: "36px" }}>검색</button>
          </div>
          <button onClick={onEatingOut}
            className="text-xs text-muted hover:text-foreground"
            style={{ minHeight: "unset", minWidth: "unset" }}>
            🍴 외식으로 표시
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {searching && <p className="text-sm text-muted text-center py-4">검색 중...</p>}
          {results.map((p) => {
            const prices = p.product_prices?.filter((pp: { price: number }) => pp.price > 0) || [];
            const best = prices[0];
            return (
              <button key={p.id} onClick={() => onSelect({
                product_id: p.id, name: p.name,
                calories: p.calories, protein_g: p.protein_g,
                price: best?.price, platform: best?.platform, url: best?.url,
                type: "product",
              })}
                className="w-full text-left p-3 rounded-xl hover:bg-surface transition-colors flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center text-lg shrink-0"
                  style={{ minHeight: "unset", minWidth: "unset" }}>🍱</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-1">{p.name}</p>
                  <p className="text-[11px] text-muted">{p.calories}kcal · 단백질 {Math.round(p.protein_g || 0)}g</p>
                </div>
                {best && <span className="text-sm font-bold shrink-0">{best.price.toLocaleString()}원</span>}
              </button>
            );
          })}
          {!searching && results.length === 0 && query && (
            <p className="text-sm text-muted text-center py-4">결과가 없습니다</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───── 메인 ───── */
export default function WeeklyBoxPage() {
  const [grid, setGrid] = useState<GridData>(emptyGrid());
  const [planId, setPlanId] = useState<string | null>(null);
  const [planTitle, setPlanTitle] = useState("새 식단");
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [searchModal, setSearchModal] = useState<{ day: string; meal: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // 저장된 식단 목록 로드
  const loadPlans = useCallback(async () => {
    const userId = getUserId();
    if (!userId) return;
    try {
      const res = await fetch(`/api/meal-plans?user_id=${userId}`);
      const data = await res.json();
      setSavedPlans(data.plans || []);
    } catch { /* */ }
  }, []);

  useEffect(() => {
    loadPlans().finally(() => setLoading(false));
  }, [loadPlans]);

  // AI 자동 생성
  const generatePlan = async () => {
    setGenerating(true);
    try {
      const profileRaw = localStorage.getItem("carefood_profile");
      if (!profileRaw) { alert("프로필이 없습니다. 온보딩을 먼저 완료해주세요."); return; }
      const profile = JSON.parse(profileRaw);

      let healthConditions: string[] = [];
      try {
        const h = localStorage.getItem("carefood_health");
        if (h) healthConditions = JSON.parse(h).conditions || [];
      } catch { /* */ }

      const res = await fetch("/api/weekly-box", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concerns: profile.concerns || [],
          conditions: [...new Set([...(profile.conditions || []), ...healthConditions])],
          allergies: profile.allergies || [],
          sensitivity: profile.sensitivity || { digestive: 2, additive: 2 },
          tastes: profile.tastes || { salty: 5, sweet: 5, spicy: 5, fatty: 5 },
          budget: 100000,
          mealsPerDay: 3,
          supplementsPerDay: 1,
        }),
      });

      const data = await res.json();
      if (!data.box?.days) { alert("식단 생성에 실패했습니다."); return; }

      // API 결과를 그리드로 변환
      const newGrid = emptyGrid();
      const dayKeys = DAYS.map(d => d.key);

      for (let i = 0; i < data.box.days.length && i < 7; i++) {
        const dayData = data.box.days[i];
        const dayKey = dayKeys[i];

        // 식사
        const mealKeys = ["breakfast", "lunch", "dinner"];
        const meals = dayData.meals || [];
        for (let j = 0; j < meals.length && j < 3; j++) {
          const m = meals[j];
          newGrid[dayKey][mealKeys[j]] = {
            product_id: m.product_id,
            name: m.name,
            calories: m.calories,
            protein_g: m.protein_g,
            price: m.best_price,
            platform: m.prices?.[0]?.platform,
            url: m.prices?.[0]?.url,
            type: "product",
          };
        }

        // 보조
        const supplements = dayData.supplements || [];
        if (supplements.length > 0) {
          const s = supplements[0];
          newGrid[dayKey].supplement = {
            product_id: s.product_id,
            name: s.name,
            calories: s.calories,
            protein_g: s.protein_g,
            price: s.best_price,
            platform: s.prices?.[0]?.platform,
            url: s.prices?.[0]?.url,
            type: "product",
          };
        }
      }

      setGrid(newGrid);
      setPlanTitle(
        (profile.concerns || []).map((c: string) => CONCERN_LABELS[c] || c).join(" · ") + " 식단"
      );
      setPlanId(null); // 새 식단
    } catch (e) {
      console.error(e);
      alert("식단 생성 중 오류가 발생했습니다.");
    } finally {
      setGenerating(false);
    }
  };

  // 저장
  const savePlan = async () => {
    const userId = getUserId();
    if (!userId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/meal-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, id: planId, title: planTitle, grid }),
      });
      const data = await res.json();
      if (data.ok) {
        setPlanId(data.id);
        loadPlans();
      }
    } catch { /* */ }
    finally { setSaving(false); }
  };

  // 식단 불러오기
  const loadPlan = async (id: string) => {
    const userId = getUserId();
    if (!userId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = (await import("@/lib/supabase/client")).createClient() as any;
    // 직접 API 호출 대신 간단하게
    try {
      const res = await fetch(`/api/meal-plans/load?id=${id}&user_id=${userId}`);
      const data = await res.json();
      if (data.plan) {
        setGrid(data.plan.grid || emptyGrid());
        setPlanTitle(data.plan.title);
        setPlanId(data.plan.id);
      }
    } catch { /* */ }
  };

  // 셀 수정
  const updateCell = (day: string, meal: string, cell: CellData) => {
    setGrid(prev => ({
      ...prev,
      [day]: { ...prev[day], [meal]: cell },
    }));
  };

  // 통계 계산
  const stats = (() => {
    let totalPrice = 0, totalCal = 0, totalProtein = 0, products = 0, eatingOut = 0;
    for (const d of DAYS) {
      for (const m of MEALS) {
        const cell = grid[d.key]?.[m.key];
        if (!cell) continue;
        if (cell.type === "eating_out") { eatingOut++; continue; }
        if (cell.product_id) {
          products++;
          totalPrice += cell.price || 0;
          totalCal += cell.calories || 0;
          totalProtein += cell.protein_g || 0;
        }
      }
    }
    return { totalPrice, avgCal: Math.round(totalCal / 7), avgProtein: Math.round(totalProtein / 7), products, eatingOut };
  })();

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <input type="text" value={planTitle}
            onChange={e => setPlanTitle(e.target.value)}
            className="text-xl font-extrabold bg-transparent border-none outline-none w-full"
            placeholder="식단 이름" />
          <p className="text-xs text-muted mt-0.5">
            {stats.products > 0
              ? `${stats.products}개 제품 · 외식 ${stats.eatingOut}끼 · 일 평균 ${stats.avgCal}kcal · 단백질 ${stats.avgProtein}g`
              : "AI 자동 생성으로 시작하거나 직접 구성하세요"}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={generatePlan} disabled={generating}
            className="px-3 py-2 bg-surface text-foreground/80 rounded-lg text-xs font-medium hover:bg-border transition-colors disabled:opacity-50"
            style={{ minHeight: "36px" }}>
            {generating ? "생성 중..." : "✨ AI 채우기"}
          </button>
          <button onClick={savePlan} disabled={saving || stats.products === 0}
            className="px-3 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary-dark transition-colors disabled:opacity-40"
            style={{ minHeight: "36px" }}>
            {saving ? "저장 중..." : "💾 저장"}
          </button>
        </div>
      </div>

      {/* 요약 바 */}
      {stats.products > 0 && (
        <div className="flex gap-4 flex-wrap mb-4 px-3 py-2.5 bg-surface rounded-xl text-xs">
          <span className="text-muted">주간 총액 <strong className="text-foreground">{stats.totalPrice.toLocaleString()}원</strong></span>
          <span className="text-muted">일 평균 <strong className="text-foreground">{stats.avgCal}kcal</strong></span>
          <span className="text-muted">일 평균 단백질 <strong className="text-foreground">{stats.avgProtein}g</strong></span>
        </div>
      )}

      {/* 식단 그리드 */}
      <div className="border border-border rounded-xl overflow-hidden mb-6">
        <div className="grid grid-cols-[48px_repeat(7,1fr)] overflow-x-auto">
          {/* 헤더 */}
          <div className="bg-surface" />
          {DAYS.map(d => (
            <div key={d.key} className="bg-surface px-1 py-2 text-center text-xs font-bold">{d.label}</div>
          ))}

          {/* 끼니별 행 */}
          {MEALS.map(meal => (
            <>
              <div key={`label-${meal.key}`} className="bg-surface/50 flex items-center justify-center">
                <span className="text-[10px] font-medium text-muted writing-vertical"
                  style={{ writingMode: "vertical-rl" }}>{meal.emoji} {meal.label}</span>
              </div>
              {DAYS.map(day => (
                <div key={`${day.key}-${meal.key}`} className="border-t border-l border-border/50 min-h-[80px]">
                  <Cell
                    cell={grid[day.key]?.[meal.key]}
                    onClear={() => updateCell(day.key, meal.key, null)}
                    onSetEatingOut={() => updateCell(day.key, meal.key, { type: "eating_out" })}
                    onAddClick={() => setSearchModal({ day: day.key, meal: meal.key })}
                  />
                </div>
              ))}
            </>
          ))}
        </div>
      </div>

      {/* 저장된 식단 목록 */}
      <section>
        <h2 className="text-sm font-bold mb-3">📂 내 식단 목록</h2>
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
          {savedPlans.map(p => (
            <button key={p.id} onClick={() => loadPlan(p.id)}
              className={`min-w-[180px] text-left border rounded-xl p-3 shrink-0 transition-colors ${
                planId === p.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
              }`}>
              <h3 className="text-xs font-bold mb-0.5 line-clamp-1">{p.title}</h3>
              <p className="text-[10px] text-muted">{p.product_count}개 제품 · {p.total_price.toLocaleString()}원</p>
              <p className="text-[10px] text-muted">일 {p.avg_daily_calories}kcal · 단백질 {p.avg_daily_protein}g</p>
              {p.tags.length > 0 && (
                <div className="flex gap-1 mt-1.5">
                  {p.tags.map(t => (
                    <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-surface text-muted"
                      style={{ minHeight: "unset", minWidth: "unset" }}>{t}</span>
                  ))}
                </div>
              )}
            </button>
          ))}

          {/* 새 식단 */}
          <button onClick={() => { setGrid(emptyGrid()); setPlanId(null); setPlanTitle("새 식단"); }}
            className="min-w-[120px] border border-dashed border-border rounded-xl p-3 shrink-0 flex flex-col items-center justify-center text-muted hover:border-primary/30 hover:text-primary transition-colors">
            <span className="text-xl mb-1">+</span>
            <span className="text-[10px]">새 식단</span>
          </button>
        </div>
      </section>

      {/* CTA */}
      <div className="flex gap-3 mt-6">
        <Link href="/recommend"
          className="flex-1 border border-border py-3 rounded-full font-medium text-center text-sm hover:bg-surface transition-colors">
          제품 추천 보기
        </Link>
        <Link href="/community"
          className="flex-1 border border-border py-3 rounded-full font-medium text-center text-sm hover:bg-surface transition-colors">
          식단 공유하기
        </Link>
      </div>

      {/* 제품 검색 모달 */}
      {searchModal && (
        <ProductSearchModal
          onSelect={(product) => {
            updateCell(searchModal.day, searchModal.meal, product);
            setSearchModal(null);
          }}
          onClose={() => setSearchModal(null)}
          onEatingOut={() => {
            updateCell(searchModal.day, searchModal.meal, { type: "eating_out" });
            setSearchModal(null);
          }}
        />
      )}
    </div>
  );
}
