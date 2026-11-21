"use client";

import { useEffect, useRef, useState } from "react";
import { Button, ConfirmSheet, DayChoice, Sheet, Skeleton, Tabs, useToast, type DayChoiceItem } from "@/components/ui";
import { dayParts, HOME_MEAL_LABEL, HOME_MEALS, type SlotState } from "@/lib/home-meal";
import type { MealKey } from "@/lib/menu-pick";

/**
 * 홈 추천 '담기' — 언제 먹을지(끼니 · 오늘부터 7일)를 골라 그날 그 끼니의 예정('AI 추천')으로 담는다.
 *   서버: GET /api/home/meal-slots (날마다 비어·계획·기록 + 그날 끼니 몫), POST /api/home/meal-recs { date, replace }
 *   기록한 끼니는 고를 수 없다. 계획이 있는 날은 "바꿀까요?"를 한 번 더 묻고, 그 계획 이름이 그대로일 때만 바꾼다.
 *   추천은 오늘 남은 양으로 고른 것 — 다른 날은 그날 몫과 견줘 한 줄로 알린다(막지 않는다).
 */
export type PlaceTarget = { ids: string[]; summary: string; calories: number };
type Slot = { date: string; state: SlotState; plan_title: string | null; budget_kcal: number };
const SUB: Record<SlotState, string> = { empty: "비어", planned: "계획", recorded: "기록" };
const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");

export default function HomeMealPlaceSheet({ target, initialMeal, onClose, onPlaced }: {
  target: PlaceTarget | null;
  initialMeal: MealKey;
  onClose: () => void;
  /** 담은 뒤 — 오늘에 담았으면 홈 추천을 다시 불러온다(그날 몫이 바뀐다) */
  onPlaced: (date: string, meal: MealKey) => void;
}) {
  const toast = useToast();
  const [meal, setMeal] = useState<MealKey>(initialMeal);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const req = useRef(0);
  const open = !!target;

  // 시트를 열 때마다 지금 끼니로 (열린 채로 끼니를 바꾸면 그 끼니로)
  useEffect(() => { if (open) setMeal(initialMeal); }, [open, initialMeal]); // eslint-disable-line react-hooks/set-state-in-effect -- 시트를 열 때 고른 끼니로 맞춘다

  useEffect(() => {
    if (!open) return;
    const n = ++req.current; // 끼니를 빨리 바꿔도 마지막 응답만
    setSlots(null); setFailed(false); // eslint-disable-line react-hooks/set-state-in-effect -- 끼니를 바꾸면 불러오는 중으로
    fetch(`/api/home/meal-slots?meal=${meal}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || String(r.status));
        if (n !== req.current) return;
        setSlots(d.days);
        // 처음 고른 날: 비어 있는 가장 가까운 날
        setDate((d.days as Slot[]).find((s) => s.state === "empty")?.date ?? null);
      })
      .catch((e) => { console.error("담을 날 읽기:", e); if (n === req.current) setFailed(true); });
  }, [open, meal, attempt]);

  const slot = slots?.find((s) => s.date === date) ?? null;
  const label = HOME_MEAL_LABEL[meal];
  const when = date ? `${dayParts(date).md}(${dayParts(date).dow})` : "";

  async function place(replace: boolean) {
    if (!target || !date || !slot || saving) return;
    setSaving(true);
    try {
      const r = await fetch("/api/home/meal-recs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meal, date, product_ids: target.ids, replace: replace ? { plan_title: slot.plan_title } : undefined }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.show(r.status >= 500 ? "담지 못했어요. 다시 시도해 주세요" : d.error || "담지 못했어요", { tone: "danger" });
        if (r.status === 409) setAttempt((n) => n + 1); // 그 사이 바뀐 상태로 다시
        return;
      }
      toast.show(`${when} ${label} 예정에 담았어요. 식단 탭에서 볼 수 있어요`);
      onPlaced(date, meal);
      onClose();
    } catch (e) {
      console.error("홈 끼니 담기:", e);
      toast.show("담지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally {
      setSaving(false); setConfirm(false);
    }
  }

  const items: DayChoiceItem[] = (slots || []).map((s) => {
    const p = dayParts(s.date);
    return { key: s.date, top: p.dow, mid: String(p.day), sub: SUB[s.state], disabled: s.state === "recorded" };
  });
  const over = slot && target && slot.budget_kcal > 0 && target.calories > slot.budget_kcal * 1.15;

  return (
    <>
      <Sheet open={open && !confirm} onClose={onClose} title="언제 먹을까요?" description={target ? `${target.summary} · ${fmt(target.calories)}kcal` : undefined}
        footer={
          <Button block disabled={!slot || slot.state === "recorded"} loading={saving}
            onClick={() => (slot?.state === "planned" ? setConfirm(true) : place(false))}>
            {slot ? `${when} ${label}에 담기` : "날짜를 골라 주세요"}
          </Button>
        }>
        <Tabs label="끼니" className="mb-4" value={meal} onChange={(m) => setMeal(m as MealKey)}
          items={HOME_MEALS.map((m) => ({ value: m, label: HOME_MEAL_LABEL[m] }))} />
        {failed ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-label text-ink-2">날짜를 불러오지 못했어요</p>
            <Button variant="secondary" size="sm" icon="refresh" onClick={() => setAttempt((n) => n + 1)}>다시 불러오기</Button>
          </div>
        ) : !slots ? (
          <div role="status" aria-label="날짜를 불러오는 중" className="grid grid-cols-7 gap-1">
            {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-16 rounded-md" />)}
          </div>
        ) : (
          <>
            <DayChoice label="담을 날" items={items} value={date} onChange={setDate} />
            <p className="text-caption text-ink-2 mt-3">
              {!slot ? "고를 날이 없어요. 다른 끼니를 골라 주세요"
                : slot.state === "planned" ? `그날 ${label}에 담아 둔 계획이 있어요 — 담으면 바꿀지 한 번 더 물어요`
                : over ? `그날 ${label} 몫(${fmt(slot.budget_kcal)}kcal)보다 많아요 — 오늘 남은 양으로 고른 추천이에요`
                : `그날 ${label} 몫 ${fmt(slot.budget_kcal)}kcal`}
            </p>
            {items.some((d) => d.disabled) && <p className="text-caption text-ink-2 mt-1">이미 기록한 끼니는 고를 수 없어요</p>}
          </>
        )}
      </Sheet>
      <ConfirmSheet open={confirm} onClose={() => setConfirm(false)} onConfirm={() => place(true)} loading={saving} tone="primary"
        title={`${when} ${label} 계획을 바꿀까요?`}
        description={slot?.plan_title ? `"${slot.plan_title}" 대신 이 음식을 담아요` : "담아 둔 계획 대신 이 음식을 담아요"}
        confirmLabel="바꾸기" />
    </>
  );
}
