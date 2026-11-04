"use client";

import { useState, useEffect } from "react";
import {
  Badge, Card, EmptyState, Page, PageHeader, PageLoading, SectionHeader, cn, useToast,
} from "@/components/ui";
import { LinkTabs, ADMIN_TABS } from "@/components/ui/LinkTabs";

/* ── 타입 ── */
type NutritionGap = {
  count: number;
  pct: number;
  threshold: string;
};

type SupplyRow = {
  spec: string;
  label: string;
  supply: number;
  demand_pct: number;
  gap_score: number;
};

type OdmSuggestion = {
  rank: number;
  spec: string;
  reason: string;
  gap_score: number;
  suggested_targets: Record<string, string>;
};

type OdmData = {
  activeUsers: number;
  totalProfiles: number;
  nutritionGaps: Record<string, NutritionGap>;
  supplyAnalysis: SupplyRow[];
  odmSuggestions: OdmSuggestion[];
  userDemographics: {
    concerns: Record<string, number>;
    dietTypes: Record<string, number>;
    ageGroups: Record<string, number>;
  };
  generatedAt: string;
};

const GAP_LABELS: Record<string, string> = {
  low_protein: "단백질 부족",
  low_fiber: "식이섬유 부족",
  high_sodium: "나트륨 과다",
  high_sugar: "당류 과다",
  low_cal: "칼로리 부족",
};

const CONCERN_LABELS: Record<string, string> = {
  gut_health: "장건강", skin: "피부건강", weight: "체중관리", energy: "활력충전",
  blood_sugar: "혈당관리", blood_pressure: "혈압관리", kidney: "신장관리",
};

const DIET_LABELS: Record<string, string> = {
  normal: "일반", diet: "다이어트", exercise: "운동병행", vegetarian: "채식", pregnant: "임산부",
};

const AGE_LABELS: Record<string, string> = {
  "20s": "20대", "30s": "30대", "40s": "40대", "50s": "50대", "60plus": "60대+",
};

/** 비율 → 심각도 (50%+ danger / 25%+ caution) — 고정 클래스 맵 */
function severity(pct: number): "danger" | "caution" | "neutral" {
  if (pct >= 50) return "danger";
  if (pct >= 25) return "caution";
  return "neutral";
}
const GAP_TILE: Record<"danger" | "caution" | "neutral", string> = {
  danger: "bg-sunken",
  caution: "bg-sunken",
  neutral: "bg-sunken",
};
const GAP_TEXT: Record<"danger" | "caution" | "neutral", string> = {
  danger: "text-danger",
  caution: "text-brand-ink",
  neutral: "text-ink",
};

function CountList({ title, data, labels }: { title: string; data: Record<string, number>; labels: Record<string, string> }) {
  return (
    <Card>
      <p className="text-label font-bold text-ink mb-3">{title}</p>
      <div className="flex flex-col gap-1.5">
        {Object.entries(data)
          .sort(([, a], [, b]) => b - a)
          .map(([key, count]) => (
            <div key={key} className="flex justify-between gap-3 text-label">
              <span className="text-ink-2">{labels[key] || key}</span>
              <span className="text-ink"><span className="num font-bold">{count}</span>명</span>
            </div>
          ))}
      </div>
    </Card>
  );
}

