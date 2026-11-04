"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Badge, BottomBar, Button, Card, CardActions, ConfirmSheet, EmptyState, IconButton, Input, Kcal, LinkButton, ListRow,
  MacroGrid, MacroInline, MealSlot, Page, PageLoading, Price, ProgressBar, SearchField, SectionHeader, Sheet, Spinner,
  Stat, Tabs, TextLink, Thumb, cn, useToast,
} from "@/components/ui";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _foods?: any[];
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
  source?: string;
  updated_at: string;
};

const DAYS = [
  { key: "mon", label: "월" }, { key: "tue", label: "화" }, { key: "wed", label: "수" },
  { key: "thu", label: "목" }, { key: "fri", label: "금" }, { key: "sat", label: "토" },
  { key: "sun", label: "일" },
];

const MEALS = [
  { key: "breakfast", label: "아침" },
  { key: "lunch", label: "점심" },
  { key: "dinner", label: "저녁" },
  { key: "supplement", label: "간식" },
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

function getUserId(): string | null {
  try { return localStorage.getItem("carefood_anon_id") || null; } catch { return null; }
}

function emptyGrid(): GridData {
  const g: GridData = {};
  for (const d of DAYS) { g[d.key] = {}; for (const m of MEALS) g[d.key][m.key] = null; }
  return g;
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

/* ───── 제품 고르기 시트 ───── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ProductRow({ p, onSelect }: { p: any; onSelect: (cell: CellData) => void }) {
  const prices = p.product_prices?.filter((pp: { price: number }) => pp.price > 0) || [];
  const best = prices[0];
  return (
    <ListRow
      onClick={() => onSelect({
        product_id: p.id, name: p.name, calories: p.calories, protein_g: p.protein_g,
        price: best?.price, platform: best?.platform, url: best?.url, type: "product",
      })}
      leading={<Thumb src={best?.image_url || p.image_url} size={44} />}
      title={p.name}
      meta={<><Kcal value={p.calories || 0} className="text-caption" /> · 단백질 <span className="num">{Math.round(p.protein_g || 0)}</span>g</>}
      trailing={best ? <Price value={best.price} className="text-label" /> : undefined}
    />
  );
}

type PickTab = "favorites" | "recent" | "search";

function ProductSearchSheet({ open, onSelect, onClose, onEatingOut }: {
  open: boolean;
  onSelect: (product: CellData) => void;
  onClose: () => void;
  onEatingOut: () => void;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<PickTab>("favorites");
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
    if (!open) return;
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
      } catch { /* */ } // ds-allow: 보조 탭(즐겨찾기) 불러오기
      finally { setLoadingFavorites(false); }
    };
    loadFavs();
  }, [open]);

  useEffect(() => {
    if (!open) return;
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
      } catch { /* */ } // ds-allow: 보조 탭(최근 본) 불러오기
      finally { setLoadingRecent(false); }
    };
    loadRecent();
  }, [open]);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true); setTab("search");
    try {
      const res = await fetch(`/api/products?q=${encodeURIComponent(query)}&hasPrice=1&limit=15`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setResults(data.products || []);
    } catch {
      toast.show("검색하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
    finally { setSearching(false); }
  };

  const displayProducts = tab === "search" ? results : tab === "favorites" ? favoriteProducts : recentProducts;
  const isLoading = tab === "search" ? searching : tab === "favorites" ? loadingFavorites : loadingRecent;

  const tabs: { value: PickTab; label: string; count?: number }[] = [
    { value: "favorites", label: "즐겨찾기", count: favoriteProducts.length },
    { value: "recent", label: "최근 본" },
    ...(results.length > 0 ? [{ value: "search" as const, label: "검색 결과", count: results.length }] : []),
  ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="음식 고르기"
      footer={<Button variant="secondary" block icon="cart" onClick={onEatingOut}>외식으로 표시하기</Button>}
    >
      <SearchField value={query} onChange={setQuery} onSubmit={search} placeholder="제품 이름 검색" />
      <Tabs variant="line" className="mt-3" value={tab} onChange={setTab} items={tabs} label="고르는 방법" />
      <div className="mt-2 -mx-2">
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : displayProducts.length > 0 ? (
          displayProducts.map((p) => <ProductRow key={p.id} p={p} onSelect={onSelect} />)
        ) : (
          <p className="text-label text-ink-2 text-center py-8">
            {tab === "favorites" ? "즐겨찾기한 제품이 없어요" : tab === "recent" ? "최근 본 제품이 없어요" : "검색 결과가 없어요"}
          </p>
        )}
      </div>
    </Sheet>
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
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SavedPlan | null>(null);
  const toast = useToast();
  const showToast = toast.show; // 안정된 함수 — effect 의존성에 toast 객체를 넣지 않는다
  const [plansError, setPlansError] = useState(false);

  const loadPlans = useCallback(async () => {
    const userId = getUserId();
    if (!userId) return;
    setPlansError(false);
    try {
      const res = await fetch(`/api/meal-plans?user_id=${userId}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setSavedPlans(data.plans || []);
    } catch {
      setPlansError(true);
      showToast("식단 리스트를 불러오지 못했어요", { tone: "danger" });
    }
  }, [showToast]);

  useEffect(() => { loadPlans().finally(() => setLoading(false)); }, [loadPlans]);

  const fetchAndBuildGrid = async (): Promise<{ grid: GridData; title: string } | null> => {
    const profileRaw = localStorage.getItem("carefood_profile");
    if (!profileRaw) return null;
    const profile = JSON.parse(profileRaw);
    let healthConditions: string[] = [];
    try { const h = localStorage.getItem("carefood_health"); if (h) healthConditions = JSON.parse(h).conditions || []; } catch { /* */ } // ds-allow: 로컬 검진 정보 읽기

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
      if (!profileRaw) return;
      setPreloading(true);
      try {
        const result = await fetchAndBuildGrid();
        if (result) setPrecomputed(result);
      } catch { /* */ } // ds-allow: 미리 계산은 실패하면 버튼 눌렀을 때 다시
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
      toast.show("AI 추천으로 7일을 채웠어요");
      return;
    }
    setGenerating(true);
    try {
      const result = await fetchAndBuildGrid();
      if (!result) { toast.show("식단을 만들지 못했어요. 프로필을 확인해 주세요", { tone: "danger" }); return; }
      setGrid(result.grid); setPlanTitle(result.title); setPlanId(null);
      toast.show("AI 추천으로 7일을 채웠어요");
    } catch { toast.show("식단을 만들지 못했어요. 다시 시도해 주세요", { tone: "danger" }); }
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
      if (data.ok) { setPlanId(data.id); loadPlans(); toast.show("식단을 저장했어요"); }
      else toast.show("저장하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } catch { toast.show("저장하지 못했어요. 다시 시도해 주세요", { tone: "danger" }); }
    finally { setSaving(false); }
  };

  const loadPlan = async (id: string) => {
    const userId = getUserId(); if (!userId) return;
    try {
      const res = await fetch(`/api/meal-plans/load?id=${id}&user_id=${userId}`);
      const data = await res.json();
      if (!res.ok || !data.plan) throw new Error(String(res.status));
      setGrid(data.plan.grid || emptyGrid()); setPlanTitle(data.plan.title); setPlanId(data.plan.id);
      toast.show(`"${data.plan.title}" 을 불러왔어요`);
    } catch {
      toast.show("식단을 불러오지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
  };

  const updateCell = (day: string, meal: string, cell: CellData) => {
    setGrid(prev => ({ ...prev, [day]: { ...prev[day], [meal]: cell } }));
  };

  /* ── 이름 변경 ── */
  const renamePlan = async (id: string) => {
    const userId = getUserId();
    if (!userId || !editTitleValue.trim()) return;
    try {
      const res = await fetch("/api/meal-plans", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, user_id: userId, title: editTitleValue.trim() }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setSavedPlans(prev => prev.map(p => p.id === id ? { ...p, title: editTitleValue.trim() } : p));
      if (planId === id) setPlanTitle(editTitleValue.trim());
      toast.show("이름을 바꿨어요");
    } catch {
      toast.show("이름을 바꾸지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
    setEditingTitle(null);
  };

  /* ── 삭제 ── */
  const deletePlan = async (id: string) => {
    const userId = getUserId(); if (!userId) return;
    try {
      const res = await fetch(`/api/meal-plans?id=${id}&user_id=${userId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      setSavedPlans(prev => prev.filter(p => p.id !== id));
      if (planId === id) { setGrid(emptyGrid()); setPlanId(null); setPlanTitle("새 식단"); }
      toast.show("식단을 삭제했어요");
    } catch {
      toast.show("식단을 삭제하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
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
        if (cell.product_id || cell.name) {
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

  if (loading) return <PageLoading />;

  const activeDayMeals = grid[activeDay] || {};
  const activeDayCal = stats.perDay[activeDay] || 0;
  const activeDayLabel = DAYS.find(d => d.key === activeDay)?.label || "";
  const filledMeals = Object.values(activeDayMeals).filter(c => c && (c.product_id || c.name)).length;

  return (
    <Page width="narrow">

      {/* ══════════ 내 식단 리스트 ══════════ */}
      <section className="mb-8">
        <SectionHeader
          title="내 식단 리스트"
          description="카드를 누르면 아래 편집기로 불러와요"
          action={savedPlans.length > 0 ? <TextLink href="/community">커뮤니티에서 따라하기</TextLink> : undefined}
        />

        {savedPlans.length > 0 ? (
          <div className="flex flex-col gap-2">
            {savedPlans.map(p => {
              const isActive = planId === p.id;
              const isEditing = editingTitle === p.id;
              return (
                <Card key={p.id} padding="md" className={cn(isActive && "border-brand")}>
                  <div
                    role={isEditing ? undefined : "button"}
                    tabIndex={isEditing ? undefined : 0}
                    onClick={() => !isEditing && loadPlan(p.id)}
                    onKeyDown={(e) => { if (!isEditing && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); loadPlan(p.id); } }}
                    className={cn(!isEditing && "cursor-pointer")}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      {isEditing ? (
                        <form
                          className="flex gap-2 flex-1"
                          onClick={e => e.stopPropagation()}
                          onSubmit={(e) => { e.preventDefault(); renamePlan(p.id); }}
                        >
                          <Input value={editTitleValue} onChange={e => setEditTitleValue(e.target.value)}
                            onKeyDown={e => { if (e.key === "Escape") setEditingTitle(null); }}
                            aria-label="식단 이름" autoFocus />
                          <Button type="submit" size="sm" className="h-11">저장하기</Button>
                        </form>
                      ) : (
                        <h3 className="text-body font-bold text-ink flex-1 min-w-0 line-clamp-1">{p.title}</h3>
                      )}
                      {!isEditing && (
                        <Badge tone={p.source === "community_copy" ? "brand" : "neutral"}>
                          {p.source === "community_copy" ? "따라하기" : "AI 생성"}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-ink-2">
                      <span><span className="num font-bold text-ink">{p.product_count}</span>개</span>
                      {p.avg_daily_calories > 0 && <Kcal value={p.avg_daily_calories} className="text-caption" />}
                      {p.total_price > 0 && <Price value={p.total_price} className="text-caption" />}
                      <span className="ml-auto">{relativeTime(p.updated_at)}</span>
                    </div>
                  </div>
                  <CardActions>
                    <Button size="sm" variant="ghost" icon="edit"
                      onClick={() => { setEditingTitle(p.id); setEditTitleValue(p.title); }}>이름 바꾸기</Button>
                    <Button size="sm" variant="ghost" icon="refresh" onClick={() => loadPlan(p.id)}>불러오기</Button>
                    <Button size="sm" variant="ghost" icon="trash" className="ml-auto" onClick={() => setDeleteTarget(p)}>삭제하기</Button>
                  </CardActions>
                </Card>
              );
            })}
          </div>
        ) : plansError ? (
          <EmptyState
            title="식단 리스트를 불러오지 못했어요"
            description="연결이 잠깐 끊겼을 수 있어요"
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => loadPlans()}>다시 불러오기</Button>}
          />
        ) : (
          <EmptyState
            title="아직 저장한 식단이 없어요"
            description="아래에서 AI 추천으로 채우거나, 커뮤니티에서 따라하기 해 보세요"
            action={<LinkButton href="/community" size="sm" variant="secondary">커뮤니티 보기</LinkButton>}
          />
        )}
      </section>

      {/* ══════════ 7일 식단 편집기 ══════════ */}
      <section className="border-t border-line pt-6">
        <div className="flex flex-col gap-3 mb-5">
          <div>
            <Input
              value={planTitle}
              onChange={e => setPlanTitle(e.target.value)}
              placeholder="식단 이름"
              aria-label="식단 이름"
              className="font-bold"
            />
            <p className="text-caption text-ink-2 mt-1.5">영양 밸런스를 맞춰 7일을 구성해요</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" block onClick={generatePlan} loading={generating || (!precomputed && preloading)}>
              {generating ? "만드는 중" : !precomputed && preloading ? "준비 중" : "AI 추천으로 채우기"}
            </Button>
            <Button block onClick={savePlan} disabled={stats.products === 0} loading={saving}>
              {saving ? "저장 중" : "저장하기"}
            </Button>
          </div>
        </div>

        {/* ── 주간 요약 ── */}
        {stats.products > 0 && (
          <Card className="mb-5">
            <div className="flex items-end justify-between gap-4 mb-4">
              <Stat size="lg" emphasis label="일 평균 kcal" value={stats.avgCal.toLocaleString()} />
              <div className="flex gap-5">
                <Stat label="목표 달성률" value={stats.goalPct} unit="%" />
                <Stat label="주간 예상 비용" value={stats.totalPrice.toLocaleString()} unit="원" />
              </div>
            </div>
            <MacroGrid
              values={{ protein: stats.avgProtein, carbs: stats.avgCarbs, fat: stats.avgFat, sodium: stats.avgSodium }}
              targets={{ protein: 80, carbs: 260, fat: 60, sodium: 2000 }}
            />
          </Card>
        )}

        {/* ── 요일 고르기 ── */}
        <div role="tablist" aria-label="요일" className="grid grid-cols-7 gap-1 mb-4">
          {DAYS.map(d => {
            const dayCal = stats.perDay[d.key] || 0;
            const isActive = d.key === activeDay;
            return (
              <button
                key={d.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveDay(d.key)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 h-14 rounded-md border transition-colors",
                  isActive ? "bg-brand-soft border-brand text-brand-ink" : "border-transparent text-ink-2 hover:bg-sunken",
                )}
              >
                <span className="text-label font-bold">{d.label}</span>
                <span className="num text-caption">{dayCal > 0 ? dayCal.toLocaleString() : "–"}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between mb-3">
          <span className="text-body font-bold text-ink">{activeDayLabel}요일 식단</span>
          <span className="text-caption text-ink-2">
            <span className="num">{filledMeals}</span>/<span className="num">{MEALS.length}</span>끼
            {activeDayCal > 0 && <> · <Kcal value={activeDayCal} className="text-caption" /></>}
          </span>
        </div>

        {/* ── 끼니 ── */}
        <div className="flex flex-col gap-2">
          {MEALS.map(meal => {
            const cell = activeDayMeals[meal.key];
            const isEatingOut = cell?.type === "eating_out";
            const isEmpty = !isEatingOut && (!cell || (!cell.product_id && !cell.name));
            const foods = cell?._foods as { name: string; calories?: number }[] | undefined;

            if (isEmpty) {
              return (
                <MealSlot key={meal.key} meal={meal.key} empty
                  onAdd={() => setSearchModal({ day: activeDay, meal: meal.key })} />
              );
            }
            if (isEatingOut) {
              return (
                <MealSlot key={meal.key} meal={meal.key}
                  right={<Button size="sm" variant="ghost" onClick={() => updateCell(activeDay, meal.key, null)}>취소</Button>}>
                  <p className="text-label text-ink-2">외식</p>
                </MealSlot>
              );
            }
            return (
              <MealSlot key={meal.key} meal={meal.key} right={<Kcal value={cell?.calories || 0} className="text-label" />}>
                {foods && foods.length > 1 ? (
                  <ul className="flex flex-col gap-0.5">
                    {foods.map((f, i) => (
                      <li key={i} className="text-body text-ink">{f.name}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-body font-medium text-ink">{cell?.name}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {cell?.platform && SERVICE_NAMES[cell.platform] && <Badge tone="brand">{SERVICE_NAMES[cell.platform]}</Badge>}
                  {cell?.price ? <Price value={cell.price} className="text-caption" /> : null}
                </div>
                <MacroInline className="mt-1.5" values={{ protein: cell?.protein_g, carbs: cell?.carbs_g, fat: cell?.fat_g, sodium: cell?.sodium_mg }} />
                <div className="flex gap-1 mt-2 -ml-3">
                  <Button size="sm" variant="ghost" icon="refresh" onClick={() => setSearchModal({ day: activeDay, meal: meal.key })}>바꾸기</Button>
                  <Button size="sm" variant="ghost" icon="trash" onClick={() => updateCell(activeDay, meal.key, null)}>빼기</Button>
                </div>
              </MealSlot>
            );
          })}
        </div>

        {/* ── 서비스 구성 ── */}
        {stats.products > 0 && stats.serviceMix.length > 0 && (
          <Card className="mt-5">
            <p className="text-label font-bold text-ink mb-3">서비스 구성</p>
            <div className="flex flex-col gap-2.5">
              {stats.serviceMix.map(svc => (
                <div key={svc.key} className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3">
                  <span className="text-caption font-medium text-ink truncate">{svc.name}</span>
                  <ProgressBar value={svc.count} max={stats.products} tone="brand" label={`${svc.name} 비중`} />
                  <span className="text-caption text-ink-2 text-right">
                    <span className="num">{svc.count}</span>끼 · <span className="num">{svc.cost.toLocaleString()}</span>원
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-4 pt-3 border-t border-line text-label">
              <span className="font-bold text-ink">월 예상</span>
              <Price value={stats.monthlyEstimate} className="text-label" />
            </div>
          </Card>
        )}
      </section>

      {/* ── 하단 주문 ── */}
      {stats.products > 0 && (
        <BottomBar>
          <div className="flex-1 min-w-0">
            <div className="text-caption text-ink-2">
              <span className="num">{stats.products}</span>끼 · <span className="num">{stats.serviceMix.filter(s => s.isHealth).length}</span>개 서비스
            </div>
            <Price value={stats.totalPrice} className="text-body" />
          </div>
          <Button onClick={() => {
            const orderItems: { day: string; slot: string; product_name: string; product_id?: string }[] = [];
            for (const [day, slots] of Object.entries(grid)) {
              for (const [slot, cell] of Object.entries(slots)) {
                if (cell && cell.name) orderItems.push({ day, slot, product_name: cell.name, product_id: cell.product_id || undefined });
              }
            }
            if (orderItems.length > 0) { localStorage.setItem("carefood_order_items", JSON.stringify(orderItems)); window.location.href = "/order"; }
          }}>
            이 식단 주문하기
          </Button>
        </BottomBar>
      )}

      {/* ── 음식 고르기 ── */}
      <ProductSearchSheet
        open={!!searchModal}
        onSelect={(product) => { if (searchModal) updateCell(searchModal.day, searchModal.meal, product); setSearchModal(null); }}
        onClose={() => setSearchModal(null)}
        onEatingOut={() => { if (searchModal) updateCell(searchModal.day, searchModal.meal, { type: "eating_out" }); setSearchModal(null); }}
      />

      <ConfirmSheet
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) deletePlan(deleteTarget.id); setDeleteTarget(null); }}
        title="이 식단을 삭제할까요?"
        description={deleteTarget ? `"${deleteTarget.title}" 이 식단 리스트에서 사라지고 되돌릴 수 없어요` : undefined}
        confirmLabel="삭제하기"
      />
    </Page>
  );
}
