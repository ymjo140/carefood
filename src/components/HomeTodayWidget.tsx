"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, Icon, ProgressBar } from "@/components/ui";

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

  const hasRecords = data.today && data.today.entries > 0;
  const score = data.weeklyScore;
  const scoreTone = score === null ? "" : score >= 80 ? "text-positive" : score >= 40 ? "text-caution" : "text-danger";

  return (
    <section className="pb-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* 오늘의 영양 */}
        <Link href="/diary" className="block rounded-lg">
          <Card interactive className="h-full">
            {hasRecords ? (
              <>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-label font-bold text-ink">오늘의 영양</span>
                  <span className="text-caption text-ink-2"><span className="num">{data.today!.entries}</span>끼 기록</span>
                </div>
                <p className="text-label text-ink-2 mb-1.5">
                  <span className="num text-title font-bold text-ink highlight">{data.today!.calories.toLocaleString("ko-KR")}</span>
                  <span className="ml-0.5">kcal</span>
                  <span className="num ml-1">/ {data.today!.goalCalories.toLocaleString("ko-KR")}</span>
                </p>
                <ProgressBar value={data.today!.calories} max={data.today!.goalCalories} label="오늘 칼로리 목표 대비" />
                <p className="text-caption text-ink-2 mt-2">단백질 <span className="num font-bold text-protein">{data.today!.protein_g}g</span></p>
              </>
            ) : (
              <>
                <p className="text-label font-bold text-ink mb-1">오늘 식단을 기록해 보세요</p>
                <p className="text-caption text-ink-2 mb-2">기록할수록 추천이 정확해져요</p>
                <span className="inline-flex items-center gap-0.5 text-label font-medium text-brand-ink">기록하기 <Icon name="chevron-right" size={16} /></span>
              </>
            )}
          </Card>
        </Link>

        {/* 주간 점수 */}
        <Link href="/diary/report" className="block rounded-lg">
          <Card interactive className="h-full">
            {score !== null ? (
              <>
                <p className="text-label font-bold text-ink mb-1">주간 영양 점수</p>
                <p className="flex items-baseline gap-1">
                  <span className={`num text-title font-bold ${scoreTone}`}>{score}</span>
                  <span className="text-caption text-ink-2">/ 100</span>
                </p>
                <span className="inline-flex items-center gap-0.5 text-label font-medium text-brand-ink mt-1">리포트 보기 <Icon name="chevron-right" size={16} /></span>
              </>
            ) : (
              <>
                <p className="text-label font-bold text-ink mb-1">주간 영양 리포트</p>
                <p className="text-caption text-ink-2 mb-2">2일 이상 기록하면 분석해 드려요</p>
                <span className="inline-flex items-center gap-0.5 text-label font-medium text-brand-ink">시작하기 <Icon name="chevron-right" size={16} /></span>
              </>
            )}
          </Card>
        </Link>

        {/* 공구 알림 */}
        <Link href="/community" className="block rounded-lg">
          <Card interactive className="h-full">
            <p className="text-label font-bold text-ink mb-1">진행 중인 공구</p>
            {data.activeGroupBuys > 0 ? (
              <p className="text-caption text-ink-2">
                <span className="num text-title font-bold text-ink mr-1">{data.activeGroupBuys}</span>건의 공구가 모집 중이에요
              </p>
            ) : (
              <p className="text-caption text-ink-2">지금 진행 중인 공구가 없어요</p>
            )}
          </Card>
        </Link>
      </div>
    </section>
  );
}
