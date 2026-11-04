"use client";

import { useState, useEffect } from "react";
import {
  Card, EmptyState, Page, PageHeader, PageLoading, ProgressBar, SectionHeader, Stat, TextLink, cn,
} from "@/components/ui";
import { LinkTabs, ADMIN_TABS } from "@/components/ui/LinkTabs";

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

function StatCard({ label, value, sub, emphasis, tone = "default" }: {
  label: string; value: number; sub?: string; emphasis?: boolean; tone?: "default" | "caution";
}) {
  return (
    <Card className={cn(tone === "caution" && "border-caution")}>
      <Stat label={label} value={value.toLocaleString()} emphasis={emphasis} />
      {sub && <p className={cn("text-caption mt-1", tone === "caution" ? "text-caution" : "text-ink-3")}>{sub}</p>}
    </Card>
  );
}

function BarChart({ data, labels }: { data: Record<string, number>; labels?: Record<string, string> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, v]) => v), 1);

  return (
    <div className="flex flex-col gap-2.5">
      {entries.map(([key, val]) => (
        <div key={key} className="flex items-center gap-3">
          <span className="text-caption text-ink-2 w-16 shrink-0 truncate">{labels?.[key] || key}</span>
          <ProgressBar value={val} max={max} label={labels?.[key] || key} className="flex-1" />
          <span className="num text-caption font-bold text-ink w-10 text-right">{val}</span>
        </div>
      ))}
    </div>
  );
}

function DistributionCard({ title, data, labels }: { title: string; data: Record<string, number>; labels: Record<string, string> }) {
  return (
    <Card>
      <p className="text-label font-bold text-ink mb-3">{title}</p>
      {Object.keys(data).length > 0 ? (
        <BarChart data={data} labels={labels} />
      ) : (
        <p className="text-caption text-ink-3">아직 데이터가 없어요</p>
      )}
    </Card>
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

  if (loading) return <PageLoading />;

  if (!data) {
    return (
      <Page width="wide">
        <EmptyState title="데이터를 불러오지 못했어요" description="잠시 후 다시 열어 주세요" />
      </Page>
    );
  }

  const d = data.data;
  const q = data.quality;
  const u = data.users;
  const matchRate = d.active_products > 0 ? Math.round(d.purchasable / d.active_products * 100 * 10) / 10 : 0;
  const categoryRate = d.active_products > 0 ? Math.round(d.categorized / d.active_products * 100 * 10) / 10 : 0;
  const ingredientMatchRate = d.food_reports.total > 0 ? Math.round(d.food_reports.matched / d.food_reports.total * 100 * 10) / 10 : 0;

  return (
    <Page width="wide">
      <PageHeader
        title="관리 대시보드"
        description={`${new Date(data.generated_at).toLocaleString("ko-KR")} 기준`}
        actions={<TextLink href="/">홈으로</TextLink>}
      />

      <LinkTabs items={ADMIN_TABS} current="/admin" label="관리자 메뉴" className="mb-6" />

      {/* ── 데이터 현황 ── */}
      <section className="mb-8">
        <SectionHeader title="데이터 현황" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <StatCard label="전체 제품" value={d.active_products} emphasis />
          <StatCard label="구매 가능" value={d.purchasable} sub={`매칭률 ${matchRate}%`} />
          <StatCard label="카테고리 태깅" value={d.categorized} sub={`${categoryRate}%`} />
          <StatCard label="매운맛 태깅" value={d.spicy_tagged} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <StatCard label="컬리 매칭" value={d.platforms.kurly ?? 0} />
          <StatCard label="11번가 매칭" value={d.platforms["11st"] ?? 0} />
          <StatCard label="오아시스 매칭" value={d.platforms.oasis ?? 0} />
          <StatCard label="홈플러스 매칭" value={d.platforms.homeplus ?? 0} />
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
        <SectionHeader title="품질 관리" description="기준을 넘으면 주의 색으로 표시돼요" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard label="오매칭 의심 (low_score)" value={q.low_score_matches}
            tone={q.low_score_matches > 1000 ? "caution" : "default"}
            sub={q.low_score_matches > 1000 ? "1,000건 초과 — 확인 필요" : undefined} />
          <StatCard label="영양정보 없음" value={q.no_nutrition}
            tone={q.no_nutrition > 500 ? "caution" : "default"}
            sub={q.no_nutrition > 500 ? "500건 초과 — 확인 필요" : undefined} />
          <StatCard label="원재료 미연결" value={q.no_ingredients_linked} />
        </div>
      </section>

      {/* ── 사용자 분석 ── */}
      <section className="mb-8">
        <SectionHeader title="사용자 분석" />
        <div className="grid grid-cols-3 gap-3 mb-3">
          <StatCard label="온보딩 완료" value={u.total_profiles} />
          <StatCard label="리뷰 수" value={u.total_reviews} />
          <StatCard label="행동 기록" value={u.total_interactions} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <DistributionCard title="연령대" data={u.age_distribution} labels={AGE_LABELS} />
          <DistributionCard title="건강 관심사" data={u.concern_distribution} labels={CONCERN_LABELS} />
          <DistributionCard title="식습관" data={u.diet_distribution} labels={DIET_LABELS} />
        </div>
      </section>

      {/* ── 최근 7일 행동 추이 ── */}
      {Object.keys(u.daily_actions).length > 0 && (
        <section className="mb-8">
          <SectionHeader title="최근 7일 행동" />
          <Card padding="none" className="overflow-x-auto">
            <table className="w-full text-label">
              <thead>
                <tr className="border-b border-line text-caption text-ink-2">
                  <th className="text-left py-2.5 px-4 font-medium">날짜</th>
                  <th className="text-right py-2.5 px-4 font-medium">조회</th>
                  <th className="text-right py-2.5 px-4 font-medium">클릭</th>
                  <th className="text-right py-2.5 px-4 font-medium">전환율</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(u.daily_actions)
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([date, actions]) => (
                    <tr key={date} className="border-b border-line last:border-0">
                      <td className="py-2.5 px-4 num text-ink">{date}</td>
                      <td className="py-2.5 px-4 text-right num text-ink-2">{actions.views}</td>
                      <td className="py-2.5 px-4 text-right num text-ink-2">{actions.clicks}</td>
                      <td className="py-2.5 px-4 text-right num font-bold text-brand-ink">
                        {actions.views > 0 ? Math.round(actions.clicks / actions.views * 100) : 0}%
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}
    </Page>
  );
}
