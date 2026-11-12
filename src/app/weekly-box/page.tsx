"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import Link from "next/link";
import { perServing } from "@/lib/nutrition";
import { defaultServingG, isBrothDish } from "@/lib/serving";
import { unitPrice } from "@/lib/prices";
import {
  Badge, BottomBar, Button, Card, CardActions, ConfirmSheet, EmptyState, Input, Kcal, LinkButton, ListRow,
  IconButton, MacroGrid, MacroInline, MealSlot, Page, PageLoading, Price, ProgressBar, SearchField, SectionHeader, Sheet, SkeletonList,
  Stat, Tabs, TextLink, Thumb, cn, useToast,
  DragArea, DragGhost, DragHandle, useDragItem, useDropTarget, type DragData,
  Chip, ChipRow, FoodEntryForm, type FoodBase, type FoodEntry, Field, Select,
} from "@/components/ui";
import { ORDERING_ENABLED } from "@/lib/features";
import { ShoppingList } from "./ShoppingList";
import { getClientActorId } from "@/lib/actor-client";

/* ───── 타입 ───── */
type CellData = {
  product_id?: string;
  name?: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  sodium_mg?: number;
  /** 한 끼 값 — 묶음이면 개수로 나눈 값 */
  price?: number;
  /** 묶음일 때 판매 가격과 개수 ("12개 34,300원") */
  pack_price?: number;
  pack_count?: number;
  platform?: string;
  url?: string;
  type?: "product" | "eating_out";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _foods?: any[];
} | null;

type GridData = Record<string, Record<string, CellData>>;
type Food = Omit<NonNullable<CellData>, "_foods">;

/** 묶음 가격이면 판매 가격·개수 */
function packOf(p: { price?: number; pack_count?: number | null } | undefined): { pack_price?: number; pack_count?: number } {
  const n = Number(p?.pack_count) || 1;
  return n > 1 && p?.price ? { pack_price: p.price, pack_count: n } : {};
}

/** 한 칸에 든 음식 — 여럿이면 _foods, 하나면 칸 자체 */
function cellFoods(c: CellData): Food[] {
  if (!c) return [];
  if (Array.isArray(c._foods) && c._foods.length > 0) return c._foods as Food[];
  const { _foods: _, ...one } = c; // eslint-disable-line @typescript-eslint/no-unused-vars
  return one.product_id || one.name ? [one] : [];
}

/** 음식 목록 → 한 칸 (첫 음식이 대표, 영양·가격은 합) */
function cellOf(foods: Food[]): CellData {
  if (foods.length === 0) return null;
  if (foods.length === 1) return { ...foods[0] };
  const sum = (k: "calories" | "protein_g" | "carbs_g" | "fat_g" | "sodium_mg" | "price") =>
    foods.some((f) => f[k] != null) ? foods.reduce((a, f) => a + (Number(f[k]) || 0), 0) : undefined;
  const first = foods[0];
  return {
    product_id: first.product_id, name: first.name, platform: first.platform, url: first.url,
    pack_price: first.pack_price, pack_count: first.pack_count,
    type: first.type === "eating_out" ? "eating_out" : "product",
    calories: sum("calories"), protein_g: sum("protein_g"), carbs_g: sum("carbs_g"), fat_g: sum("fat_g"),
    sodium_mg: sum("sodium_mg"), price: sum("price"),
    _foods: foods,
  };
}

/** 가족 프로필 (/api/family) — AI 채우기 기준으로 고를 수 있다 */
type FamilyMember = {
  id: string; nickname: string; relationship: string | null;
  concerns: string[] | null; conditions: string[] | null; allergies: string[] | null;
  sensitivity_digestive: number | null; sensitivity_additive: number | null;
  taste_salty: number | null; taste_sweet: number | null; taste_spicy: number | null; taste_fatty: number | null;
};

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
  /** 음식이 든 요일 — 하루 이하면 원하는 요일에 넣고, 여러 날이면 통째로 불러온다 */
  filled_days?: string[];
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
  "11st": "11번가", kurly: "컬리", oasis: "오아시스", homeplus: "홈플러스", coupang: "쿠팡",
};

function getUserId(): string | null {
  // 서버가 발급한 쿠키의 id — API 는 이 값을 받지 않고 쿠키로 직접 확인한다
  return getClientActorId();
}

