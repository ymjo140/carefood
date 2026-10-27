"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-3" />
          <p className="text-sm text-muted">인사이트 데이터 분석 중...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">데이터를 불러올 수 없습니다.</p>
      </div>
    );
  }

  const maxSupply = Math.max(...data.supplyGap.map((s) => s.supply));
  const maxCatCount = Math.max(...(data.dishDistribution || []).map((d) => d.count));

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/admin" className="text-sm text-muted hover:text-primary transition-colors">
              ← 관리자
            </Link>
          </div>
          <h1 className="text-2xl font-extrabold">시장 인사이트</h1>
          <p className="text-sm text-muted mt-1">
            {formatNum(data.overview.total_products)}개 식품 DB 기반 시장 분석 리포트
          </p>
        </div>
        <span className="text-xs text-muted bg-surface px-3 py-1.5 rounded-full">B2B</span>
      </div>

      {/* ── KPI 카드 ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: "전체 식품 DB", value: formatNum(data.overview.total_products), sub: "식약처 기반" },
          { label: "구매 가능 제품", value: formatNum(data.overview.purchasable), sub: `${((data.overview.purchasable / data.overview.total_products) * 100).toFixed(1)}%` },
          { label: "건강식단 서비스", value: `${data.overview.health_meal_products}개`, sub: "5곳 통합" },
          { label: "사용자 프로필", value: `${data.overview.total_profiles}명`, sub: "온보딩 완료" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-card rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-xs text-muted mb-1">{kpi.label}</p>
            <p className="text-xl font-extrabold">{kpi.value}</p>
            <p className="text-[10px] text-primary mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* ── 건강식단 서비스 비교 ── */}
      <section className="mb-8">
        <h2 className="text-lg font-extrabold mb-1">건강식단 서비스 비교</h2>
        <p className="text-xs text-muted mb-4">5개 건강식단 서비스의 제품 수·가격·건강점수 비교</p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted text-xs">
                <th className="text-left py-2.5 font-medium">서비스</th>
                <th className="text-right py-2.5 font-medium">메뉴 수</th>
                <th className="text-right py-2.5 font-medium">건강점수</th>
                <th className="text-right py-2.5 font-medium">최저가</th>
                <th className="text-right py-2.5 font-medium">평균가</th>
                <th className="text-right py-2.5 font-medium">최고가</th>
                <th className="text-right py-2.5 font-medium">종류</th>
              </tr>
            </thead>
            <tbody>
              {data.serviceCompare.map((svc) => (
                <tr key={svc.source} className="border-b border-border/50 hover:bg-card/50 transition-colors">
                  <td className="py-3 font-bold">{svc.name}</td>
                  <td className="py-3 text-right">{svc.product_count}</td>
                  <td className="py-3 text-right">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                      (svc.avg_health_score ?? 0) >= 80 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                    }`}>
                      {svc.avg_health_score ?? "-"}
                    </span>
                  </td>
                  <td className="py-3 text-right text-muted">{formatPrice(svc.min_price)}</td>
                  <td className="py-3 text-right font-medium">{formatPrice(svc.avg_price)}</td>
                  <td className="py-3 text-right text-muted">{formatPrice(svc.max_price)}</td>
                  <td className="py-3 text-right text-muted">{svc.dish_types}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── 건강 목표별 공급 분석 ── */}
      <section className="mb-8">
        <h2 className="text-lg font-extrabold mb-1">건강 목표별 제품 공급</h2>
        <p className="text-xs text-muted mb-4">
          구매 가능 제품 {formatNum(data.overview.purchasable)}개 중 각 기준 충족 제품 수
        </p>

        <div className="space-y-3">
          {data.supplyGap.map((gap) => {
            const ratio = data.overview.purchasable > 0 ? (gap.supply / data.overview.purchasable) * 100 : 0;
            const barWidth = maxSupply > 0 ? (gap.supply / maxSupply) * 100 : 0;
            return (
              <div key={gap.segment} className="flex items-center gap-3">
                <div className="w-20 shrink-0">
                  <span className="text-xs font-bold">{gap.label}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="h-6 bg-surface rounded-lg overflow-hidden relative">
                    <div
                      className="h-full bg-primary/20 rounded-lg transition-all"
                      style={{ width: `${barWidth}%` }}
                    />
                    <span className="absolute inset-0 flex items-center px-2 text-[10px] font-medium">
                      {gap.supply.toLocaleString()}개 ({ratio.toFixed(1)}%)
                    </span>
                  </div>
                </div>
                <span className="text-[10px] text-muted w-24 shrink-0 text-right">{gap.desc}</span>
              </div>
            );
          })}
        </div>

        <div className="mt-4 bg-accent/5 border border-accent/20 rounded-xl p-3">
          <p className="text-xs text-accent/90 font-medium">💡 공급 갭 인사이트</p>
          <p className="text-xs text-muted mt-1">
            초고단백(30g+)·고식이섬유(3g+) 제품이 전체의 {
              data.overview.purchasable > 0
                ? ((data.supplyGap.find(g => g.segment === "very_high_protein")?.supply ?? 0) / data.overview.purchasable * 100).toFixed(1)
                : "0"
            }%·{
              data.overview.purchasable > 0
                ? ((data.supplyGap.find(g => g.segment === "high_fiber")?.supply ?? 0) / data.overview.purchasable * 100).toFixed(1)
                : "0"
            }%로 공급 부족 영역. 해당 카테고리 제품 개발 기회.
          </p>
        </div>
      </section>

      {/* ── 카테고리별 영양 벤치마크 ── */}
      <section className="mb-8">
        <h2 className="text-lg font-extrabold mb-1">카테고리별 영양 벤치마크</h2>
        <p className="text-xs text-muted mb-4">음식 종류별 평균 영양성분 (100g 기준)</p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted text-xs">
                <th className="text-left py-2.5 font-medium">카테고리</th>
                <th className="text-right py-2.5 font-medium">제품 수</th>
                <th className="text-right py-2.5 font-medium">건강점수</th>
                <th className="text-right py-2.5 font-medium">칼로리</th>
                <th className="text-right py-2.5 font-medium">단백질</th>
                <th className="text-right py-2.5 font-medium">나트륨</th>
                <th className="text-right py-2.5 font-medium">당류</th>
              </tr>
            </thead>
            <tbody>
              {data.categoryHealth.map((cat) => (
                <tr key={cat.category} className="border-b border-border/50 hover:bg-card/50 transition-colors">
                  <td className="py-2.5 font-medium">{CAT_LABELS[cat.category] || cat.category}</td>
                  <td className="py-2.5 text-right text-muted">{cat.count}</td>
                  <td className="py-2.5 text-right">
                    {cat.avg_score != null && (
                      <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                        cat.avg_score >= 65 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : cat.avg_score >= 55 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                        : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                      }`}>
                        {cat.avg_score}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-right text-muted">{cat.avg_cal ?? "-"}kcal</td>
                  <td className="py-2.5 text-right text-muted">{cat.avg_protein ?? "-"}g</td>
                  <td className="py-2.5 text-right text-muted">{cat.avg_sodium ?? "-"}mg</td>
                  <td className="py-2.5 text-right text-muted">{cat.avg_sugar ?? "-"}g</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── 제품 종류 분포 ── */}
      <section className="mb-8">
        <h2 className="text-lg font-extrabold mb-1">구매 가능 제품 분포</h2>
        <p className="text-xs text-muted mb-4">음식 종류별 제품 수</p>

        <div className="space-y-2">
          {(data.dishDistribution || []).map((d) => (
            <div key={d.category} className="flex items-center gap-3">
              <span className="w-24 text-xs font-medium shrink-0 truncate">{CAT_LABELS[d.category] || d.category}</span>
              <div className="flex-1 min-w-0">
                <div className="h-5 bg-surface rounded overflow-hidden">
                  <div
                    className="h-full bg-primary/30 rounded transition-all"
                    style={{ width: `${maxCatCount > 0 ? (d.count / maxCatCount) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <span className="text-xs text-muted w-14 text-right shrink-0">{d.count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── 기회 영역 ── */}
      {data.opportunity && data.opportunity.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-extrabold mb-1">제품 개발 기회 영역</h2>
          <p className="text-xs text-muted mb-4">
            건강점수 높지만 제품 수 적은 카테고리 = 공급 부족 + 높은 수요 잠재
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {data.opportunity.map((opp) => (
              <div key={opp.category} className="bg-card rounded-xl p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <p className="text-xs text-muted mb-1">{CAT_LABELS[opp.category] || opp.category}</p>
                <p className="text-lg font-extrabold">{opp.avg_score}</p>
                <p className="text-[10px] text-muted">건강점수 평균</p>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                  <span className="text-[10px] text-muted">{opp.supply}개</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    기회 {opp.opportunity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 하단 면책 ── */}
      <div className="text-[10px] text-muted text-center py-6 border-t border-border">
        본 리포트는 식약처 영양성분 데이터베이스 기반 통계 분석이며, 개별 제품의 품질을 보증하지 않습니다.
      </div>
    </div>
  );
}
