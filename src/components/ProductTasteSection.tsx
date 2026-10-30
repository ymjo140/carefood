"use client";

import { useState, useEffect } from "react";
import DualRadarChart, {
  calcTasteMatchScore,
  calcNutritionMatchScore,
  calcOverallMatchScore,
} from "./DualRadarChart";
import TasteReviewForm from "./TasteReviewForm";

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
  };
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
 * 리뷰 없어도 영양성분에서 맛을 합리적으로 추정
 */
function predictTasteFromNutrition(n: Props["nutrition"]) {
  // 짠맛: 나트륨 기반. 0mg=1, 200=2, 500=3, 800=4, 1200+=5
  const salty = n.sodium_mg != null
    ? Math.min(5, Math.max(1, Math.round(n.sodium_mg / 300) + 1))
    : 2.5;

  // 단맛: 당류 기반. 0g=1, 3=2, 6=3, 12=4, 20+=5
  const sweet = n.calories != null
    ? Math.min(5, Math.max(1, Math.round((n.calories > 0 ? (n.carbs_g ?? 0) * 0.3 : 0) / 3) + 1))
    : 2.5;

  // 매운맛: 직접 추정 어려움 → 기본 2 (리뷰로 보정 기대)
  const spicy = 2;

  // 감칠맛: 단백질+지방 기반 (고기/해산물/발효식품 = 감칠맛↑)
  const umami = n.protein_g != null
    ? Math.min(5, Math.max(1, Math.round(n.protein_g / 7) + 1))
    : 2.5;

  // 신맛: 직접 추정 어려움 → 기본 2 (리뷰로 보정 기대)
  const sour = 2;

  return { spicy, sweet, salty, umami, sour };
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

export default function ProductTasteSection({ productId, productName, nutrition }: Props) {
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
      .catch(() => {});
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
                // 온보딩: 4축(salty/sweet/spicy/fatty, 1-10) → 차트: 5축(1-5)
                setUserTaste({
                  pref_spicy: Math.max(1, Math.min(5, Math.round(t.spicy / 2))),
                  pref_sweet: Math.max(1, Math.min(5, Math.round(t.sweet / 2))),
                  pref_salty: Math.max(1, Math.min(5, Math.round(t.salty / 2))),
                  pref_umami: 3, // 온보딩에 umami 없음 → 중간값
                  pref_sour: 3,  // 온보딩에 sour 없음 → 중간값
                });
              }
            }
          } catch { /* silent */ }
        }
      })
      .catch(() => {});
  }, [productId]);

  // 맛 프로필: 리뷰 있으면 리뷰 데이터, 없으면 영양성분에서 예측
  const tasteProfile = (taste && taste.review_count > 0)
    ? { spicy: +taste.spicy, sweet: +taste.sweet, salty: +taste.salty, umami: +taste.umami, sour: +taste.sour }
    : predictTasteFromNutrition(nutrition);

  const userTasteProfile = userTaste
    ? { spicy: +userTaste.pref_spicy, sweet: +userTaste.pref_sweet, salty: +userTaste.pref_salty, umami: +userTaste.pref_umami, sour: +userTaste.pref_sour }
    : undefined;

  const nutritionProfile = toNutritionProfile(nutrition);

  // 매칭 점수 계산
  const tasteScore = userTasteProfile ? calcTasteMatchScore(tasteProfile, userTasteProfile) : null;
  const nutritionScore = calcNutritionMatchScore(nutritionProfile);
  const overallScore = tasteScore != null ? calcOverallMatchScore(tasteScore, nutritionScore) : null;

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-extrabold">맛·영양 프로필</h2>
        {taste && (
          <span className="text-[10px] text-muted">
            맛 리뷰 {taste.review_count}건
            {taste.avg_rating > 0 && ` · ⭐ ${(+taste.avg_rating).toFixed(1)}`}
          </span>
        )}
      </div>

      {/* 이중 레이더 차트 */}
      <div className="border border-border rounded-xl p-4 mb-3">
        <DualRadarChart
          taste={tasteProfile}
          userTaste={userTasteProfile}
          nutrition={nutritionProfile}
          matchScore={overallScore ?? undefined}
          mode="dual"
          size={240}
        />

        {/* 점수 분해 */}
        {tasteScore != null && (
          <div className="flex justify-center gap-4 mt-3 text-[10px]">
            <span className="text-muted">
              맛 매칭 <b className="text-foreground">{tasteScore}점</b>
            </span>
            <span className="text-muted">
              영양 충족 <b className="text-foreground">{nutritionScore}점</b>
            </span>
          </div>
        )}

        {!userTasteProfile && (
          <p className="text-[10px] text-center text-muted mt-2">
            맛 리뷰를 남기면 내 입맛 기반 매칭 점수를 볼 수 있어요
          </p>
        )}
      </div>

      {/* 맛 리뷰 버튼/폼 */}
      {!showReviewForm ? (
        <button
          onClick={() => setShowReviewForm(true)}
          className="w-full border border-border rounded-xl py-3 text-sm font-medium text-muted hover:text-foreground hover:border-primary/30 transition-colors"
          style={{ minHeight: "44px" }}
        >
          🍽️ 이 제품 맛 평가하기
        </button>
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
