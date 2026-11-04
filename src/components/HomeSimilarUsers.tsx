"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Price, SectionHeader } from "@/components/ui";

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
    <section className="py-6">
      <SectionHeader title={`${segmentLabel} 사람들이 많이 본 제품`} description="비슷한 프로필의 사용자 행동 기반" />

      <div className="flex gap-3 scroll-row -mx-4 px-4 pb-2">
        {products.map(p => {
          const prices = p.product_prices?.filter(pp => pp.price > 0) || [];
          const bestPrice = prices.length > 0 ? Math.min(...prices.map(pp => pp.price)) : null;
          const imageUrl = prices.find(pp => pp.image_url)?.image_url;

          return (
            <Link key={p.id} href={`/products/${p.id}`}
              className="block w-44 shrink-0 rounded-lg border border-line bg-surface overflow-hidden transition-colors hover:border-line-strong">
              <div className="h-24 bg-sunken">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {imageUrl && <img src={imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />}
              </div>
              <div className="p-3">
                <h3 className="text-label font-medium text-ink line-clamp-2 mb-1">{p.name}</h3>
                {bestPrice && <Price value={bestPrice} className="text-label" />}
                {prices[0] && (
                  <p className="text-caption text-ink-2">
                    {PLATFORM_LABELS[prices[0].platform] || prices[0].platform}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