export default function OdmPage() {
  const [data, setData] = useState<OdmData | null>(null);
  const [loading, setLoading] = useState(true);
  const { show: showToast } = useToast();

  useEffect(() => {
    fetch("/api/admin/odm")
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(setData)
      .catch(() => showToast("ODM 데이터를 불러오지 못했어요", { tone: "danger" }))
      .finally(() => setLoading(false));
  }, [showToast]);

  if (loading) return <PageLoading />;

  if (!data) {
    return (
      <Page width="wide">
        <EmptyState title="데이터를 불러오지 못했어요" description="잠시 후 다시 열어 주세요" />
      </Page>
    );
  }

  return (
    <Page width="wide">
      <PageHeader
        title="ODM 수요 분석"
        description="사용자 영양 갭 기반 제품 개발 기회"
        actions={
          <div className="flex flex-col sm:items-end">
            <span className="text-caption text-ink-3">{new Date(data.generatedAt).toLocaleDateString("ko-KR")} 기준</span>
            <span className="text-caption text-ink-2">
              활성 유저 <span className="num font-bold text-ink">{data.activeUsers}</span>명 / 프로필 <span className="num font-bold text-ink">{data.totalProfiles}</span>명
            </span>
          </div>
        }
      />

      <LinkTabs items={ADMIN_TABS} current="/admin/odm" label="관리자 메뉴" className="mb-6" />

      {/* ── 영양 갭 요약 ── */}
      <section className="mb-8">
        <SectionHeader title="전체 사용자 영양 갭" description="50% 이상은 경고, 25% 이상은 주의 색" />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Object.entries(data.nutritionGaps).map(([key, gap]) => {
            const sev = severity(gap.pct);
            return (
              <div key={key} className={cn("rounded-md p-3 text-center", GAP_TILE[sev])}>
                <p className={cn("num text-title font-bold", GAP_TEXT[sev])}>{gap.pct}%</p>
                <p className="text-caption text-ink mt-0.5">{GAP_LABELS[key] || key}</p>
                <p className="text-caption text-ink-2">{gap.threshold}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── ODM 제안 Top ── */}
      <section className="mb-8">
        <SectionHeader
          title={`ODM 제품 개발 제안 — Top ${data.odmSuggestions.length}`}
          description="Gap Score = 수요% / log₂(공급+1) — 높을수록 기회 큼"
        />
        <div className="flex flex-col gap-3">
          {data.odmSuggestions.map((s, i) => (
            <Card key={s.rank} tone={i === 0 ? "brand" : "default"}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="num size-8 rounded-full bg-sunken text-ink text-label font-bold flex items-center justify-center shrink-0">
                    {s.rank}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-body font-bold text-ink">{s.spec}</h3>
                    <p className="text-label text-ink-2">{s.reason}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={cn("num text-title font-bold text-brand-ink", i === 0 && "highlight")}>{s.gap_score}</p>
                  <p className="text-caption text-ink-2">Gap Score</p>
                </div>
              </div>
              {/* 추천 스펙 */}
              <div className="rounded-md bg-surface border border-line p-3">
                <p className="text-caption font-bold text-ink-2 mb-2">제안 스펙</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(s.suggested_targets).map(([key, val]) => (
                    <Badge key={key}>
                      <span className="text-ink-2">{key}:</span>
                      <span className="text-ink">{val}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* ── 공급 갭 테이블 ── */}
      <section className="mb-8">
        <SectionHeader title="시장 공급 vs 수요" />
        <Card padding="none" className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-label">
            <thead>
              <tr className="border-b border-line text-caption text-ink-2">
                <th className="text-left px-4 py-2.5 font-medium">스펙</th>
                <th className="text-right px-4 py-2.5 font-medium">공급 (제품 수)</th>
                <th className="text-right px-4 py-2.5 font-medium">수요 (%)</th>
                <th className="text-right px-4 py-2.5 font-medium">Gap Score</th>
              </tr>
            </thead>
            <tbody>
              {data.supplyAnalysis.map(s => {
                const sev = severity(s.demand_pct);
                return (
                  <tr key={s.spec} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 font-medium text-ink">{s.label}</td>
                    <td className="px-4 py-2.5 text-right num text-ink-2">{s.supply.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={cn("num", GAP_TEXT[sev], sev === "danger" && "font-bold")}>{s.demand_pct}%</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={cn("num", s.gap_score >= 20 ? "text-brand-ink font-bold" : "text-ink-2")}>{s.gap_score}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </section>

      {/* ── 사용자 세그먼트 ── */}
      <section className="mb-8">
        <SectionHeader title="사용자 세그먼트" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <CountList title="관심사 분포" data={data.userDemographics.concerns} labels={CONCERN_LABELS} />
          <CountList title="식단 유형" data={data.userDemographics.dietTypes} labels={DIET_LABELS} />
          <CountList title="연령대" data={data.userDemographics.ageGroups} labels={AGE_LABELS} />
        </div>
      </section>

      {/* ── 핵심 인사이트 ── */}
      <Card tone="sunken">
        <p className="text-body font-bold text-ink mb-3">핵심 인사이트</p>
        <div className="flex flex-col gap-2 text-label text-ink">
          {data.odmSuggestions.length > 0 && (
            <p>
              <span className="font-bold text-brand-ink">1위 기회:</span>{" "}
              {data.odmSuggestions[0].spec} — {data.odmSuggestions[0].reason}.
              이 스펙의 제품을 OEM/ODM으로 개발하면 기존 공급 대비 차별화 가능.
            </p>
          )}
          {data.nutritionGaps.low_fiber?.pct >= 50 && (
            <p>
              <span className="font-bold text-danger">식이섬유 위기:</span>{" "}
              사용자의 {data.nutritionGaps.low_fiber.pct}%가 식이섬유 부족.
              고섬유 제품 라인업 확대 또는 식이섬유 강화 제품 개발 필요.
            </p>
          )}
          <p>
            <span className="font-bold">데이터 가치:</span>{" "}
            {data.totalProfiles}명의 건강 프로필 + {data.activeUsers}명의 실시간 식단 데이터.
            제조사에 구체적 수요 데이터를 제공하여 ODM 제안 가능.
          </p>
        </div>
      </Card>
    </Page>
  );
}
