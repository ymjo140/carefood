"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type DailyStat = {
  date: string;
  count: number;
  calories: number;
  protein_g: number;
  fat_g: number;
  sugar_g: number;
  sodium_mg: number;
  fiber_g: number;
};

type MealLog = {
  id: string;
  product_id: string;
  product_name: string | null;
  eaten_at: string;
  meal_type: string;
  calories: number;
  protein_g: number;
  functional_tags: string[];
};

type Deficit = { nutrient: string; label: string; current: number; target: number; unit: string };
type Excess = { nutrient: string; label: string; current: number; limit: number; unit: string };

const MEAL_LABELS: Record<string, string> = {
  breakfast: "아침", lunch: "점심", dinner: "저녁", snack: "간식",
};

const TAG_LABELS: Record<string, string> = {
  probiotics: "유산균", collagen: "콜라겐", protein: "프로틴",
  vitamin: "비타민", omega3: "오메가3", prebiotic: "식이섬유",
  diet: "다이어트", sugar_free: "무설탕", calcium: "칼슘",
};

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export default function MealsPage() {
  const [logs, setLogs] = useState<MealLog[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [weeklyAvg, setWeeklyAvg] = useState<Record<string, number> | null>(null);
  const [deficits, setDeficits] = useState<Deficit[]>([]);
  const [excesses, setExcesses] = useState<Excess[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);

      try {
        const res = await fetch(`/api/meals?userId=${user.id}&days=7`);
        const data = await res.json();
        setLogs(data.logs || []);
        setDailyStats(data.dailyStats || []);
        setWeeklyAvg(data.weeklyAvg || null);
        setDeficits(data.deficits || []);
        setExcesses(data.excesses || []);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-muted mb-4">식사 기록은 로그인이 필요해요</p>
          <Link href="/login?returnTo=/meals" className="inline-block bg-primary text-white px-6 py-3 rounded-full font-bold">
            로그인하기
          </Link>
        </div>
      </div>
    );
  }

  // 주간 칼로리 막대 차트 데이터
  const last7Days: { label: string; calories: number; date: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const stat = dailyStats.find((s) => s.date === dateStr);
    last7Days.push({
      label: DAY_LABELS[d.getDay()],
      calories: stat?.calories || 0,
      date: dateStr,
    });
  }
  const maxCal = Math.max(...last7Days.map((d) => d.calories), 1);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] px-4 py-6">
      <div className="max-w-lg mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold">식사 기록</h1>
            <p className="text-sm text-muted">최근 7일 영양 섭취 트래킹</p>
          </div>
          <Link
            href="/recommend"
            className="text-xs bg-primary text-white px-3 py-2 rounded-xl font-bold"
          >
            + 기록하기
          </Link>
        </div>

        {/* 주간 칼로리 차트 */}
        <div className="bg-card border border-border rounded-2xl p-5 mb-6">
          <h2 className="text-sm font-bold mb-4">주간 칼로리</h2>
          <div className="flex items-end gap-2 h-[120px]">
            {last7Days.map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-muted">{d.calories > 0 ? d.calories : ""}</span>
                <div
                  className={`w-full rounded-t-lg transition-all ${
                    d.calories > 0 ? "bg-primary/80" : "bg-border"
                  }`}
                  style={{
                    height: d.calories > 0 ? `${Math.max((d.calories / maxCal) * 100, 8)}%` : "4px",
                  }}
                />
                <span className={`text-xs font-medium ${
                  d.date === new Date().toISOString().slice(0, 10) ? "text-primary" : "text-muted"
                }`}>
                  {d.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 주간 평균 */}
        {weeklyAvg && logs.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <StatCard label="1일 평균 열량" value={`${weeklyAvg.calories}`} unit="kcal" />
            <StatCard label="1일 평균 단백질" value={`${weeklyAvg.protein_g}`} unit="g" />
            <StatCard label="1일 평균 나트륨" value={`${weeklyAvg.sodium_mg}`} unit="mg" />
          </div>
        )}

        {/* 부족/초과 영양소 알림 */}
        {(deficits.length > 0 || excesses.length > 0) && (
          <div className="space-y-3 mb-6">
            {deficits.map((d) => (
              <div key={d.nutrient} className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    {d.label} 부족
                  </p>
                  <p className="text-xs text-muted">
                    현재 {d.current}{d.unit}/일 · 권장 {d.target}{d.unit}/일
                  </p>
                </div>
              </div>
            ))}
            {excesses.map((e) => (
              <div key={e.nutrient} className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">
                    {e.label} 초과
                  </p>
                  <p className="text-xs text-muted">
                    현재 {e.current}{e.unit}/일 · 상한 {e.limit}{e.unit}/일
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 최근 기록 */}
        <h2 className="text-sm font-bold mb-3">최근 기록</h2>
        {logs.length === 0 ? (
          <div className="text-center py-12 bg-card border border-border rounded-2xl">
            <p className="text-muted mb-2">아직 기록이 없어요</p>
            <p className="text-xs text-muted mb-4">
              추천 페이지에서 먹은 제품을 기록해보세요
            </p>
            <Link
              href="/recommend"
              className="inline-block bg-primary text-white px-5 py-2.5 rounded-full text-sm font-bold"
            >
              추천 보기
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.slice(0, 20).map((log) => {
              const time = new Date(log.eaten_at);
              const dateStr = `${time.getMonth() + 1}/${time.getDate()}`;
              const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}`;

              return (
                <Link
                  key={log.id}
                  href={`/products/${log.product_id}`}
                  className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl hover:border-primary/30 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary">
                      {MEAL_LABELS[log.meal_type] || "간식"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight line-clamp-1">
                      {log.product_name || "제품"}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted mt-0.5">
                      <span>{dateStr} {timeStr}</span>
                      {log.calories && <span>· {log.calories}kcal</span>}
                      {log.protein_g && <span>· 단백질 {log.protein_g}g</span>}
                    </div>
                  </div>
                  {log.functional_tags.length > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/5 text-primary border border-primary/10 shrink-0">
                      {TAG_LABELS[log.functional_tags[0]] || log.functional_tags[0]}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        {/* 하단 네비 */}
        <div className="mt-8 flex gap-3">
          <Link href="/weekly-box" className="flex-1 border border-border py-3 rounded-full font-medium text-center hover:bg-card transition-colors">
            주간 박스
          </Link>
          <Link href="/health/report" className="flex-1 border border-border py-3 rounded-full font-medium text-center hover:bg-card transition-colors">
            영양 리포트
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3 text-center">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className="text-lg font-extrabold">{value}<span className="text-xs font-normal">{unit}</span></p>
    </div>
  );
}
