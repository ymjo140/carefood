"use client";

import { useState } from "react";
import { Button, Chip, ChoiceList, Field, Input, RangeInput, Sheet, useToast } from "@/components/ui";
import { DAY_CHOICES, NOTE_MAX, RULES, defaultGoal, ruleOf, type UserMetric } from "@/lib/challenge-rules";
import { getOrCreateNickname } from "@/lib/nickname";

/**
 * 내 챌린지 만들기 — 규칙 목록에서 고르고 숫자만 정한다 (규칙·제목을 글로 쓰지 않는다).
 * 규칙 → 목표값 → 기간 → 성공 기준 → 시작일 → 각오(선택). 제목은 자동으로 보여 준다.
 * 열량 규칙은 없다. 만들면 내 묶음이 열리고 onCreated 로 초대 카드를 띄운다.
 */
type Start = "today" | "tomorrow" | "monday";
const START_LABEL: Record<Start, string> = { today: "오늘", tomorrow: "내일", monday: "다음 월요일" };

export default function ChallengeCreateSheet({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (r: { challenge_id: string; group_id: string; title: string }) => void;
}) {
  const toast = useToast();
  const [metric, setMetric] = useState<UserMetric>("protein_min");
  const [target, setTarget] = useState(60);
  const [days, setDays] = useState(7);
  const [goal, setGoal] = useState(defaultGoal(7));
  const [start, setStart] = useState<Start>("tomorrow");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const spec = ruleOf(metric)!;
  const t = spec.target;
  const value = t ? target : 1;
  const title = spec.title(days, value);

  const pickRule = (m: UserMetric) => {
    setMetric(m);
    const r = ruleOf(m);
    if (r?.target) setTarget(r.target.default);
    setError(null);
  };
  const pickDays = (d: number) => { setDays(d); setGoal(defaultGoal(d)); };

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

  return (
    <Sheet open={open} onClose={onClose} title="챌린지 만들기" description="식단을 기록하면 하루씩 저절로 채워져요. 링크를 받은 사람만 같이 할 수 있어요"
      footer={<Button block loading={busy} onClick={create}>만들고 친구 초대하기</Button>}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-label font-medium text-ink">규칙</span>
          <ChoiceList label="규칙" value={metric} onChange={pickRule}
            options={RULES.map((r) => ({ value: r.metric, label: <span className="flex flex-col"><span className="text-body text-ink">{r.label}</span><span className="text-caption text-ink-2">{r.hint}</span></span> }))} />
        </div>

        {t && (
          <div className="flex flex-col gap-2">
            <span className="flex items-baseline justify-between text-label font-medium text-ink">
              목표 <span className="text-body"><span className="num font-bold">{target.toLocaleString("ko-KR")}</span>{t.unit}</span>
            </span>
            <RangeInput min={t.min} max={t.max} step={t.step} value={target} name="challenge_target" aria-label="목표"
              onChange={(e) => setTarget(Number(e.target.value))} />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-label font-medium text-ink">기간</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="기간">
            {DAY_CHOICES.map((d) => <Chip key={d} role="radio" aria-checked={days === d} selected={days === d} onClick={() => pickDays(d)}>{d}일</Chip>)}
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
