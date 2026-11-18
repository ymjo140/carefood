"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button, Card, Chip, ChipRow, EmptyState, Icon, IconButton, IconLink, LinkButton, MealSlot, SectionHeader, SkeletonList, Stat, TextLink, useToast,
} from "@/components/ui";
import { addDays, todayKst } from "@/lib/day";
import { josa } from "@/lib/buddy";

/**
 * 식단 탭의 가족 하루 보기 — 맨 위 사람 칩에서 가족을 고르면 그 가족이 보여 주기로 한 것만, 읽기 전용으로.
 *   끼니 기록 여부·시각 · 약 체크 · (켰으면) 열량·영양 숫자 · 이번 주 고른 제품. 먹은 음식 이름·건강 목표·체중은 보이지 않는다.
 *   오늘 아직 기록 안 한 끼니에는 '콕 찌르기'(끼니당 하루 한 번, 가족이 받기로 한 경우만). 캐릭터는 넣지 않는다.
 *   볼 수 있는 날은 오늘부터 6일 전까지 (서버 familyDayOk 와 같은 폭).
 */
export type FamilyPerson = { id: string; label: string };

type Meal = "breakfast" | "lunch" | "dinner";
const MEAL_LABEL: Record<Meal, string> = { breakfast: "아침", lunch: "점심", dinner: "저녁" };
const DAYS = 7;

type Day = {
  label: string;
  scopes: { meals: boolean; products: boolean; meds: boolean; numbers: boolean };
  is_today: boolean;
  today: {
    date: string;
    meals: { meal: Meal; at: string | null }[] | null;
    products: { name: string; fact: string; day: string }[] | null;
    meds: { id: string; label: string; remind_at: string | null; checked_at: string | null }[] | null;
    numbers: { kcal: number; protein_g: number; sodium_mg: number } | null;
  };
  nudge: { ready: boolean; allowed: boolean; sent: string[] };
};

/** 나 · 가족 칩 — 가족이 없으면 그리지 않는다 (가족 추가는 '+') */
export function PersonChips({ people, who, onChange }: { people: FamilyPerson[]; who: string | null; onChange: (id: string | null) => void }) {
  if (!people.length) return null;
  return (
    <div className="flex items-center gap-2 mb-4">
      <ChipRow className="flex-1 min-w-0">
        <Chip selected={who === null} onClick={() => onChange(null)}>나</Chip>
        {people.map((p) => <Chip key={p.id} selected={who === p.id} onClick={() => onChange(p.id)}>{p.label}</Chip>)}
      </ChipRow>
      <IconLink href="/family" icon="plus" label="가족 추가" />
    </div>
  );
}

