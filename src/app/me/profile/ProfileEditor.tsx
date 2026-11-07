"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SensitivityLevel, TasteLevel } from "@/types/database";
import {
  BottomBar, Button, Chip, Field, Icon, Input, Notice, PageHeader, SectionHeader, Select, Skeleton, Stat, TextLink, useToast,
} from "@/components/ui";
import { calculateNutritionGoals, HEALTH_GOAL_LABELS, type DietType, type Gender, type HealthGoal } from "@/lib/nutrition";
import {
  ALLERGIES, DIET_OPTIONS, DISEASE_GOALS, EATING_OUT_OPTIONS, MAIN_GOALS, TASTE_CONFIG,
  buildProfile, persistProfile, readLocalProfile, tasteBenchmark, type ProfileInput,
} from "@/lib/profile-options";

/**
 * 관심사·건강 정보 고치기 — 온보딩을 처음부터 다시 하지 않고 한 화면에서 바꾼다.
 * 저장하면 추천(이 기기·서버 프로필)과 식단 기록의 하루 목표가 같이 바뀐다.
 */
const DEFAULTS: ProfileInput = {
  goals: [], gender: "other", birthYear: 1995, heightCm: 170, weightKg: 65, mealsPerDay: 3, eatingOutFreq: "1_2",
  dietType: "normal", allergies: [], sensitivity: { digestive: 2, additive: 2 }, tastes: { salty: 5, sweet: 5, spicy: 5, fatty: 5 },
};

function fromLocal(p: Record<string, unknown> | null): ProfileInput {
  if (!p) return DEFAULTS;
  return {
    goals: (p.goals as HealthGoal[]) || [],
    gender: (p.gender as Gender) || "other",
    birthYear: Number(p.birthYear) || DEFAULTS.birthYear,
    heightCm: Number(p.heightCm) || DEFAULTS.heightCm,
    weightKg: Number(p.weightKg) || DEFAULTS.weightKg,
    mealsPerDay: Number(p.meals_per_day) || 3,
    eatingOutFreq: (p.eating_out_freq as string) || "1_2",
    dietType: (p.diet_type as DietType) || "normal",
    allergies: (p.allergies as string[]) || [],
    sensitivity: (p.sensitivity as { digestive: SensitivityLevel; additive: SensitivityLevel }) || DEFAULTS.sensitivity,
    tastes: (p.tastes as ProfileInput["tastes"]) || DEFAULTS.tastes,
  };
}

const THIS_YEAR = new Date().getFullYear();

