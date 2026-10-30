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
 * 영양성분에서 확실히 알 수 있는 5축만 사용
 * (캡사이신·글루탐산 데이터 확보 시 매운맛·감칠맛 추가 예정)
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

  // 자극도: 칼로리 밀도(kcal/100g). 높으면 진한맛, 낮으면 가벼운맛
  const calDensity = n.calories != null
    ? n.calories / Math.max(100, 300) // serving 대비 칼로리 밀도 근사
    : 0.5;
  const intensity = Math.min(5, Math.max(1, Math.round(calDensity * 3) + 1));

  return { salty, sweet, savory, light, intensity };
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
          } catch { /* silent */ }
        }
      })
      .catch(() => {});
  }, [productId]);

  // 맛 프로필: 영양성분에서 예측 (리뷰 데이터는 향후 보정용)
  const tasteProfile = predictTasteFromNutrition(nutrition);

  // 사용자 선호: 온보딩 데이터를 새 5축으로 매핑
  const userTasteProfile = userTaste
    ? {
        salty: +userTaste.pref_salty,
        sweet: +userTaste.pref_sweet,
        savory: Math.round((+userTaste.pref_umami + (+userTaste.pref_salty > 3 ? 1 : 0)) * 0.8 + 1), // 감칠맛+짠맛 → 고소함 근사
        light: Math.max(1, 6 - Math.round((+userTaste.pref_spicy + +userTaste.pref_salty) / 2)), // 자극 적으면 담백 선호
        intensity: Math.round((+userTaste.pref_spicy + +userTaste.pref_salty) / 2), // 매운+짠 → 자극도
      }
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
