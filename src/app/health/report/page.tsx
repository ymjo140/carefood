"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ── 타입 ──
type HealthData = {
  height_cm?: number | null;
  weight_kg?: number | null;
  bmi?: number | null;
  fasting_glucose?: number | null;
  bp_systolic?: number | null;
  bp_diastolic?: number | null;
  total_cholesterol?: number | null;
  ldl?: number | null;
  hdl?: number | null;
  triglycerides?: number | null;
  conditions?: string[];
};

type NutrientAdvice = {
  nutrient: string;
  status: "good" | "caution" | "warning";
  label: string;
  detail: string;
  recommendation: string;
};

type ReportData = {
  overallScore: number;
  bmi: { value: number; label: string; status: string } | null;
  advice: NutrientAdvice[];
  autoConditions: string[];
};

// ── 분석 로직 ──
function analyzeHealth(data: HealthData): ReportData {
  const advice: NutrientAdvice[] = [];
  const autoConditions: string[] = [];
  let score = 70; // 기본 점수

  // BMI 분석
  let bmiResult = null;
  if (data.bmi) {
    const bmi = data.bmi;
    let label = "정상";
    let status = "good";
    if (bmi < 18.5) { label = "저체중"; status = "caution"; score -= 5; }
    else if (bmi < 23) { label = "정상"; status = "good"; score += 10; }
    else if (bmi < 25) { label = "과체중"; status = "caution"; score -= 5; }
    else { label = "비만"; status = "warning"; score -= 10; }
    bmiResult = { value: Math.round(bmi * 10) / 10, label, status };
  }

  // 혈당 분석
  if (data.fasting_glucose) {
    const v = data.fasting_glucose;
    if (v < 100) {
      advice.push({
        nutrient: "당류", status: "good", label: `공복혈당 ${v}mg/dL`,
        detail: "정상 범위예요",
        recommendation: "현재 식습관을 유지하세요",
      });
      score += 5;
    } else if (v < 126) {
      advice.push({
        nutrient: "당류", status: "caution", label: `공복혈당 ${v}mg/dL`,
        detail: "경계 수준이에요. 당류 섭취에 주의가 필요해요",
        recommendation: "당류 5g 이하 식품을 우선 추천해드릴게요",
      });
      score -= 5;
    } else {
      advice.push({
        nutrient: "당류", status: "warning", label: `공복혈당 ${v}mg/dL`,
        detail: "공복혈당이 높은 편이에요. 의사와 상담을 권해요",
        recommendation: "저당 식품 위주로 추천하고, 당류 상한을 설정했어요",
      });
      autoConditions.push("diabetes");
      score -= 15;
    }
  }

  // 혈압 분석
  if (data.bp_systolic) {
    const s = data.bp_systolic;
    const d = data.bp_diastolic || 0;
    if (s < 120 && d < 80) {
      advice.push({
        nutrient: "나트륨", status: "good", label: `혈압 ${s}/${d}mmHg`,
        detail: "입력하신 혈압 수치가 일반 기준 범위 안이에요",
        recommendation: "현재 식습관을 유지하세요",
      });
      score += 5;
    } else if (s < 140 && d < 90) {
      advice.push({
        nutrient: "나트륨", status: "caution", label: `혈압 ${s}/${d}mmHg`,
        detail: "혈압이 약간 높아요. 나트륨 섭취를 줄여보세요",
        recommendation: "나트륨 400mg 이하 식품을 우선 추천해드릴게요",
      });
      score -= 5;
    } else {
      advice.push({
        nutrient: "나트륨", status: "warning", label: `혈압 ${s}/${d}mmHg`,
        detail: "혈압 수치가 높은 편이에요. 의사와 상담을 권해요",
        recommendation: "저나트륨 식품 위주로 추천해드릴게요",
      });
      autoConditions.push("hypertension");
      score -= 15;
    }
  }

  // 콜레스테롤 분석
  if (data.total_cholesterol) {
    const tc = data.total_cholesterol;
    if (tc < 200) {
      advice.push({
        nutrient: "지방", status: "good", label: `총 콜레스테롤 ${tc}mg/dL`,
        detail: "정상 범위예요",
        recommendation: "균형 잡힌 식단을 유지하세요",
      });
      score += 5;
    } else if (tc < 240) {
      advice.push({
        nutrient: "지방", status: "caution", label: `총 콜레스테롤 ${tc}mg/dL`,
        detail: "경계 수준이에요. 포화지방 섭취를 줄여보세요",
        recommendation: "저지방 식품을 우선 추천해드릴게요",
      });
      score -= 5;
    } else {
      advice.push({
        nutrient: "지방", status: "warning", label: `총 콜레스테롤 ${tc}mg/dL`,
        detail: "콜레스테롤 수치가 높은 편이에요. 의사와 상담을 권해요",
        recommendation: "저지방·저콜레스테롤 식품 위주로 추천해드릴게요",
      });
      autoConditions.push("hyperlipidemia");
      score -= 15;
    }
  }

  if (data.ldl && data.ldl >= 160) {
    advice.push({
      nutrient: "LDL", status: "warning", label: `LDL ${data.ldl}mg/dL`,
      detail: "LDL 콜레스테롤이 높아요",
      recommendation: "포화지방이 적은 식품을 추천해드릴게요",
    });
    if (!autoConditions.includes("hyperlipidemia")) autoConditions.push("hyperlipidemia");
    score -= 10;
  }

  if (data.hdl && data.hdl < 40) {
    advice.push({
      nutrient: "HDL", status: "caution", label: `HDL ${data.hdl}mg/dL`,
      detail: "HDL(좋은 콜레스테롤)이 낮아요",
      recommendation: "오메가3, 견과류 등 건강한 지방 섭취를 늘려보세요",
    });
    score -= 5;
  }

  if (data.triglycerides && data.triglycerides >= 200) {
    advice.push({
      nutrient: "중성지방", status: "warning", label: `중성지방 ${data.triglycerides}mg/dL`,
      detail: "중성지방이 높아요",
      recommendation: "당류와 정제 탄수화물을 줄이는 게 좋아요",
    });
    score -= 10;
  }

  // 입력 항목이 적으면 점수에 너무 큰 변동 방지
  const clampedScore = Math.max(20, Math.min(100, score));

  return {
    overallScore: clampedScore,
    bmi: bmiResult,
    advice,
    autoConditions,
  };
}

