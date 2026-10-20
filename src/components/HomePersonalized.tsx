"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const PERSONA_LABELS: Record<string, string> = {
  elderly: "어르신",
  patient: "환자",
  pregnant: "산모",
  general: "일반",
};

const PERSONA_EMOJI: Record<string, string> = {
  elderly: "👴",
  patient: "🏥",
  pregnant: "🤰",
  general: "🥗",
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
    <section className="px-4 pb-8 -mt-6">
      <div className="max-w-4xl mx-auto">
        {/* 다시 오신 분 배너 */}
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl" aria-hidden="true">
                {PERSONA_EMOJI[profile.persona] || "🥗"}
              </span>
              <div>
                <h2 className="font-bold text-lg">
                  {PERSONA_LABELS[profile.persona] || "맞춤"} 추천
                </h2>
                <p className="text-sm text-muted">
                  이전 프로필 기반으로 빠르게 추천해드려요
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                href="/recommend"
                className="bg-primary text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors"
              >
                전체 추천 보기
              </Link>
              <Link
                href="/onboarding"
                className="border border-border px-4 py-2 rounded-xl text-sm font-medium hover:bg-card transition-colors"
              >
                프로필 수정
              </Link>
            </div>
          </div>
        </div>

        {/* 빠른 추천 카드 3개 */}
        {products.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                  className="bg-card rounded-xl border border-border p-4 hover:border-primary/30 hover:shadow-sm transition-all block"
                >
                  <div className="flex gap-3 mb-2">
                    {imageUrl && (
                      <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-border">
                        <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-sm leading-tight line-clamp-2">
                        {p.name}
                      </h3>
                      {bestPrice && (
                        <p className="text-primary font-bold text-sm mt-1">
                          {bestPrice.toLocaleString("ko-KR")}원
                          {bestPlatform && (
                            <span className="text-[10px] text-muted font-normal ml-1">
                              {bestPlatform}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  {p.reason_detail && (
                    <p className="text-xs text-primary bg-primary/5 rounded-lg px-2.5 py-1.5">
                      💡 {p.reason_detail}
                    </p>
                  )}
                  {!p.reason_detail && p.reasons.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {p.reasons.slice(0, 2).map((r) => (
                        <span key={r} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {r}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
