"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type FamilyProfile = {
  id: string;
  nickname: string;
  relationship: string;
  birth_year: number | null;
  concerns: string[];
  conditions: string[];
  height_cm: number | null;
  weight_kg: number | null;
  bmi: number | null;
  fasting_glucose: number | null;
  bp_systolic: number | null;
};

type NewProfile = {
  nickname: string;
  relationship: string;
  birth_year: string;
  concerns: string[];
  height_cm: string;
  weight_kg: string;
  fasting_glucose: string;
  bp_systolic: string;
  bp_diastolic: string;
  total_cholesterol: string;
  ldl: string;
  taste_salty: number;
  taste_sweet: number;
  taste_spicy: number;
  taste_fatty: number;
};

const CONCERN_OPTIONS = [
  { key: "gut_health", label: "장건강", emoji: "🌿" },
  { key: "skin", label: "피부건강", emoji: "✨" },
  { key: "weight", label: "체중관리", emoji: "🏃" },
  { key: "energy", label: "활력충전", emoji: "⚡" },
];

const RELATIONSHIP_OPTIONS = [
  { key: "parent", label: "부모님" },
  { key: "grandparent", label: "조부모님" },
  { key: "spouse", label: "배우자" },
  { key: "child", label: "자녀" },
  { key: "other", label: "기타" },
];

const CONDITION_LABELS: Record<string, string> = {
  diabetes: "당류 제한", hypertension: "나트륨 제한", hyperlipidemia: "지방 제한",
};

const CONCERN_LABELS: Record<string, string> = {
  gut_health: "장건강", skin: "피부건강", weight: "체중관리", energy: "활력충전",
};

const emptyProfile: NewProfile = {
  nickname: "", relationship: "parent", birth_year: "",
  concerns: [], height_cm: "", weight_kg: "",
  fasting_glucose: "", bp_systolic: "", bp_diastolic: "",
  total_cholesterol: "", ldl: "",
  taste_salty: 3, taste_sweet: 3, taste_spicy: 3, taste_fatty: 3,
};

