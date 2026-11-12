"use client";

import { useState, useEffect } from "react";
import { PLATFORM_LABELS } from "@/lib/platforms";
import Link from "next/link";
import { Badge, Price, SectionHeader, TextLink } from "@/components/ui";

const CONCERN_LABELS: Record<string, string> = {
  gut_health: "장건강",
  skin: "피부건강",
  weight: "체중관리",
  energy: "활력충전",
  balanced: "균형식단",
  weight_loss: "체중관리",
  muscle: "근력강화",
  diabetes: "당뇨 관심",
  blood_pressure: "혈압 관심",
  kidney: "신장 관심",
};

type QuickProduct = {
  id: string;
  name: string;
  match_score: number;
  category_large?: string | null;
  dish_category?: string | null;
  is_exploration?: boolean;
  meal_role?: string | null;
  variant_count?: number;
  slot?: string;
  reason_detail: string | null;
  match_reasons?: string[];
  product_prices: { platform: string; price: number; url: string; image_url: string | null }[];
};


/**
 * 홈 추천 세 칸 (추천 유형화 설계 v3)
 * 1. 내 프로필에 가장 잘 맞는 것  2. 건강식단 서비스 중 가장 잘 맞는 것  3. 평소 안 보던 종류 (필터 버블 방지)
 * 해당하는 게 없으면 다음 순위로 채운다.
 */
function pickSlots(list: QuickProduct[]): QuickProduct[] {
  const out: QuickProduct[] = [];
  const used = new Set<string>();
  const take = (p: QuickProduct | undefined, slot: string) => { if (p && !used.has(p.id)) { used.add(p.id); out.push({ ...p, slot }); } };
  // 1칸: 추천 상위 10개 중 매칭 점수(맛 40·영양 60)가 가장 높은 것 — 라벨과 숫자가 어긋나지 않게
  //  한 끼·반찬(meal_role)이 있으면 그중에서 — 분말·음료가 '가장 잘 맞아요'에 오르지 않게
  const pool = list.filter((p) => !p.is_exploration).slice(0, 10);
  const meals = pool.filter((p) => p.meal_role === "meal" || p.meal_role === "side");
  const top = meals.length ? meals : pool;
  take(top.reduce<QuickProduct | undefined>((b, p) => (!b || p.match_score > b.match_score ? p : b), undefined) || list[0], "가장 잘 맞아요");
  take(list.find((p) => !used.has(p.id) && p.category_large === "건강식단서비스"), "건강식단 서비스");
  const firstCat = out[0]?.dish_category;
  take(list.find((p) => !used.has(p.id) && (p.is_exploration || (p.dish_category && p.dish_category !== firstCat))), "새로 시도해 보기");
  for (const p of list) { if (out.length >= 3) break; take(p, "잘 맞아요"); }
  return out;
}

/**
 * 홈 개인화 섹션 — 재방문 사용자에게 빠른 추천 카드 표시
 * 이너케어 방식: concerns 기반
 */
export default function HomePersonalized({ cold = false }: { cold?: boolean }) {
  const [profile, setProfile] = useState<any>(null);
  const [products, setProducts] = useState<QuickProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasHealthData, setHasHealthData] = useState(false);
  const [learned, setLearned] = useState(0);

  useEffect(() => {
    // 첫 방문: 프로필 없이 '지금 살 수 있는 건강한 한 끼' (적합도 없음)
    if (cold) {
      fetch("/api/recommend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cold: true }) })
        .then((r) => r.json())
        .then((data) => setProducts((data.recommendations || []).slice(0, 6)))
        .catch(console.error) // ds-allow: 첫 방문 추천은 보조 — 못 불러오면 칸을 숨긴다
        .finally(() => setLoading(false));
      return;
    }
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
      } catch { /* silent */ } // ds-allow: 로컬 프로필 읽기

      // v5: 프로필 + 건강검진 → 5축 복합 프로필 + 피드백 루프 반영 추천 (사용자 행동은 서버가 쿠키로 찾는다)
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
          setProducts(pickSlots(data.recommendations || []));
          setLearned(data.learned?.samples || 0);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } catch {
      setLoading(false);
    }
  }, [cold]);

  if (cold) {
    if (loading || products.length === 0) return null;
    return (
      <section className="pt-8">
        <SectionHeader title="지금 살 수 있는 건강한 한 끼" />
        <p className="text-label text-ink-2 -mt-1 mb-3">건강 점수가 높은 한 끼·반찬이에요. 목표를 알려 주면 맞춰 골라요</p>
        <ProductCards products={products} showMatch={false} />
      </section>
    );
  }

  if (loading || !profile) return null;

  // 섹션 헤더 라벨: 고른 목표 → v2 concerns → v1 persona
  //   (concerns 는 목표 일부만 옮겨 담아 '근력 강화'를 골라도 기본값 '활력충전'으로 보였다)
  const sectionLabel = (() => {
    const goalLabels = ((profile.goals || []) as string[]).map((g) => CONCERN_LABELS[g]).filter(Boolean);
    if (goalLabels.length > 0) return [...new Set(goalLabels)].join(" · ");
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
    <section className="pt-8">
      {/* 전체 목록은 바로 아래 '전체 제품'이 맡는다 */}
      <SectionHeader title={`${sectionLabel} 추천`} />

      {products.length > 0 && <ProductCards products={products} showMatch />}
      {learned > 0 && <p className="text-caption text-ink-2 mt-1">맛 평가 <span className="num">{learned}</span>개로 입맛을 맞춰 골랐어요</p>}

      {/* 건강검진 입력 유도 — 추천을 가리지 않게 한 줄로 */}
      {!hasHealthData && (
        <p className="text-label text-ink-2 mt-2">
          혈당·혈압을 입력하면 더 정확하게 골라요 · <TextLink href="/health">건강검진 정보 입력하기</TextLink>
        </p>
      )}
    </section>
  );
}

/** 가로로 넘기는 제품 카드 — 홈 추천·첫 방문 추천이 같이 쓴다 */
function ProductCards({ products, showMatch }: { products: QuickProduct[]; showMatch: boolean }) {
  return (
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
            {imageUrl && <img src={imageUrl} alt="" className="w-full h-full object-cover" loading="lazy"
              onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} /> /* 판매처 이미지가 안 열리면 깨진 그림 대신 빈 칸 */}
            {showMatch && <Badge tone="brand" className="absolute top-2 left-2 bg-surface">적합도 <span className="num">{p.match_score}</span></Badge>}
          </div>
          <div className="p-3">
            {p.slot && <p className="text-caption font-medium text-brand-ink mb-0.5">{p.slot}</p>}
            <h3 className="text-label font-medium text-ink line-clamp-2 mb-1.5">{p.name}</h3>
            {p.reason_detail && <p className="text-caption text-ink-2 line-clamp-2 mb-1">{p.reason_detail}</p>}
            {bestPrice && <Price value={bestPrice} className="text-body" />}
            {bestPlatform && <p className="text-caption text-ink-2">{bestPlatform} 외</p>}
            {!!p.variant_count && <p className="text-caption text-ink-2">다른 맛·용량 <span className="num">{p.variant_count}</span>가지 더</p>}
          </div>
        </Link>
      );
    })}
  </div>
  );
}
