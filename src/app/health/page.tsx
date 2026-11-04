"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input, Notice, Page, PageHeader, PageLoading, ProgressBar } from "@/components/ui";

// ── 타입 ──
type HealthData = {
  height_cm: string;
  weight_kg: string;
  fasting_glucose: string;
  bp_systolic: string;
  bp_diastolic: string;
  total_cholesterol: string;
  ldl: string;
  hdl: string;
  triglycerides: string;
};

type FieldConfig = {
  key: keyof HealthData;
  label: string;
  unit: string;
  placeholder: string;
  hint?: string;
  min: number;
  max: number;
};

// ── 입력 필드 설정 ──
const BASIC_FIELDS: FieldConfig[] = [
  { key: "height_cm", label: "키", unit: "cm", placeholder: "170", min: 100, max: 250 },
  { key: "weight_kg", label: "체중", unit: "kg", placeholder: "65", min: 20, max: 300 },
];

const GLUCOSE_FIELDS: FieldConfig[] = [
  {
    key: "fasting_glucose", label: "공복혈당", unit: "mg/dL", placeholder: "100",
    hint: "일반 참고 기준: 100 미만 · 100-125 경계 · 126 이상 높음",
    min: 30, max: 500,
  },
];

const BP_FIELDS: FieldConfig[] = [
  {
    key: "bp_systolic", label: "수축기 혈압", unit: "mmHg", placeholder: "120",
    hint: "일반 참고 기준: 120 미만 · 120-139 경계 · 140 이상 높음",
    min: 60, max: 300,
  },
  { key: "bp_diastolic", label: "이완기 혈압", unit: "mmHg", placeholder: "80", min: 30, max: 200 },
];

const CHOLESTEROL_FIELDS: FieldConfig[] = [
  {
    key: "total_cholesterol", label: "총 콜레스테롤", unit: "mg/dL", placeholder: "200",
    hint: "200 미만 정상 · 200-239 경계 · 240 이상 주의",
    min: 50, max: 500,
  },
  { key: "ldl", label: "LDL (나쁜 콜레스테롤)", unit: "mg/dL", placeholder: "130", min: 20, max: 400 },
  { key: "hdl", label: "HDL (좋은 콜레스테롤)", unit: "mg/dL", placeholder: "50", min: 10, max: 200 },
  { key: "triglycerides", label: "중성지방", unit: "mg/dL", placeholder: "150", min: 20, max: 1000 },
];

const SECTIONS = [
  { title: "기본 정보", fields: BASIC_FIELDS },
  { title: "혈당", fields: GLUCOSE_FIELDS },
  { title: "혈압", fields: BP_FIELDS },
  { title: "콜레스테롤", fields: CHOLESTEROL_FIELDS },
];

export default function HealthPage() {
  const router = useRouter();
  const [data, setData] = useState<HealthData>({
    height_cm: "", weight_kg: "",
    fasting_glucose: "",
    bp_systolic: "", bp_diastolic: "",
    total_cholesterol: "", ldl: "", hdl: "", triglycerides: "",
  });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // 기존 데이터 로드
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoaded(true);
        return;
      }

      const { data: profile } = await (supabase
        .from("user_health_profiles") as any)
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (profile) {
        setData({
          height_cm: profile.height_cm?.toString() || "",
          weight_kg: profile.weight_kg?.toString() || "",
          fasting_glucose: profile.fasting_glucose?.toString() || "",
          bp_systolic: profile.bp_systolic?.toString() || "",
          bp_diastolic: profile.bp_diastolic?.toString() || "",
          total_cholesterol: profile.total_cholesterol?.toString() || "",
          ldl: profile.ldl?.toString() || "",
          hdl: profile.hdl?.toString() || "",
          triglycerides: profile.triglycerides?.toString() || "",
        });
      }
      setLoaded(true);
    })();
  }, []);

  const handleChange = (key: keyof HealthData, value: string) => {
    // 숫자만 허용 (소수점 포함)
    if (value && !/^\d*\.?\d*$/.test(value)) return;
    setData((prev) => ({ ...prev, [key]: value }));
  };

  const filledCount = Object.values(data).filter((v) => v.trim() !== "").length;
  const totalCount = Object.keys(data).length;

  const handleSave = async () => {
    setSaving(true);

    // 숫자 변환
    const numericData: Record<string, number | null> = {};
    for (const [key, val] of Object.entries(data)) {
      numericData[key] = val.trim() ? parseFloat(val) : null;
    }

    // BMI 자동 계산
    if (numericData.height_cm && numericData.weight_kg) {
      const h = numericData.height_cm / 100;
      numericData.bmi = Math.round((numericData.weight_kg / (h * h)) * 10) / 10;
    }

    // 질환 자동 감지
    const conditions: string[] = [];
    if (numericData.fasting_glucose && numericData.fasting_glucose >= 126) {
      conditions.push("diabetes");
    }
    if (numericData.bp_systolic && numericData.bp_systolic >= 140) {
      conditions.push("hypertension");
    }
    if (numericData.ldl && numericData.ldl >= 160) {
      conditions.push("hyperlipidemia");
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      await (supabase.from("user_health_profiles") as any).upsert({
        user_id: user.id,
        ...numericData,
        conditions,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    }

    // localStorage에도 저장 (비로그인 + 빠른 복원)
    try {
      localStorage.setItem("carefood_health", JSON.stringify({ ...numericData, conditions }));
    } catch { /* silent */ }

    setSaving(false);
    router.push("/health/report");
  };

  if (!loaded) return <PageLoading />;

  return (
    <Page width="narrow">
      <PageHeader
        title="건강검진 정보 입력"
        description="검진 결과를 넣으면 성분 매칭이 더 정확해져요. 모든 항목은 선택이에요."
      />

      {/* 진행도 */}
      <Card tone="brand" padding="sm" className="mb-4">
        <div className="flex items-center gap-3">
          <span className="text-label font-bold text-brand-ink shrink-0">
            <span className="num">{filledCount}</span>/<span className="num">{totalCount}</span>개 입력함
          </span>
          <ProgressBar value={filledCount} max={totalCount} label="입력 진행도" />
        </div>
      </Card>

      {/* 입력 섹션 */}
      <div className="flex flex-col gap-3">
        {SECTIONS.map((section) => (
          <Card key={section.title}>
            <h2 className="text-body font-bold text-ink mb-3">{section.title}</h2>
            <div className="flex flex-col gap-4">
              {section.fields.map((field) => (
                <Field key={field.key} label={field.label} hint={field.hint}>
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={data[field.key]}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                    />
                    <span className="text-label text-ink-2 w-14 text-right shrink-0">{field.unit}</span>
                  </div>
                </Field>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Notice className="mt-4">
        입력한 정보는 식품 성분 매칭에만 쓰이며 의학적 진단이 아니에요. 건강에 이상이 있다면 전문가와 상담하세요.
      </Notice>

      <div className="mt-4 flex gap-2">
        <Button variant="secondary" block onClick={() => router.back()}>돌아가기</Button>
        <Button block onClick={handleSave} disabled={filledCount === 0} loading={saving}>
          {saving ? "저장 중" : "분석 결과 보기"}
        </Button>
      </div>
    </Page>
  );
}