const dayLabel = (day: string, today: string) => {
  const [, m, d] = day.split("-").map(Number);
  return `${m}월 ${d}일${day === today ? " · 오늘" : day === addDays(today, -1) ? " · 어제" : ""}`;
};
const ampm = (t: string) => { const h = Number(t.slice(0, 2)); return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${t.slice(3, 5)}`; };

export function FamilyDay({ person }: { person: FamilyPerson }) {
  const toast = useToast();
  const today = todayKst();
  const [day, setDay] = useState(today);
  const [data, setData] = useState<Day | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "done">("loading");
  const [reload, setReload] = useState(0);
  const [nudging, setNudging] = useState<Meal | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const my = ++seq.current;
    setStatus("loading"); // eslint-disable-line react-hooks/set-state-in-effect -- 사람·날짜를 바꾸면 곧바로 자리 잡기
    fetch(`/api/family/links/${person.id}?date=${day}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || String(r.status));
        if (my !== seq.current) return;
        setData(d);
        setStatus("done");
      })
      .catch((e) => {
        console.error(e);
        if (my === seq.current) setStatus("error");
      });
  }, [person.id, day, reload]);

  const nudge = async (meal: Meal) => {
    setNudging(meal);
    try {
      const r = await fetch(`/api/family/links/${person.id}/nudge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meal }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.show(d.error || "콕 찌르지 못했어요. 다시 시도해 주세요", { tone: "danger" }); return; }
      toast.show(`${person.label}에게 ${MEAL_LABEL[meal]} 콕 찔렀어요`);
      setData((x) => (x ? { ...x, nudge: { ...x.nudge, sent: [...x.nudge.sent, meal] } } : x));
    } catch {
      toast.show("콕 찌르지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally {
      setNudging(null);
    }
  };

  const first = addDays(today, -(DAYS - 1));
  const t = data?.today;
  const nothing = !!data && !data.scopes.meals && !data.scopes.meds && !data.scopes.numbers && !data.scopes.products;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-caption text-ink-2 min-w-0">
          <Icon name="lock" size={14} className="shrink-0" />{person.label}{josa(person.label, "이", "가")} 보여 주기로 한 것만 · 읽기만 해요
        </p>
        <div className="flex items-center gap-0.5 shrink-0">
          <IconButton icon="chevron-left" label="전날" size="sm" disabled={day <= first} onClick={() => setDay(addDays(day, -1))} />
          <span className="text-label font-medium whitespace-nowrap">{dayLabel(day, today)}</span>
          <IconButton icon="chevron-right" label="다음 날" size="sm" disabled={day >= today} onClick={() => setDay(addDays(day, 1))} />
        </div>
      </div>

      {status === "loading" && <SkeletonList rows={4} thumb={false} />}

      {status === "error" && (
        <EmptyState title="가족 기록을 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
          action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => setReload((n) => n + 1)}>다시 불러오기</Button>} />
      )}

      {status === "done" && nothing && (
        <EmptyState title={`${person.label} 쪽에서 보여 주는 것이 없어요`} description="보여 줄 것은 확인받는 사람이 직접 골라요"
          action={<LinkButton size="sm" variant="secondary" href="/family">가족 화면으로</LinkButton>} />
      )}

      {status === "done" && data && t && !nothing && (
        <>
          {t.numbers && (
            <Card className="grid grid-cols-3 gap-3">
              <Stat label="먹은 열량" value={t.numbers.kcal.toLocaleString("ko-KR")} unit="kcal" />
              <Stat label="단백질" value={t.numbers.protein_g.toLocaleString("ko-KR")} unit="g" />
              <Stat label="나트륨" value={t.numbers.sodium_mg.toLocaleString("ko-KR")} unit="mg" />
            </Card>
          )}

          {t.meds && (
            <section aria-labelledby="fam-med-h">
              <SectionHeader title={<span id="fam-med-h">약 체크</span>} />
              {t.meds.length === 0 ? (
                <p className="text-label text-ink-2">{person.label}{josa(person.label, "이", "가")} 등록한 약 체크가 없어요</p>
              ) : (
                <ul className="flex flex-col">
                  {t.meds.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 min-h-11 border-b border-line last:border-b-0">
                      <span className="flex items-center gap-2 text-label text-ink min-w-0">
                        <Icon name={m.checked_at ? "check" : "minus"} size={18} className={m.checked_at ? "text-positive shrink-0" : "text-ink-3 shrink-0"} />
                        <span className="truncate">{m.label}</span>
                      </span>
                      <span className="text-caption text-ink-2 whitespace-nowrap">
                        {m.checked_at ? <>체크 <span className="num">{m.checked_at}</span></> : <>{m.remind_at ? <span className="num">{ampm(m.remind_at)} · </span> : null}아직</>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section aria-labelledby="fam-meal-h">
            <SectionHeader title={<span id="fam-meal-h">끼니</span>} />
            {!t.meals ? (
              <p className="text-label text-ink-2">끼니 기록 여부는 보여 주지 않기로 했어요</p>
            ) : (
              <div className="flex flex-col gap-2">
                {t.meals.map((m) => {
                  const sent = data.nudge.sent.includes(m.meal);
                  const canNudge = data.is_today && data.nudge.ready && data.nudge.allowed && !m.at;
                  return (
                    <MealSlot key={m.meal} meal={m.meal}
                      right={m.at
                        ? <span className="flex items-center gap-1 text-caption text-ink-2 whitespace-nowrap"><Icon name="check" size={16} className="text-positive" />먹음 <span className="num">{m.at}</span></span>
                        : <span className="text-caption text-ink-2 whitespace-nowrap">{data.is_today ? "아직 기록이 없어요" : "기록 없음"}</span>}>
                      {canNudge && (sent
                        ? <p className="text-caption text-ink-2">콕 찔렀어요 · 기록하면 여기에 보여요</p>
                        : <Button size="sm" variant="secondary" icon="bell" loading={nudging === m.meal} onClick={() => nudge(m.meal)}>콕 찌르기</Button>)}
                    </MealSlot>
                  );
                })}
              </div>
            )}
          </section>

          {t.products && t.products.length > 0 && (
            <section aria-labelledby="fam-prod-h">
              <SectionHeader title={<span id="fam-prod-h">이번 주 고른 제품</span>} />
              <ul className="flex flex-col">
                {t.products.map((p) => (
                  <li key={`${p.name}-${p.day}`} className="flex flex-col gap-0.5 py-2 border-b border-line last:border-b-0">
                    <span className="text-label text-ink truncate">{p.name}</span>
                    {p.fact && <span className="text-caption text-ink-2">{p.fact}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-caption text-ink-2">보여 줄 것·알림 설정은 <TextLink href="/family">가족 화면</TextLink>에서 바꿔요</p>
        </>
      )}
    </div>
  );
}
