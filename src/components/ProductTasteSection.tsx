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

/** 영양 데이터를 일일 권장량 대비 충족률(%)로 변환 */
function toNutritionProfile(n: Props["nutrition"]) {
  const daily = { protein: 55, carbs: 324, fat: 54, fiber: 25, vitamins: 2000 }; // vitamins = sodium 역산
  return {
    protein: n.protein_g ? Math.min(Math.round((n.protein_g / daily.protein) * 100), 100) : 0,
    carbs: n.carbs_g ? Math.min(Math.round((n.carbs_g / daily.carbs) * 100), 100) : 0,
    fat: n.fat_g ? Math.min(Math.round((n.fat_g / daily.fat) * 100), 100) : 0,
    fiber: n.fiber_g ? Math.min(Math.round((n.fiber_g / daily.fiber) * 100), 100) : 0,
    // 비타민 지표: 나트륨이 낮을수록 좋음 (역산)
    vitamins: n.sodium_mg != null ? Math.max(0, Math.min(100, Math.round((1 - n.sodium_mg / daily.vitamins) * 100))) : 50,
  };
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

    // 사용자 맛 선호 조회
    fetch(`/api/taste?user_id=${uid}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.preferences) setUserTaste(d.preferences);
      })
      .catch(() => {});
  }, [productId]);

  const tasteProfile = taste
    ? { spicy: +taste.spicy, sweet: +taste.sweet, salty: +taste.salty, umami: +taste.umami, sour: +taste.sour }
    : { spicy: 2.5, sweet: 2.5, salty: 2.5, umami: 2.5, sour: 2.5 };

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
