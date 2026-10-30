"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

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

      // v4: 프로필 + 건강검진 데이터 전체 전송 → 5축 복합 프로필 기반 추천
      fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: parsed,
          health: healthData,
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
    <section className="px-4 pb-8">
      <div className="max-w-2xl mx-auto">
        {/* 섹션 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold">
            {sectionLabel} 추천
          </h2>
          <div className="flex gap-2">
            <Link
              href="/products"
              className="text-xs text-primary font-bold hover:underline"
            >
              전체 보기
            </Link>
          </div>
        </div>

        {/* 건강검진 입력 유도 배너 */}
        {!hasHealthData && (
          <Link
            href="/health"
            className="block mb-4 p-4 rounded-2xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-primary">건강검진 정보 입력하기</p>
                <p className="text-xs text-muted">혈당·혈압·콜레스테롤 입력하면 더 정확한 추천을 받아요</p>
              </div>
              <svg className="w-5 h-5 text-primary/50 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
              </svg>
            </div>
          </Link>
        )}

        {/* 가로 스크롤 제품 카드 */}
        {products.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
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
                  className="min-w-[160px] max-w-[180px] bg-card rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 transition-transform flex-shrink-0 block"
                >
                  {/* 이미지 영역 */}
                  <div className="h-[120px] bg-surface relative flex items-center justify-center">
                    {imageUrl ? (
                      <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <svg className="w-10 h-10 text-border" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M2 12c0 3.87 3.13 7 7 7h6c3.87 0 7-3.13 7-7H2zM12 4C7.58 4 4 6.69 4 10h16c0-3.31-3.58-6-8-6z" />
                      </svg>
                    )}
                    {/* 적합도 배지 */}
                    <div className="absolute top-2 left-2 bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                      적합도 {p.match_score}
                    </div>
                  </div>

                  {/* 정보 */}
                  <div className="p-3">
                    <h3 className="text-xs font-semibold leading-tight line-clamp-2 mb-1.5">
                      {p.name}
                    </h3>
                    {bestPrice && (
                      <p className="text-base font-extrabold">
                        {bestPrice.toLocaleString("ko-KR")}원
                      </p>
                    )}
                    {bestPlatform && (
                      <p className="text-[10px] text-muted">{bestPlatform} 외</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
