"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button, Card, Checkbox, Chip, ChipRow, ChoiceList, EmptyState, Field, Icon, IconButton, IconLink, Input, Kcal, LinkButton, MealSlot, SectionHeader,
  Sheet, SkeletonList, Stat, TextLink, useToast,
} from "@/components/ui";
import { addDays, todayKst } from "@/lib/day";
import { josa } from "@/lib/buddy";

/**
 * 식단 탭의 가족 하루 보기 — 맨 위 사람 칩에서 가족을 고르면 그 가족이 보여 주기로 한 것만, 읽기 전용으로.
 *   끼니 기록 여부·시각 · 약 체크 · (켰으면) 열량·영양 숫자 · 이번 주 고른 제품 · (켰으면) 먹은 음식과 담아 둔 예정.
 *   건강 목표·체중은 보이지 않는다. 캐릭터는 넣지 않는다.
 *   오늘 아직 기록 안 한 끼니: '콕 찌르기'(끼니당 하루 한 번, 가족이 받기로 한 경우) · '추천 보내기'(가족 기준으로 고른 후보를 예정으로)
 *   가족이 '대신 기록하기'를 켰으면: 담긴 예정을 '대신 기록하기', 약 '대신 체크'.
 *   더 보고 싶으면 '보여 달라고 요청하기' → 가족이 푸시 · 알림함에서 동의 화면으로 직접 켠다.
 *   볼 수 있는 날은 오늘부터 6일 전까지 (서버 familyDayOk 와 같은 폭).
 */
export type FamilyPerson = { id: string; label: string };

type Meal = "breakfast" | "lunch" | "dinner";
type Ask = "foods" | "proxy";
const MEAL_LABEL: Record<Meal, string> = { breakfast: "아침", lunch: "점심", dinner: "저녁" };
const ASK_LABEL: Record<Ask, { title: string; hint: string }> = {
  foods: { title: "먹은 음식", hint: "끼니마다 음식 이름과 양" },
  proxy: { title: "대신 기록하기", hint: "담아 둔 끼니와 약 체크를 내가 대신 기록" },
};
const DAYS = 7;

