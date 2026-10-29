"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

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

export default function OdmPage() {
  const [data, setData] = useState<OdmData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/odm")
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="inline-block w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-3" />
        <p className="text-sm text-muted">수요 데이터 분석 중...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <p className="text-muted">데이터를 불러올 수 없습니다</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/admin" className="text-xs text-muted hover:text-foreground mb-1 inline-block">← 관리자</Link>
          <h1 className="text-xl font-extrabold">🏭 ODM 수요 분석</h1>
          <p className="text-xs text-muted mt-0.5">사용자 영양 갭 기반 제품 개발 기회</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted">{new Date(data.generatedAt).toLocaleDateString("ko-KR")} 기준</p>
          <p className="text-xs text-muted">활성 유저 {data.activeUsers}명 / 프로필 {data.totalProfiles}명</p>
        </div>
      </div>

      {/* ── 영양 갭 요약 ── */}
      <div className="border border-border rounded-xl p-5 mb-5">
        <h2 className="text-sm font-bold mb-4">📊 전체 사용자 영양 갭</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Object.entries(data.nutritionGaps).map(([key, gap]) => (
            <div key={key} className={`rounded-lg p-3 text-center ${gap.pct >= 50 ? "bg-red-500/10 border border-red-500/20" : gap.pct >= 25 ? "bg-orange-500/10 border border-orange-500/20" : "bg-surface border border-border"}`}>
              <p className={`text-2xl font-extrabold ${gap.pct >= 50 ? "text-red-400" : gap.pct >= 25 ? "text-orange-400" : "text-foreground"}`}>
                {gap.pct}%
              </p>
              <p className="text-[10px] text-muted mt-0.5">{GAP_LABELS[key]}</p>
              <p className="text-[9px] text-muted">{gap.threshold}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── ODM 제안 Top5 ── */}
      <div className="border border-primary/30 rounded-xl p-5 mb-5 bg-primary/3">
        <h2 className="text-sm font-bold mb-1">🎯 ODM 제품 개발 제안 — Top {data.odmSuggestions.length}</h2>
        <p className="text-xs text-muted mb-4">Gap Score = 수요% / log₂(공급+1) — 높을수록 기회 큼</p>
        <div className="space-y-3">
          {data.odmSuggestions.map(s => (
            <div key={s.rank} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-primary/15 text-primary text-xs font-extrabold flex items-center justify-center shrink-0"
                    style={{ minHeight: "unset", minWidth: "unset" }}>
                    {s.rank}
                  </span>
                  <div>
                    <h3 className="text-sm font-bold">{s.spec}</h3>
                    <p className="text-xs text-muted">{s.reason}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-extrabold text-primary">{s.gap_score}</p>
                  <p className="text-[9px] text-muted">Gap Score</p>
                </div>
              </div>
              {/* 추천 스펙 */}
              <div className="bg-surface rounded-lg p-3 mt-2">
                <p className="text-[10px] font-bold text-muted mb-1.5">제안 스펙</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(s.suggested_targets).map(([key, val]) => (
                    <span key={key} className="text-[10px] px-2 py-0.5 rounded bg-card border border-border"
                      style={{ minHeight: "unset", minWidth: "unset" }}>
                      <span className="text-muted">{key}: </span>
                      <span className="font-medium">{val}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 공급 갭 테이블 ── */}
      <div className="border border-border rounded-xl overflow-hidden mb-5">
        <div className="bg-surface/50 px-4 py-2.5 border-b border-border">
          <h2 className="text-sm font-bold">📦 시장 공급 vs 수요</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-surface/30 text-muted">
                <th className="text-left px-4 py-2 font-medium">스펙</th>
                <th className="text-right px-4 py-2 font-medium">공급 (제품 수)</th>
                <th className="text-right px-4 py-2 font-medium">수요 (%)</th>
                <th className="text-right px-4 py-2 font-medium">Gap Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {data.supplyAnalysis.map(s => (
                <tr key={s.spec} className="hover:bg-surface/30 transition-colors">
                  <td className="px-4 py-2.5 font-medium">{s.label}</td>
                  <td className="px-4 py-2.5 text-right">{s.supply.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={s.demand_pct >= 50 ? "text-red-400 font-bold" : s.demand_pct >= 25 ? "text-orange-400" : ""}>
                      {s.demand_pct}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={s.gap_score >= 20 ? "text-primary font-bold" : ""}>
                      {s.gap_score}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 사용자 세그먼트 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        {/* 관심사 */}
        <div className="border border-border rounded-xl p-4">
          <h3 className="text-xs font-bold mb-3">🎯 관심사 분포</h3>
          <div className="space-y-1.5">
            {Object.entries(data.userDemographics.concerns)
              .sort(([, a], [, b]) => b - a)
              .map(([key, count]) => (
                <div key={key} className="flex justify-between text-xs">
                  <span className="text-muted">{CONCERN_LABELS[key] || key}</span>
                  <span className="font-bold">{count}명</span>
                </div>
              ))}
          </div>
        </div>

        {/* 식단 유형 */}
        <div className="border border-border rounded-xl p-4">
          <h3 className="text-xs font-bold mb-3">🍽️ 식단 유형</h3>
          <div className="space-y-1.5">
            {Object.entries(data.userDemographics.dietTypes)
              .sort(([, a], [, b]) => b - a)
              .map(([key, count]) => (
                <div key={key} className="flex justify-between text-xs">
                  <span className="text-muted">{DIET_LABELS[key] || key}</span>
                  <span className="font-bold">{count}명</span>
                </div>
              ))}
          </div>
        </div>

        {/* 연령대 */}
        <div className="border border-border rounded-xl p-4">
          <h3 className="text-xs font-bold mb-3">👥 연령대</h3>
          <div className="space-y-1.5">
            {Object.entries(data.userDemographics.ageGroups)
              .sort(([, a], [, b]) => b - a)
              .map(([key, count]) => (
                <div key={key} className="flex justify-between text-xs">
                  <span className="text-muted">{AGE_LABELS[key] || key}</span>
                  <span className="font-bold">{count}명</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* ── 핵심 인사이트 ── */}
      <div className="bg-surface rounded-xl p-5">
        <h2 className="text-sm font-bold mb-3">💡 핵심 인사이트</h2>
        <div className="space-y-2 text-xs leading-relaxed">
          {data.odmSuggestions.length > 0 && (
            <p>
              <span className="font-bold text-primary">1위 기회:</span>{" "}
              {data.odmSuggestions[0].spec} — {data.odmSuggestions[0].reason}.
              이 스펙의 제품을 OEM/ODM으로 개발하면 기존 공급 대비 차별화 가능.
            </p>
          )}
          {data.nutritionGaps.low_fiber?.pct >= 50 && (
            <p>
              <span className="font-bold text-orange-400">식이섬유 위기:</span>{" "}
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
      </div>
    </div>
  );
}
