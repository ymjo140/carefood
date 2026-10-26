"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type SimilarProduct = {
  id: string;
  name: string;
  manufacturer: string | null;
  calories: number | null;
  protein_g: number | null;
  popularity_score: number;
  product_prices: { platform: string; price: number; url: string; image_url: string | null }[];
};

const PLATFORM_LABELS: Record<string, string> = {
  kurly: "컬리", oasis: "오아시스", homeplus: "홈플러스", "11st": "11번가",
};

export default function HomeSimilarUsers() {
  const [products, setProducts] = useState<SimilarProduct[]>([]);
  const [segmentLabel, setSegmentLabel] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("carefood_profile");
      if (!raw) { setLoading(false); return; }
      const profile = JSON.parse(raw);

      const params = new URLSearchParams();
      if (profile.age_group) params.set("age_group", profile.age_group);
      if (profile.gender) params.set("gender", profile.gender);
      if (profile.concerns?.length > 0) params.set("concern", profile.concerns[0]);
      params.set("limit", "6");

      if (!params.get("age_group") && !params.get("concern")) {
        setLoading(false);
        return;
      }

      fetch(`/api/recommend/similar-users?${params.toString()}`)
        .then(r => r.json())
        .then(data => {
          setProducts(data.products || []);
          setSegmentLabel(data.segment_label || "");
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } catch {
      setLoading(false);
    }
  }, []);

  if (loading || products.length === 0) return null;

  return (
    <section className="px-4 pb-8">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-lg font-extrabold mb-1">
          {segmentLabel} 사람들이 많이 본 제품
        </h2>
        <p className="text-xs text-muted mb-4">비슷한 프로필의 사용자 행동 기반</p>

        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
          {products.map(p => {
            const prices = p.product_prices?.filter(pp => pp.price > 0) || [];
            const bestPrice = prices.length > 0 ? Math.min(...prices.map(pp => pp.price)) : null;
            const imageUrl = prices.find(pp => pp.image_url)?.image_url;

            return (
              <Link key={p.id} href={`/products/${p.id}`}
                className="min-w-[160px] max-w-[180px] border border-border rounded-xl overflow-hidden hover:shadow-sm transition-all flex-shrink-0 block">
                <div className="h-[100px] bg-surface flex items-center justify-center">
                  {imageUrl ? (
                    <img src={imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <svg className="w-8 h-8 text-border" viewBox="0 0 24 24" fill="currentColor"
                      style={{ minHeight: "unset", minWidth: "unset" }}>
                      <path d="M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11 8.76l1-1.36 1 1.36L15.38 12 17 10.83 14.92 8H20v6z"/>
                    </svg>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="text-xs font-semibold leading-tight line-clamp-2 mb-1">{p.name}</h3>
                  {bestPrice && (
                    <p className="text-sm font-bold">{bestPrice.toLocaleString("ko-KR")}원</p>
                  )}
                  {prices[0] && (
                    <p className="text-[10px] text-muted">
                      {PLATFORM_LABELS[prices[0].platform] || prices[0].platform}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