type Food = { name: string; amount: string | null; kcal: number | null; by: string | null };
type Planned = { names: string[]; kcal: number | null; from: string | null; note: string | null };
type Day = {
  label: string;
  scopes: { meals: boolean; products: boolean; meds: boolean; numbers: boolean; foods: boolean; proxy: boolean };
  is_today: boolean;
  today: {
    date: string;
    meals: { meal: Meal; at: string | null; foods: Food[] | null; planned: Planned | null }[] | null;
    products: { name: string; fact: string; day: string }[] | null;
    meds: { id: string; label: string; remind_at: string | null; checked_at: string | null; checked_by: string | null }[] | null;
    numbers: { kcal: number; protein_g: number; sodium_mg: number } | null;
  };
  nudge: { ready: boolean; allowed: boolean; sent: string[] };
  request: { asks: Ask[]; status: "pending" | "accepted" | "declined"; created_at: string } | null;
  request_ready: boolean;
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
const ga = (w: string) => `${w}${josa(w, "이", "가")}`;

export function FamilyDay({ person }: { person: FamilyPerson }) {
  const toast = useToast();
  const today = todayKst();
  const [day, setDay] = useState(today);
  const [data, setData] = useState<Day | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "done">("loading");
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [sendMeal, setSendMeal] = useState<Meal | null>(null);
  const [asking, setAsking] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const my = ++seq.current;
    setStatus((s) => (s === "done" ? s : "loading")); // eslint-disable-line react-hooks/set-state-in-effect -- 다시 부를 때는 지금 화면을 두고, 처음·바꿀 때만 자리 잡기
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
  // 사람·날짜를 바꾸면 처음부터 자리 잡기
  useEffect(() => { setStatus("loading"); }, [person.id, day]); // eslint-disable-line react-hooks/set-state-in-effect -- 바꾼 순간 이전 사람 화면을 지운다

  const json = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const post = async (key: string, call: () => Promise<Response>, done: string, fail: string) => {
    setBusy(key);
    try {
      const r = await call();
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.show(d.error || fail, { tone: "danger" }); return false; }
      toast.show(done);
      setReload((n) => n + 1); // 바뀐 기록·예정을 다시 불러온다
      return true;
    } catch {
      toast.show(fail, { tone: "danger" });
      return false;
    } finally {
      setBusy(null);
    }
  };
  const nudge = (meal: Meal) => post(`nudge-${meal}`, () => fetch(`/api/family/links/${person.id}/nudge`, json({ meal })), `${person.label}에게 ${MEAL_LABEL[meal]} 콕 찔렀어요`, "콕 찌르지 못했어요. 다시 시도해 주세요");
  const proxyMeal = (meal: Meal) => post(`proxy-${meal}`, () => fetch(`/api/family/links/${person.id}/proxy`, json({ kind: "meal", meal })), `${person.label} ${MEAL_LABEL[meal]}을 대신 기록했어요`, "대신 기록하지 못했어요. 다시 시도해 주세요");
  const proxyMed = (id: string, label: string) => post(`med-${id}`, () => fetch(`/api/family/links/${person.id}/proxy`, json({ kind: "med", item_id: id })), `${label}${josa(label, "을", "를")} 대신 체크했어요`, "대신 체크하지 못했어요. 다시 시도해 주세요");

  const first = addDays(today, -(DAYS - 1));
  const t = data?.today;
  const s = data?.scopes;
  const nothing = !!s && !s.meals && !s.meds && !s.numbers && !s.products && !s.foods;
  const missing = s ? (["foods", "proxy"] as Ask[]).filter((a) => !s[a]) : [];
  const pending = data?.request?.status === "pending";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-caption text-ink-2 min-w-0">
          <Icon name="lock" size={14} className="shrink-0" />{ga(person.label)} 보여 주기로 한 것만 보여요
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

      {status === "done" && data && t && s && !nothing && (
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
                <p className="text-label text-ink-2">{ga(person.label)} 등록한 약 체크가 없어요</p>
              ) : (
                <ul className="flex flex-col">
                  {t.meds.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 min-h-11 border-b border-line last:border-b-0">
                      <span className="flex items-center gap-2 text-label text-ink min-w-0">
                        <Icon name={m.checked_at ? "check" : "minus"} size={18} className={m.checked_at ? "text-positive shrink-0" : "text-ink-3 shrink-0"} />
                        <span className="truncate">{m.label}</span>
                      </span>
                      {m.checked_at ? (
                        <span className="text-caption text-ink-2 whitespace-nowrap">체크 <span className="num">{m.checked_at}</span>{m.checked_by && ` · ${ga(m.checked_by)} 체크`}</span>
                      ) : s.proxy && data.is_today ? (
                        <Button size="sm" variant="secondary" loading={busy === `med-${m.id}`} disabled={!!busy} onClick={() => proxyMed(m.id, m.label)}>대신 체크</Button>
                      ) : (
                        <span className="text-caption text-ink-2 whitespace-nowrap">{m.remind_at ? <span className="num">{ampm(m.remind_at)} · </span> : null}아직</span>
                      )}
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
                  const open = data.is_today && !m.at;
                  const canNudge = open && data.nudge.ready && data.nudge.allowed && !sent;
                  return (
                    <MealSlot key={m.meal} meal={m.meal}
                      right={m.at
                        ? <span className="flex items-center gap-1 text-caption text-ink-2 whitespace-nowrap"><Icon name="check" size={16} className="text-positive" />먹음 <span className="num">{m.at}</span></span>
                        : <span className="text-caption text-ink-2 whitespace-nowrap">{data.is_today ? "아직 기록이 없어요" : "기록 없음"}</span>}>
                      {m.foods && m.foods.length > 0 && (
                        <ul className="flex flex-col gap-0.5">
                          {m.foods.map((f, i) => (
                            <li key={`${f.name}-${i}`} className="flex items-baseline justify-between gap-2 text-label text-ink">
                              <span className="min-w-0 truncate">{f.name}{f.amount && <span className="text-caption text-ink-2"> · {f.amount}</span>}{f.by && <span className="text-caption text-ink-2"> · {ga(f.by)} 기록</span>}</span>
                              {f.kcal != null && <Kcal value={f.kcal} className="text-caption shrink-0" />}
                            </li>
                          ))}
                        </ul>
                      )}
                      {!m.at && m.planned && (
                        <div className="flex flex-col gap-1">
                          <span className="text-caption font-medium text-brand-ink">{m.planned.from ? `예정 · ${ga(m.planned.from)} 보냄` : "예정"}</span>
                          <span className="text-label text-ink">{m.planned.names.join(" · ")}{m.planned.kcal != null && <span className="text-caption text-ink-2"> · <span className="num">{m.planned.kcal.toLocaleString("ko-KR")}</span>kcal</span>}</span>
                          {m.planned.note && <p className="text-label text-ink rounded-md bg-sunken px-3 py-2">“{m.planned.note}”</p>}
                        </div>
                      )}
                      {open && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {s.proxy && s.foods && m.planned && (
                            <Button size="sm" loading={busy === `proxy-${m.meal}`} disabled={!!busy} onClick={() => proxyMeal(m.meal)}>대신 기록하기</Button>
                          )}
                          {canNudge && <Button size="sm" variant="secondary" icon="bell" loading={busy === `nudge-${m.meal}`} disabled={!!busy} onClick={() => nudge(m.meal)}>콕 찌르기</Button>}
                          {!m.planned && <Button size="sm" variant="secondary" icon="send" disabled={!!busy} onClick={() => setSendMeal(m.meal)}>추천 보내기</Button>}
                        </div>
                      )}
                      {open && sent && <p className="text-caption text-ink-2 mt-1">콕 찔렀어요 · 기록하면 여기에 보여요</p>}
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

          {data.request_ready && missing.length > 0 && (
            <Card className="flex flex-col gap-2">
              <h2 className="text-label font-bold text-ink">더 보고 싶다면</h2>
              {pending ? (
                <p className="text-label text-ink-2">요청을 보냈어요 · {ga(person.label)} 정하면 알려 드려요</p>
              ) : (
                <>
                  <p className="text-label text-ink-2">{missing.map((a) => ASK_LABEL[a].title).join(" · ")} — {ga(person.label)} 직접 동의해야 보여요</p>
                  <Button size="sm" variant="secondary" className="self-start" icon="lock" onClick={() => setAsking(true)}>보여 달라고 요청하기</Button>
                </>
              )}
            </Card>
          )}

          <p className="text-caption text-ink-2">보여 줄 것·알림 설정은 <TextLink href="/family">가족 화면</TextLink>에서 바꿔요</p>

          <AskSheet open={asking} onClose={() => setAsking(false)} person={person} missing={missing} onSent={() => setReload((n) => n + 1)} />
          <SendSheet meal={sendMeal} onClose={() => setSendMeal(null)} person={person} onSent={() => setReload((n) => n + 1)} />
        </>
      )}
    </div>
  );
}

