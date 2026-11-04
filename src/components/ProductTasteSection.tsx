"use client";

import { useState, useEffect } from "react";
import DualRadarChart, {
  calcTasteMatchScore,
  calcNutritionMatchScore,
  calcOverallMatchScore,
} from "./DualRadarChart";
import TasteReviewForm from "./TasteReviewForm";
import { Button, Card, Notice, SectionHeader, cn } from "@/components/ui";

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
    sodium_mg: number | null;
    spicy_score: number | null;
  };
  /** 리뷰 기반 맛 체감 평균 (있으면 영양 예측을 보정) */
  reviewTaste?: ReviewTasteData;
};

type TasteData = {
  spicy: number;
  sweet: number;
  salty: number;
  umami: number;
  sour: number;
  review_count: number;
  avg_rating: number;
};

function getUserId(): string {
  try {
    let id = localStorage.getItem("carefood_anon_id");
    if (!id) {
      id = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem("carefood_anon_id", id);
    }
    return id;
  } catch {
    return `anon_${Date.now()}`;
  }
}

/**
 * 영양성분 → 맛 프로필 예측 (1~5 스케일)
 * 영양성분 + spicy_score에서 알 수 있는 5축 사용
 * 짠맛(나트륨), 단맛(당류비율), 고소함(지방), 담백함(단백질밀도), 매운맛(spicy_score)
 */
function predictTasteFromNutrition(n: Props["nutrition"]) {
  // 짠맛: 나트륨 기반. 0mg=1, 200=2, 500=3, 800=4, 1200+=5
  const salty = n.sodium_mg != null
    ? Math.min(5, Math.max(1, Math.round(n.sodium_mg / 300) + 1))
    : 2.5;

  // 단맛: 탄수화물 중 당류 비중 추정. carbs가 높고 칼로리 대비 비율 높으면 단맛↑
  const carbRatio = (n.carbs_g ?? 0) / Math.max(1, (n.calories ?? 100) / 100);
  const sweet = Math.min(5, Math.max(1, Math.round(carbRatio * 0.8) + 1));

  // 고소함: 지방 기반. 0g=1, 5=2, 10=3, 15=4, 20+=5
  const savory = n.fat_g != null
    ? Math.min(5, Math.max(1, Math.round(n.fat_g / 5) + 1))
    : 2.5;

  // 담백함: 단백질÷칼로리 비율. 높으면 담백 (닭가슴살=5, 과자=1)
  const proteinDensity = n.protein_g != null && n.calories != null && n.calories > 0
    ? (n.protein_g * 4) / n.calories  // 단백질 칼로리 비율 (0~1)
    : 0.15;
  const light = Math.min(5, Math.max(1, Math.round(proteinDensity * 10) + 1));

  // 매운맛: spicy_score 기반 (원재료명 키워드 파싱, 0~5)
  const spicy = n.spicy_score != null
    ? Math.min(5, Math.max(1, n.spicy_score || 1))
    : 1;

  return { salty, sweet, savory, light, spicy };
}