export function ProfileEditor() {
  const router = useRouter();
  const toast = useToast();
  const [base, setBase] = useState<Record<string, unknown> | null>(null);
  const [s, setS] = useState<ProfileInput | null>(null);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const p = readLocalProfile();
    /* eslint-disable react-hooks/set-state-in-effect -- 이 기기 저장소는 화면을 그린 뒤에만 읽을 수 있다 */
    setBase(p || {});
    const init = fromLocal(p);
    setS(init);
    setConsent(init.goals.some((g) => DISEASE_GOALS.includes(g))); // 이미 고른 적 있으면 동의한 것
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const bodyOk = !!s && s.gender !== "other" && s.birthYear > 1920 && s.birthYear <= THIS_YEAR - 10
    && s.heightCm >= 100 && s.heightCm <= 250 && s.weightKg >= 20 && s.weightKg <= 300;
  const goals = useMemo(() => (s && bodyOk
    ? calculateNutritionGoals({ gender: s.gender as Gender, birthYear: s.birthYear, heightCm: s.heightCm, weightKg: s.weightKg }, s.goals.length ? s.goals : ["balanced"], s.dietType)
    : null), [s, bodyOk]);

  if (!s || !base) {
    return (<><PageHeader title="관심사·건강 정보" /><Skeleton className="h-64 rounded-lg" /></>);
  }

  const set = <K extends keyof ProfileInput>(k: K, v: ProfileInput[K]) => setS({ ...s, [k]: v });
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const needsConsent = s.goals.some((g) => DISEASE_GOALS.includes(g));
  const canSave = s.goals.length > 0 && (!needsConsent || consent);

  const save = async () => {
    setSaving(true);
    try {
      await persistProfile(buildProfile(s, goals, base), { syncDiaryGoals: true });
      toast.show("저장했어요. 추천과 식단 기록 목표에 바로 반영돼요");
      router.push("/me");
    } catch {
      toast.show("저장하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setSaving(false); }
  };

  return (
    <div className="pb-24">
      <PageHeader title="관심사·건강 정보" description="바꾸면 추천과 식단 기록의 하루 목표가 같이 바뀌어요" />

      {/* ── 목표 ── */}
      <section className="mb-8">
        <SectionHeader title="건강 목표" description="여러 개 고를 수 있어요" />
        <div className="flex flex-wrap gap-2">
          {MAIN_GOALS.map((g) => (
            <Chip key={g} selected={s.goals.includes(g)} onClick={() => set("goals", toggle(s.goals, g))}>{HEALTH_GOAL_LABELS[g].label}</Chip>
          ))}
        </div>
        <p className="text-label font-medium text-ink mt-5 mb-2">관심 있는 수치 <span className="text-ink-2 font-regular">(선택)</span></p>
        <div className="flex flex-wrap gap-2">
          {DISEASE_GOALS.map((g) => (
            <Chip key={g} selected={s.goals.includes(g)} onClick={() => set("goals", toggle(s.goals, g))}>{HEALTH_GOAL_LABELS[g].label}</Chip>
          ))}
        </div>
        {needsConsent && (
          <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
            <input type="checkbox" className="ds-check shrink-0 mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span className="text-label text-ink-2">건강 관련 관심사를 맞춤 추천에만 쓰는 데 동의해요. 진단이 아니라 성분 정보로 고르는 데 써요 <TextLink href="/privacy">개인정보처리방침</TextLink></span>
          </label>
        )}
      </section>

      {/* ── 신체 ── */}
      <section className="mb-8">
        <SectionHeader title="신체 정보" description="하루 목표 칼로리·단백질을 계산해요" />
        <div className="flex flex-wrap gap-2 mb-4" role="radiogroup" aria-label="성별">
          {([["female", "여성"], ["male", "남성"]] as const).map(([k, label]) => (
            <Chip key={k} selected={s.gender === k} onClick={() => set("gender", k)}>{label}</Chip>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="출생 연도"><Input type="number" inputMode="numeric" name="birthYear" className="num" value={s.birthYear || ""} onChange={(e) => set("birthYear", Number(e.target.value) || 0)} /></Field>
          <Field label="키 (cm)"><Input type="number" inputMode="decimal" name="heightCm" className="num" value={s.heightCm || ""} onChange={(e) => set("heightCm", Number(e.target.value) || 0)} /></Field>
          <Field label="몸무게 (kg)"><Input type="number" inputMode="decimal" name="weightKg" className="num" value={s.weightKg || ""} onChange={(e) => set("weightKg", Number(e.target.value) || 0)} /></Field>
        </div>
        {goals ? (
          <div className="flex flex-wrap gap-x-8 gap-y-3 mt-4 rounded-md bg-sunken px-4 py-3">
            <Stat label="하루 목표" value={goals.dailyCalories.toLocaleString("ko-KR")} unit="kcal" emphasis />
            <Stat label="단백질" value={String(goals.dailyProteinG)} unit="g" />
            <Stat label="나트륨 상한" value={goals.maxSodiumMg.toLocaleString("ko-KR")} unit="mg" />
          </div>
        ) : (
          <p className="text-caption text-ink-2 mt-3">성별과 신체 정보를 넣으면 하루 목표를 계산해요</p>
        )}
      </section>

      {/* ── 식사 ── */}
      <section className="mb-8">
        <SectionHeader title="식사 패턴" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="식단">
            <Select name="dietType" value={s.dietType} onChange={(e) => set("dietType", e.target.value as DietType)}>
              {DIET_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="하루 끼니">
            <Select name="mealsPerDay" value={s.mealsPerDay} onChange={(e) => set("mealsPerDay", Number(e.target.value))}>
              {[2, 3, 4].map((n) => <option key={n} value={n}>{n}끼</option>)}
            </Select>
          </Field>
          <Field label="외식">
            <Select name="eatingOutFreq" value={s.eatingOutFreq} onChange={(e) => set("eatingOutFreq", e.target.value)}>
              {EATING_OUT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </Select>
          </Field>
        </div>
      </section>

      {/* ── 알레르기 ── */}
      <section className="mb-8" id="allergies">
        <SectionHeader title="알레르기" description="고른 성분이 든 제품은 추천에서 빼요" />
        <div className="flex flex-wrap gap-2">
          {ALLERGIES.map((a) => (
            <Chip key={a.key} selected={s.allergies.includes(a.key)} onClick={() => set("allergies", toggle(s.allergies, a.key))}>{a.label}</Chip>
          ))}
        </div>
        <Notice icon="alert" className="mt-3">제품 상세의 알레르기 표시는 제조사 표기를 따라요. 드시기 전 포장의 표시를 한 번 더 확인해 주세요</Notice>
      </section>

      {/* ── 맛 ── */}
      <section className="mb-8">
        <SectionHeader title="맛 선호" description="입맛에 맞는 제품을 먼저 보여 줘요" />
        <div className="flex flex-col gap-4">
          {TASTE_CONFIG.map((t) => (
            <div key={t.key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-label font-medium text-ink">{t.label}</span>
                <span className="text-caption text-ink-2">{tasteBenchmark(t.key, s.tastes[t.key])} 정도</span>
              </div>
              <input type="range" min={1} max={10} step={1} className="ds-range" aria-label={t.label}
                value={s.tastes[t.key]} onChange={(e) => set("tastes", { ...s.tastes, [t.key]: Number(e.target.value) as TasteLevel })} />
            </div>
          ))}
        </div>
      </section>

      <p className="flex items-center gap-1.5 text-caption text-ink-2">
        <Icon name="lock" size={14} className="shrink-0" />이 정보는 나만 봐요. 커뮤니티 글에는 나오지 않아요
      </p>

      <BottomBar>
        <Button block disabled={!canSave} loading={saving} onClick={save}>저장하기</Button>
      </BottomBar>
    </div>
  );
}
