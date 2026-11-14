"use client";

import { useEffect, useState } from "react";
import { Button, Chip, ChipRow, ChoiceCard, ChoiceList, Field, Input, RangeInput, Sheet, Tabs, useToast } from "@/components/ui";
import {
  BUNDLES, DAY_CHOICES, KCAL_TIERS, NOTE_MAX, RULES, TEMPLATES, defaultGoal, nearestTier, ruleOf,
  type Bundle, type Template, type UserMetric,
} from "@/lib/challenge-rules";
import { MACRO_TYPES, kcalRange } from "@/lib/challenges";
import { getOrCreateNickname } from "@/lib/nickname";

/**
 * 내 챌린지 만들기 — 위는 템플릿(누르면 숫자가 채워짐), 아래는 묶음 탭 → 규칙 → 숫자 (규칙·제목을 글로 쓰지 않는다).
 * 열량은 '…이하'가 없고 구간(±10%)만 — 6구간 중 내 목표에 가장 가까운 것을 먼저 고른다. 구간 숫자는 나만 본다.
 * 탄단지는 5유형, 저탄수·저지방은 추천하지 않고 고를 때만.
 * 기간 → 성공 기준 → 시작일 → 각오(선택). 만들면 내 묶음이 열리고 onCreated 로 초대 카드를 띄운다.
 */
type Start = "today" | "tomorrow" | "monday";
const START_LABEL: Record<Start, string> = { today: "오늘", tomorrow: "내일", monday: "다음 월요일" };
const won = (v: number) => v.toLocaleString("ko-KR");

