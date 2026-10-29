"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

/**
 * 홈 화면 개인화 위젯
 *
 * 재방문 유저에게 표시:
 * 1. 오늘의 영양 상태 (기록 있으면 달성률, 없으면 기록 독려)
 * 2. 주간 영양 점수 미리보기
 * 3. 진행 중인 공구 알림
 */

type TodayData = {
  hasProfile: boolean;
  today: {
    entries: number;
    calories: number;
    protein_g: number;
    goalCalories: number;
  } | null;
  weeklyScore: number | null;
  activeGroupBuys: number;
  streak: number; // 연속 기록 일수
};

function getUserId(): string | null {
  try {
    return localStorage.getItem("carefood_anon_id");
  } catch {
    return null;
  }
}

export default function HomeTodayWidget() {
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userId = getUserId();
    if (!userId) { setLoading(false); return; }

    const today = new Date().toISOString().slice(0, 10);

    // 병렬로 데이터 가져오기
    Promise.all([
      // 오늘 식단
      fetch(`/api/diary?date=${today}&user_id=${userId}`).then(r => r.json()).catch(() => null),
      // 공구 수
      fetch("/api/community/group-buy?status=recruiting").then(r => r.json()).catch(() => null),
      // 주간 리포트 (점수만)
      fetch(`/api/diary/report?user_id=${userId}`).then(r => r.json()).catch(() => null),
    ]).then(([diary, groupBuys, report]) => {
      const todayEntries = diary?.entries?.length || 0;
      const todayTotals = diary?.totals || { calories: 0, protein_g: 0 };
      const goalCal = diary?.goals?.daily_calories || 2000;

      setData({
        hasProfile: true,
        today: {
          entries: todayEntries,
          calories: Math.round(todayTotals.calories || 0),
          protein_g: Math.round((todayTotals.protein_g || 0) * 10) / 10,
          goalCalories: goalCal,
        },
        weeklyScore: report?.hasData ? report.overallScore : null,
        activeGroupBuys: groupBuys?.total || groupBuys?.group_buys?.length || 0,
        streak: 0, // TODO: 연속 기록 계산
      });
    }).finally(() => setLoading(false));
  }, []);

  // 프로필 없거나 로딩 중이면 렌더링 안 함
  if (loading || !data?.hasProfile) return null;

  const calRatio = data.today ? Math.min(data.today.calories / data.today.goalCalories * 100, 100) : 0;
  const hasRecords = data.today && data.today.entries > 0;

  return (
    <section className="px-4 pb-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* 오늘의 영양 */}
          <Link href="/diary"
            className="border border-border rounded-xl p-4 hover:border-primary/30 transition-colors">
            {hasRecords ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold">🍽️ 오늘의 영양</span>
                  <span className="text-[10px] text-muted">{data.today!.entries}끼 기록</span>
                </div>
                <div className="mb-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span>{data.today!.calories} kcal</span>
                    <span className="text-muted">/ {data.today!.goalCalories}</span>
                  </div>
                  <div className="h-2 bg-surface rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${calRatio}%` }} />
                  </div>
                </div>
                <p className="text-[10px] text-muted">단백질 {data.today!.protein_g}g</p>
              </>
            ) : (
              <>
                <p className="text-xs font-bold mb-1">🍽️ 오늘 식단을 기록해보세요</p>
                <p className="text-[10px] text-muted mb-2">기록할수록 추천이 정확해져요</p>
                <span className="text-[10px] text-primary font-bold">기록하기 →</span>
              </>
            )}
          </Link>

          {/* 주간 점수 */}
          <Link href="/diary/report"
            className="border border-border rounded-xl p-4 hover:border-primary/30 transition-colors">
            {data.weeklyScore !== null ? (
              <>
                <p className="text-xs font-bold mb-1">📊 주간 영양 점수</p>
                <div className="flex items-end gap-2">
                  <span className={`text-2xl font-extrabold ${
                    data.weeklyScore >= 80 ? "text-green-400" :
                    data.weeklyScore >= 60 ? "text-yellow-400" :
                    data.weeklyScore >= 40 ? "text-orange-400" : "text-red-400"
                  }`}>{data.weeklyScore}</span>
                  <span className="text-xs text-muted mb-1">/ 100</span>
                </div>
                <p className="text-[10px] text-primary font-bold mt-1">리포트 보기 →</p>
              </>
            ) : (
              <>
                <p className="text-xs font-bold mb-1">📊 주간 영양 리포트</p>
                <p className="text-[10px] text-muted mb-2">2일 이상 기록하면 분석해드려요</p>
                <span className="text-[10px] text-primary font-bold">시작하기 →</span>
              </>
            )}
          </Link>

          {/* 공구 알림 */}
          <Link href="/community"
            className="border border-border rounded-xl p-4 hover:border-primary/30 transition-colors">
            <p className="text-xs font-bold mb-1">🛒 진행 중인 공구</p>
            {data.activeGroupBuys > 0 ? (
              <>
                <p className="text-2xl font-extrabold text-primary">{data.activeGroupBuys}</p>
                <p className="text-[10px] text-muted mt-1">건의 공구가 모집 중이에요</p>
              </>
            ) : (
              <p className="text-[10px] text-muted">현재 진행 중인 공구가 없습니다</p>
            )}
          </Link>
        </div>
      </div>
    </section>
  );
}
