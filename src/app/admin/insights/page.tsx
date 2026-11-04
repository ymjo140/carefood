"use client";

import { useEffect, useState } from "react";
import {
  Badge, Card, EmptyState, Notice, Page, PageHeader, PageLoading, ProgressBar, SectionHeader, Stat, cn,
  type BadgeTone,
} from "@/components/ui";
import { LinkTabs, ADMIN_TABS } from "@/components/ui/LinkTabs";

/* ── 타입 ── */
type InsightData = {
  overview: {
    total_products: number;
    purchasable: number;
    health_meal_products: number;
    total_profiles: number;
  };
  categoryHealth: {
    category: string;
    count: number;
    avg_score: number | null;
    avg_cal: number | null;
    avg_protein: number | null;
    avg_sodium: number | null;
    avg_sugar: number | null;
  }[];
  supplyGap: {
    segment: string;
    label: string;
    desc: string;
    supply: number;
  }[];
  serviceCompare: {
    source: string;
    name: string;
    product_count: number;
    avg_health_score: number | null;
    min_price: number | null;
    avg_price: number | null;
    max_price: number | null;
    dish_types: number;
  }[];
  opportunity: {
    category: string;
    supply: number;
    avg_score: number;
    opportunity: number;
  }[];
  dishDistribution: {
    category: string;
    count: number;
  }[];
};

const CAT_LABELS: Record<string, string> = {
  snack: "간식/과자",
  beverage: "음료/차",
  sauce: "소스/양념",
  side: "반찬/밑반찬",
  soup: "국/탕/찌개",
  rice: "밥/죽/덮밥",
  noodle: "면/파스타",
  grill: "구이/스테이크",
  seafood: "해산물",
  dairy: "유제품",
  salad: "샐러드/채소",
  bread: "빵/베이커리",
  ingredient: "식재료",
  powder: "분말/선식",
  supplement: "건강기능식품",
  set: "세트/도시락",
  other: "기타",
};

