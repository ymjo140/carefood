"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import ShareButton from "@/components/ShareButton";
import {
  Badge, Card, EmptyState, Icon, LinkButton, Notice, Page, PageHeader, ProgressBar, SectionHeader,
  Spinner, TextLink, buttonClass, cn,
} from "@/components/ui";
import { getClientActorId } from "@/lib/actor-client";

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

/* 등급 → 고정 클래스 (같은 의미는 같은 색) */
const GRADE_TONE: Record<string, "positive" | "brand" | "caution" | "danger"> = {
  excellent: "positive",
  good: "brand",
  low: "caution",
  critical: "danger",
  over: "caution",
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
  // 서버가 발급한 쿠키의 id — API 는 이 값을 받지 않고 쿠키로 직접 확인한다
  return getClientActorId() || "";
}

function ReportContent() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userId = getUserId();
    fetch(`/api/diary/report?user_id=${userId}`)
      .then(r => r.json())
      .then(setReport)
      .catch(() => setReport({ hasData: false, message: "리포트를 불러오지 못했어요." }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <Spinner size={32} />
        <p className="text-label text-ink-2">주간 리포트를 분석하고 있어요</p>
      </div>
    );
  }

  if (!report?.hasData) {
    return (
      <EmptyState
        title="아직 데이터가 없어요"
        description={report?.message || "식단을 기록하면 주간 리포트를 받을 수 있어요"}
        action={<LinkButton href="/diary">식단 기록하기</LinkButton>}
      />
    );
  }

  const { overallScore = 0, comment, grades = [], dailyData = [], topFoods = [], mealSlotCounts = {}, gapNutrients = [], recommendations = [], groupBuys = [], period, daysWithData = 0, totalEntries = 0, recordRate = 0 } = report;

  // 점수 의미 (같은 의미는 같은 색)
  const scoreTone = overallScore >= 80 ? "positive" : overallScore >= 60 ? "brand" : overallScore >= 40 ? "caution" : "danger";
  const scoreLabel = overallScore >= 80 ? "우수" : overallScore >= 60 ? "양호" : overallScore >= 40 ? "보통" : "부족";

  // 일별 칼로리 차트의 최대값
  const maxCal = Math.max(...dailyData.map(d => d.calories), 1);

  return (
    <div className="flex flex-col gap-4">
      {/* ── 종합 점수 ── */}
      <Card className="flex flex-col items-center text-center gap-1 py-6">
        <p className="text-caption text-ink-2">
          <span className="num">{period?.start?.slice(5).replace("-", "/")} ~ {period?.end?.slice(5).replace("-", "/")}</span> 주간 영양 점수
        </p>
        <p className="num text-display font-bold text-ink leading-none mt-1">
          <span className="highlight">{overallScore}</span>
          <span className="text-label font-medium text-ink-2 ml-1">/ 100점</span>
        </p>
        <Badge tone={scoreTone} className="mt-2">{scoreLabel}</Badge>
        {comment && <p className="text-body text-ink mt-3">{comment}</p>}
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3 text-caption text-ink-2">
          <span><span className="num font-bold text-ink">{daysWithData}</span>일 기록</span>
          <span><span className="num font-bold text-ink">{totalEntries}</span>끼 기록</span>
          <span>기록률 <span className="num font-bold text-ink">{recordRate}%</span></span>
        </div>
      </Card>

      {/* ── 일별 칼로리 차트 ── */}
      <Card>
        <SectionHeader title="일별 칼로리" />
        <div className="flex items-end gap-1.5 h-32">
          {dailyData.map((d, i) => {
            const pct = d.calories / maxCal * 100;
            const dayName = DAY_NAMES[new Date(d.date).getDay()];
            return (
              <div key={i} className="flex-1 h-full flex flex-col items-center justify-end gap-1 min-w-0">
                <span className="num text-caption text-ink-2">{d.calories}</span>
                <div className="w-full rounded-t-sm bg-brand" style={{ height: `${Math.max(pct, 4)}%` }} />
                <span className="text-caption text-ink-2">{dayName}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── 영양소별 성적표 ── */}
      <Card padding="none">
        <div className="px-4 pt-4"><SectionHeader title="영양소별 달성률" /></div>
        <div className="divide-y divide-line">
          {grades.map(g => (
            <div key={g.nutrient} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <span className="text-label font-medium text-ink">{g.label}</span>
                <Badge tone={GRADE_TONE[g.grade] || "neutral"}>{GRADE_LABELS[g.grade]}</Badge>
              </div>
              <ProgressBar value={Math.min(g.ratio * 100, 100)} tone={GRADE_TONE[g.grade] || "brand"} label={`${g.label} 달성률`} />
              <div className="flex justify-between text-caption text-ink-2 mt-1">
                <span>평균 <span className="num">{g.avg}{g.unit}</span></span>
                <span>목표 <span className="num">{g.target}{g.unit}</span></span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── 끼니별 기록률 · 자주 먹은 음식 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <SectionHeader title="끼니별 기록" />
          <div className="flex flex-col gap-2">
            {Object.entries(SLOT_LABELS).map(([key, label]) => (
              <div key={key} className="flex justify-between items-center text-label">
                <span className="text-ink-2">{label}</span>
                <span className="text-ink"><span className="num font-bold">{mealSlotCounts[key] || 0}</span>회</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="자주 먹은 음식" />
          <div className="flex flex-col gap-2">
            {topFoods.length > 0 ? topFoods.slice(0, 4).map((f, i) => (
              <div key={i} className="flex justify-between items-center gap-2 text-label">
                <span className="line-clamp-1 flex-1 min-w-0 text-ink">{f.name}</span>
                <span className="shrink-0 text-brand-ink"><span className="num font-bold">{f.count}</span>회</span>
              </div>
            )) : (
              <p className="text-label text-ink-2">기록이 없어요</p>
            )}
          </div>
        </Card>
      </div>

      {/* ── 영양 갭 → 추천 ── */}
      {gapNutrients.length > 0 && (
        <Card tone="brand">
          <SectionHeader title="이번 주 부족한 영양소" description="부족한 영양소를 채울 수 있는 제품을 골랐어요" />
          <div className="flex flex-col gap-2">
            {gapNutrients.map(gap => (
              <div key={gap.nutrient} className="bg-surface rounded-md px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-label font-medium text-ink">{gap.label}</span>
                  <Badge tone="caution"><span className="num">{Math.round(gap.ratio * 100)}%</span> 달성</Badge>
                </div>
                <p className="text-caption text-ink-2 mt-0.5">
                  평균 <span className="num">{gap.avg}{gap.unit}</span> / 목표 <span className="num">{gap.target}{gap.unit}</span>
                </p>
              </div>
            ))}
          </div>
          {recommendations.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              {recommendations.map((rec, i) => (
                <Link key={i} href={`/products/${rec.product_id}`}
                  className="flex items-center justify-between gap-3 bg-surface rounded-md px-3 py-2.5 border border-transparent hover:border-line-strong transition-colors">
                  <div className="min-w-0">
                    <p className="text-label text-ink line-clamp-1">{rec.product_name}</p>
                    <p className="text-caption text-brand-ink font-medium">{rec.reason}</p>
                  </div>
                  <span className="text-caption text-ink-2 shrink-0">건강점수 <span className="num font-bold text-ink">{rec.health_score}</span></span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ── 관련 공구 ── */}
      {groupBuys.length > 0 && (
        <Card>
          <SectionHeader title="진행 중인 공구" />
          <div className="flex flex-col gap-2">
            {groupBuys.map(gb => (
              <Link href="/community" key={gb.id}
                className="flex items-center justify-between gap-3 bg-sunken rounded-md px-3 py-2.5 border border-transparent hover:border-line-strong transition-colors">
                <div className="min-w-0">
                  <p className="text-label font-medium text-ink line-clamp-1">{gb.product_name}</p>
                  {gb.target_price && (
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="num text-label font-bold text-ink">{gb.target_price.toLocaleString()}<span className="text-caption font-medium text-ink-2">원</span></span>
                      {gb.discount_rate && <Badge tone="danger"><span className="num">{Math.round(gb.discount_rate * 100)}%</span> 할인</Badge>}
                    </div>
                  )}
                </div>
                <span className="text-caption text-ink-2 shrink-0"><span className="num">{gb.current_count}/{gb.target_count}</span>명</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* ── CTA ── */}
      <div className="flex gap-3">
        <LinkButton href="/diary" variant="secondary" className="flex-1">식단 기록하기</LinkButton>
        <LinkButton href="/products" className="flex-1">맞춤 제품 보기</LinkButton>
      </div>

      {/* ── 공유 ── */}
      <ShareButton
        title={`이번 주 영양 점수: ${overallScore}점`}
        text={`케어푸드 주간 리포트${grades.some(g => g.grade === "excellent") ? `\n우수: ${grades.filter(g => g.grade === "excellent").map(g => g.label).join(", ")}` : ""}${gapNutrients.length > 0 ? `\n부족: ${gapNutrients.map(g => `${g.label} ${Math.round(g.ratio * 100)}%`).join(", ")}` : ""}\n나도 무료로 확인해 보기`}
        url="https://carefood-iota.vercel.app/diary/report"
        className={cn(buttonClass({ variant: "secondary", block: true }))}
      >
        <Icon name="share" size={18} />
        리포트 공유하기
      </ShareButton>

      <Notice>식약처 영양 DB 기준 정보이며 의학적 진단·처방을 대신하지 않아요</Notice>
    </div>
  );
}

export default function WeeklyReportPage() {
  return (
    <Page width="narrow">
      <TextLink href="/diary" className="mb-3">
        <Icon name="chevron-left" size={16} /> 식단 기록
      </TextLink>
      <PageHeader title="주간 영양 리포트" description="지난 7일 기록으로 영양 밸런스를 살펴봐요" />
      <Suspense fallback={<div className="flex justify-center py-16"><Spinner size={32} /></div>}>
        <ReportContent />
      </Suspense>
    </Page>
  );
}
