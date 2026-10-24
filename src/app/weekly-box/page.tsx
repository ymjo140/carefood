"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type BoxItem = {
  product_id: string;
  name: string;
  calories: number;
  protein_g: number;
  match_score: number;
  best_price: number;
  prices: { platform: string; price: number; url: string }[];
  functional_tags: string[];
};

type BoxDay = {
  day: number;
  dayLabel: string;
  items: BoxItem[];
};

type BoxSummary = {
  totalItems: number;
  totalPrice: number;
  avgDailyNutrients: {
    calories: number;
    protein_g: number;
    fat_g: number;
    sugar_g: number;
    sodium_mg: number;
  };
  concerns: string[];
  mealsPerDay: number;
};

const CONCERN_LABELS: Record<string, string> = {
  gut_health: "장건강", skin: "피부건강", weight: "체중관리", energy: "활력충전",
};

const PLATFORM_LABELS: Record<string, string> = {
  kurly: "컬리", oasis: "오아시스", homeplus: "홈플러스",
  "11st": "11번가", danawa: "다나와",
};

const TAG_LABELS: Record<string, string> = {
  probiotics: "유산균", collagen: "콜라겐", protein: "프로틴",
  vitamin: "비타민", omega3: "오메가3", prebiotic: "식이섬유",
  diet: "다이어트", sugar_free: "무설탕", calcium: "칼슘",
  iron: "철분", zinc: "아연", lutein: "루테인",
};

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

        // 건강검진 conditions 병합
        let healthConditions: string[] = [];
        try {
          const hRaw = localStorage.getItem("carefood_health");
          if (hRaw) healthConditions = JSON.parse(hRaw).conditions || [];
        } catch { /* silent */ }

        const res = await fetch("/api/weekly-box", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            concerns: profile.concerns || [],
            conditions: [...new Set([...(profile.conditions || []), ...healthConditions])],
            allergies: profile.allergies || [],
            sensitivity: profile.sensitivity || { digestive: 2, additive: 2 },
            tastes: profile.tastes || { salty: 3, sweet: 3, spicy: 3, fatty: 3 },
            budget: 100000,
            mealsPerDay: 2,
          }),
        });

        const data = await res.json();
        if (data.box) {
          setDays(data.box.days);
          setSummary(data.box.summary);
        } else {
          setError(data.message || "박스를 생성할 수 없습니다.");
        }
      } catch (e) {
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
  const dayCalories = currentDay?.items.reduce((s, i) => s + (i.calories || 0), 0) || 0;
  const dayProtein = currentDay?.items.reduce((s, i) => s + (i.protein_g || 0), 0) || 0;
  const dayPrice = currentDay?.items.reduce((s, i) => s + i.best_price, 0) || 0;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] px-4 py-6">
      <div className="max-w-lg mx-auto">
        {/* 헤더 */}
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold mb-1">이번 주 추천 박스</h1>
          <p className="text-sm text-muted">
            {summary?.concerns.map((c) => CONCERN_LABELS[c] || c).join(" · ")} 맞춤 ·
            하루 {summary?.mealsPerDay}끼 기준
          </p>
        </div>

        {/* 요약 카드 */}
        {summary && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-card border border-border rounded-xl p-3 text-center">
              <p className="text-xs text-muted mb-1">총 금액</p>
              <p className="text-lg font-extrabold">{Math.round(summary.totalPrice / 1000)}천원</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-3 text-center">
              <p className="text-xs text-muted mb-1">1일 평균 열량</p>
              <p className="text-lg font-extrabold">{summary.avgDailyNutrients.calories}<span className="text-xs font-normal">kcal</span></p>
            </div>
            <div className="bg-card border border-border rounded-xl p-3 text-center">
              <p className="text-xs text-muted mb-1">1일 평균 단백질</p>
              <p className="text-lg font-extrabold">{summary.avgDailyNutrients.protein_g}<span className="text-xs font-normal">g</span></p>
            </div>
          </div>
        )}

        {/* 요일 탭 */}
        <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {days.map((d, i) => (
            <button
              key={d.day}
              onClick={() => setSelectedDay(i)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all shrink-0 ${
                selectedDay === i
                  ? "bg-primary text-white shadow-sm"
                  : "bg-card border border-border hover:border-primary/30"
              }`}
            >
              {d.dayLabel}
            </button>
          ))}
        </div>

        {/* 일일 요약 */}
        <div className="flex items-center gap-4 mb-4 px-1">
          <span className="text-xs text-muted">{dayCalories}kcal</span>
          <span className="text-xs text-muted">단백질 {dayProtein}g</span>
          <span className="text-xs text-muted ml-auto font-medium">{dayPrice.toLocaleString()}원</span>
        </div>

        {/* 제품 카드 */}
        <div className="space-y-3">
          {currentDay?.items.map((item, idx) => (
            <Link
              key={item.product_id}
              href={`/products/${item.product_id}`}
              className="block bg-card border border-border rounded-2xl p-4 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-start gap-3">
                {/* 끼니 번호 */}
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">{idx + 1}끼</span>
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm leading-tight line-clamp-2 mb-2">
                    {item.name}
                  </h3>

                  {/* 영양 정보 */}
                  <div className="flex items-center gap-3 text-xs text-muted mb-2">
                    <span>{item.calories}kcal</span>
                    <span>단백질 {item.protein_g}g</span>
                    <span className="ml-auto text-primary font-bold text-sm">
                      적합도 {item.match_score}
                    </span>
                  </div>

                  {/* 기능성 태그 */}
                  {item.functional_tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {item.functional_tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/5 text-primary border border-primary/10">
                          {TAG_LABELS[tag] || tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 가격 */}
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm">
                      {item.best_price.toLocaleString()}원
                    </span>
                    {item.prices[0] && (
                      <span className="text-[10px] text-muted">
                        {PLATFORM_LABELS[item.prices[0].platform] || item.prices[0].platform}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}

          {currentDay?.items.length === 0 && (
            <div className="text-center py-8 text-muted text-sm">
              이 날의 추천 제품이 없습니다
            </div>
          )}
        </div>

        {/* 하단 안내 */}
        <div className="mt-8 p-4 rounded-xl bg-surface border border-border">
          <p className="text-xs text-muted leading-relaxed">
            주간 박스는 관심사·건강 상태·맛 선호도를 종합하여 자동 구성됩니다.
            각 제품을 눌러 상세 정보와 구매 링크를 확인하세요.
          </p>
        </div>

        {/* CTA */}
        <div className="mt-4 flex gap-3">
          <Link
            href="/recommend"
            className="flex-1 border border-border py-3 rounded-full font-medium text-center hover:bg-card transition-colors"
          >
            개별 추천 보기
          </Link>
          <Link
            href="/"
            className="flex-1 border border-border py-3 rounded-full font-medium text-center hover:bg-card transition-colors"
          >
            홈으로
          </Link>
        </div>
      </div>
    </div>
  );
}
