"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";

/* ───── 타입 ───── */
type NutrientGrade = {
  nutrient: string;
  label: string;
  unit: string;
  avg: number;
  target: number;
  ratio: number;
  grade: "excellent" | "good" | "low" | "critical" | "over";
  emoji: string;
};

type DailyData = {
  date: string;
  calories: number;
  protein_g: number;
  meal_count: number;
};

type ReportData = {
  hasData: boolean;
  message?: string;
  period?: { start: string; end: string };
  daysWithData?: number;
  totalEntries?: number;
  recordRate?: number;
  overallScore?: number;
  comment?: string;
  grades?: NutrientGrade[];
  dailyData?: DailyData[];
  topFoods?: { name: string; count: number }[];
  mealSlotCounts?: Record<string, number>;
  gapNutrients?: NutrientGrade[];
  recommendations?: { product_name: string; product_id: string; health_score: number; reason: string }[];
  groupBuys?: { id: string; title: string; product_name: string; target_price: number | null; original_price: number | null; discount_rate: number | null; target_count: number; current_count: number }[];
};

const GRADE_COLORS: Record<string, string> = {
  excellent: "text-green-400",
  good: "text-yellow-400",
  low: "text-orange-400",
  critical: "text-red-400",
  over: "text-orange-400",
};

const GRADE_LABELS: Record<string, string> = {
  excellent: "우수",
  good: "양호",
  low: "부족",
  critical: "매우 부족",
  over: "과다",
};

const SLOT_LABELS: Record<string, string> = {
  breakfast: "아침", lunch: "점심", dinner: "저녁", snack: "간식",
};

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

