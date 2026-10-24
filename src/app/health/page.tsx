"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
    hint: "100 미만 정상 · 100-125 주의 · 126 이상 당뇨 의심",
    min: 30, max: 500,
  },
];

const BP_FIELDS: FieldConfig[] = [
  {
    key: "bp_systolic", label: "수축기 혈압", unit: "mmHg", placeholder: "120",
    hint: "120 미만 정상 · 120-139 주의 · 140 이상 고혈압 의심",
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
  { title: "기본 정보", fields: BASIC_FIELDS, icon: "📏" },
  { title: "혈당", fields: GLUCOSE_FIELDS, icon: "🩸" },
  { title: "혈압", fields: BP_FIELDS, icon: "❤️" },
  { title: "콜레스테롤", fields: CHOLESTEROL_FIELDS, icon: "🧪" },
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

  if (!loaded) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] px-4 py-8">
      <div className="max-w-lg mx-auto">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold mb-2">건강검진 정보 입력</h1>
          <p className="text-muted text-sm leading-relaxed">
            건강검진 결과를 입력하면 더 정확한 맞춤 추천을 받을 수 있어요.
            <br />
            <span className="text-xs">모든 항목은 선택 사항이에요 · 입력한 정보는 기기에만 저장돼요</span>
          </p>
        </div>

        {/* 진행도 */}
        <div className="flex items-center gap-2 mb-6 p-3 rounded-xl bg-primary/5 border border-primary/10">
          <span className="text-sm font-medium text-primary">
            {filledCount}/{totalCount}개 입력됨
          </span>
          <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${(filledCount / totalCount) * 100}%` }}
            />
          </div>
        </div>

        {/* 입력 섹션 */}
        <div className="space-y-6">
          {SECTIONS.map((section) => (
            <div key={section.title} className="bg-card border border-border rounded-2xl p-5">
              <h2 className="font-bold text-sm mb-4 flex items-center gap-2">
                <span>{section.icon}</span>
                {section.title}
              </h2>
              <div className="space-y-4">
                {section.fields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium mb-1.5">
                      {field.label}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={data[field.key]}
                        onChange={(e) => handleChange(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="flex-1 px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-colors"
                      />
                      <span className="text-sm text-muted w-14 text-right shrink-0">
                        {field.unit}
                      </span>
                    </div>
                    {field.hint && (
                      <p className="text-xs text-muted mt-1.5 pl-1">{field.hint}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 하단 안내 + 버튼 */}
        <div className="mt-6 p-4 rounded-xl bg-surface border border-border">
          <p className="text-xs text-muted leading-relaxed">
            입력하신 정보는 식품 성분 매칭에만 사용되며, 의학적 진단이 아닙니다.
            건강에 이상이 있다면 의료 전문가와 상담하세요.
          </p>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => router.back()}
            className="flex-1 border border-border py-3.5 rounded-full font-medium hover:bg-card transition-colors"
          >
            돌아가기
          </button>
          <button
            onClick={handleSave}
            disabled={saving || filledCount === 0}
            className="flex-1 bg-primary text-white py-3.5 rounded-full font-bold hover:bg-primary-dark transition-colors disabled:opacity-40"
          >
            {saving ? "저장 중..." : "분석 결과 보기"}
          </button>
        </div>
      </div>
    </div>
  );
}