const STATUS_COLORS = {
  good: { bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-800", dot: "bg-emerald-500" },
  caution: { bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-400", border: "border-amber-200 dark:border-amber-800", dot: "bg-amber-500" },
  warning: { bg: "bg-red-50 dark:bg-red-900/20", text: "text-red-700 dark:text-red-400", border: "border-red-200 dark:border-red-800", dot: "bg-red-500" },
};

type QuickProduct = {
  id: string;
  name: string;
  match_score: number;
  reasons: string[];
  reason_detail: string | null;
  product_prices: { platform: string; price: number }[];
};

export default function HealthReportPage() {
  const router = useRouter();
  const [report, setReport] = useState<ReportData | null>(null);
  const [topProducts, setTopProducts] = useState<QuickProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let healthData: HealthData | null = null;

    // localStorage에서 건강 데이터 로드
    try {
      const saved = localStorage.getItem("carefood_health");
      if (saved) {
        healthData = JSON.parse(saved);
        const result = analyzeHealth(healthData!);
        setReport(result);
      }
    } catch { /* silent */ }

    // 맞춤 추천 제품 5개 로드
    try {
      const profileRaw = localStorage.getItem("carefood_profile");
      if (profileRaw && healthData) {
        const profile = JSON.parse(profileRaw);
        fetch("/api/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            concerns: profile.concerns || [],
            sensitivity: profile.sensitivity || { digestive: 2, additive: 2 },
            conditions: [...new Set([...(profile.conditions || []), ...(healthData.conditions || [])])],
            allergies: profile.allergies || [],
            tastes: profile.tastes || { salty: 3, sweet: 3, spicy: 3, fatty: 3 },
          }),
        })
          .then((r) => r.json())
          .then((data) => setTopProducts((data.recommendations || []).slice(0, 5)))
          .catch(() => {});
      }
    } catch { /* silent */ }

    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-muted mb-4">건강검진 데이터가 없어요</p>
          <Link
            href="/health"
            className="inline-block bg-primary text-white px-6 py-3 rounded-full font-bold"
          >
            건강검진 정보 입력하기
          </Link>
        </div>
      </div>
    );
  }

  const scoreColor = report.overallScore >= 70 ? "text-emerald-600" : report.overallScore >= 50 ? "text-amber-600" : "text-red-600";
  const scoreLabel = report.overallScore >= 80 ? "양호" : report.overallScore >= 60 ? "보통" : report.overallScore >= 40 ? "주의" : "관리 필요";

  return (
    <div className="min-h-[calc(100vh-3.5rem)] px-4 py-8">
      <div className="max-w-lg mx-auto">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold mb-2">나의 영양 리포트</h1>
          <p className="text-muted text-sm">
            입력하신 건강검진 정보를 기반으로 분석한 결과예요.
            <br />
            <span className="text-xs">의학적 진단이 아닌 성분 매칭 참고 자료입니다</span>
          </p>
        </div>

        {/* 종합 점수 */}
        <div className="bg-card border border-border rounded-2xl p-6 mb-6 text-center">
          <p className="text-sm text-muted mb-2">영양 균형 점수</p>
          <div className="flex items-center justify-center gap-3 mb-3">
            <span className={`text-5xl font-extrabold ${scoreColor}`}>
              {report.overallScore}
            </span>
            <span className="text-muted text-lg">/100</span>
          </div>
          <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
            report.overallScore >= 70 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
            : report.overallScore >= 50 ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
            : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
          }`}>
            {scoreLabel}
          </span>
        </div>

        {/* BMI */}
        {report.bmi && (
          <div className="bg-card border border-border rounded-2xl p-5 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted mb-1">BMI (체질량지수)</p>
                <p className="text-2xl font-bold">{report.bmi.value}</p>
              </div>
              <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                report.bmi.status === "good" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                : report.bmi.status === "caution" ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
              }`}>
                {report.bmi.label}
              </span>
            </div>
          </div>
        )}

        {/* 영양 분석 카드 */}
        {report.advice.length > 0 && (
          <div className="space-y-3 mb-6">
            <h2 className="font-bold text-sm text-muted uppercase tracking-wide">영양 분석</h2>
            {report.advice.map((item) => {
              const colors = STATUS_COLORS[item.status];
              return (
                <div key={item.nutrient} className={`${colors.bg} border ${colors.border} rounded-2xl p-4`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${colors.dot} mt-1.5 shrink-0`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`font-bold text-sm ${colors.text}`}>{item.label}</span>
                      </div>
                      <p className="text-sm text-foreground/80 mb-2">{item.detail}</p>
                      <p className="text-xs text-muted">{item.recommendation}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 입력 수치 기반 영양 필터 */}
        {report.autoConditions.length > 0 && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 mb-6">
            <p className="text-sm font-medium text-primary mb-2">입력 수치 기반 영양 필터</p>
            <p className="text-xs text-muted leading-relaxed">
              입력하신 수치를 기반으로 아래 성분 기준을 적용합니다:
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {report.autoConditions.map((c) => (
                <span key={c} className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                  {c === "diabetes" ? "당류 제한" : c === "hypertension" ? "나트륨 제한" : c === "hyperlipidemia" ? "지방 제한" : c}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 맞춤 추천 제품 Top 5 */}
        {topProducts.length > 0 && (
          <div className="mb-6">
            <h2 className="font-bold text-sm text-muted uppercase tracking-wide mb-3">건강검진 맞춤 추천</h2>
            <div className="space-y-2">
              {topProducts.map((p, i) => {
                const bestPrice = p.product_prices?.[0]?.price;
                return (
                  <Link
                    key={p.id}
                    href={`/products/${p.id}`}
                    className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl hover:border-primary/30 transition-colors"
                  >
                    <span className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight line-clamp-1">{p.name}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {p.reasons.slice(0, 2).join(" · ")}
                        {bestPrice ? ` · ${bestPrice.toLocaleString()}원` : ""}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-primary shrink-0">
                      {p.match_score}점
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* CTA 버튼 */}
        <div className="space-y-3">
          <Link
            href="/recommend"
            className="block w-full bg-primary text-white py-3.5 rounded-full font-bold text-center hover:bg-primary-dark transition-colors"
          >
            맞춤 추천 받기
          </Link>
          <div className="flex gap-3">
            <Link
              href="/health"
              className="flex-1 border border-border py-3 rounded-full font-medium text-center hover:bg-card transition-colors"
            >
              정보 수정
            </Link>
            <button
              onClick={() => router.push("/")}
              className="flex-1 border border-border py-3 rounded-full font-medium hover:bg-card transition-colors"
            >
              홈으로
            </button>
          </div>
        </div>

        {/* 면책 조항 */}
        <p className="text-center text-xs text-muted mt-8 leading-relaxed">
          본 리포트는 식품 성분 매칭을 위한 참고 자료이며,
          <br />
          의학적 진단이나 처방을 대체하지 않습니다.
        </p>
      </div>
    </div>
  );
}
