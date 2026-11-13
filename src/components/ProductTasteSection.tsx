"use client";

import { useState, useEffect } from "react";
import DualRadarChart from "./DualRadarChart";
import { Card, Estimate, Notice, SectionHeader, TextLink, cn } from "@/components/ui";
import { parseProfile, scoreProduct } from "@/lib/recommend";
import { productTaste, cleanTastes } from "@/lib/recommend/taste";

type ReviewTasteData = {
  avgSalty: number;   // 1~5, 0=데이터없음
  avgSweet: number;
  avgSpicy: number;
  avgFatty: number;
  reviewCount: number;
};

type Props = {
  productId: string;
  productName: string;
  /** 제품 영양 데이터 (1회 제공량 기준) */
  nutrition: {
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    fiber_g: number | null;
    sugar_g?: number | null;
    sodium_mg: number | null;
    spicy_score: number | null;
  };
  /** 리뷰 기반 맛 체감 평균 (있으면 영양 예측을 보정) */
  reviewTaste?: ReviewTasteData;
  /** 영양값이 음식에 비해 말이 안 되게 낮아 믿기 어려움 (products.nutrition_flag) — 영양·매칭 점수를 보이지 않는다 */
  nutritionUnreliable?: boolean;
  /** 100g 기준 제품 행 — 적합도·맛 단계를 목록과 같은 식(lib/recommend)으로 */
  scoreRow: Record<string, unknown>;
};

/**
 * 영양성분 → 맛 프로필 예측 (1~5 스케일)
 * 영양성분 + spicy_score에서 알 수 있는 5축 사용
 * 짠맛(나트륨), 단맛(당류비율), 고소함(지방), 담백함(단백질밀도), 매운맛(spicy_score)
 */
function predictTasteFromNutrition(row: Record<string, unknown>) {
  // 목록 추천과 같은 1~10 단계(lib/recommend/taste — 저장된 맛 값 우선)를 1~5 로. 모르면 가운데
  const lv = productTaste(row);
  const half = (v: number | undefined, unknown = 2.5) => (v === undefined ? unknown : Math.max(1, Math.min(5, Math.round(v / 2))));
  return { salty: half(lv.salty), sweet: half(lv.sweet), savory: half(lv.fatty), spicy: half(lv.spicy, 1), sour: half(lv.sour, 1), umami: half(lv.umami, 1) };
}

/**
 * 영양 데이터를 1~5 스케일로 변환
 * 단백질: 높을수록 좋음 · 저당(당류)·저염도: 낮을수록 좋음
 * 탄수/지방: 적당하면 좋음
 * 나트륨: 낮을수록 좋음
 */
function toNutritionProfile(n: Props["nutrition"]) {
  const protein = n.protein_g != null
    ? Math.min(5, Math.max(1, Math.round(n.protein_g / 7) + 1))
    : 2.5;

  const carbVal = n.carbs_g ?? 40;
  const carbs = carbVal <= 60
    ? Math.min(5, Math.max(1, Math.round(carbVal / 15) + 1))
    : Math.max(1, 5 - Math.round((carbVal - 60) / 20));

  const fatVal = n.fat_g ?? 10;
  const fat = fatVal <= 20
    ? Math.min(5, Math.max(1, Math.round(fatVal / 5) + 1))
    : Math.max(1, 5 - Math.round((fatVal - 20) / 10));

  // 넷째 축은 저당 — 식이섬유는 DB 에 믿을 만한 값이 없어(2026-11 정리) 당류로 바꿨다. 값이 없으면 가운데
  const fiber = n.sugar_g != null
    ? Math.min(5, Math.max(1, 5 - Math.round(n.sugar_g / 6)))
    : 3;

  const balance = n.sodium_mg != null
    ? Math.min(5, Math.max(1, 5 - Math.round(n.sodium_mg / 400)))
    : 3;

  return { protein, carbs, fat, fiber, vitamins: balance };
}