function formatNum(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}천`;
  return n.toLocaleString();
}

function formatPrice(n: number | null): string {
  if (n == null) return "-";
  return `${n.toLocaleString()}원`;
}

/** 건강점수 → 배지 색 (높음 positive / 보통 caution / 낮음 danger) */
function scoreTone(score: number, high: number, mid?: number): BadgeTone {
  if (score >= high) return "positive";
  if (mid == null || score >= mid) return "caution";
  return "danger";
}

const TH = "py-2.5 px-3 font-medium";
const TD = "py-2.5 px-3";

/* ── 메인 ── */
export default function InsightsPage() {
  const [data, setData] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/insights")
      .then((r) => r.json())
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

  const maxSupply = Math.max(...data.supplyGap.map((s) => s.supply));
  const maxCatCount = Math.max(...(data.dishDistribution || []).map((d) => d.count));

  return (
    <Page width="wide">
      <PageHeader
        title="시장 인사이트"
        description={`${formatNum(data.overview.total_products)}개 식품 DB 기반 시장 분석 리포트`}
        actions={<Badge>B2B</Badge>}
      />

      <LinkTabs items={ADMIN_TABS} current="/admin/insights" label="관리자 메뉴" className="mb-6" />

      {/* ── KPI ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: "전체 식품 DB", value: formatNum(data.overview.total_products), sub: "식약처 기반" },
          { label: "구매 가능 제품", value: formatNum(data.overview.purchasable), sub: `${((data.overview.purchasable / data.overview.total_products) * 100).toFixed(1)}%` },
          { label: "건강식단 서비스", value: `${data.overview.health_meal_products}개`, sub: "5곳 통합" },
          { label: "사용자 프로필", value: `${data.overview.total_profiles}명`, sub: "온보딩 완료" },
        ].map((kpi, i) => (
          <Card key={kpi.label}>
            <Stat label={kpi.label} value={kpi.value} emphasis={i === 0} />
            <p className="text-caption text-brand-ink mt-1">{kpi.sub}</p>
          </Card>
        ))}
      </div>

      {/* ── 건강식단 서비스 비교 ── */}
      <section className="mb-8">
        <SectionHeader title="건강식단 서비스 비교" description="5개 건강식단 서비스의 제품 수·가격·건강점수 비교" />
        <Card padding="none" className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-label">
            <thead>
              <tr className="border-b border-line text-caption text-ink-2">
                <th className={cn(TH, "text-left")}>서비스</th>
                <th className={cn(TH, "text-right")}>메뉴 수</th>
                <th className={cn(TH, "text-right")}>건강점수</th>
                <th className={cn(TH, "text-right")}>최저가</th>
                <th className={cn(TH, "text-right")}>평균가</th>
                <th className={cn(TH, "text-right")}>최고가</th>
                <th className={cn(TH, "text-right")}>종류</th>
              </tr>
            </thead>
            <tbody>
              {data.serviceCompare.map((svc) => (
                <tr key={svc.source} className="border-b border-line last:border-0">
                  <td className={cn(TD, "font-bold text-ink")}>{svc.name}</td>
                  <td className={cn(TD, "text-right num text-ink")}>{svc.product_count}</td>
                  <td className={cn(TD, "text-right")}>
                    <Badge tone={scoreTone(svc.avg_health_score ?? 0, 80)}>
                      <span className="num">{svc.avg_health_score ?? "-"}</span>
                    </Badge>
                  </td>
                  <td className={cn(TD, "text-right num text-ink-2")}>{formatPrice(svc.min_price)}</td>
                  <td className={cn(TD, "text-right num font-medium text-ink")}>{formatPrice(svc.avg_price)}</td>
                  <td className={cn(TD, "text-right num text-ink-2")}>{formatPrice(svc.max_price)}</td>
                  <td className={cn(TD, "text-right num text-ink-2")}>{svc.dish_types}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      {/* ── 건강 목표별 공급 분석 ── */}
      <section className="mb-8">
        <SectionHeader
          title="건강 목표별 제품 공급"
          description={`구매 가능 제품 ${formatNum(data.overview.purchasable)}개 중 각 기준 충족 제품 수`}
        />
        <Card>
          <div className="flex flex-col gap-4">
            {data.supplyGap.map((gap) => {
              const ratio = data.overview.purchasable > 0 ? (gap.supply / data.overview.purchasable) * 100 : 0;
              return (
                <div key={gap.segment} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                  <span className="text-label font-bold text-ink sm:w-24 shrink-0">{gap.label}</span>
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <ProgressBar value={gap.supply} max={maxSupply} label={gap.label} />
                    <span className="text-caption text-ink-2">
                      <span className="num font-bold text-ink">{gap.supply.toLocaleString()}</span>개 (<span className="num">{ratio.toFixed(1)}</span>%)
                    </span>
                  </div>
                  <span className="text-caption text-ink-3 sm:w-32 shrink-0 sm:text-right">{gap.desc}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Notice tone="brand" title="공급 갭 인사이트" className="mt-3">
          초고단백(30g+)·고식이섬유(3g+) 제품이 전체의 {
            data.overview.purchasable > 0
              ? ((data.supplyGap.find(g => g.segment === "very_high_protein")?.supply ?? 0) / data.overview.purchasable * 100).toFixed(1)
              : "0"
          }%·{
            data.overview.purchasable > 0
              ? ((data.supplyGap.find(g => g.segment === "high_fiber")?.supply ?? 0) / data.overview.purchasable * 100).toFixed(1)
              : "0"
          }%로 공급 부족 영역. 해당 카테고리 제품 개발 기회.
        </Notice>
      </section>

      {/* ── 카테고리별 영양 벤치마크 ── */}
      <section className="mb-8">
        <SectionHeader title="카테고리별 영양 벤치마크" description="음식 종류별 평균 영양성분 (100g 기준)" />
        <Card padding="none" className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-label">
            <thead>
              <tr className="border-b border-line text-caption text-ink-2">
                <th className={cn(TH, "text-left")}>카테고리</th>
                <th className={cn(TH, "text-right")}>제품 수</th>
                <th className={cn(TH, "text-right")}>건강점수</th>
                <th className={cn(TH, "text-right")}>칼로리</th>
                <th className={cn(TH, "text-right")}>단백질</th>
                <th className={cn(TH, "text-right")}>나트륨</th>
                <th className={cn(TH, "text-right")}>당류</th>
              </tr>
            </thead>
            <tbody>
              {data.categoryHealth.map((cat) => (
                <tr key={cat.category} className="border-b border-line last:border-0">
                  <td className={cn(TD, "font-medium text-ink")}>{CAT_LABELS[cat.category] || cat.category}</td>
                  <td className={cn(TD, "text-right num text-ink-2")}>{cat.count}</td>
                  <td className={cn(TD, "text-right")}>
                    {cat.avg_score != null && (
                      <Badge tone={scoreTone(cat.avg_score, 65, 55)}>
                        <span className="num">{cat.avg_score}</span>
                      </Badge>
                    )}
                  </td>
                  <td className={cn(TD, "text-right num text-ink-2")}>{cat.avg_cal ?? "-"}kcal</td>
                  <td className={cn(TD, "text-right num text-ink-2")}>{cat.avg_protein ?? "-"}g</td>
                  <td className={cn(TD, "text-right num text-ink-2")}>{cat.avg_sodium ?? "-"}mg</td>
                  <td className={cn(TD, "text-right num text-ink-2")}>{cat.avg_sugar ?? "-"}g</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      {/* ── 제품 종류 분포 ── */}
      <section className="mb-8">
        <SectionHeader title="구매 가능 제품 분포" description="음식 종류별 제품 수" />
        <Card>
          <div className="flex flex-col gap-2.5">
            {(data.dishDistribution || []).map((d) => (
              <div key={d.category} className="flex items-center gap-3">
                <span className="w-24 text-caption font-medium text-ink shrink-0 truncate">{CAT_LABELS[d.category] || d.category}</span>
                <ProgressBar value={d.count} max={maxCatCount} label={CAT_LABELS[d.category] || d.category} className="flex-1" />
                <span className="num text-caption text-ink-2 w-14 text-right shrink-0">{d.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* ── 기회 영역 ── */}
      {data.opportunity && data.opportunity.length > 0 && (
        <section className="mb-8">
          <SectionHeader
            title="제품 개발 기회 영역"
            description="건강점수 높지만 제품 수 적은 카테고리 = 공급 부족 + 높은 수요 잠재"
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {data.opportunity.map((opp) => (
              <Card key={opp.category}>
                <p className="text-caption text-ink-2 mb-1">{CAT_LABELS[opp.category] || opp.category}</p>
                <Stat label="건강점수 평균" value={opp.avg_score} />
                <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-line">
                  <span className="text-caption text-ink-2"><span className="num">{opp.supply}</span>개</span>
                  <Badge tone="brand">기회 <span className="num">{opp.opportunity}</span></Badge>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ── 하단 면책 ── */}
      <p className="text-caption text-ink-3 text-center py-6 border-t border-line">
        본 리포트는 식약처 영양성분 데이터베이스 기반 통계 분석이며, 개별 제품의 품질을 보증하지 않습니다.
      </p>
    </Page>
  );
}
