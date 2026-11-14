"use client";

import { useState, useEffect } from "react";
import {
  Badge, Button, Card, Chip, ConfirmSheet, EmptyState, Field, Icon, Input, LinkButton, Notice, Page, PageHeader, PageLoading, SectionHeader, Select, useToast,
} from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { FamilyConnect } from "./FamilyConnect";

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
  { key: "gut_health", label: "장건강" },
  { key: "skin", label: "피부건강" },
  { key: "weight", label: "체중관리" },
  { key: "energy", label: "활력충전" },
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
  const [deleteTarget, setDeleteTarget] = useState<FamilyProfile | null>(null);
  const toast = useToast();

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
      toast.show(`${data.profile.nickname}님을 추가했어요`);
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
    toast.show("가족 정보를 삭제했어요");
  };

  if (loading) return <PageLoading />;

  if (!userId) {
    return (
      <Page width="narrow">
        <PageHeader title="가족" />
        <EmptyState
          title="가족과 연결하려면 로그인이 필요해요"
          description="로그인하면 가족을 초대해 끼니 기록·고른 제품·약 체크를 함께 볼 수 있어요"
          action={<LinkButton href="/login?returnTo=/family">로그인하기</LinkButton>}
        />
      </Page>
    );
  }

  const setField = <K extends keyof NewProfile>(key: K, value: NewProfile[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <Page width="narrow">
      <PageHeader title="가족" description="가족이 보여 주기로 한 것만 보고, 내 것도 고른 만큼만 보여 줘요" />

      <FamilyConnect />

      <SectionHeader title="직접 입력한 가족 프로필" description="가족 대신 맞춤 추천을 받아볼 때"
        action={
          <Button size="sm" variant="secondary" icon={showForm ? undefined : "plus"} onClick={() => setShowForm(!showForm)}>
            {showForm ? "취소" : "프로필 추가하기"}
          </Button>
        } />

      {/* 추가 폼 */}
      {showForm && (
        <Card className="mb-6">
          <h2 className="text-body font-bold text-ink mb-4">가족 정보 입력</h2>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="이름/별칭">
                <Input type="text" value={form.nickname} onChange={(e) => setField("nickname", e.target.value)} placeholder="예: 어머니" />
              </Field>
              <Field label="관계">
                <Select value={form.relationship} onChange={(e) => setField("relationship", e.target.value)}>
                  {RELATIONSHIP_OPTIONS.map((r) => (
                    <option key={r.key} value={r.key}>{r.label}</option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="출생년도 (선택)">
              <Input type="text" inputMode="numeric" value={form.birth_year}
                onChange={(e) => setField("birth_year", e.target.value.replace(/\D/g, ""))} placeholder="1960" />
            </Field>

            <div className="flex flex-col gap-1.5">
              <span className="text-label font-medium text-ink">건강 관심사</span>
              <div className="flex flex-wrap gap-2">
                {CONCERN_OPTIONS.map((c) => (
                  <Chip
                    key={c.key}
                    selected={form.concerns.includes(c.key)}
                    onClick={() => {
                      const next = form.concerns.includes(c.key)
                        ? form.concerns.filter((x) => x !== c.key)
                        : [...form.concerns, c.key];
                      setField("concerns", next);
                    }}
                  >
                    {c.label}
                  </Chip>
                ))}
              </div>
            </div>

            {/* 건강검진 수치 (접이식) */}
            <details className="group rounded-md bg-sunken px-3 py-2">
              <summary className="flex items-center justify-between gap-2 h-9 text-label font-medium text-ink cursor-pointer list-none">
                건강검진 수치 입력 (선택)
                <Icon name="chevron-down" size={18} className="text-ink-2 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-2 mb-1 grid grid-cols-2 gap-3">
                {[
                  { key: "height_cm" as const, label: "키 (cm)", ph: "170" },
                  { key: "weight_kg" as const, label: "체중 (kg)", ph: "65" },
                  { key: "fasting_glucose" as const, label: "공복혈당", ph: "100" },
                  { key: "bp_systolic" as const, label: "수축기 혈압", ph: "120" },
                  { key: "total_cholesterol" as const, label: "총 콜레스테롤", ph: "200" },
                  { key: "ldl" as const, label: "LDL", ph: "130" },
                ].map((f) => (
                  <Field key={f.key} label={f.label}>
                    <Input type="text" inputMode="decimal" value={form[f.key]}
                      onChange={(e) => setField(f.key, e.target.value)} placeholder={f.ph} />
                  </Field>
                ))}
              </div>
            </details>

            <Button block onClick={handleSave} disabled={!form.nickname.trim()} loading={saving}>
              {saving ? "저장 중" : "프로필 추가하기"}
            </Button>
          </div>
        </Card>
      )}

      {/* 가족 목록 */}
      {profiles.length === 0 && !showForm ? (
        <EmptyState
          title="직접 입력한 프로필이 없어요"
          description="가족 정보를 입력하면 맞춤 식품 추천을 대신 받아볼 수 있어요"
          action={<Button size="sm" variant="secondary" icon="plus" onClick={() => setShowForm(true)}>프로필 추가하기</Button>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {profiles.map((p) => {
            const age = p.birth_year ? new Date().getFullYear() - p.birth_year : null;
            return (
              <Card key={p.id}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <h3 className="text-body font-bold text-ink">{p.nickname}</h3>
                    <p className="text-caption text-ink-2">
                      {RELATIONSHIP_OPTIONS.find((r) => r.key === p.relationship)?.label || p.relationship}
                      {age ? <> · <span className="num">{age}</span>세</> : null}
                      {p.bmi ? <> · BMI <span className="num">{p.bmi}</span></> : null}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" icon="trash" onClick={() => setDeleteTarget(p)}>삭제하기</Button>
                </div>

                {(p.concerns.length > 0 || p.conditions.length > 0) && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {p.concerns.map((c) => <Badge key={c} tone="brand">{CONCERN_LABELS[c] || c}</Badge>)}
                    {p.conditions.map((c) => <Badge key={c} tone="caution">{CONDITION_LABELS[c] || c}</Badge>)}
                  </div>
                )}

                {(p.fasting_glucose || p.bp_systolic) && (
                  <div className="flex gap-3 text-caption text-ink-2">
                    {p.fasting_glucose && <span>혈당 <span className="num font-bold text-ink">{p.fasting_glucose}</span></span>}
                    {p.bp_systolic && <span>혈압 <span className="num font-bold text-ink">{p.bp_systolic}</span></span>}
                  </div>
                )}

                <LinkButton href={`/recommend?family=${p.id}`} variant="secondary" size="sm" block className="mt-3" iconRight="chevron-right">
                  {p.nickname}님 맞춤 추천 보기
                </LinkButton>
              </Card>
            );
          })}
        </div>
      )}

      <Notice className="mt-6">
        가족 정보는 식품 성분 매칭에만 쓰이며 의학적 진단이 아니에요. 가족의 건강 정보는 보호자 본인만 볼 수 있어요.
      </Notice>

      <ConfirmSheet
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) handleDelete(deleteTarget.id); setDeleteTarget(null); }}
        title={`${deleteTarget?.nickname || ""}님 정보를 삭제할까요?`}
        description="등록한 건강 정보도 함께 지워지고 되돌릴 수 없어요"
        confirmLabel="삭제하기"
      />
    </Page>
  );
}