export default function ChallengeCreateSheet({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (r: { challenge_id: string; group_id: string; title: string }) => void;
}) {
  const toast = useToast();
  const [bundle, setBundle] = useState<Bundle>("record");
  const [metric, setMetric] = useState<UserMetric>("meals_min");
  const [target, setTarget] = useState(3);
  const [days, setDays] = useState(7);
  const [goal, setGoal] = useState(defaultGoal(7));
  const [start, setStart] = useState<Start>("tomorrow");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tpl, setTpl] = useState<string | null>(null);
  /** 식단 기록 화면의 하루 열량 목표 — 열량 구간 추천에 쓴다 (없으면 2,000kcal 기준) */
  const [goalKcal, setGoalKcal] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/diary/goals")
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error); if (alive) setGoalKcal(Number(d.goals?.daily_calories) || null); })
      .catch((e) => console.error("목표를 불러오지 못했어요:", (e as Error).message)); // ds-allow: 추천 구간만 2,000kcal 기준으로 보인다
    return () => { alive = false; };
  }, [open]);

  const myTier = nearestTier(goalKcal);
  const spec = ruleOf(metric)!;
  const t = spec.target;
  const value = t ? target : 1;
  const title = spec.title(days, value);

  const pickRule = (m: UserMetric) => {
    setMetric(m);
    setTpl(null);
    const r = ruleOf(m);
    if (r?.target) setTarget(r.target.kind === "kcal" ? myTier : r.target.default);
    setError(null);
  };
  const pickDays = (d: number) => { setDays(d); setGoal(defaultGoal(d)); };
  const pickTemplate = (x: Template) => {
    const r = ruleOf(x.metric)!;
    setTpl(x.key);
    setBundle(r.bundle);
    setMetric(x.metric);
    setTarget(x.target === "my_tier" ? myTier : x.target);
    pickDays(x.days);
    setError(null);
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/community/challenges/new", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metric, target: value, days, goal, start, note, nickname: getOrCreateNickname() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || "만들지 못했어요. 다시 시도해 주세요"); return; }
      toast.show(`"${d.title}" 챌린지를 만들었어요. 친구에게 링크를 보내 주세요`);
      onCreated(d);
      setNote("");
    } catch {
      toast.show("만들지 못했어요. 연결을 확인하고 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(false); }
  };

  const inBundle = RULES.filter((r) => r.bundle === bundle);
  const ruleLabel = (label: string, hint: string) => (
    <span className="flex flex-col"><span className="text-body text-ink">{label}</span><span className="text-caption text-ink-2">{hint}</span></span>
  );

  return (
    <Sheet open={open} onClose={onClose} title="챌린지 만들기" description="식단을 기록하면 하루씩 저절로 채워져요. 링크를 받은 사람만 같이 할 수 있어요"
      footer={<Button block loading={busy} onClick={create}>만들고 친구 초대하기</Button>}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="flex items-baseline justify-between text-label font-medium text-ink">템플릿 <span className="text-caption font-regular text-ink-2">누르면 숫자가 채워져요</span></span>
          <ChipRow>
            {TEMPLATES.map((x) => (
              <ChoiceCard key={x.key} size="sm" className="w-36 shrink-0" selected={tpl === x.key} onClick={() => pickTemplate(x)}
                title={x.name} description={`${BUNDLES.find((b) => b.key === ruleOf(x.metric)?.bundle)?.label} · ${x.days}일`} />
            ))}
          </ChipRow>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-label font-medium text-ink">직접 만들기</span>
          <Tabs variant="line" label="묶음" value={bundle} onChange={(b) => { setBundle(b); const first = RULES.find((r) => r.bundle === b); if (first && ruleOf(metric)?.bundle !== b) pickRule(first.metric); }}
            items={BUNDLES.map((b) => ({ value: b.key, label: b.label }))} />
          <ChoiceList label="규칙" value={metric} onChange={pickRule}
            options={inBundle.map((r) => ({ value: r.metric, label: ruleLabel(r.label, r.hint) }))} />
        </div>

        {t?.kind === "kcal" && (
          <div className="flex flex-col gap-2">
            <span className="flex items-baseline justify-between text-label font-medium text-ink">
              내 구간 <span className="text-body"><span className="num font-bold">{won(target)}</span>kcal</span>
            </span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="열량 구간">
              {KCAL_TIERS.map((k) => (
                <Chip key={k} role="radio" aria-checked={target === k} selected={target === k} onClick={() => { setTarget(k); setTpl(null); }}>
                  <span className="num">{won(k)}</span>{k === myTier ? " · 나에게 맞아요" : ""}
                </Chip>
              ))}
            </div>
            <RangeInput min={t.min} max={t.max} step={t.step} value={target} name="challenge_kcal" aria-label="열량 직접 정하기"
              onChange={(e) => { setTarget(Number(e.target.value)); setTpl(null); }} />
            <p className="text-caption text-ink-2 num">
              해낸 날 {won(kcalRange(target)[0])}~{won(kcalRange(target)[1])}kcal · 구간 아래로 떨어진 날도 못 한 날이에요 ·
              {goalKcal ? ` 기록 목표 ${won(goalKcal)}kcal` : " 기록 목표가 없어 2,000kcal 기준"} · 친구는 들어올 때 자기 목표에 맞는 구간으로 시작하고, 숫자는 각자만 봐요
            </p>
          </div>
        )}

        {t?.kind === "macro" && (
          <div className="flex flex-col gap-2">
            <span className="text-label font-medium text-ink">탄단지 유형 <span className="font-regular text-ink-2">· 하루 열량에서 차지하는 비율</span></span>
            <ChoiceList label="탄단지 유형" value={String(target)} onChange={(v) => { setTarget(Number(v)); setTpl(null); }}
              options={MACRO_TYPES.map((m) => ({
                value: String(m.code),
                label: ruleLabel(m.label, `탄 ${m.c[0]}~${m.c[1]}% · 단 ${m.p[0]}~${m.p[1]}% · 지 ${m.f[0]}~${m.f[1]}%${m.recommend ? "" : " · 추천하지 않고 고를 때만"}`),
              }))} />
          </div>
        )}

        {t && !t.kind && (
          <div className="flex flex-col gap-2">
            <span className="flex items-baseline justify-between text-label font-medium text-ink">
              목표 <span className="text-body"><span className="num font-bold">{won(target)}</span>{t.unit}</span>
            </span>
            <RangeInput min={t.min} max={t.max} step={t.step} value={target} name="challenge_target" aria-label="목표"
              onChange={(e) => { setTarget(Number(e.target.value)); setTpl(null); }} />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-label font-medium text-ink">기간</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="기간">
            {DAY_CHOICES.map((d) => <Chip key={d} role="radio" aria-checked={days === d} selected={days === d} onClick={() => { pickDays(d); setTpl(null); }}>{d}일</Chip>)}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="flex items-baseline justify-between text-label font-medium text-ink">
            성공 기준 <span className="text-body"><span className="num">{days}</span>일 중 <span className="num font-bold">{goal}</span>일</span>
          </span>
          <RangeInput min={1} max={days} step={1} value={goal} name="challenge_goal" aria-label="성공 기준"
            onChange={(e) => setGoal(Number(e.target.value))} />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-label font-medium text-ink">시작일</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="시작일">
            {(["today", "tomorrow", "monday"] as const).map((k) => <Chip key={k} role="radio" aria-checked={start === k} selected={start === k} onClick={() => setStart(k)}>{START_LABEL[k]}</Chip>)}
          </div>
        </div>

        <Field label={<>한 줄 각오 <span className="font-regular text-ink-2">· 선택</span></>} hint={`${NOTE_MAX}자까지 · 효능 표현은 쓸 수 없어요`}>
          <Input value={note} maxLength={NOTE_MAX} name="challenge_note" placeholder="예: 점심마다 단백질 반찬 하나씩" onChange={(e) => setNote(e.target.value)} />
        </Field>

        <div className="rounded-md bg-sunken px-4 py-3 flex flex-col gap-0.5">
          <span className="text-caption text-ink-2">이렇게 보여요</span>
          <span className="text-body font-bold text-ink">{title}</span>
          <span className="text-label text-ink-2">{spec.rule(value)}을 <span className="num">{days}</span>일 중 <span className="num">{goal}</span>일 채우면 해낸 거예요</span>
        </div>

        {error && <p role="alert" className="text-label text-danger">{error}</p>}
      </div>
    </Sheet>
  );
}