export default function ProductTasteSection({ nutrition, reviewTaste, scoreRow, nutritionUnreliable }: Props) {
  // 내 프로필 — 홈 추천·탐색과 같은 carefood_profile (입맛 1~10) · carefood_health
  const [mine, setMine] = useState<{ profile: Record<string, unknown>; health: Record<string, unknown> | null } | null>(null);
  const [learnedFrom, setLearnedFrom] = useState(0);

  useEffect(() => {
    let alive = true;
    try {
      const raw = localStorage.getItem("carefood_profile");
      const health = localStorage.getItem("carefood_health");
      if (!raw) return;
      const profile = JSON.parse(raw);
      setMine({ profile, health: health ? JSON.parse(health) : null }); // eslint-disable-line react-hooks/set-state-in-effect -- 브라우저 저장소는 그린 뒤에만 읽을 수 있다
      // 내 맛 평가로 맞춘 입맛 — 목록의 적합도와 같은 값이 나오게
      fetch("/api/recommend/taste", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tastes: profile.tastes }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!alive || !d?.samples) return;
          setLearnedFrom(d.samples);
          setMine((m) => (m ? { ...m, profile: { ...m.profile, tastes: d.tastes } } : m));
        })
        .catch(() => {}); // ds-allow: 보정 못 하면 고른 입맛 그대로 보인다
    } catch { /* ds-allow: 저장된 프로필을 못 읽으면 영양 점수만 보인다 */ }
    return () => { alive = false; };
  }, []);

  // 맛 프로필: 영양성분 예측 + 리뷰 체감 보정
  const predicted = predictTasteFromNutrition(scoreRow);
  const reviewCount = reviewTaste?.reviewCount || 0;
  const estimated = reviewCount < 2; // 맛 평가가 2건 모이기 전엔 영양성분으로 추정한 맛
  const tasteProfile = !estimated && reviewTaste
    ? {
        // 리뷰 2건 이상이면 리뷰 70% + 예측 30% 블렌딩
        salty: reviewTaste.avgSalty > 0
          ? Math.round((predicted.salty * 0.3 + reviewTaste.avgSalty * 0.7) * 10) / 10
          : predicted.salty,
        sweet: reviewTaste.avgSweet > 0
          ? Math.round((predicted.sweet * 0.3 + reviewTaste.avgSweet * 0.7) * 10) / 10
          : predicted.sweet,
        savory: reviewTaste.avgFatty > 0
          ? Math.round((predicted.savory * 0.3 + reviewTaste.avgFatty * 0.7) * 10) / 10
          : predicted.savory,
        sour: predicted.sour, // 새콤·감칠은 리뷰에서 수집 안 함
        umami: predicted.umami,
        spicy: reviewTaste.avgSpicy > 0
          ? Math.round((predicted.spicy * 0.3 + reviewTaste.avgSpicy * 0.7) * 10) / 10
          : predicted.spicy,
      }
    : predicted;

  // 내 입맛 그림 — 1~10 을 1~5 로
  const ut = mine ? cleanTastes(mine.profile.tastes) : {};
  const half = (v: number | undefined) => (v === undefined ? 3 : Math.max(1, Math.min(5, Math.round(v / 2))));
  const userTasteProfile = mine && Object.keys(ut).length
    ? {
        salty: half(ut.salty),
        sweet: half(ut.sweet),
        savory: half(ut.fatty),
        spicy: half(ut.spicy),
        // 새콤·감칠은 입맛으로 묻지 않아 비교하지 않는다 — 제품 값과 같게 그려 차이가 보이지 않게
        sour: tasteProfile.sour,
        umami: tasteProfile.umami,
      }
    : undefined;

  const nutritionProfile = toNutritionProfile(nutrition);

  // 점수 — 목록의 적합도와 같은 식 (lib/recommend/scoring). 알레르기는 따로 경고하므로 여기선 빼고 계산
  const scored = scoreProduct(
    scoreRow,
    { ...parseProfile(mine?.profile || {}, mine?.health || null), allergies: [] },
    !!scoreRow.is_purchasable,
  );
  const tasteScore = mine && scored.taste_known ? scored.taste_score : null;
  const nutritionScore = nutritionUnreliable ? 0 : scored.nutrition_score;
  const matchScore = mine && !nutritionUnreliable ? scored.match_score : null;

  return (
    <section className="mb-8">
      <SectionHeader
        title="맛·영양 프로필"
        action={reviewCount > 0 ? (
          <span className="text-caption text-ink-2">맛 평가 <span className="num">{reviewCount}</span>건</span>
        ) : undefined}
      />

      {/* ── 3가지 점수 ── */}
      {(tasteScore != null || nutritionScore > 0) && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {matchScore != null && <ScoreTile label="적합도" score={matchScore} />}
          {tasteScore != null && <ScoreTile label="맛" score={tasteScore} />}
          {!nutritionUnreliable && <ScoreTile label="영양" score={nutritionScore} />}
        </div>
      )}

      {!userTasteProfile && (
        <Notice className="mb-3">온보딩을 마치면 맛 매칭 점수를 볼 수 있어요</Notice>
      )}

      {/* ── 이중 레이더 차트 ── */}
      <Card className="mb-3">
        <DualRadarChart
          taste={tasteProfile}
          userTaste={userTasteProfile}
          nutrition={nutritionProfile}
          tasteEstimated={estimated}
          mode="dual"
        />
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <Estimate>
          {estimated
            ? "제품 맛은 영양 수치·원재료·이름으로 추정했어요. 맛 평가가 2건 모이면 평가를 반영해요"
            : <>맛 평가 <span className="num">{reviewCount}</span>건을 반영했어요</>}
        </Estimate>
        <TextLink href="#reviews">맛 평가 남기기</TextLink>
      </div>
      {learnedFrom > 0 && (
        <p className="text-caption text-ink-2 mt-1">내 맛 평가 <span className="num">{learnedFrom}</span>개로 입맛을 맞춰 계산했어요</p>
      )}
    </section>
  );
}

/* 점수 칸 — 점수대별 색은 고정 클래스 */
const SCORE_TEXT = {
  high: "text-positive",
  good: "text-brand-ink",
  mid: "text-brand-ink",
  low: "text-ink-2",
} as const;

function ScoreTile({ label, score }: { label: string; score: number }) {
  const cls = score >= 80 ? SCORE_TEXT.high : score >= 60 ? SCORE_TEXT.good : score >= 40 ? SCORE_TEXT.mid : SCORE_TEXT.low;
  return (
    <Card padding="sm" className="flex flex-col items-center gap-1 text-center">
      <span className="text-caption text-ink-2">{label}</span>
      <span className={cn("num text-title font-bold leading-none", cls)}>{score}</span>
    </Card>
  );
}
