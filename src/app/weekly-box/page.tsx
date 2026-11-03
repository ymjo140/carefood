"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

/* ───── 타입 ───── */
type SavedPlan = {
  id: string;
  title: string;
  tags: string[];
  total_price: number;
  avg_daily_calories: number;
  avg_daily_protein: number;
  product_count: number;
  eating_out_count: number;
  source?: string;
  updated_at: string;
  created_at?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CellData = Record<string, any> | null;
type GridData = Record<string, Record<string, CellData>>;

type PlanDetail = SavedPlan & { grid: GridData };

const DAYS = [
  { key: "mon", label: "월" }, { key: "tue", label: "화" }, { key: "wed", label: "수" },
  { key: "thu", label: "목" }, { key: "fri", label: "금" }, { key: "sat", label: "토" },
  { key: "sun", label: "일" },
];
const MEALS = [
  { key: "breakfast", label: "아침", emoji: "☀️", color: "#E8A830" },
  { key: "lunch", label: "점심", emoji: "🌤️", color: "#D47040" },
  { key: "dinner", label: "저녁", emoji: "🌙", color: "#6870C8" },
  { key: "supplement", label: "간식", emoji: "🍪", color: "#48A870" },
];

const NUM = { fontFamily: "'Outfit', sans-serif", fontVariantNumeric: "tabular-nums" as const };
const CONCERN_LABELS: Record<string, string> = {
  gut_health: "장건강", skin: "피부건강", weight: "체중관리", energy: "활력충전",
  balanced: "균형식단", weight_loss: "체중관리", muscle: "근력강화",
};

function getUserId(): string | null {
  try { return localStorage.getItem("carefood_anon_id") || null; } catch { return null; }
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(dateStr).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

/* ───── 메인 페이지 ───── */
export default function MealListPage() {
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanDetail | null>(null);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [toast, setToast] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    const userId = getUserId();
    if (!userId) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/meal-plans?user_id=${userId}`);
      const data = await res.json();
      setPlans(data.plans || []);
    } catch { /* */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  /* ── AI 식단 생성 ── */
  const generatePlan = async () => {
    const userId = getUserId();
    if (!userId || generating) return;
    setGenerating(true);

    try {
      const profileRaw = localStorage.getItem("carefood_profile");
      if (!profileRaw) { showToast("프로필을 먼저 설정해주세요"); setGenerating(false); return; }
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
          user_id: userId, nutrition_goals: profile.nutrition_goals || undefined,
        }),
      });
      if (!res.ok) { showToast("식단 생성에 실패했어요"); return; }
      const data = await res.json();
      if (!data.box?.days || data.box.days.length === 0) { showToast("추천할 제품이 부족해요"); return; }

      // 그리드 빌드
      const grid: GridData = {};
      const dayKeys = DAYS.map(d => d.key);
      for (const d of DAYS) { grid[d.key] = {}; for (const m of MEALS) grid[d.key][m.key] = null; }
      for (let i = 0; i < data.box.days.length && i < 7; i++) {
        const dayData = data.box.days[i];
        for (const m of (dayData.meals || [])) {
          const slot = m.slot_type || "lunch";
          grid[dayKeys[i]][slot] = {
            product_id: m.product_id, name: m.name, calories: m.calories,
            protein_g: m.protein_g, price: m.best_price, type: "product",
          };
        }
      }

      const goalLabels = (profile.goals || profile.concerns || []).map((c: string) => CONCERN_LABELS[c] || c);
      const title = (goalLabels.length > 0 ? goalLabels.join(" · ") : "AI 맞춤") + " 식단";

      // 저장
      const saveRes = await fetch("/api/meal-plans", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, title, grid }),
      });
      if (saveRes.ok) {
        showToast("✨ AI 식단이 생성되었어요!");
        loadPlans();
      }
    } catch { showToast("오류가 발생했어요"); }
    finally { setGenerating(false); }
  };

  /* ── 식단 상세 로드 ── */
  const openPlan = async (planId: string) => {
    const userId = getUserId();
    if (!userId) return;
    try {
      const res = await fetch(`/api/meal-plans/load?id=${planId}&user_id=${userId}`);
      const data = await res.json();
      if (data.plan) setSelectedPlan(data.plan);
    } catch { /* */ }
  };

  /* ── 이름 변경 ── */
  const saveTitle = async (planId: string) => {
    const userId = getUserId();
    if (!userId || !editTitleValue.trim()) return;
    try {
      await fetch("/api/meal-plans", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: planId, user_id: userId, title: editTitleValue.trim() }),
      });
      setPlans(prev => prev.map(p => p.id === planId ? { ...p, title: editTitleValue.trim() } : p));
      if (selectedPlan?.id === planId) setSelectedPlan({ ...selectedPlan, title: editTitleValue.trim() });
      showToast("이름이 변경되었어요");
    } catch { /* */ }
    setEditingTitle(null);
  };

  /* ── 삭제 ── */
  const deletePlan = async (planId: string) => {
    const userId = getUserId();
    if (!userId) return;
    setDeleting(planId);
    try {
      await fetch(`/api/meal-plans?id=${planId}&user_id=${userId}`, { method: "DELETE" });
      setPlans(prev => prev.filter(p => p.id !== planId));
      if (selectedPlan?.id === planId) setSelectedPlan(null);
      showToast("식단이 삭제되었어요");
    } catch { /* */ }
    setDeleting(null);
  };

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  /* ── 소스 라벨 ── */
  const sourceLabel = (s?: string) => {
    if (s === "community_copy") return { text: "따라하기", color: "#C4870A", bg: "rgba(196,135,10,0.12)" };
    return { text: "AI 생성", color: "#4A8FD4", bg: "rgba(74,143,212,0.12)" };
  };

  /* ───── 렌더 ───── */
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-[500px] mx-auto px-4 py-5 pb-24">
      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-extrabold">식단 리스트</h1>
          <p className="text-xs text-muted mt-0.5">AI 추천 · 따라하기 식단 모아보기</p>
        </div>
        <button onClick={generatePlan} disabled={generating}
          className="px-4 py-2.5 rounded-xl text-xs font-bold bg-primary text-white disabled:opacity-50 transition-colors"
          style={{ minHeight: "40px" }}>
          {generating ? "생성 중..." : "✨ AI 식단 만들기"}
        </button>
      </div>

      {/* ── 식단 카드 리스트 ── */}
      {plans.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm font-semibold mb-1">아직 저장된 식단이 없어요</p>
          <p className="text-xs text-muted mb-4">AI로 맞춤 식단을 만들거나, 커뮤니티에서 따라하기해보세요</p>
          <div className="flex gap-2 justify-center">
            <button onClick={generatePlan} disabled={generating}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-primary text-white disabled:opacity-50"
              style={{ minHeight: "36px" }}>
              ✨ AI 식단 만들기
            </button>
            <Link href="/community"
              className="px-4 py-2.5 rounded-xl text-xs font-bold border border-border hover:border-primary/30 transition-colors flex items-center"
              style={{ minHeight: "36px" }}>
              커뮤니티 구경하기
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map(plan => {
            const src = sourceLabel(plan.source);
            const isEditing = editingTitle === plan.id;

            return (
              <div key={plan.id}
                className="bg-[var(--color-card)] rounded-[18px] shadow-[0_1px_4px_rgba(28,27,24,0.06)] overflow-hidden transition-all hover:shadow-[0_2px_8px_rgba(28,27,24,0.1)]">
                {/* 카드 상단 */}
                <div className="p-4 cursor-pointer" onClick={() => !isEditing && openPlan(plan.id)}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    {isEditing ? (
                      <div className="flex gap-2 flex-1" onClick={e => e.stopPropagation()}>
                        <input type="text" value={editTitleValue} onChange={e => setEditTitleValue(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveTitle(plan.id); if (e.key === "Escape") setEditingTitle(null); }}
                          className="flex-1 px-2 py-1 rounded-lg border border-primary text-sm font-bold bg-transparent outline-none"
                          autoFocus />
                        <button onClick={() => saveTitle(plan.id)}
                          className="text-[10px] text-primary font-bold px-2" style={{ minHeight: "unset", minWidth: "unset" }}>저장</button>
                      </div>
                    ) : (
                      <h3 className="text-[15px] font-bold flex-1 min-w-0 line-clamp-1">{plan.title}</h3>
                    )}
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0"
                      style={{ background: src.bg, color: src.color }}>
                      {src.text}
                    </span>
                  </div>

                  {/* 영양 요약 */}
                  <div className="flex gap-3 text-[11px] mb-2">
                    <span className="text-muted"><span className="font-semibold text-foreground" style={NUM}>{plan.product_count}</span>개 음식</span>
                    {plan.avg_daily_calories > 0 && (
                      <span className="text-muted"><span className="font-semibold" style={{ ...NUM, color: "#D47040" }}>{plan.avg_daily_calories}</span>kcal</span>
                    )}
                    {plan.avg_daily_protein > 0 && (
                      <span className="text-muted">단백질 <span className="font-semibold" style={{ ...NUM, color: "#4A8FD4" }}>{plan.avg_daily_protein}</span>g</span>
                    )}
                    {plan.total_price > 0 && (
                      <span className="text-muted"><span className="font-semibold" style={NUM}>{plan.total_price.toLocaleString()}</span>원</span>
                    )}
                  </div>

                  {/* 태그 + 시간 */}
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                      {(plan.tags || []).slice(0, 3).map(t => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-md bg-[var(--color-surface)] text-muted">{t}</span>
                      ))}
                    </div>
                    <span className="text-[10px] text-muted">{relativeTime(plan.updated_at)}</span>
                  </div>
                </div>

                {/* 카드 하단 액션 */}
                <div className="border-t border-border/30 px-4 py-2 flex items-center gap-3">
                  <button onClick={(e) => { e.stopPropagation(); setEditingTitle(plan.id); setEditTitleValue(plan.title); }}
                    className="text-[11px] text-muted hover:text-foreground transition-colors"
                    style={{ minHeight: "unset", minWidth: "unset" }}>
                    ✏️ 이름 변경
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); openPlan(plan.id); }}
                    className="text-[11px] text-muted hover:text-foreground transition-colors"
                    style={{ minHeight: "unset", minWidth: "unset" }}>
                    👁️ 상세 보기
                  </button>
                  <div className="flex-1" />
                  <button onClick={(e) => { e.stopPropagation(); if (confirm("이 식단을 삭제할까요?")) deletePlan(plan.id); }}
                    disabled={deleting === plan.id}
                    className="text-[11px] text-red-400 hover:text-red-500 transition-colors"
                    style={{ minHeight: "unset", minWidth: "unset" }}>
                    {deleting === plan.id ? "삭제 중..." : "🗑️ 삭제"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 식단 상세 모달 ── */}
      {selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedPlan(null)} />
          <div className="relative bg-[var(--color-card)] w-full max-w-[500px] max-h-[85vh] overflow-y-auto rounded-t-[24px] sm:rounded-[24px] shadow-xl">
            {/* 모달 헤더 */}
            <div className="sticky top-0 z-10 bg-[var(--color-card)] border-b border-border/30 px-5 py-4 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-extrabold line-clamp-1">{selectedPlan.title}</h2>
                <p className="text-[11px] text-muted mt-0.5">
                  {selectedPlan.product_count}개 음식 · {selectedPlan.avg_daily_calories}kcal · 단백질 {selectedPlan.avg_daily_protein}g
                </p>
              </div>
              <button onClick={() => setSelectedPlan(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--color-surface)] text-muted"
                style={{ minHeight: "unset", minWidth: "unset" }}>✕</button>
            </div>

            {/* 그리드 내용 */}
            <div className="px-5 py-4 space-y-3">
              {DAYS.map(day => {
                const dayGrid = selectedPlan.grid?.[day.key] || {};
                const filledMeals = MEALS.filter(m => dayGrid[m.key] && (dayGrid[m.key]?.name || dayGrid[m.key]?.product_id));
                if (filledMeals.length === 0) return null;

                return (
                  <div key={day.key}>
                    <p className="text-xs font-bold text-muted mb-1.5">{day.label}요일</p>
                    <div className="space-y-1.5">
                      {filledMeals.map(meal => {
                        const cell = dayGrid[meal.key];
                        if (!cell) return null;
                        // _foods가 있으면 (따라하기) 전체 음식 목록 표시
                        const foods = cell._foods as { name: string; calories?: number; protein_g?: number }[] | undefined;

                        return (
                          <div key={meal.key} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[var(--color-surface)]"
                            style={{ borderLeft: `3px solid ${meal.color}` }}>
                            <span className="text-sm">{meal.emoji}</span>
                            <div className="flex-1 min-w-0">
                              {foods && foods.length > 1 ? (
                                <>
                                  {foods.map((f, i) => (
                                    <p key={i} className="text-[12px] leading-snug">{f.name}
                                      <span className="text-muted ml-1" style={NUM}>{f.calories || 0}kcal</span>
                                    </p>
                                  ))}
                                </>
                              ) : (
                                <p className="text-[13px] font-semibold line-clamp-1">{cell.name || "음식"}</p>
                              )}
                              <p className="text-[10px] text-muted mt-0.5" style={NUM}>
                                {cell.calories || 0}kcal · 단백질 {Math.round(cell.protein_g || 0)}g
                              </p>
                            </div>
                            {cell.price > 0 && (
                              <span className="text-[11px] font-bold shrink-0" style={NUM}>{cell.price.toLocaleString()}원</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* 빈 식단 */}
              {DAYS.every(d => MEALS.every(m => !selectedPlan.grid?.[d.key]?.[m.key]?.name)) && (
                <div className="text-center py-8">
                  <p className="text-muted text-sm">이 식단에 저장된 음식이 없어요</p>
                </div>
              )}
            </div>

            {/* 모달 하단 액션 */}
            <div className="sticky bottom-0 bg-[var(--color-card)] border-t border-border/30 px-5 py-3 flex gap-2">
              <Link href="/diary"
                className="flex-1 py-3 rounded-xl text-sm font-bold text-center bg-primary text-white"
                style={{ minHeight: "44px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                📝 식단 기록에 추가
              </Link>
              <button onClick={() => setSelectedPlan(null)}
                className="px-4 py-3 rounded-xl text-sm font-medium border border-border"
                style={{ minHeight: "44px" }}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-lg text-[13px] font-medium"
          style={{ background: "#C4870A", color: "#0C1117", maxWidth: "90vw" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
