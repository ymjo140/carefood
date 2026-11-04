"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Badge, Card, Icon, Price, SectionHeader, TextLink } from "@/components/ui";

const CONCERN_LABELS: Record<string, string> = {
  gut_health: "장건강",
  skin: "피부건강",
  weight: "체중관리",
  energy: "활력충전",
};

type QuickProduct = {
  id: string;
  name: string;
  match_score: number;
  reason_detail: string | null;
  reasons: string[];
  product_prices: { platform: string; price: number; url: string; image_url: string | null }[];
};

const PLATFORM_LABELS: Record<string, string> = {
  kurly: "컬리",
  oasis: "오아시스",
  homeplus: "홈플러스",
  "11st": "11번가",
};

/**
 * 홈 개인화 섹션 — 재방문 사용자에게 빠른 추천 카드 표시
 * 이너케어 방식: concerns 기반
 */
export default function HomePersonalized() {
  const [profile, setProfile] = useState<any>(null);
  const [products, setProducts] = useState<QuickProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasHealthData, setHasHealthData] = useState(false);

  useEffect(() => {
    try {
      // 건강검진 데이터 유무 확인
      const healthRaw = localStorage.getItem("carefood_health");
      if (healthRaw) setHasHealthData(true);

      const raw = localStorage.getItem("carefood_profile");
      if (!raw) {
        setLoading(false);
        return;
      }
      const parsed = JSON.parse(raw);
      setProfile(parsed);

      // 건강검진 데이터
      let healthData: Record<string, unknown> | null = null;
      try {
        const healthRaw = localStorage.getItem("carefood_health");
        if (healthRaw) {
          healthData = JSON.parse(healthRaw);
        }
      } catch { /* silent */ }

      // v5: 프로필 + 건강검진 + user_id → 5축 복합 프로필 + 피드백 루프 반영 추천
      const anonId = (() => { try { return localStorage.getItem("carefood_anon_id") || ""; } catch { return ""; } })();
      fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: parsed,
          health: healthData,
          user_id: anonId,
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          setProducts((data.recommendations || []).slice(0, 3));
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } catch {
      setLoading(false);
    }
  }, []);

  if (loading || !profile) return null;

  // 섹션 헤더 라벨: v2 concerns 우선, v1 persona 폴백
  const sectionLabel = (() => {
    if (profile.concerns && profile.concerns.length > 0) {
      return profile.concerns.map((c: string) => CONCERN_LABELS[c] || c).join(" · ");
    }
    // v1 레거시
    const legacyLabels: Record<string, string> = {
      elderly: "어르신",
      patient: "환자",
      pregnant: "산모",
      general: "일반",
    };
    return legacyLabels[profile.persona] || "맞춤";
  })();

  return (
    <section className="py-6">
      <SectionHeader
        title={`${sectionLabel} 추천`}
        action={<TextLink href="/products">전체 보기 <Icon name="chevron-right" size={16} /></TextLink>}
      />

      {/* 건강검진 입력 유도 */}
      {!hasHealthData && (
        <Link href="/health" className="block rounded-lg mb-4">
          <Card tone="brand" interactive>
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-label font-bold text-brand-ink">건강검진 정보 입력하기</p>
                <p className="text-caption text-ink-2 mt-0.5">혈당·혈압·콜레스테롤을 입력하면 더 정확한 추천을 받아요</p>
              </div>
              <Icon name="chevron-right" size={20} className="text-brand-ink shrink-0" />
            </div>
          </Card>
        </Link>
      )}

      {/* 가로 스크롤 제품 카드 */}
      {products.length > 0 && (
        <div className="flex gap-3 scroll-row -mx-4 px-4 pb-2">
          {products.map((p) => {
            const prices = p.product_prices?.filter((pp) => pp.price > 0) || [];
            const bestPrice = prices.length > 0 ? Math.min(...prices.map((pp) => pp.price)) : null;
            const imageUrl = prices.find((pp) => pp.image_url)?.image_url;
            const bestPlatform = prices[0]
              ? PLATFORM_LABELS[prices[0].platform] || prices[0].platform
              : null;

            return (
              <Link
                key={p.id}
                href={`/products/${p.id}`}
                className="block w-44 shrink-0 rounded-lg border border-line bg-surface overflow-hidden transition-colors hover:border-line-strong"
              >
                <div className="h-28 bg-sunken relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {imageUrl && <img src={imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />}
                  <Badge tone="brand" className="absolute top-2 left-2">적합도 <span className="num">{p.match_score}</span></Badge>
                </div>
                <div className="p-3">
                  <h3 className="text-label font-medium text-ink line-clamp-2 mb-1.5">{p.name}</h3>
                  {bestPrice && <Price value={bestPrice} className="text-body" />}
                  {bestPlatform && <p className="text-caption text-ink-2">{bestPlatform} 외</p>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