/** 보여 달라고 요청하기 — 아직 꺼진 항목만 고른다. 보내면 가족에게 푸시 + 알림함 */
function AskSheet({ open, onClose, person, missing, onSent }: { open: boolean; onClose: () => void; person: FamilyPerson; missing: Ask[]; onSent: () => void }) {
  const toast = useToast();
  const [pick, setPick] = useState<Ask[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setPick(missing); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect -- 열 때만 처음 값
  const send = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/family/links/${person.id}/request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asks: pick }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.show(d.error || "요청을 보내지 못했어요. 다시 시도해 주세요", { tone: "danger" }); return; }
      toast.show(`${person.label}에게 요청을 보냈어요`);
      onSent();
      onClose();
    } catch {
      toast.show("요청을 보내지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={`${person.label}에게 보여 달라고 요청하기`} size="sm"
      description={`${ga(person.label)} 알림을 눌러 직접 켜야 보여요. 정하기 전에는 아무것도 바뀌지 않아요`}
      footer={<div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={onClose}>취소</Button><Button className="flex-1" loading={busy} disabled={!pick.length} onClick={send}>요청 보내기</Button></div>}>
      <div className="flex flex-col">
        {missing.map((a) => (
          <Checkbox key={a} checked={pick.includes(a)} onChange={(e) => setPick((p) => (e.target.checked ? [...p, a] : p.filter((x) => x !== a)))}
            label={<span className="flex flex-col"><span className="text-body text-ink">{ASK_LABEL[a].title}</span><span className="text-caption text-ink-2">{ASK_LABEL[a].hint}</span></span>} />
        ))}
      </div>
    </Sheet>
  );
}

type Pick = { key: string; kind: "menu" | "product"; ref: string; name: string; calories: number; protein_g: number; sodium_mg: number; price: number | null; sub: string };

