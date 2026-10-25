"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type BoxItem = {
  product_id: string;
  name: string;
  manufacturer: string | null;
  calories: number;
  protein_g: number;
  fat_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  match_score: number;
  best_price: number;
  prices: { platform: string; price: number; url: string }[];
  functional_tags: string[];
  dish_category: string | null;
  slot_type: "meal" | "supplement";
};

type DaySummary = {
  calories: number;
  protein_g: number;
  total_price: number;
  meal_count: number;
  supplement_count: number;
};

type BoxDay = {
  day: number;
  dayLabel: string;
  meals: BoxItem[];
  supplements: BoxItem[];
  summary: DaySummary;
};

type BoxSummary = {
  totalItems: number;
  totalMeals: number;
  totalSupplements: number;
  totalPrice: number;
  avgDailyCalories: number;
  avgDailyProtein: number;
  avgDailyPrice: number;
  concerns: string[];
  mealsPerDay: number;
  supplementsPerDay: number;
  warnings: string[];
};

const CONCERN_LABELS: Record<string, string> = {
  gut_health: "장건강", skin: "피부건강", weight: "체중관리", energy: "활력충전",
};

const PLATFORM_LABELS: Record<string, string> = {
  kurly: "컬리", oasis: "오아시스", homeplus: "홈플러스", "11st": "11번가",
};
const PLATFORM_COLORS: Record<string, string> = {
  kurly: "text-purple-600", oasis: "text-green-600",
  homeplus: "text-orange-600", "11st": "text-red-500",
};

const TAG_LABELS: Record<string, string> = {
  probiotics: "유산균", collagen: "콜라겐", protein: "고단백",
  vitamin: "비타민", omega3: "오메가3", prebiotic: "식이섬유",
  diet: "다이어트", sugar_free: "무설탕", calcium: "칼슘",
  iron: "철분", zinc: "아연", lutein: "루테인",
};

function formatPrice(price: number): string {
  return price.toLocaleString("ko-KR") + "원";
}

