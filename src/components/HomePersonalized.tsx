"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const PERSONA_LABELS: Record<string, string> = {
  elderly: "어르신",
  patient: "환자",
  pregnant: "산모",
  general: "일반",
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
 * 로드맵: "재주문 마찰 0", "가입 전 추천 체험"
 */
export default function HomePersonalized() {
  const [profile, setProfile] = useState<any>(null);
  const [products, setProducts] = useState<QuickProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("carefood_profile");
      if (!raw) {
        setLoading(false);
        return;
      }
      const parsed = JSON.parse(raw);
      setProfile(parsed);

      // 빠른 추천 3개 가져오기
      fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona: parsed.persona,
          conditions: parsed.conditions || [],
          allergies: parsed.allergies || [],
          pregnancyStage: parsed.pregnancyStage || "",
          healthGoal: parsed.healthGoal || "",
          tastes: parsed.tastes || { salty: 3, sweet: 3, spicy: 3, fatty: 3 },
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

  return (
    <section className="px-4 pb-8">
      <div className="max-w-2xl mx-auto">
        {/* 섹션 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold">
            {PERSONA_LABELS[profile.persona] || "맞춤"} 추천
          </h2>
          <div className="flex gap-2">
            <Link
              href="/recommend"
              className="text-xs text-primary font-bold hover:underline"
            >
              전체 보기
            </Link>
          </div>
        </div>

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
