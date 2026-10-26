"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type DashboardData = {
  data: {
    total_products: number;
    active_products: number;
    purchasable: number;
    categorized: number;
    spicy_tagged: number;
    platforms: Record<string, number>;
    food_reports: { total: number; matched: number };
  };
  quality: {
    low_score_matches: number;
    no_nutrition: number;
    no_ingredients_linked: number;
  };
  users: {
    total_profiles: number;
    total_reviews: number;
    total_interactions: number;
    age_distribution: Record<string, number>;
    concern_distribution: Record<string, number>;
    diet_distribution: Record<string, number>;
    daily_actions: Record<string, { views: number; clicks: number; reviews: number }>;
  };
  generated_at: string;
};

const AGE_LABELS: Record<string, string> = {
  "20s": "20대", "30s": "30대", "40s": "40대", "50s": "50대", "60plus": "60대+",
};
const CONCERN_LABELS: Record<string, string> = {
  gut_health: "장건강", skin: "피부건강", weight: "체중관리", energy: "활력충전",
};
const DIET_LABELS: Record<string, string> = {
  normal: "일반", diet: "다이어트", exercise: "운동병행", vegetarian: "채식", pregnant: "임산부",
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="border border-border rounded-xl p-4">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className="text-2xl font-extrabold tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</p>
      {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

function BarChart({ data, labels }: { data: Record<string, number>; labels?: Record<string, string> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, v]) => v), 1);

  return (
    <div className="space-y-2">
      {entries.map(([key, val]) => (
        <div key={key} className="flex items-center gap-2">
          <span className="text-xs text-foreground/70 w-16 shrink-0 truncate">{labels?.[key] || key}</span>
          <div className="flex-1 h-5 bg-surface rounded overflow-hidden">
            <div className="h-full bg-primary/60 rounded" style={{ width: `${(val / max) * 100}%` }} />
          </div>
          <span className="text-xs font-medium w-10 text-right tabular-nums">{val}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 text-center">
        <div className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-3" />
        <p className="text-sm text-muted">대시보드 로딩 중...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-center">
        <p className="text-muted">데이터를 불러올 수 없습니다.</p>
      </div>
    );
  }

  const d = data.data;
  const q = data.quality;
  const u = data.users;
  const matchRate = d.active_products > 0 ? Math.round(d.purchasable / d.active_products * 100 * 10) / 10 : 0;
  const categoryRate = d.active_products > 0 ? Math.round(d.categorized / d.active_products * 100 * 10) / 10 : 0;
  const ingredientMatchRate = d.food_reports.total > 0 ? Math.round(d.food_reports.matched / d.food_reports.total * 100 * 10) / 10 : 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-extrabold">관리 대시보드</h1>
          <p className="text-xs text-muted mt-0.5">
            {new Date(data.generated_at).toLocaleString("ko-KR")} 기준
          </p>
        </div>
        <Link href="/" className="text-xs text-muted hover:text-primary"
          style={{ minHeight: "unset", minWidth: "unset" }}>
          ← 홈으로
        </Link>
      </div>

      {/* ── 데이터 현황 ── */}
      <section className="mb-8">
        <h2 className="text-sm font-bold mb-3">📊 데이터 현황</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <StatCard label="전체 제품" value={d.active_products} />
          <StatCard label="구매 가능" value={d.purchasable} sub={`매칭률 ${matchRate}%`} />
          <StatCard label="카테고리 태깅" value={d.categorized} sub={`${categoryRate}%`} />
          <StatCard label="매운맛 태깅" value={d.spicy_tagged} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <StatCard label="컬리 매칭" value={d.platforms.kurly} />
          <StatCard label="11번가 매칭" value={d.platforms["11st"]} />
          <StatCard label="오아시스 매칭" value={d.platforms.oasis} />
          <StatCard label="홈플러스 매칭" value={d.platforms.homeplus} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatCard label="품목제조보고 (원재료)" value={d.food_reports.total}
            sub={`매칭 ${d.food_reports.matched}건 (${ingredientMatchRate}%)`} />
          <StatCard label="총 플랫폼 매칭"
            value={Object.values(d.platforms).reduce((s, v) => s + v, 0)}
            sub="4개 쇼핑몰 합산" />
        </div>
      </section>

      {/* ── 품질 관리 ── */}
      <section className="mb-8">
        <h2 className="text-sm font-bold mb-3">⚠️ 품질 관리</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className={`border rounded-xl p-4 ${q.low_score_matches > 1000 ? "border-orange-300 bg-orange-50" : "border-border"}`}>
            <p className="text-xs text-muted mb-1">오매칭 의심 (low_score)</p>
            <p className="text-2xl font-extrabold tabular-nums">{q.low_score_matches.toLocaleString()}</p>
          </div>
          <div className={`border rounded-xl p-4 ${q.no_nutrition > 500 ? "border-orange-300 bg-orange-50" : "border-border"}`}>
            <p className="text-xs text-muted mb-1">영양정보 없음</p>
            <p className="text-2xl font-extrabold tabular-nums">{q.no_nutrition.toLocaleString()}</p>
          </div>
          <div className="border border-border rounded-xl p-4">
            <p className="text-xs text-muted mb-1">원재료 미연결</p>
            <p className="text-2xl font-extrabold tabular-nums">{q.no_ingredients_linked.toLocaleString()}</p>
          </div>
        </div>
      </section>

      {/* ── 사용자 분석 ── */}
      <section className="mb-8">
        <h2 className="text-sm font-bold mb-3">👥 사용자 분석</h2>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatCard label="온보딩 완료" value={u.total_profiles} />
          <StatCard label="리뷰 수" value={u.total_reviews} />
          <StatCard label="행동 기록" value={u.total_interactions} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* 연령대 분포 */}
          <div className="border border-border rounded-xl p-4">
            <h3 className="text-xs font-bold mb-3">연령대</h3>
            {Object.keys(u.age_distribution).length > 0 ? (
              <BarChart data={u.age_distribution} labels={AGE_LABELS} />
            ) : (
              <p className="text-xs text-muted">데이터 없음</p>
            )}
          </div>

          {/* 관심사 분포 */}
          <div className="border border-border rounded-xl p-4">
            <h3 className="text-xs font-bold mb-3">건강 관심사</h3>
            {Object.keys(u.concern_distribution).length > 0 ? (
              <BarChart data={u.concern_distribution} labels={CONCERN_LABELS} />
            ) : (
              <p className="text-xs text-muted">데이터 없음</p>
            )}
          </div>

          {/* 식습관 분포 */}
          <div className="border border-border rounded-xl p-4">
            <h3 className="text-xs font-bold mb-3">식습관</h3>
            {Object.keys(u.diet_distribution).length > 0 ? (
              <BarChart data={u.diet_distribution} labels={DIET_LABELS} />
            ) : (
              <p className="text-xs text-muted">데이터 없음</p>
            )}
          </div>
        </div>
      </section>

      {/* ── 최근 7일 행동 추이 ── */}
      {Object.keys(u.daily_actions).length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-bold mb-3">📈 최근 7일 행동</h2>
          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface/50 border-b border-border">
                  <th className="text-left py-2 px-4 text-xs text-muted font-medium">날짜</th>
                  <th className="text-right py-2 px-4 text-xs text-muted font-medium">조회</th>
                  <th className="text-right py-2 px-4 text-xs text-muted font-medium">클릭</th>
                  <th className="text-right py-2 px-4 text-xs text-muted font-medium">전환율</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(u.daily_actions)
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([date, actions]) => (
                    <tr key={date} className="border-b border-border last:border-0">
                      <td className="py-2 px-4 text-xs">{date}</td>
                      <td className="py-2 px-4 text-xs text-right tabular-nums">{actions.views}</td>
                      <td className="py-2 px-4 text-xs text-right tabular-nums">{actions.clicks}</td>
                      <td className="py-2 px-4 text-xs text-right tabular-nums text-primary font-medium">
                        {actions.views > 0 ? Math.round(actions.clicks / actions.views * 100) : 0}%
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