/* ───── 아이템 카드 ───── */
function ItemCard({ item, label }: { item: BoxItem; label: string }) {
  return (
    <Link href={`/products/${item.product_id}`}
      className="block border border-border rounded-xl p-4 hover:shadow-sm transition-all">
      <div className="flex gap-3">
        {/* 라벨 */}
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
          item.slot_type === "meal"
            ? "bg-primary/10 text-primary"
            : "bg-accent/10 text-accent"
        }`} style={{ minHeight: "unset", minWidth: "unset" }}>
          {label}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm leading-tight line-clamp-2 mb-1">{item.name}</h3>
          {item.manufacturer && (
            <p className="text-xs text-muted mb-1.5 truncate">{item.manufacturer}</p>
          )}

          {/* 영양 */}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted mb-2">
            <span><span className="text-foreground/70 font-medium">{item.calories}</span>kcal</span>
            <span>단백질 <span className="text-foreground/70 font-medium">{Math.round(item.protein_g)}</span>g</span>
            {item.sodium_mg != null && <span>나트륨 {Math.round(item.sodium_mg)}mg</span>}
          </div>

          {/* 태그 */}
          {item.functional_tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {item.functional_tags.slice(0, 3).map(tag => (
                <span key={tag} className="text-[11px] px-2 py-0.5 rounded bg-primary/8 text-primary/80 font-medium"
                  style={{ minHeight: "unset", minWidth: "unset" }}>
                  {TAG_LABELS[tag] || tag}
                </span>
              ))}
            </div>
          )}

          {/* 가격 + 적합도 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">{formatPrice(item.best_price)}</span>
              {item.prices[0] && (
                <a href={item.prices[0].url} target="_blank" rel="noopener noreferrer"
                  className={`text-[11px] hover:underline ${PLATFORM_COLORS[item.prices[0].platform] || "text-muted"}`}
                  style={{ minHeight: "unset", minWidth: "unset" }}
                  onClick={e => e.stopPropagation()}>
                  {PLATFORM_LABELS[item.prices[0].platform] || item.prices[0].platform}
                </a>
              )}
            </div>
            <span className="text-xs text-primary font-bold">적합도 {item.match_score}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function WeeklyBoxPage() {
  const [days, setDays] = useState<BoxDay[]>([]);
  const [summary, setSummary] = useState<BoxSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const profileRaw = localStorage.getItem("carefood_profile");
        if (!profileRaw) {
          setError("프로필이 없습니다. 온보딩을 먼저 완료해주세요.");
          setLoading(false);
          return;
        }
        const profile = JSON.parse(profileRaw);

        let healthConditions: string[] = [];
        try {
          const hRaw = localStorage.getItem("carefood_health");
          if (hRaw) healthConditions = JSON.parse(hRaw).conditions || [];
        } catch { /* silent */ }

        // user_id 가져오기 (로그인 시)
        let userId: string | undefined;
        try {
          const { createClient } = await import("@/lib/supabase/client");
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (user) userId = user.id;
        } catch { /* anonymous */ }

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
            mealsPerDay: 2,
            supplementsPerDay: 1,
            user_id: userId,
          }),
        });

        const data = await res.json();
        if (data.box) {
          setDays(data.box.days);
          setSummary(data.box.summary);
        } else {
          setError(data.message || "박스를 생성할 수 없습니다.");
        }
      } catch {
        setError("주간 박스 생성 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center gap-3">
        <div className="inline-block w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="text-sm text-muted">이번 주 식단을 구성하고 있어요...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-muted mb-4">{error}</p>
          <Link href="/onboarding" className="inline-block bg-primary text-white px-6 py-3 rounded-full font-bold">
            온보딩 시작하기
          </Link>
        </div>
      </div>
    );
  }

  const currentDay = days[selectedDay];

  return (
    <div className="min-h-[calc(100vh-3.5rem)] px-4 sm:px-6 py-6">
      <div className="max-w-2xl mx-auto">
        {/* 헤더 */}
        <div className="mb-5">
          <h1 className="text-xl font-extrabold mb-1">이번 주 추천 박스</h1>
          <p className="text-sm text-muted">
            {summary?.concerns.map(c => CONCERN_LABELS[c] || c).join(" · ")} 맞춤 ·
            하루 식사 {summary?.mealsPerDay}끼 + 보조 {summary?.supplementsPerDay}개
          </p>
        </div>

        {/* 요약 카드 */}
        {summary && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="border border-border rounded-xl p-3 text-center">
                <p className="text-[11px] text-muted mb-0.5">총 금액</p>
                <p className="text-lg font-extrabold">{Math.round(summary.totalPrice / 1000)}<span className="text-xs font-normal">천원</span></p>
              </div>
              <div className="border border-border rounded-xl p-3 text-center">
                <p className="text-[11px] text-muted mb-0.5">1일 평균 열량</p>
                <p className="text-lg font-extrabold">{summary.avgDailyCalories}<span className="text-xs font-normal">kcal</span></p>
              </div>
              <div className="border border-border rounded-xl p-3 text-center">
                <p className="text-[11px] text-muted mb-0.5">1일 평균 단백질</p>
                <p className="text-lg font-extrabold">{summary.avgDailyProtein}<span className="text-xs font-normal">g</span></p>
              </div>
            </div>

            {/* 영양 경고 */}
            {summary.warnings.length > 0 && (
              <div className="bg-accent/5 border border-accent/20 rounded-lg px-3 py-2 mb-4">
                {summary.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-accent">{w}</p>
                ))}
              </div>
            )}

            <div className="text-xs text-muted mb-4 px-1">
              식사 {summary.totalMeals}개 + 보조 {summary.totalSupplements}개 = 총 {summary.totalItems}개 제품
            </div>
          </>
        )}

        {/* 요일 탭 */}
        <div className="flex gap-1.5 mb-5 overflow-x-auto no-scrollbar pb-1">
          {days.map((d, i) => (
            <button key={d.day} onClick={() => setSelectedDay(i)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all shrink-0 ${
                selectedDay === i
                  ? "bg-foreground text-card"
                  : "bg-surface hover:bg-border"
              }`}
              style={{ minHeight: "36px", minWidth: "unset" }}>
              {d.dayLabel}
            </button>
          ))}
        </div>

        {currentDay && (
          <>
            {/* 일일 요약 바 */}
            <div className="flex items-center gap-4 mb-3 px-1 text-xs text-muted">
              <span>{currentDay.summary.calories}kcal</span>
              <span>단백질 {currentDay.summary.protein_g}g</span>
              <span className="ml-auto font-medium text-foreground">{formatPrice(currentDay.summary.total_price)}</span>
            </div>

            {/* 식사 */}
            {currentDay.meals.length > 0 && (
              <div className="mb-4">
                <h2 className="text-[13px] font-bold text-foreground mb-2 px-1">
                  🍚 식사 ({currentDay.meals.length}끼)
                </h2>
                <div className="space-y-2.5">
                  {currentDay.meals.map((item, idx) => (
                    <ItemCard key={item.product_id} item={item} label={`${idx + 1}끼`} />
                  ))}
                </div>
              </div>
            )}

            {/* 보조 */}
            {currentDay.supplements.length > 0 && (
              <div className="mb-4">
                <h2 className="text-[13px] font-bold text-foreground mb-2 px-1">
                  💊 영양 보조
                </h2>
                <div className="space-y-2.5">
                  {currentDay.supplements.map((item, idx) => (
                    <ItemCard key={item.product_id} item={item} label={`보조${idx + 1}`} />
                  ))}
                </div>
              </div>
            )}

            {currentDay.meals.length === 0 && currentDay.supplements.length === 0 && (
              <div className="text-center py-8 text-muted text-sm">이 날의 추천 제품이 없습니다</div>
            )}
          </>
        )}

        {/* 하단 */}
        <div className="mt-8 p-4 rounded-xl bg-surface border border-border">
          <p className="text-xs text-muted leading-relaxed">
            주간 박스는 관심사·건강 상태·맛 선호도·조회 이력을 종합하여 자동 구성됩니다.
            식사는 250kcal 이상의 실제 음식, 보조는 건강기능식품·음료·간식류로 구분됩니다.
          </p>
        </div>

        <div className="mt-4 flex gap-3">
          <Link href="/recommend"
            className="flex-1 border border-border py-3 rounded-full font-medium text-center text-sm hover:bg-surface transition-colors">
            개별 추천 보기
          </Link>
          <Link href="/"
            className="flex-1 border border-border py-3 rounded-full font-medium text-center text-sm hover:bg-surface transition-colors">
            홈으로
          </Link>
        </div>
      </div>
    </div>
  );
}