/** 추천 보내기 — 가족 기준(알레르기·남은 양)으로 서버가 고른 후보 중 하나를 그 끼니 예정으로 */
function SendSheet({ meal, onClose, person, onSent }: { meal: Meal | null; onClose: () => void; person: FamilyPerson; onSent: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; picks: Pick[] }>({ status: "loading", picks: [] });
  const [attempt, setAttempt] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!meal) return;
    const my = ++seq.current;
    setState({ status: "loading", picks: [] }); // eslint-disable-line react-hooks/set-state-in-effect -- 끼니를 열 때마다 새로
    setPicked(null);
    fetch(`/api/family/links/${person.id}/picks?meal=${meal}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || String(r.status));
        if (my !== seq.current) return;
        const picks: Pick[] = [
          ...(d.menus || []).map((m: { id: string; name: string; category: string; calories: number; protein_g: number; sodium_mg: number }) =>
            ({ key: `m-${m.id}`, kind: "menu", ref: m.id, name: m.name, calories: m.calories, protein_g: m.protein_g, sodium_mg: m.sodium_mg, price: null, sub: `집밥·외식 · ${m.category}` })),
          ...(d.items || []).map((i: { id: string; name: string; calories: number; protein_g: number; sodium_mg: number; price: number | null }) =>
            ({ key: `p-${i.id}`, kind: "product", ref: i.id, name: i.name, calories: i.calories, protein_g: i.protein_g, sodium_mg: i.sodium_mg, price: i.price, sub: "살 수 있는 제품" })),
        ];
        setState({ status: "done", picks });
        setPicked(picks[0]?.key ?? null);
      })
      .catch((e) => { console.error(e); if (my === seq.current) setState({ status: "error", picks: [] }); });
  }, [meal, person.id, attempt]);

  const send = async () => {
    const p = state.picks.find((x) => x.key === picked);
    if (!meal || !p) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/family/links/${person.id}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meal, kind: p.kind, ref: p.ref, note }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.show(d.error || "보내지 못했어요. 다시 시도해 주세요", { tone: "danger" }); return; }
      toast.show(`${person.label} ${MEAL_LABEL[meal]}에 넣었어요`);
      setNote("");
      onSent();
      onClose();
    } catch {
      toast.show("보내지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const mealName = meal ? MEAL_LABEL[meal] : "";
  return (
    <Sheet open={!!meal} onClose={onClose} title={`${person.label} ${mealName}에 넣을 음식`}
      description={`${person.label} 기준(알레르기·오늘 남은 양)으로 골랐어요. 이유는 성분 숫자로만 보여요`}
      footer={<div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={onClose}>취소</Button>
        <Button className="flex-[2]" loading={busy} disabled={!picked || state.status !== "done"} onClick={send}>{person.label} {mealName}에 넣기</Button></div>}>
      {state.status === "loading" && <SkeletonList rows={4} thumb={false} />}
      {state.status === "error" && (
        <EmptyState title="후보를 불러오지 못했어요" description="잠시 뒤 다시 불러와 주세요"
          action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => setAttempt((n) => n + 1)}>다시 불러오기</Button>} />
      )}
      {state.status === "done" && state.picks.length === 0 && (
        <EmptyState title="지금 고를 만한 후보가 없어요" description="다른 끼니를 골라 보거나 나중에 다시 열어 주세요" />
      )}
      {state.status === "done" && state.picks.length > 0 && (
        <div className="flex flex-col gap-4">
          <ChoiceList label="보낼 음식" value={picked} onChange={setPicked}
            options={state.picks.map((p) => ({
              value: p.key,
              label: (
                <span className="flex items-center justify-between gap-3 w-full">
                  <span className="flex flex-col min-w-0">
                    <span className="text-label font-medium text-ink truncate">{p.name}</span>
                    <span className="text-caption text-ink-2">{p.sub} · 단백질 <span className="num">{p.protein_g}</span>g · 나트륨 <span className="num">{p.sodium_mg.toLocaleString("ko-KR")}</span>mg{p.price != null && <> · <span className="num">{p.price.toLocaleString("ko-KR")}</span>원</>}</span>
                  </span>
                  <Kcal value={p.calories} className="text-label shrink-0" />
                </span>
              ),
            }))} />
          <Field label="한마디 (선택)" hint="60자까지">
            <Input value={note} maxLength={60} name="family_note" placeholder="오늘 저녁은 이거 어때요?" onChange={(e) => setNote(e.target.value)} />
          </Field>
          <p className="text-caption text-ink-2">{person.label} 하루 보기 {mealName} 칸에 예정으로 들어가요. 먹으면 한 번에 기록돼요</p>
        </div>
      )}
    </Sheet>
  );
}