export default function FamilyPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<FamilyProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewProfile>({ ...emptyProfile });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const res = await fetch(`/api/family?userId=${user.id}`);
      const data = await res.json();
      setProfiles(data.profiles || []);
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    if (!userId || !form.nickname.trim() || saving) return;
    setSaving(true);

    const body: Record<string, any> = {
      userId,
      nickname: form.nickname.trim(),
      relationship: form.relationship,
      birth_year: form.birth_year ? parseInt(form.birth_year) : null,
      concerns: form.concerns,
      height_cm: form.height_cm ? parseFloat(form.height_cm) : null,
      weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
      fasting_glucose: form.fasting_glucose ? parseFloat(form.fasting_glucose) : null,
      bp_systolic: form.bp_systolic ? parseFloat(form.bp_systolic) : null,
      bp_diastolic: form.bp_diastolic ? parseFloat(form.bp_diastolic) : null,
      total_cholesterol: form.total_cholesterol ? parseFloat(form.total_cholesterol) : null,
      ldl: form.ldl ? parseFloat(form.ldl) : null,
      taste_salty: form.taste_salty,
      taste_sweet: form.taste_sweet,
      taste_spicy: form.taste_spicy,
      taste_fatty: form.taste_fatty,
    };

    const res = await fetch("/api/family", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.profile) {
      setProfiles((prev) => [...prev, data.profile]);
      setForm({ ...emptyProfile });
      setShowForm(false);
    }
    setSaving(false);
  };

  const handleDelete = async (profileId: string) => {
    if (!userId) return;
    await fetch("/api/family", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: profileId, userId }),
    });
    setProfiles((prev) => prev.filter((p) => p.id !== profileId));
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-muted mb-4">가족 관리는 로그인이 필요해요</p>
          <Link href="/login?returnTo=/family" className="inline-block bg-primary text-white px-6 py-3 rounded-full font-bold">
            로그인하기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] px-4 py-6">
      <div className="max-w-lg mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold">가족 건강 관리</h1>
            <p className="text-sm text-muted">가족의 건강 정보를 등록하고 맞춤 추천을 받아보세요</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-sm bg-primary text-white px-4 py-2 rounded-xl font-bold"
          >
            {showForm ? "취소" : "+ 추가"}
          </button>
        </div>

        {/* 추가 폼 */}
        {showForm && (
          <div className="bg-card border border-border rounded-2xl p-5 mb-6 space-y-5">
            <h2 className="font-bold">가족 정보 입력</h2>

            {/* 기본 정보 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">이름/별칭</label>
                <input
                  type="text"
                  value={form.nickname}
                  onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                  placeholder="예: 어머니"
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:border-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">관계</label>
                <select
                  value={form.relationship}
                  onChange={(e) => setForm({ ...form, relationship: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:border-primary outline-none"
                >
                  {RELATIONSHIP_OPTIONS.map((r) => (
                    <option key={r.key} value={r.key}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">출생년도 (선택)</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.birth_year}
                onChange={(e) => setForm({ ...form, birth_year: e.target.value.replace(/\D/g, "") })}
                placeholder="1960"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:border-primary outline-none"
              />
            </div>

            {/* 건강 관심사 */}
            <div>
              <label className="block text-xs font-medium mb-2">건강 관심사</label>
              <div className="flex flex-wrap gap-2">
                {CONCERN_OPTIONS.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => {
                      const next = form.concerns.includes(c.key)
                        ? form.concerns.filter((x) => x !== c.key)
                        : [...form.concerns, c.key];
                      setForm({ ...form, concerns: next });
                    }}
                    className={`px-3 py-2 rounded-xl text-sm transition-all ${
                      form.concerns.includes(c.key)
                        ? "bg-primary/10 border-2 border-primary text-primary font-medium"
                        : "bg-surface border-2 border-border"
                    }`}
                  >
                    {c.emoji} {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 건강검진 수치 (접이식) */}
            <details className="group">
              <summary className="text-xs font-medium text-primary cursor-pointer">
                건강검진 수치 입력 (선택) ▾
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {[
                  { key: "height_cm" as const, label: "키 (cm)", ph: "170" },
                  { key: "weight_kg" as const, label: "체중 (kg)", ph: "65" },
                  { key: "fasting_glucose" as const, label: "공복혈당", ph: "100" },
                  { key: "bp_systolic" as const, label: "수축기 혈압", ph: "120" },
                  { key: "total_cholesterol" as const, label: "총 콜레스테롤", ph: "200" },
                  { key: "ldl" as const, label: "LDL", ph: "130" },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="block text-xs text-muted mb-1">{f.label}</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={form[f.key]}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      placeholder={f.ph}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:border-primary outline-none"
                    />
                  </div>
                ))}
              </div>
            </details>

            <button
              onClick={handleSave}
              disabled={!form.nickname.trim() || saving}
              className="w-full bg-primary text-white py-3 rounded-full font-bold hover:bg-primary-dark transition-colors disabled:opacity-40"
            >
              {saving ? "저장 중..." : "가족 추가하기"}
            </button>
          </div>
        )}

        {/* 가족 목록 */}
        {profiles.length === 0 && !showForm ? (
          <div className="text-center py-16 bg-card border border-border rounded-2xl">
            <p className="text-3xl mb-3">👨‍👩‍👧‍👦</p>
            <p className="font-bold mb-1">아직 등록된 가족이 없어요</p>
            <p className="text-sm text-muted mb-4">가족을 추가하면 맞춤 식품 추천을 대신 받아줄 수 있어요</p>
            <button
              onClick={() => setShowForm(true)}
              className="bg-primary text-white px-5 py-2.5 rounded-full text-sm font-bold"
            >
              가족 추가하기
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {profiles.map((p) => {
              const age = p.birth_year ? new Date().getFullYear() - p.birth_year : null;

              return (
                <div key={p.id} className="bg-card border border-border rounded-2xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-lg">{p.nickname}</h3>
                      <p className="text-xs text-muted">
                        {RELATIONSHIP_OPTIONS.find((r) => r.key === p.relationship)?.label || p.relationship}
                        {age ? ` · ${age}세` : ""}
                        {p.bmi ? ` · BMI ${p.bmi}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="text-xs text-muted hover:text-red-500 transition-colors px-2 py-1"
                    >
                      삭제
                    </button>
                  </div>

                  {/* 관심사 태그 */}
                  {p.concerns.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {p.concerns.map((c) => (
                        <span key={c} className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium">
                          {CONCERN_LABELS[c] || c}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 자동 감지 조건 */}
                  {p.conditions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {p.conditions.map((c) => (
                        <span key={c} className="text-xs px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                          {CONDITION_LABELS[c] || c}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 건강 수치 요약 */}
                  <div className="flex gap-3 text-xs text-muted">
                    {p.fasting_glucose && <span>혈당 {p.fasting_glucose}</span>}
                    {p.bp_systolic && <span>혈압 {p.bp_systolic}</span>}
                  </div>

                  {/* 대리 추천 버튼 */}
                  <Link
                    href={`/recommend?family=${p.id}`}
                    className="block mt-3 text-center py-2.5 rounded-xl bg-primary/5 text-primary text-sm font-medium hover:bg-primary/10 transition-colors"
                  >
                    {p.nickname}님 맞춤 추천 보기
                  </Link>
                </div>
              );
            })}
          </div>
        )}

        {/* 하단 안내 */}
        <div className="mt-6 p-4 rounded-xl bg-surface border border-border">
          <p className="text-xs text-muted leading-relaxed">
            가족 정보는 식품 성분 매칭에만 사용되며, 의학적 진단이 아닙니다.
            가족의 건강 정보는 보호자 본인만 열람할 수 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
