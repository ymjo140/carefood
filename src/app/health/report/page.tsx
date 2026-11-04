"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Badge, Button, Card, EmptyState, LinkButton, ListRow, Notice, Page, PageHeader, PageLoading, Price, ProgressBar,
  SectionHeader, Stat, type BadgeTone,
} from "@/components/ui";

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

/* 상태 → 디자인 시스템 tone (같은 의미는 같은 색) */
const STATUS_TONE: Record<NutrientAdvice["status"], { badge: BadgeTone; notice: "neutral" | "caution" | "danger"; label: string }> = {
  good: { badge: "positive", notice: "neutral", label: "기준 범위" },
  caution: { badge: "caution", notice: "caution", label: "확인 필요" },
  warning: { badge: "danger", notice: "danger", label: "높음" },
};
const BMI_TONE: Record<string, BadgeTone> = { good: "positive", caution: "caution", warning: "danger" };

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
    } catch { /* silent */ } // ds-allow: 로컬 검진 정보 읽기

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
          .catch(() => {}); // ds-allow: 추천 제품은 없으면 숨김
      }
    } catch { /* silent */ } // ds-allow: 로컬 프로필 읽기

    setLoading(false);
  }, []);

  if (loading) return <PageLoading />;

  if (!report) {
    return (
      <Page width="narrow">
        <EmptyState
          title="건강검진 데이터가 없어요"
          description="검진 수치를 넣으면 성분 기준에 맞춘 리포트를 만들어 드려요"
          action={<LinkButton href="/health">건강검진 정보 입력하기</LinkButton>}
        />
      </Page>
    );
  }

  const scoreTone: "positive" | "caution" | "danger" = report.overallScore >= 70 ? "positive" : report.overallScore >= 50 ? "caution" : "danger";
  const scoreLabel = report.overallScore >= 80 ? "양호" : report.overallScore >= 60 ? "보통" : report.overallScore >= 40 ? "주의" : "관리 필요";

  return (
    <Page width="narrow">
      <PageHeader
        title="나의 영양 리포트"
        description="입력한 건강검진 수치로 정리한 성분 매칭 참고 자료예요"
      />

      {/* 종합 점수 */}
      <Card className="mb-3">
        <div className="flex items-end justify-between gap-4">
          <Stat size="lg" emphasis label="영양 균형 점수 (100점 기준)" value={report.overallScore} unit="점" />
          <Badge tone={scoreTone}>{scoreLabel}</Badge>
        </div>
        <ProgressBar value={report.overallScore} max={100} tone={scoreTone} className="mt-4" label="영양 균형 점수" />
      </Card>

      {/* BMI */}
      {report.bmi && (
        <Card className="mb-6">
          <div className="flex items-end justify-between gap-4">
            <Stat label="BMI (체질량지수)" value={report.bmi.value} />
            <Badge tone={BMI_TONE[report.bmi.status] || "neutral"}>{report.bmi.label}</Badge>
          </div>
        </Card>
      )}

      {/* 영양 분석 카드 */}
      {report.advice.length > 0 && (
        <section className="mb-6">
          <SectionHeader title="영양 분석" />
          <div className="flex flex-col gap-2">
            {report.advice.map((item) => {
              const t = STATUS_TONE[item.status];
              return (
                <Card key={item.nutrient} padding="sm">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="num text-body font-bold text-ink">{item.label}</span>
                    <Badge tone={t.badge}>{t.label}</Badge>
                  </div>
                  <p className="text-label text-ink">{item.detail}</p>
                  <p className="text-caption text-ink-2 mt-1">{item.recommendation}</p>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* 입력 수치 기반 영양 필터 */}
      {report.autoConditions.length > 0 && (
        <Card tone="brand" className="mb-6">
          <p className="text-label font-bold text-brand-ink mb-1">입력 수치 기반 영양 필터</p>
          <p className="text-caption text-ink-2">입력한 수치에 맞춰 아래 성분 기준을 적용해요</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {report.autoConditions.map((c) => (
              <Badge key={c} tone="brand">
                {c === "diabetes" ? "당류 제한" : c === "hypertension" ? "나트륨 제한" : c === "hyperlipidemia" ? "지방 제한" : c}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* 맞춤 추천 제품 Top 5 */}
      {topProducts.length > 0 && (
        <section className="mb-6">
          <SectionHeader title="건강검진 맞춤 추천" />
          <Card padding="none" className="p-1">
            {topProducts.map((p, i) => {
              const bestPrice = p.product_prices?.[0]?.price;
              return (
                <ListRow
                  key={p.id}
                  href={`/products/${p.id}`}
                  leading={<span className="num size-8 rounded-md bg-sunken inline-flex items-center justify-center text-label font-bold text-ink-2">{i + 1}</span>}
                  title={p.name}
                  meta={<>{p.reasons.slice(0, 2).join(" · ")}{bestPrice ? <> · <Price value={bestPrice} className="text-caption" /></> : null}</>}
                  trailing={<span className="num text-label font-bold text-brand-ink">{p.match_score}점</span>}
                />
              );
            })}
          </Card>
        </section>
      )}

      {/* 다음 행동 */}
      <div className="flex flex-col gap-2">
        <LinkButton href="/products" block>맞춤 추천 받기</LinkButton>
        <div className="flex gap-2">
          <LinkButton href="/health" variant="secondary" block>정보 수정하기</LinkButton>
          <Button variant="secondary" block onClick={() => router.push("/")}>홈으로</Button>
        </div>
      </div>

      <Notice className="mt-6">
        이 리포트는 식품 성분 매칭을 위한 참고 자료이며, 의학적 진단이나 처방을 대신하지 않아요.
      </Notice>
    </Page>
  );
}