/** 사용자 id 를 붙여 JSON 을 받는다. 익명 id 가 없으면 빈 결과 (항상 비동기) */
async function getJson(urlWithUserIdAtEnd: string) {
  const userId = getUserId();
  if (!userId) return {};
  const res = await fetch(urlWithUserIdAtEnd + encodeURIComponent(userId));
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
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
function ProductRow({ p: raw, onSelect }: { p: any; onSelect: (cell: CellData) => void }) {
  // DB 영양값은 100g 기준 → 식단 칸에는 제품 상세와 같은 1회 제공량 기준으로 넣는다
  const p = perServing(raw);
  const prices = p.product_prices?.filter((pp: { price: number }) => pp.price > 0) || [];
  // 한 끼 값이 가장 싼 곳 — 묶음은 개수로 나눠 견준다 ("200g x 24개 41,540원" → 1,731원)
  const best = prices.reduce((a: { price: number; unit_price?: number | null } | undefined, b: { price: number; unit_price?: number | null }) =>
    !a || unitPrice(b) < unitPrice(a) ? b : a, undefined);
  const pack = Number(best?.pack_count) > 1 ? Number(best.pack_count) : undefined;
  const servingG = defaultServingG(p); // 포장 무게는 걸러서 (lib/serving.ts) — perServing 과 같은 양
  return (
    <ListRow
      onClick={() => onSelect({
        product_id: p.id, name: p.name, calories: Math.round(p.calories || 0), protein_g: p.protein_g,
        carbs_g: p.carbs_g ?? undefined, fat_g: p.fat_g ?? undefined, sodium_mg: p.sodium_mg ?? undefined,
        price: best ? unitPrice(best) : undefined, pack_price: pack ? best.price : undefined, pack_count: pack,
        platform: best?.platform, url: best?.url, type: "product",
      })}
      leading={<Thumb src={best?.image_url || p.image_url} size={44} />}
      title={p.name}
      meta={<>{servingG > 0 && <>1회 <span className="num">{Math.round(servingG)}</span>g · </>}<Kcal value={Math.round(p.calories || 0)} className="text-caption" /> · 단백질 <span className="num">{Math.round(p.protein_g || 0)}</span>g</>}
      trailing={best ? (
        <span className="flex flex-col items-end">
          <Price value={unitPrice(best)} className="text-label" />
          {pack && <span className="text-caption text-ink-2"><span className="num">{pack}</span>개 묶음 개당</span>}
        </span>
      ) : undefined}
    />
  );
}

type PickTab = "favorites" | "recent" | "plans";
type LoadState<T> = { status: "idle" | "loading" | "error" | "done"; data: T[] };
type PlanWithGrid = SavedPlan & { grid: GridData };

/** 내 식단 탭 한 줄 — 저장한 식단 안의 끼니 하나 */
function PlanMealRow({ day, meal, cell, multiDay, onSelect }: {
  day: string; meal: string; cell: NonNullable<CellData>; multiDay: boolean; onSelect: (cell: CellData) => void;
}) {
  const foods = (cell._foods || []) as { name: string }[];
  const name = foods.length > 1 ? `${foods[0].name} 외 ${foods.length - 1}개` : cell.name || "";
  const where = `${multiDay ? `${DAYS.find(d => d.key === day)?.label}요일 ` : ""}${MEALS.find(m => m.key === meal)?.label}`;
  return (
    <ListRow
      onClick={() => onSelect({ ...cell })}
      title={name}
      meta={<>{where} · <Kcal value={cell.calories || 0} className="text-caption" /></>}
      trailing={cell.price ? <Price value={cell.price} className="text-label" /> : undefined}
    />
  );
}

function ProductSearchSheet({ open, onSelect, onClose, onEatingOut, title = "음식 고르기", quickQueries }: {
  open: boolean;
  onSelect: (product: CellData) => void;
  onClose: () => void;
  /** 없으면 "외식으로만 표시"를 숨긴다 (음식을 더할 때) */
  onEatingOut?: () => void;
  title?: string;
  /** 검색어를 누르기만 해도 찾게 — 국물 요리에 밥을 더할 때 "쌀밥" 등 */
  quickQueries?: string[];
}) {
  const toast = useToast();
  const [tab, setTab] = useState<PickTab>("favorites");
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [favorites, setFavorites] = useState<LoadState<any>>({ status: "idle", data: [] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [recent, setRecent] = useState<LoadState<any>>({ status: "idle", data: [] });
  const [plans, setPlans] = useState<LoadState<PlanWithGrid>>({ status: "idle", data: [] });
  // 일반 메뉴(외식·직접 만든 음식)
  const [dishResults, setDishResults] = useState<FoodBase[]>([]);
  const [menus, setMenus] = useState<LoadState<FoodBase & { category: string }>>({ status: "idle", data: [] });
  const [menuCat, setMenuCat] = useState("한식");
  const [eatOut, setEatOut] = useState(false);
  const [entry, setEntry] = useState<FoodBase | "manual" | null>(null);

  // 시트를 열 때마다 새로 불러온다 (그사이 저장·즐겨찾기가 바뀌었을 수 있다)
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setFavorites({ status: "idle", data: [] }); setRecent({ status: "idle", data: [] }); setPlans({ status: "idle", data: [] });
      setQuery(""); setSearched(""); setResults([]); setDishResults([]);
      setEatOut(false); setEntry(null);
    }
  }

  const loadFavorites = useCallback(async () => {
    try {
      const data = await getJson("/api/favorites?user_id=");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setFavorites({ status: "done", data: (data.favorites || []).map((f: any) => ({
        id: f.product_id, name: f.name, calories: f.calories, protein_g: f.protein_g, carbs_g: f.carbs_g, fat_g: f.fat_g,
        sodium_mg: f.sodium_mg, serving_size_g: f.serving_size_g, nutrient_base_g: f.nutrient_base_g,
        product_prices: f.best_price ? [{ price: f.best_price, pack_count: f.best_pack_count, unit_price: f.best_unit_price, platform: "", url: "", image_url: f.image_url }] : [],
      })) });
    } catch { setFavorites({ status: "error", data: [] }); }
  }, []);

  const loadRecent = useCallback(async () => {
    try {
      const data = await getJson("/api/products/recent?user_id=");
      setRecent({ status: "done", data: data.products || [] });
    } catch { setRecent({ status: "error", data: [] }); }
  }, []);

  const loadPlans = useCallback(async () => {
    try {
      const data = await getJson("/api/meal-plans?include=grid&user_id=");
      setPlans({ status: "done", data: data.plans || [] });
    } catch { setPlans({ status: "error", data: [] }); }
  }, []);

  // 보고 있는 탭만, 시트를 연 뒤 처음 볼 때 불러온다
  const requested = useRef(new Set<PickTab>());
  useEffect(() => {
    if (!open) { requested.current.clear(); return; }
    if (requested.current.has(tab)) return;
    requested.current.add(tab);
    if (tab === "favorites") loadFavorites();
    if (tab === "recent") loadRecent();
    if (tab === "plans") loadPlans();
  }, [open, tab, loadFavorites, loadRecent, loadPlans]);
  const retry = (tabKey: PickTab) => {
    if (tabKey === "favorites") { setFavorites({ status: "loading", data: [] }); loadFavorites(); }
    if (tabKey === "recent") { setRecent({ status: "loading", data: [] }); loadRecent(); }
    if (tabKey === "plans") { setPlans({ status: "loading", data: [] }); loadPlans(); }
  };

  const search = async (qArg?: string) => {
    const q = (qArg ?? query).trim();
    if (!q) return;
    if (qArg) setQuery(qArg);
    setSearching(true); setSearched(q);
    setEntry(null); setEatOut(false);
    try {
      const [res, dishRes] = await Promise.all([
        fetch(`/api/products?q=${encodeURIComponent(q)}&hasPrice=1&limit=15`),
        fetch(`/api/common-foods?q=${encodeURIComponent(q)}`),
      ]);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setResults(data.products || []);
      const dishData = dishRes.ok ? await dishRes.json() : { foods: [] };
      setDishResults(dishData.foods || []);
    } catch {
      setResults([]); setDishResults([]);
      toast.show("검색하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
    finally { setSearching(false); }
  };
  const inSearch = searched !== "" && query.trim() === searched;

  const loadMenus = useCallback(async () => {
    try {
      const res = await fetch("/api/common-foods?all=1");
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setMenus({ status: "done", data: data.foods || [] });
    } catch { setMenus({ status: "error", data: [] }); }
  }, []);
  const openEatOut = () => {
    setEatOut(true); setEntry(null);
    if (menus.status !== "done") { setMenus({ status: "loading", data: [] }); loadMenus(); }
  };
  const putEntry = (e: FoodEntry) => onSelect({
    type: "eating_out", name: e.name, calories: e.calories,
    protein_g: e.protein_g, carbs_g: e.carbs_g, fat_g: e.fat_g, sodium_mg: e.sodium_mg,
  });
  const dishRow = (f: FoodBase) => (
    <ListRow key={`${f.source}-${f.id}`} onClick={() => setEntry(f)}
      title={f.name}
      meta={<>{f.serving_desc} · <Kcal value={f.calories || 0} className="text-caption" /></>}
      trailing={<span className="text-label font-bold text-brand-ink">고르기</span>} />
  );
  const groupLabel = (t: string) => <p className="px-3 pt-2 pb-1 text-caption font-bold text-ink-2">{t}</p>;

  // 내 식단 → 끼니 목록 (음식이 든 칸만)
  const planGroups = plans.data.map(plan => {
    const multiDay = (plan.filled_days?.length || 0) > 1;
    const rows: { day: string; meal: string; cell: NonNullable<CellData> }[] = [];
    for (const d of DAYS) for (const m of MEALS) {
      const cell = plan.grid?.[d.key]?.[m.key];
      if (cell && (cell.product_id || cell.name)) rows.push({ day: d.key, meal: m.key, cell });
    }
    return { plan, multiDay, rows };
  }).filter(g => g.rows.length > 0);

  const tabs: { value: PickTab; label: string; count?: number }[] = [
    { value: "favorites", label: "즐겨찾기", count: favorites.status === "done" ? favorites.data.length : undefined },
    { value: "recent", label: "최근 본" },
    { value: "plans", label: "내 식단", count: plans.status === "done" ? planGroups.length : undefined },
  ];

  const failed = (what: string, retry: () => void) => (
    <EmptyState className="mx-2" title={`${what}을 불러오지 못했어요`} description="연결이 잠깐 끊겼을 수 있어요"
      action={<Button size="sm" variant="secondary" icon="refresh" onClick={retry}>다시 불러오기</Button>} />
  );
  const loadingList = <SkeletonList rows={4} className="px-2 pt-2" />;

  let body: ReactNode;
  if (entry) {
    const f = entry === "manual" ? undefined : entry;
    body = (
      <div className="px-2">
        <FoodEntryForm key={f ? `${f.source}-${f.id}` : "manual"} food={f} onSubmit={putEntry} submitLabel="이 칸에 넣기"
          note={!f ? "가게 메뉴판에 칼로리가 있으면 그 값을 넣어 주세요"
            : f.source === "mfds" ? "식약처 식품영양성분DB의 1인분 기준이에요. 가게·양에 따라 달라요"
            : "보통 1인분 기준이에요. 가게·양에 따라 달라요"} />
      </div>
    );
  } else if (eatOut) {
    const ORDER = ["한식", "분식", "중식", "일식", "양식", "패스트푸드", "카페", "편의점", "야식", "길거리", "간식"];
    const cats = [...new Set(menus.data.map(m => m.category))].sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
    body = menus.status === "error" ? failed("외식 메뉴", () => { setMenus({ status: "loading", data: [] }); loadMenus(); })
      : menus.status !== "done" ? loadingList
      : (
        <>
          <ChipRow className="px-2 pb-2">
            {cats.map(c => <Chip key={c} size="sm" selected={menuCat === c} onClick={() => setMenuCat(c)}>{c}</Chip>)}
          </ChipRow>
          {menus.data.filter(m => m.category === menuCat).map(dishRow)}
          <div className="px-2 pt-3">
            <Button variant="secondary" block icon="edit" onClick={() => setEntry("manual")}>목록에 없으면 직접 입력하기</Button>
          </div>
        </>
      );
  } else if (inSearch) {
    body = searching ? loadingList
      : results.length + dishResults.length > 0 ? (
        <>
          {dishResults.length > 0 && <>{groupLabel("일반 메뉴 · 외식")}{dishResults.map(dishRow)}</>}
          {results.length > 0 && <>{groupLabel("제품")}{results.map(p => <ProductRow key={p.id} p={p} onSelect={onSelect} />)}</>}
        </>
      )
      : <EmptyState className="mx-2" title={`"${searched}" 검색 결과가 없어요`} description="이름과 칼로리를 직접 넣을 수 있어요"
          action={<Button size="sm" variant="secondary" icon="edit" onClick={() => setEntry("manual")}>직접 입력하기</Button>} />;
  } else if (tab === "favorites") {
    body = favorites.status === "error" ? failed("즐겨찾기", () => retry("favorites"))
      : favorites.status !== "done" ? loadingList
      : favorites.data.length > 0 ? favorites.data.map(p => <ProductRow key={p.id} p={p} onSelect={onSelect} />)
      : <EmptyState className="mx-2" title="즐겨찾기한 제품이 없어요" description="제품 상세에서 하트를 누르면 여기 모여요" />;
  } else if (tab === "recent") {
    body = recent.status === "error" ? failed("최근 본 제품", () => retry("recent"))
      : recent.status !== "done" ? loadingList
      : recent.data.length > 0 ? recent.data.map(p => <ProductRow key={p.id} p={p} onSelect={onSelect} />)
      : <EmptyState className="mx-2" title="최근 30일에 본 제품이 없어요" description="위에서 이름으로 찾아보세요" />;
  } else {
    body = plans.status === "error" ? failed("내 식단", () => retry("plans"))
      : plans.status !== "done" ? loadingList
      : planGroups.length > 0 ? (
        <div className="flex flex-col gap-4">
          {planGroups.map(g => (
            <section key={g.plan.id} aria-label={g.plan.title}>
              <p className="px-3 pb-1 text-caption font-bold text-ink-2">{g.plan.title}</p>
              {g.rows.map(r => (
                <PlanMealRow key={`${r.day}-${r.meal}`} day={r.day} meal={r.meal} cell={r.cell} multiDay={g.multiDay} onSelect={onSelect} />
              ))}
            </section>
          ))}
        </div>
      )
      : <EmptyState className="mx-2" title="저장한 식단이 없어요" description="커뮤니티에서 따라하기 하거나 이 화면에서 저장하면 여기 나와요" />;
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={entry ? "메뉴 넣기" : eatOut ? "외식 메뉴" : title}
      footer={entry || eatOut ? undefined : (
        <div className="flex gap-2">
          <Button variant="secondary" block onClick={openEatOut}>외식 메뉴 고르기</Button>
          {onEatingOut && <Button variant="ghost" onClick={onEatingOut}>외식으로만 표시</Button>}
        </div>
      )}
    >
      {(entry || eatOut) ? (
        <div className="-mt-2 mb-2 -ml-3">
          <Button size="sm" variant="ghost" onClick={() => (entry && eatOut ? setEntry(null) : entry ? setEntry(null) : setEatOut(false))}>
            {entry && eatOut ? "외식 메뉴로" : "목록으로"}
          </Button>
        </div>
      ) : null}
      {!entry && <SearchField value={query} onChange={setQuery} onSubmit={() => search()} placeholder="메뉴·제품 검색 (예: 핫도그)" />}
      {!entry && !eatOut && !inSearch && quickQueries && quickQueries.length > 0 && (
        <ChipRow className="mt-2">
          {quickQueries.map((q) => <Chip key={q} size="sm" onClick={() => search(q)}>{q}</Chip>)}
        </ChipRow>
      )}
      {entry || eatOut ? null : inSearch ? (
        <div className="flex items-center justify-between mt-4 mb-1">
          <p className="text-label font-bold text-ink">검색 결과 {!searching && <span className="num text-ink-2">{results.length}</span>}</p>
          <Button size="sm" variant="ghost" onClick={() => { setQuery(""); setSearched(""); }}>목록으로</Button>
        </div>
      ) : (
        <Tabs variant="line" className="mt-3" value={tab} onChange={setTab} items={tabs} label="고르는 곳" />
      )}
      <div className={cn("-mx-2", !entry && "mt-2")}>{body}</div>
    </Sheet>
  );
}

/** 식단 칸의 제품 이름 — 누르면 제품 상세 (편집 중인 식단은 임시 저장돼 돌아와도 그대로) */
function FoodLink({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Link href={`/products/${id}`}
      className="underline decoration-line-strong underline-offset-4 hover:decoration-ink transition-colors">
      {children}
    </Link>
  );
}

const DRAFT_KEY = "carefood_weekly_draft";

/* ───── 끌어서 놓기 조각 ───── */
const dayLabel = (k: string) => DAYS.find(d => d.key === k)?.label || "";
const mealLabel = (k: string) => MEALS.find(m => m.key === k)?.label || "";

function hasFood(c: CellData | undefined) {
  return !!c && (!!c.product_id || !!c.name || c.type === "eating_out");
}

/** 요일 탭 — 끼니나 저장 식단을 놓을 수 있는 자리 */
function DayTab({ dayKey, label, cal, active, onClick }: { dayKey: string; label: string; cal: number; active: boolean; onClick: () => void }) {
  const { setNodeRef, isOver, isDragging } = useDropTarget(`day:${dayKey}`, { kind: "day", day: dayKey, label: `${label}요일` });
  return (
    <button
      ref={setNodeRef}
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 h-14 rounded-md border transition-colors",
        isOver ? "bg-brand-soft border-brand text-brand-ink"
          : active ? "bg-brand-soft border-brand text-brand-ink"
          : isDragging ? "border-dashed border-line-strong text-ink-2"
          : "border-transparent text-ink-2 hover:bg-sunken",
      )}
    >
      <span className="text-label font-bold">{label}</span>
      <span className="num text-caption">{cal > 0 ? cal.toLocaleString() : "–"}</span>
    </button>
  );
}

/** 끼니 칸 — 놓을 자리이면서, 음식이 있으면 끌 수 있다 */
function SlotDnd({ day, meal, label, filled, children }: {
  day: string; meal: string; label: string; filled: boolean;
  children: (p: { dropping: boolean; handle?: ReactNode }) => ReactNode;
}) {
  const { setNodeRef: dropRef, isOver } = useDropTarget(`slot:${day}:${meal}`, { kind: "slot", day, meal, label: `${dayLabel(day)}요일 ${mealLabel(meal)}` });
  const { setNodeRef: dragRef, isDragging, itemClass, handle } = useDragItem(`cell:${day}:${meal}`, { kind: "cell", day, meal, label }, !filled);
  return (
    <div ref={dropRef}>
      <div ref={dragRef} className={itemClass}>
        {children({
          dropping: isOver && !isDragging,
          handle: filled ? <DragHandle {...handle} label={`${label} 옮기기`} /> : undefined,
        })}
      </div>
    </div>
  );
}

/** 저장 식단 카드 손잡이 — 하루 이하 식단만 요일로 끌 수 있다 */
function PlanDrag({ plan, children }: { plan: SavedPlan; children: (p: { handle?: ReactNode; itemClass: string }) => ReactNode }) {
  const single = (plan.filled_days?.length || 0) <= 1;
  const { setNodeRef, itemClass, handle } = useDragItem(`plan:${plan.id}`, { kind: "plan", plan, label: plan.title }, !single);
  return (
    <div ref={setNodeRef}>
      {children({ handle: single ? <DragHandle {...handle} label={`${plan.title} 요일로 끌기`} /> : undefined, itemClass })}
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
  // add: 이미 든 음식 옆에 더한다 (국물 요리에 밥 등) — 밥은 사용자가 고른다, 자동으로 넣지 않는다
  const [searchModal, setSearchModal] = useState<{ day: string; meal: string; mode?: "add"; broth?: boolean } | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  // 누구 기준으로 AI 가 채울지 — 로그인하고 가족을 등록한 경우만 고를 수 있다
  const [familyList, setFamilyList] = useState<FamilyMember[]>([]);
  const [forWhom, setForWhom] = useState("me");
  useEffect(() => {
    fetch("/api/family").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.profiles) setFamilyList(d.profiles); })
      .catch(() => {}); // ds-allow: 가족 목록이 없으면 '나' 기준만
  }, []);
  const [saving, setSaving] = useState(false);
  const [precomputed, setPrecomputed] = useState<{ grid: GridData; title: string } | null>(null);
  const [preloading, setPreloading] = useState(false);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SavedPlan | null>(null);
  const [placeTarget, setPlaceTarget] = useState<SavedPlan | null>(null);
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

  // 편집 중인 식단 임시 저장 — 제품 상세에 다녀와도 그대로 (저장하기 전 내용)
  const restored = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d?.grid) {
          setGrid(d.grid); setPlanTitle(d.planTitle || "새 식단"); setPlanId(d.planId || null);
          if (d.activeDay) setActiveDay(d.activeDay);
        }
      }
    } catch { /* */ } // ds-allow: 임시 저장본이 깨졌으면 새로 시작
    restored.current = true;
  }, []);
  useEffect(() => {
    if (!restored.current) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ grid, planTitle, planId, activeDay })); } catch { /* */ } // ds-allow: 저장 공간이 없으면 임시 저장만 건너뜀
  }, [grid, planTitle, planId, activeDay]);

  const fetchAndBuildGrid = async (who?: FamilyMember): Promise<{ grid: GridData; title: string } | null> => {
    // 가족 기준이면 가족 프로필로, 아니면 내 온보딩 프로필로
    let profile: Record<string, unknown> & { concerns?: string[]; goals?: string[]; conditions?: string[] };
    let healthConditions: string[] = [];
    if (who) {
      profile = {
        concerns: who.concerns || [], goals: [], conditions: who.conditions || [], allergies: who.allergies || [],
        sensitivity: { digestive: who.sensitivity_digestive ?? 2, additive: who.sensitivity_additive ?? 2 },
        tastes: { salty: who.taste_salty ?? 5, sweet: who.taste_sweet ?? 5, spicy: who.taste_spicy ?? 5, fatty: who.taste_fatty ?? 5 },
        meals_per_day: 3,
      };
    } else {
      const profileRaw = localStorage.getItem("carefood_profile");
      if (!profileRaw) return null;
      profile = JSON.parse(profileRaw);
      try { const h = localStorage.getItem("carefood_health"); if (h) healthConditions = JSON.parse(h).conditions || []; } catch { /* */ } // ds-allow: 로컬 검진 정보 읽기
    }

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
          product_id: m.product_id, name: m.name, calories: m.calories != null ? Math.round(m.calories) : undefined, // 영양 정보가 없는 식단 서비스 제품은 비워 둔다
          protein_g: m.protein_g, carbs_g: m.carbs_g, fat_g: m.fat_g, sodium_mg: m.sodium_mg, price: m.best_price, // 묶음이면 개당 (api/weekly-box)
          ...packOf(m.prices?.[0]),
          platform: m.health_source || m.prices?.[0]?.platform, url: m.prices?.[0]?.url, type: "product",
        };
      }
      const supplements = dayData.supplements || [];
      if (supplements.length > 0) {
        const s = supplements[0];
        newGrid[dayKey].supplement = {
          product_id: s.product_id, name: s.name, calories: s.calories != null ? Math.round(s.calories) : undefined,
          protein_g: s.protein_g, carbs_g: s.carbs_g, fat_g: s.fat_g, sodium_mg: s.sodium_mg, price: s.best_price,
          ...packOf(s.prices?.[0]),
          platform: s.prices?.[0]?.platform, url: s.prices?.[0]?.url, type: "product",
        };
      }
    }
    const goalLabels = ((profile.goals?.length ? profile.goals : profile.concerns) || []).map((c: string) => CONCERN_LABELS[c] || c);
    const base = (goalLabels.length > 0 ? goalLabels.join(" · ") : "맞춤") + " 식단";
    return { grid: newGrid, title: who ? `${who.nickname} · ${base}` : base };
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
    const who = familyList.find((f) => f.id === forWhom);
    if (who) {
      setGenerating(true);
      try {
        const result = await fetchAndBuildGrid(who);
        if (!result) { toast.show("식단을 만들지 못했어요. 가족 프로필을 확인해 주세요", { tone: "danger" }); return; }
        setGrid(result.grid); setPlanTitle(result.title); setPlanId(null);
        toast.show(`${who.nickname} 기준으로 7일을 채웠어요`);
      } catch { toast.show("식단을 만들지 못했어요. 다시 시도해 주세요", { tone: "danger" }); }
      finally { setGenerating(false); }
      return;
    }
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

  // 온보딩을 마치고 바로 온 경우(?fill=1): 비어 있으면 한 번 AI 로 채운다 — 첫 방문에 '내 기준 7일'을 바로 보이게
  const autoFilled = useRef(false);
  useEffect(() => {
    if (loading || autoFilled.current) return;
    if (!new URLSearchParams(window.location.search).has("fill")) return;
    autoFilled.current = true;
    window.history.replaceState(null, "", "/weekly-box");
    const empty = Object.values(grid).every((slots) => Object.values(slots).every((c) => !c));
    if (empty) generatePlan();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 첫 로딩이 끝났을 때 한 번만
  }, [loading]);

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
      // 리스트는 편집기 아래에 있으므로 불러온 뒤 편집기로 올라간다
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      toast.show(`"${data.plan.title}" 을 불러왔어요`);
    } catch {
      toast.show("식단을 불러오지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
  };

  const updateCell = (day: string, meal: string, cell: CellData) => {
    setGrid(prev => ({ ...prev, [day]: { ...prev[day], [meal]: cell } }));
  };
  const addFood = (day: string, meal: string, food: CellData) => {
    if (!food) return;
    setGrid(prev => ({ ...prev, [day]: { ...prev[day], [meal]: cellOf([...cellFoods(prev[day]?.[meal]), ...cellFoods(food)]) } }));
  };
  const removeFood = (day: string, meal: string, index: number) => {
    setGrid(prev => ({ ...prev, [day]: { ...prev[day], [meal]: cellOf(cellFoods(prev[day]?.[meal]).filter((_, i) => i !== index)) } }));
  };

  const showDay = (day: string) => {
    setActiveDay(day);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  /* ── 한 끼·하루 식단을 고른 요일(·끼니)에 넣기 — 다른 요일은 그대로 둔다 ── */
  const placePlan = async (plan: SavedPlan, day: string, meal?: string) => {
    const userId = getUserId(); if (!userId) return;
    try {
      const res = await fetch(`/api/meal-plans/load?id=${plan.id}&user_id=${userId}`);
      const data = await res.json();
      if (!res.ok || !data.plan) throw new Error(String(res.status));
      const src: GridData = data.plan.grid || {};
      const srcDay = DAYS.map(d => d.key).find(k => MEALS.some(m => hasFood(src[k]?.[m.key])));
      if (!srcDay) { toast.show("이 식단에는 넣을 음식이 없어요", { tone: "danger" }); return; }
      const cells = MEALS.filter(m => hasFood(src[srcDay][m.key])).map(m => [m.key, src[srcDay][m.key]] as const);
      const oneMeal = !!meal && cells.length === 1;
      setGrid(prev => {
        const next = { ...prev, [day]: { ...prev[day] } };
        if (oneMeal) next[day][meal] = { ...cells[0][1] };
        else for (const [k, c] of cells) next[day][k] = c ? { ...c } : null;
        return next;
      });
      showDay(day);
      toast.show(`"${plan.title}" 을 ${dayLabel(day)}요일${oneMeal ? ` ${mealLabel(meal)}` : ""}에 넣었어요`);
    } catch {
      toast.show("식단을 넣지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
  };

  /* ── 끼니 옮기기 — 놓은 자리에 음식이 있으면 서로 바꾼다 ── */
  const moveCell = (from: { day: string; meal: string }, to: { day: string; meal: string }) => {
    if (from.day === to.day && from.meal === to.meal) return;
    const a = grid[from.day]?.[from.meal] ?? null;
    const b = grid[to.day]?.[to.meal] ?? null;
    if (!hasFood(a)) return;
    setGrid(prev => {
      const next = { ...prev, [from.day]: { ...prev[from.day] } };
      next[to.day] = { ...next[to.day] };
      next[to.day][to.meal] = a;
      next[from.day][from.meal] = hasFood(b) ? b : null;
      return next;
    });
    const where = `${to.day === from.day ? "" : `${dayLabel(to.day)}요일 `}${mealLabel(to.meal)}`;
    toast.show(hasFood(b) ? `${where}과 자리를 바꿨어요` : `${where}으로 옮겼어요`);
  };

  const onDrop = (drag: DragData, drop: DragData) => {
    const day = drop.day as string;
    if (drag.kind === "cell") {
      const from = { day: drag.day as string, meal: drag.meal as string };
      if (drop.kind === "slot") moveCell(from, { day, meal: drop.meal as string });
      else if (drop.kind === "day") moveCell(from, { day, meal: from.meal });
    } else if (drag.kind === "plan") {
      const plan = drag.plan as SavedPlan;
      if (drop.kind === "slot") placePlan(plan, day, drop.meal as string);
      else if (drop.kind === "day") placePlan(plan, day);
    }
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
  // 장보기 목록: 제품 → 이번 주에 들어간 횟수 (외식 제외)
  const shopCounts: Record<string, number> = {};
  for (const slots of Object.values(grid)) for (const cell of Object.values(slots)) {
    if (!cell || cell.type === "eating_out") continue;
    for (const f of cellFoods(cell)) {
      if (f.product_id && f.type !== "eating_out") shopCounts[f.product_id] = (shopCounts[f.product_id] || 0) + 1;
    }
  }

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
        if (cell.type === "eating_out") {
          // 외식은 주문할 제품은 아니지만 칼로리·영양은 하루 합계에 넣는다
          eatingOut++;
          totalCal += cell.calories || 0; totalProtein += cell.protein_g || 0; totalCarbs += cell.carbs_g || 0;
          totalFat += cell.fat_g || 0; totalSodium += cell.sodium_mg || 0; dayCal += cell.calories || 0;
          continue;
        }
        if (cell.product_id || cell.name) {
          products++;
          totalPrice += cell.price || 0;
          totalCal += cell.calories || 0;
          totalProtein += cell.protein_g || 0;
          totalCarbs += cell.carbs_g || 0;
          totalFat += cell.fat_g || 0;
          totalSodium += cell.sodium_mg || 0;
          dayCal += cell.calories || 0;
          // 판매처별 — 한 칸에 여럿이면 음식마다 (더한 밥이 대표 음식의 판매처로 잡히지 않게)
          for (const f of cellFoods(cell)) {
            if (f.type === "eating_out") continue;
            const svc = f.platform || "기타";
            if (!serviceMap[svc]) serviceMap[svc] = { count: 0, cost: 0 };
            serviceMap[svc].count++;
            serviceMap[svc].cost += f.price || 0;
          }
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
    <DragArea
      onDrop={onDrop}
      describe={(d) => String(d?.label || "항목")}
      renderOverlay={(d) => <DragGhost>{String(d.label || "")}</DragGhost>}
    >

      {/* ══════════ 7일 식단 편집기 ══════════ */}
      {/* ── 요일 고르기 — 스크롤해도 머리 아래 붙어 있어 아래 리스트에서 끌어 올 수 있다 ── */}
      <div role="tablist" aria-label="요일" className="sticky top-14 z-10 bg-canvas grid grid-cols-7 gap-1 py-2 mb-2">
        {DAYS.map(d => (
          <DayTab key={d.key} dayKey={d.key} label={d.label} cal={stats.perDay[d.key] || 0}
            active={d.key === activeDay} onClick={() => setActiveDay(d.key)} />
        ))}
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <span className="text-body font-bold text-ink">{activeDayLabel}요일 식단</span>
          <span className="text-caption text-ink-2">
            <span className="num">{filledMeals}</span>/<span className="num">{MEALS.length}</span>끼
            {activeDayCal > 0 && <> · <Kcal value={activeDayCal} className="text-caption" /></>}
          </span>
        </div>

        {/* ── 끼니 — 손잡이를 끌어 다른 끼니·요일로 옮긴다 ── */}
        <div className="flex flex-col gap-2">
          {MEALS.map(meal => {
            const cell = activeDayMeals[meal.key];
            const isEatingOut = cell?.type === "eating_out";
            const isEmpty = !isEatingOut && (!cell || (!cell.product_id && !cell.name));
            const foods = cell?._foods as Food[] | undefined;
            const all = cellFoods(cell);
            // 국물 요리만 있고 밥이 없으면 — 열량에 밥이 빠졌다고 알리고 "밥 더하기"로 (자동으로 넣지 않는다)
            const broth = !isEatingOut && all.some(f => isBrothDish(f.name)) && !all.some(f => /밥|햇반/.test(f.name || "") && !isBrothDish(f.name));
            const name = isEatingOut ? (cell?.name || "외식") : foods && foods.length > 1 ? `${foods[0].name} 외 ${foods.length - 1}개` : cell?.name || "";

            return (
              <SlotDnd key={meal.key} day={activeDay} meal={meal.key} label={`${meal.label} ${name}`} filled={!isEmpty}>
                {({ dropping, handle }) => isEmpty ? (
                  <MealSlot meal={meal.key} empty dropping={dropping}
                    onAdd={() => setSearchModal({ day: activeDay, meal: meal.key })} />
                ) : isEatingOut ? (
                  <MealSlot meal={meal.key} dropping={dropping} handle={handle}
                    right={cell?.calories ? <Kcal value={cell.calories} className="text-label" /> : undefined}>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-body font-medium text-ink">{cell?.name || "외식"}</p>
                      <Badge tone="neutral">외식</Badge>
                    </div>
                    {!cell?.calories && <p className="text-caption text-ink-2 mt-0.5">칼로리를 넣으면 하루 합계에 들어가요</p>}
                    <MacroInline className="mt-1.5" values={{ protein: cell?.protein_g, carbs: cell?.carbs_g, fat: cell?.fat_g, sodium: cell?.sodium_mg }} />
                    <div className="flex gap-1 mt-2 -ml-3">
                      <Button size="sm" variant="ghost" icon="refresh" onClick={() => setSearchModal({ day: activeDay, meal: meal.key })}>
                        {cell?.calories ? "바꾸기" : "메뉴·칼로리 넣기"}
                      </Button>
                      <Button size="sm" variant="ghost" icon="trash" onClick={() => updateCell(activeDay, meal.key, null)}>빼기</Button>
                    </div>
                  </MealSlot>
                ) : (
                  <MealSlot meal={meal.key} dropping={dropping} handle={handle}
                    right={cell?.calories != null ? <Kcal value={cell.calories} className="text-label" /> : <span className="text-caption text-ink-2">열량 정보 없음</span>}>
                    {foods && foods.length > 1 ? (
                      <ul className="flex flex-col">
                        {foods.map((f, i) => (
                          <li key={i} className="flex items-center justify-between gap-2 text-body text-ink">
                            <span className="min-w-0">
                              {f.product_id ? <FoodLink id={f.product_id}>{f.name}</FoodLink> : f.name}
                              {f.calories != null && <span className="text-caption text-ink-2"> · <Kcal value={Math.round(f.calories)} className="text-caption" /></span>}
                            </span>
                            <IconButton icon="close" size="sm" label={`${f.name} 빼기`} onClick={() => removeFood(activeDay, meal.key, i)} />
                          </li>
                        ))}
                      </ul>
                    ) : cell?.product_id ? (
                      <p className="text-body font-medium text-ink"><FoodLink id={cell.product_id}>{cell?.name}</FoodLink></p>
                    ) : (
                      <p className="text-body font-medium text-ink">{cell?.name}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {cell?.platform && SERVICE_NAMES[cell.platform] && <Badge tone="brand">{SERVICE_NAMES[cell.platform]}</Badge>}
                      {cell?.price ? <Price value={cell.price} className="text-caption" /> : null}
                      {all.length === 1 && cell?.pack_count && cell.pack_price ? (
                        <span className="text-caption text-ink-2"><span className="num">{cell.pack_count}</span>개 묶음 <span className="num">{cell.pack_price.toLocaleString("ko-KR")}</span>원 중 1개</span>
                      ) : null}
                    </div>
                    <MacroInline className="mt-1.5" values={{ protein: cell?.protein_g, carbs: cell?.carbs_g, fat: cell?.fat_g, sodium: cell?.sodium_mg }} />
                    {broth && <p className="text-caption text-ink-2 mt-1">밥은 들어 있지 않아요. 드신다면 밥을 더해야 열량이 맞아요</p>}
                    <div className="flex flex-wrap gap-1 mt-2 -ml-3">
                      <Button size="sm" variant="ghost" icon="refresh" onClick={() => setSearchModal({ day: activeDay, meal: meal.key })}>바꾸기</Button>
                      <Button size="sm" variant="ghost" icon="plus" onClick={() => setSearchModal({ day: activeDay, meal: meal.key, mode: "add", broth })}>
                        {broth ? "밥 더하기" : "더하기"}
                      </Button>
                      <Button size="sm" variant="ghost" icon="trash" onClick={() => updateCell(activeDay, meal.key, null)}>{all.length > 1 ? "모두 빼기" : "빼기"}</Button>
                    </div>
                  </MealSlot>
                )}
              </SlotDnd>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 mt-6">
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
          {familyList.length > 0 && (
            <Field label="누구 기준으로 채울까요">
              <Select value={forWhom} onChange={(e) => setForWhom(e.target.value)}>
                <option value="me">나</option>
                {familyList.map((f) => <option key={f.id} value={f.id}>{f.nickname}{f.relationship ? ` (${f.relationship})` : ""}</option>)}
              </Select>
            </Field>
          )}
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
          <Card className="mt-6">
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

        {/* ── 서비스 구성 ── */}
        {stats.products > 0 && stats.serviceMix.length > 0 && (
          <Card className="mt-3">
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

      {/* ══════════ 내 식단 리스트 ══════════ */}
      <section className="mt-8 border-t border-line pt-6">
        <SectionHeader
          title="내 식단 리스트"
          description="한 끼·하루 식단은 원하는 요일에 넣고, 일주일 식단은 통째로 불러와요"
          action={savedPlans.length > 0 ? <TextLink href="/community">커뮤니티에서 따라하기</TextLink> : undefined}
        />

        {savedPlans.length > 0 ? (
          <div className="flex flex-col gap-2">
            {savedPlans.map(p => {
              const isActive = planId === p.id;
              const isEditing = editingTitle === p.id;
              // 한 끼·하루짜리(따라하기 등)는 원하는 요일에 넣고, 여러 날 식단은 통째로 불러온다
              const single = (p.filled_days?.length || 0) <= 1;
              const open = () => (single ? setPlaceTarget(p) : loadPlan(p.id));
              return (
                <PlanDrag key={p.id} plan={p}>
                  {({ handle, itemClass }) => (
                <Card padding="md" className={cn(itemClass, isActive && "border-brand")}>
                  <div className="flex items-start gap-1">
                  {handle && !isEditing && <div className="pt-1">{handle}</div>}
                  <div
                    role={isEditing ? undefined : "button"}
                    tabIndex={isEditing ? undefined : 0}
                    onClick={() => !isEditing && open()}
                    onKeyDown={(e) => { if (!isEditing && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } }}
                    className={cn("flex-1 min-w-0", !isEditing && "cursor-pointer")}
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
                          {p.source === "community_copy" ? "따라하기" : single ? "하루" : `${p.filled_days?.length || 0}일`}
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
                  </div>
                  <CardActions>
                    <Button size="sm" variant="ghost" icon="edit"
                      onClick={() => { setEditingTitle(p.id); setEditTitleValue(p.title); }}>이름 바꾸기</Button>
                    {single
                      ? <Button size="sm" variant="ghost" icon="calendar" onClick={() => setPlaceTarget(p)}>요일에 넣기</Button>
                      : <Button size="sm" variant="ghost" icon="refresh" onClick={() => loadPlan(p.id)}>불러오기</Button>}
                    {p.source !== "community_copy" && (
                      <LinkButton size="sm" variant="ghost" icon="share" href={`/community?compose=plan&plan=${p.id}`}>나누기</LinkButton>
                    )}
                    <Button size="sm" variant="ghost" icon="trash" className="ml-auto" onClick={() => setDeleteTarget(p)}>삭제하기</Button>
                  </CardActions>
                </Card>
                  )}
                </PlanDrag>
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
            description="위에서 AI 추천으로 채우거나, 커뮤니티에서 따라하기 해 보세요"
            action={<LinkButton href="/community" size="sm" variant="secondary">커뮤니티 보기</LinkButton>}
          />
        )}
      </section>

    </DragArea>

      {/* ── 하단: 장보기 목록 (통합 주문은 ORDERING_ENABLED 를 켜야 열린다) ── */}
      {stats.products > 0 && (
        <BottomBar>
          <div className="flex-1 min-w-0">
            <div className="text-caption text-ink-2">
              <span className="num">{stats.products}</span>끼 · 묶음은 개당 값으로
            </div>
            <Price value={stats.totalPrice} className="text-body" />
          </div>
          {ORDERING_ENABLED && (
            <Button variant="secondary" onClick={() => {
              const orderItems: { day: string; slot: string; product_name: string; product_id?: string }[] = [];
              for (const [day, slots] of Object.entries(grid)) {
                for (const [slot, cell] of Object.entries(slots)) {
                  if (cell && cell.name && cell.type !== "eating_out") orderItems.push({ day, slot, product_name: cell.name, product_id: cell.product_id || undefined });
                }
              }
              if (orderItems.length > 0) { localStorage.setItem("carefood_order_items", JSON.stringify(orderItems)); window.location.href = "/order"; }
            }}>
              주문하기
            </Button>
          )}
          <Button onClick={() => setShopOpen(true)}>장보기 목록 보기</Button>
        </BottomBar>
      )}
      <ShoppingList open={shopOpen} onClose={() => setShopOpen(false)} counts={shopCounts} />

      {/* ── 음식 고르기 ── */}
      <ProductSearchSheet
        open={!!searchModal}
        onSelect={(product) => {
          if (searchModal) {
            if (searchModal.mode === "add") {
              addFood(searchModal.day, searchModal.meal, product);
              toast.show(`${product?.name || "음식"}, ${MEALS.find(m => m.key === searchModal.meal)?.label}에 더했어요`);
            } else updateCell(searchModal.day, searchModal.meal, product);
          }
          setSearchModal(null);
        }}
        onClose={() => setSearchModal(null)}
        onEatingOut={searchModal?.mode === "add" ? undefined : () => { if (searchModal) updateCell(searchModal.day, searchModal.meal, { type: "eating_out" }); setSearchModal(null); }}
        title={searchModal?.mode === "add" ? (searchModal.broth ? "밥 더하기" : "함께 먹을 음식 더하기") : undefined}
        quickQueries={searchModal?.broth ? ["쌀밥", "잡곡밥", "곤약밥"] : undefined}
      />

      {/* ── 요일에 넣기 ── */}
      <Sheet
        open={!!placeTarget}
        onClose={() => setPlaceTarget(null)}
        title="어느 요일에 넣을까요?"
        description={placeTarget ? `"${placeTarget.title}" 을 고른 요일의 같은 끼니에 넣어요. 그 끼니에 있던 음식은 바뀌어요` : undefined}
      >
        <div className="grid grid-cols-7 gap-1">
          {DAYS.map(d => {
            const cal = stats.perDay[d.key] || 0;
            return (
              <button key={d.key} type="button"
                onClick={() => { const t = placeTarget; setPlaceTarget(null); if (t) placePlan(t, d.key); }}
                className="press flex flex-col items-center justify-center gap-0.5 h-16 rounded-md border border-line hover:border-brand hover:bg-brand-soft transition-colors">
                <span className="text-label font-bold text-ink">{d.label}</span>
                <span className="num text-caption text-ink-2">{cal > 0 ? cal.toLocaleString() : "–"}</span>
              </button>
            );
          })}
        </div>
        <p className="text-caption text-ink-2 mt-3">카드의 손잡이를 위쪽 요일로 끌어 놓아도 돼요</p>
      </Sheet>

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