/**
 * 영양 데이터를 1~5 스케일로 변환
 * 단백질/섬유질: 높을수록 좋음
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

  const fiber = n.fiber_g != null
    ? Math.min(5, Math.max(1, Math.round(n.fiber_g / 2.5) + 1))
    : 1;

  const balance = n.sodium_mg != null
    ? Math.min(5, Math.max(1, 5 - Math.round(n.sodium_mg / 400)))
    : 3;

  return { protein, carbs, fat, fiber, vitamins: balance };
}

export default function ProductTasteSection({ productId, productName, nutrition, reviewTaste }: Props) {
  const [taste, setTaste] = useState<TasteData | null>(null);
  const [userTaste, setUserTaste] = useState<{ pref_spicy: number; pref_sweet: number; pref_salty: number; pref_umami: number; pref_sour: number } | null>(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [userId, setUserId] = useState("");

  const fetchData = () => {
    fetch(`/api/taste?product_id=${productId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.taste_profile) setTaste(d.taste_profile);
      })
      .catch(() => {}); // ds-allow: 맛 예측은 없으면 숨김
  };

  useEffect(() => {
    const uid = getUserId();
    setUserId(uid);
    fetchData();

    // 사용자 맛 선호 조회 (user_taste_preferences 테이블 우선 → 온보딩 폴백)
    fetch(`/api/taste?user_id=${uid}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.preferences && d.preferences.source !== "default") {
          setUserTaste(d.preferences);
        } else {
          // 테이블에 없으면 온보딩 데이터에서 폴백
          try {
            const profileRaw = localStorage.getItem("carefood_profile");
            if (profileRaw) {
              const profile = JSON.parse(profileRaw);
              const t = profile.tastes;
              if (t) {
                // 온보딩: 4축(salty/sweet/spicy/fatty, 1-10) → 새 5축(1-5)
                const salty = Math.max(1, Math.min(5, Math.round(t.salty / 2)));
                const sweet = Math.max(1, Math.min(5, Math.round(t.sweet / 2)));
                const spicy = Math.max(1, Math.min(5, Math.round(t.spicy / 2)));
                const fatty = Math.max(1, Math.min(5, Math.round(t.fatty / 2)));
                setUserTaste({
                  pref_salty: salty,
                  pref_sweet: sweet,
                  pref_spicy: spicy,
                  pref_umami: fatty, // fatty → 고소함 매핑에 활용
                  pref_sour: 3,
                });
              }
            }
          } catch { /* silent */ } // ds-allow: 로컬 프로필 읽기
        }
      })
      .catch(() => {}); // ds-allow: 보조 정보 불러오기
  }, [productId]);

  // 맛 프로필: 영양성분 예측 + 리뷰 체감 보정
  const predicted = predictTasteFromNutrition(nutrition);
  const tasteProfile = (reviewTaste && reviewTaste.reviewCount >= 2)
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
        light: predicted.light, // 담백함은 리뷰에서 수집 안 함
        spicy: reviewTaste.avgSpicy > 0
          ? Math.round((predicted.spicy * 0.3 + reviewTaste.avgSpicy * 0.7) * 10) / 10
          : predicted.spicy,
      }
    : predicted;

  // 사용자 선호: 온보딩 데이터를 새 5축으로 매핑
  const userTasteProfile = userTaste
    ? {
        salty: +userTaste.pref_salty,
        sweet: +userTaste.pref_sweet,
        savory: Math.round((+userTaste.pref_umami + (+userTaste.pref_salty > 3 ? 1 : 0)) * 0.8 + 1), // 감칠맛+짠맛 → 고소함 근사
        light: Math.max(1, 6 - Math.round((+userTaste.pref_spicy + +userTaste.pref_salty) / 2)), // 자극 적으면 담백 선호
        spicy: +userTaste.pref_spicy || 3, // 매운맛 선호도
      }
    : undefined;

  const nutritionProfile = toNutritionProfile(nutrition);

  // 3가지 점수 계산
  const tasteScore = userTasteProfile ? calcTasteMatchScore(tasteProfile, userTasteProfile) : null;
  const nutritionScore = calcNutritionMatchScore(nutritionProfile);
  // 종합 매칭 = 맛 40% + 영양 60% (리스트의 매칭 점수와 동일 기준)
  const matchScore = tasteScore != null ? calcOverallMatchScore(tasteScore, nutritionScore) : null;

  return (
    <section className="mb-8">
      <SectionHeader
        title="맛·영양 프로필"
        action={taste ? (
          <span className="text-caption text-ink-2">
            맛 리뷰 <span className="num">{taste.review_count}</span>건
            {taste.avg_rating > 0 && <> · 평점 <span className="num">{(+taste.avg_rating).toFixed(1)}</span></>}
          </span>
        ) : undefined}
      />

      {/* ── 3가지 점수 ── */}
      {(tasteScore != null || nutritionScore > 0) && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {matchScore != null && <ScoreTile label="매칭" score={matchScore} />}
          {tasteScore != null && <ScoreTile label="맛" score={tasteScore} />}
          <ScoreTile label="영양" score={nutritionScore} />
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
          mode="dual"
        />
      </Card>

      {/* 맛 리뷰 버튼/폼 */}
      {!showReviewForm ? (
        <Button variant="secondary" block icon="edit" onClick={() => setShowReviewForm(true)}>
          이 제품 맛 평가하기
        </Button>
      ) : (
        <TasteReviewForm
          productId={productId}
          productName={productName}
          userId={userId}
          onSubmitted={() => {
            setShowReviewForm(false);
            fetchData();
          }}
        />
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