function getUserId(): string {
  try {
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

function ReportContent() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userId = getUserId();
    fetch(`/api/diary/report?user_id=${userId}`)
      .then(r => r.json())
      .then(setReport)
      .catch(() => setReport({ hasData: false, message: "리포트를 불러올 수 없습니다." }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="inline-block w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-3" />
        <p className="text-sm text-muted">주간 리포트 분석 중...</p>
      </div>
    );
  }

  if (!report?.hasData) {
    return (
      <div className="text-center py-16">
        <p className="text-4xl mb-3">📊</p>
        <h2 className="text-lg font-bold mb-2">아직 데이터가 없어요</h2>
        <p className="text-sm text-muted mb-6">{report?.message || "식단을 기록하면 주간 리포트를 받을 수 있어요!"}</p>
        <Link href="/diary" className="inline-block bg-primary text-white px-6 py-3 rounded-full text-sm font-bold">
          식단 기록 시작하기
        </Link>
      </div>
    );
  }

  const { overallScore = 0, comment, grades = [], dailyData = [], topFoods = [], mealSlotCounts = {}, gapNutrients = [], recommendations = [], groupBuys = [], period, daysWithData = 0, totalEntries = 0, recordRate = 0 } = report;

  // 점수 색상
  const scoreColor = overallScore >= 80 ? "text-green-400" : overallScore >= 60 ? "text-yellow-400" : overallScore >= 40 ? "text-orange-400" : "text-red-400";

  // 일별 칼로리 차트의 최대값
  const maxCal = Math.max(...dailyData.map(d => d.calories), 1);

  return (
    <>
      {/* ── 종합 점수 ── */}
      <div className="bg-surface rounded-2xl p-6 mb-4 text-center">
        <p className="text-xs text-muted mb-1">
          {period?.start?.slice(5).replace("-", "/")} ~ {period?.end?.slice(5).replace("-", "/")} 주간 영양 점수
        </p>
        <p className={`text-5xl font-extrabold ${scoreColor}`}>{overallScore}</p>
        <p className="text-xs text-muted mt-1">/ 100점</p>
        <p className="text-sm mt-3">{comment}</p>
        <div className="flex justify-center gap-4 mt-4 text-xs text-muted">
          <span>{daysWithData}일 기록</span>
          <span>{totalEntries}끼 기록</span>
          <span>기록률 {recordRate}%</span>
        </div>
      </div>

      {/* ── 일별 칼로리 차트 ── */}
      <div className="border border-border rounded-xl p-4 mb-4">
        <h2 className="text-sm font-bold mb-3">📈 일별 칼로리</h2>
        <div className="flex items-end gap-1.5 h-28">
          {dailyData.map((d, i) => {
            const pct = d.calories / maxCal * 100;
            const dayName = DAY_NAMES[new Date(d.date).getDay()];
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[9px] text-muted">{d.calories}</span>
                <div className="w-full rounded-t bg-primary/60 transition-all" style={{ height: `${Math.max(pct, 4)}%` }} />
                <span className="text-[9px] text-muted">{dayName}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 영양소별 성적표 ── */}
      <div className="border border-border rounded-xl overflow-hidden mb-4">
        <div className="bg-surface/50 px-4 py-2.5 border-b border-border">
          <h2 className="text-sm font-bold">🎯 영양소별 달성률</h2>
        </div>
        <div className="divide-y divide-border/30">
          {grades.map(g => (
            <div key={g.nutrient} className="px-4 py-3 flex items-center gap-3">
              <span className="text-base">{g.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{g.label}</span>
                  <span className={`text-xs font-bold ${GRADE_COLORS[g.grade]}`}>
                    {GRADE_LABELS[g.grade]}
                  </span>
                </div>
                <div className="h-1.5 bg-border/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      g.grade === "excellent" ? "bg-green-400" :
                      g.grade === "good" ? "bg-yellow-400" :
                      g.grade === "over" ? "bg-orange-400" :
                      g.grade === "critical" ? "bg-red-400" : "bg-orange-400"
                    }`}
                    style={{ width: `${Math.min(g.ratio * 100, 150)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted mt-0.5">
                  <span>평균 {g.avg}{g.unit}</span>
                  <span>목표 {g.target}{g.unit}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 끼니별 기록률 ── */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="border border-border rounded-xl p-4">
          <h3 className="text-sm font-bold mb-3">🍽️ 끼니별 기록</h3>
          <div className="space-y-2">
            {Object.entries(SLOT_LABELS).map(([key, label]) => (
              <div key={key} className="flex justify-between items-center text-xs">
                <span className="text-muted">{label}</span>
                <span className="font-bold">{mealSlotCounts[key] || 0}회</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── 자주 먹은 음식 ── */}
        <div className="border border-border rounded-xl p-4">
          <h3 className="text-sm font-bold mb-3">⭐ 자주 먹은 음식</h3>
          <div className="space-y-2">
            {topFoods.length > 0 ? topFoods.slice(0, 4).map((f, i) => (
              <div key={i} className="flex justify-between items-center text-xs">
                <span className="truncate flex-1 mr-2">{f.name}</span>
                <span className="font-bold text-primary shrink-0">{f.count}회</span>
              </div>
            )) : (
              <p className="text-xs text-muted">기록이 없습니다</p>
            )}
          </div>
        </div>
      </div>

      {/* ── 영양 갭 → 추천 ── */}
      {gapNutrients.length > 0 && (
        <div className="border border-primary/30 rounded-xl p-4 mb-4 bg-primary/3">
          <h2 className="text-sm font-bold mb-1">⚠️ 이번 주 부족한 영양소</h2>
          <p className="text-xs text-muted mb-3">부족한 영양소를 채울 수 있는 제품을 추천합니다</p>
          <div className="space-y-2">
            {gapNutrients.map(gap => (
              <div key={gap.nutrient} className="flex items-center gap-3 bg-surface rounded-lg px-3 py-2">
                <span className="text-lg">{gap.emoji}</span>
                <div className="flex-1">
                  <span className="text-sm font-medium">{gap.label}</span>
                  <span className="text-xs text-muted ml-2">
                    {Math.round(gap.ratio * 100)}% 달성 (평균 {gap.avg}{gap.unit} / 목표 {gap.target}{gap.unit})
                  </span>
                </div>
              </div>
            ))}
          </div>
          {recommendations.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {recommendations.map((rec, i) => (
                <Link key={i} href={`/products/${rec.product_id}`}
                  className="flex items-center justify-between bg-surface rounded-lg px-3 py-2 hover:bg-border/50 transition-colors">
                  <div>
                    <span className="text-sm">{rec.product_name}</span>
                    <span className="text-[10px] text-primary ml-2 font-medium">{rec.reason}</span>
                  </div>
                  <span className="text-xs text-muted">건강점수 {rec.health_score}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 관련 공구 ── */}
      {groupBuys.length > 0 && (
        <div className="border border-border rounded-xl p-4 mb-4">
          <h2 className="text-sm font-bold mb-3">🛒 진행 중인 공구</h2>
          <div className="space-y-2">
            {groupBuys.map(gb => (
              <Link href="/community" key={gb.id}
                className="flex items-center justify-between bg-surface rounded-lg px-3 py-2 hover:bg-border/50 transition-colors">
                <div>
                  <p className="text-sm font-medium">{gb.product_name}</p>
                  {gb.target_price && (
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-bold text-primary">{gb.target_price.toLocaleString()}원</span>
                      {gb.discount_rate && <span className="text-[10px] text-accent font-bold">{Math.round(gb.discount_rate * 100)}% OFF</span>}
                    </div>
                  )}
                </div>
                <span className="text-xs text-muted">{gb.current_count}/{gb.target_count}명</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── CTA ── */}
      <div className="flex gap-3">
        <Link href="/diary"
          className="flex-1 border border-border py-3 rounded-xl font-medium text-center text-sm hover:bg-surface transition-colors">
          식단 기록하기
        </Link>
        <Link href="/products"
          className="flex-1 bg-primary text-white py-3 rounded-xl font-bold text-center text-sm hover:bg-primary-dark transition-colors">
          맞춤 제품 보기
        </Link>
      </div>
    </>
  );
}

export default function WeeklyReportPage() {
  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-6">
      <Link href="/diary" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground mb-4">
        ← 식단 기록
      </Link>
      <h1 className="text-xl font-extrabold mb-5">📊 주간 영양 리포트</h1>
      <Suspense fallback={
        <div className="text-center py-16">
          <div className="inline-block w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      }>
        <ReportContent />
      </Suspense>
    </div>
  );
}
