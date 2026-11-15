"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button, Checkbox, Chip, ChipRow, ChoiceList, EmptyState, Kcal, LinkButton, Notice, Sheet, SkeletonList, useToast,
} from "@/components/ui";
import { PLAN_DAYS, cellFoods, planMealKey, readDraftGrid, weekdayKey, type PlanFood, type PlanGrid } from "@/lib/weekly-plan";
import { PLANNED_MEALS, planTotals, type PlannedMealKey } from "@/lib/planned-meals";

/**
 * 식단 불러오기 — 저장한 식단(또는 이 기기에서 짜는 식단)의 한 요일을 골라, 고른 끼니만 그 날짜에 담는다.
 * 오늘·지난 날은 바로 기록하고(onRecord), 앞으로 올 날은 예정으로 담는다(/api/diary/planned).
 * 네 상태: 불러오는 중 · 실패(다시 불러오기) · 비어 있음(일주일 보기로) · 채워짐. 늦게 온 응답은 버린다(요청 번호).
 */
type Plan = { key: string; title: string; grid: PlanGrid; note: string };

const MEAL_LABEL: Record<PlannedMealKey, string> = { breakfast: "아침", lunch: "점심", dinner: "저녁", snack: "간식" };
const DAY_LABEL: Record<string, string> = { mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일" };
const filledDays = (g: PlanGrid) => PLAN_DAYS.filter((d) => Object.values(g[d] || {}).some((c) => cellFoods(c).length > 0));

export function PlanSheet({ open, onClose, date, today, dateLabel, onRecord, onSaved }: {
  open: boolean;
  onClose: () => void;
  date: string;
  today: string;
  dateLabel: string;
  /** 오늘·지난 날 — 끼니 하나를 계획대로 기록. 하나라도 기록했으면 true */
  onRecord: (meal: PlannedMealKey, foods: PlanFood[], label: string) => Promise<boolean>;
  /** 예정으로 담았거나 기록했으면 — 하루 보기를 다시 불러온다 */
  onSaved: () => void;
}) {
  const toast = useToast();
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planKey, setPlanKey] = useState<string | null>(null);
  const [day, setDay] = useState<string>("mon");
  const [checked, setChecked] = useState<Set<PlannedMealKey>>(new Set());
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const seq = useRef(0);
  const future = date > today;

  // 열 때마다 새로 — 그사이 일주일 보기에서 식단을 바꿨을 수 있다
  useEffect(() => {
    if (!open) return;
    const n = ++seq.current;
    setStatus("loading"); // eslint-disable-line react-hooks/set-state-in-effect -- 시트를 열 때 불러오는 중으로
    fetch("/api/meal-plans?include=grid")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; })
      .then((d) => {
        if (n !== seq.current) return;
        const list: Plan[] = [];
        const draft = readDraftGrid();
        if (draft && filledDays(draft).length > 0) list.push({ key: "draft", title: "일주일 보기에서 짜는 식단", grid: draft, note: "이 기기 · 저장 전" });
        for (const p of (d.plans || []) as { id: string; title: string; grid: PlanGrid | null; filled_days: string[]; avg_daily_calories: number | null }[]) {
          if (!p.grid || p.filled_days.length === 0) continue;
          list.push({ key: p.id, title: p.title || "저장한 식단", grid: p.grid,
            note: `${p.filled_days.length}일 채움${p.avg_daily_calories ? ` · 하루 평균 ${Math.round(p.avg_daily_calories).toLocaleString("ko-KR")}kcal` : ""}` });
        }
        setPlans(list);
        setPlanKey((k) => (k && list.some((p) => p.key === k) ? k : list[0]?.key ?? null));
        setStatus("ready");
      })
      .catch((e) => { console.error("식단 목록을 불러오지 못했어요:", (e as Error).message); if (n === seq.current) setStatus("error"); });
  }, [open, reload]);

  const plan = plans.find((p) => p.key === planKey) || null;
  const days = useMemo(() => (plan ? filledDays(plan.grid) : []), [plan]);

  // 식단이나 날짜가 바뀌면 — 그 날짜의 요일이 채워져 있으면 그 요일, 아니면 첫 채운 요일
  useEffect(() => {
    if (!plan) return;
    const want = weekdayKey(date);
    setDay(days.includes(want as never) ? want : days[0] || "mon"); // eslint-disable-line react-hooks/set-state-in-effect -- 고른 식단에 맞춰 요일을 맞춘다
  }, [plan, days, date]);

  const mealsOfDay = useMemo(() => PLANNED_MEALS.map((m) => ({
    meal: m, foods: plan ? cellFoods(plan.grid[day]?.[planMealKey(m)]) : [],
  })), [plan, day]);

  // 요일이 바뀌면 음식이 있는 끼니를 모두 고른 상태로
  useEffect(() => {
    setChecked(new Set(mealsOfDay.filter((x) => x.foods.length > 0).map((x) => x.meal))); // eslint-disable-line react-hooks/set-state-in-effect -- 요일을 고르면 끼니 체크를 새로
  }, [mealsOfDay]);

  const picked = mealsOfDay.filter((x) => checked.has(x.meal) && x.foods.length > 0);
  const totals = planTotals(picked.flatMap((x) => x.foods));

  const toggle = (m: PlannedMealKey) => setChecked((s) => { const n = new Set(s); if (n.has(m)) n.delete(m); else n.add(m); return n; });

  const submit = async () => {
    if (picked.length === 0 || busy) return;
    setBusy(true);
    try {
      if (future) {
        const meals = Object.fromEntries(picked.map((x) => [x.meal, x.foods]));
        const r = await fetch("/api/diary/planned", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, meals, plan_title: plan?.key === "draft" ? null : plan?.title }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { toast.show(r.status === 503 || r.status === 400 ? d.error : "담지 못했어요. 다시 시도해 주세요", { tone: "danger" }); return; }
        toast.show(`${dateLabel}에 ${picked.length}끼를 예정으로 담았어요`);
      } else {
        let ok = 0;
        for (const x of picked) if (await onRecord(x.meal, x.foods, MEAL_LABEL[x.meal])) ok++;
        if (ok === 0) return; // 실패 알림은 onRecord 가 띄운다
      }
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="식단 불러오기" description={`${dateLabel}에 ${future ? "예정으로 담아요" : "기록해요"}`}
      footer={status === "ready" && plan ? (
        <div className="flex flex-col gap-3 w-full">
          <p className="text-label text-ink-2 flex justify-between">
            <span><span className="num">{picked.length}</span>끼</span>
            <span><Kcal value={Math.round(totals.kcal)} className="text-label" /> · 단백질 <span className="num font-bold text-ink">{Math.round(totals.protein)}</span>g</span>
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={onClose}>취소</Button>
            <Button className="flex-[2]" disabled={picked.length === 0} loading={busy} onClick={submit}>{future ? "예정으로 담기" : "기록하기"}</Button>
          </div>
        </div>
      ) : undefined}>
      {status === "loading" ? <SkeletonList rows={4} thumb={false} />
        : status === "error" ? (
          <EmptyState title="식단을 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => setReload((k) => k + 1)}>다시 불러오기</Button>} />
        ) : plans.length === 0 ? (
          <EmptyState title="불러올 식단이 없어요" description="일주일 보기에서 식단을 짜거나 추천으로 채워 저장하면 여기서 고를 수 있어요"
            action={<LinkButton href="/weekly-box" size="sm" variant="secondary">일주일 보기로</LinkButton>} />
        ) : (
          <div className="flex flex-col gap-5">
            <ChoiceList label="저장한 식단" value={planKey} onChange={setPlanKey}
              options={plans.map((p) => ({ value: p.key, label: (
                <span className="flex flex-col"><span className="text-body font-bold text-ink">{p.title}</span><span className="text-caption text-ink-2">{p.note}</span></span>
              ) }))} />
            <div className="flex flex-col gap-2">
              <p className="text-label font-bold text-ink">어느 요일을 가져올까요</p>
              <ChipRow>
                {PLAN_DAYS.map((d) => (
                  <Chip key={d} selected={day === d} disabled={!days.includes(d as never)} onClick={() => setDay(d)} aria-label={`${DAY_LABEL[d]}요일`}>{DAY_LABEL[d]}</Chip>
                ))}
              </ChipRow>
            </div>
            <fieldset className="flex flex-col">
              <legend className="text-label font-bold text-ink mb-1">담을 끼니</legend>
              {mealsOfDay.map((x) => (
                <div key={x.meal} className="flex items-center gap-3 border-b border-line last:border-b-0">
                  <Checkbox checked={checked.has(x.meal)} disabled={x.foods.length === 0} onChange={() => toggle(x.meal)}
                    aria-label={`${MEAL_LABEL[x.meal]} 담기`} label={<span className="text-label font-bold w-8">{MEAL_LABEL[x.meal]}</span>} />
                  <span className="flex-1 min-w-0 text-label text-ink truncate">{x.foods.length ? x.foods.map((f) => f.name).join(" · ") : <span className="text-ink-2">비어 있어요</span>}</span>
                  {x.foods.length > 0 && <Kcal value={Math.round(planTotals(x.foods).kcal)} className="text-label shrink-0" />}
                </div>
              ))}
            </fieldset>
            {future && <Notice icon="info">아직 오지 않은 날이라 예정으로 담겨요. 먹은 날 하루 보기에서 끼니마다 기록할 수 있어요</Notice>}
          </div>
        )}
    </Sheet>
  );
}
