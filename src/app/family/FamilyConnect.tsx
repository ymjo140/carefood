"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button, Card, Checkbox, Chip, ChipRow, ConfirmSheet, EmptyState, Field, IconButton, Input, ListRow, SectionHeader, Sheet, Skeleton,
  SkeletonList, Stat, Switch, TextButton, useToast,
} from "@/components/ui";

/**
 * 가족 연결 — 캐릭터 없이 사실만 글자로.
 *  - 내가 보는 가족: 확인받는 사람이 고른 것만 (끼니 기록 여부 · 이번 주 고른 제품 · 약 먹었는지 · 숫자)
 *  - 초대하기: 부르는 이름(예: 엄마)으로 7일짜리 링크 → 받은 사람이 /f/<code> 에서 보여 줄 것을 골라 동의
 *  - 나를 보는 가족: 보여 줄 것 바꾸기 · 그만 보여 주기 (나만 할 수 있다)
 *  - 내 약 체크: 내가 정한 이름 + 알림 시각, 오늘 먹었어요 체크 (복용 안내는 하지 않는다)
 */
type Scopes = { meals: boolean; products: boolean; meds: boolean; numbers: boolean };
type Links = {
  watching: { id: string; label: string; scopes: Scopes; alert_evening: boolean }[];
  invites: { id: string; label: string; url: string; expires_at: string }[];
  watchers: { id: string; who: string | null; scopes: Scopes }[];
};
type Today = {
  date: string;
  meals: { meal: "breakfast" | "lunch" | "dinner"; at: string | null }[] | null;
  products: { name: string; fact: string; day: string }[] | null;
  product_summary: { total: number; low_sodium: number; protein15: number } | null;
  meds: { id: string; label: string; remind_at: string | null; checked_at: string | null }[] | null;
  numbers: { kcal: number; protein_g: number; sodium_mg: number } | null;
};
type Med = { id: string; label: string; remind_at: string | null; checked_at: string | null };

const MEAL_LABEL = { breakfast: "아침", lunch: "점심", dinner: "저녁" } as const;
const SCOPE_LABEL: Record<keyof Scopes, { title: string; hint: string }> = {
  meals: { title: "끼니를 기록했는지", hint: "아침·점심·저녁 기록 여부와 시각" },
  products: { title: "고른 제품", hint: "이번 주 기록한 제품과 성분 한 줄" },
  meds: { title: "약 먹었는지", hint: "내가 정한 이름과 체크 여부만 · 약 이름은 보이지 않아요" },
  numbers: { title: "열량·영양 숫자", hint: "하루 열량과 단백질·나트륨" },
};
const won = (v: number) => v.toLocaleString("ko-KR");
const weekday = (d: string) => "일월화수목금토"[new Date(`${d}T00:00:00+09:00`).getDay()];
const shared = (s: Scopes) => (Object.keys(SCOPE_LABEL) as (keyof Scopes)[]).filter((k) => s[k]).map((k) => SCOPE_LABEL[k].title).join(", ") || "없음";

async function copy(text: string, toast: ReturnType<typeof useToast>) {
  try { await navigator.clipboard.writeText(text); toast.show("초대 링크를 복사했어요. 카톡으로 보내 주세요"); }
  catch { toast.show("복사하지 못했어요. 링크를 길게 눌러 복사해 주세요", { tone: "danger" }); }
}

export function FamilyConnect() {
  const toast = useToast();
  const [links, setLinks] = useState<{ status: "loading" | "error" | "done"; data: Links | null }>({ status: "loading", data: null });
  const [attempt, setAttempt] = useState(0);
  const [pick, setPick] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [label, setLabel] = useState("");
  const [made, setMade] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ending, setEnding] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/family/links")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (alive) setLinks({ status: "done", data: d }); })
      .catch(() => { if (alive) setLinks({ status: "error", data: null }); });
    return () => { alive = false; };
  }, [attempt]);
  const reload = () => setAttempt((n) => n + 1);

  const createInvite = async () => {
    setBusy("invite");
    try {
      const r = await fetch("/api/family/links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "");
      setMade(d.url);
      reload();
    } catch (e) {
      toast.show((e as Error).message || "초대 링크를 만들지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(null); }
  };

  const end = async (id: string) => {
    setBusy(id);
    try {
      const r = await fetch("/api/family/links", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!r.ok) throw new Error(String(r.status));
      setEnding(null);
      toast.show("연결을 끊었어요");
      if (pick === id) setPick(null);
      reload();
    } catch {
      toast.show("연결을 끊지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(null); }
  };

  const saveScopes = async (id: string, scopes: Scopes) => {
    setBusy(id);
    try {
      const r = await fetch("/api/family/links", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, scopes }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "");
      setLinks((s) => (s.data ? { ...s, data: { ...s.data, watchers: s.data.watchers.map((w) => (w.id === id ? { ...w, scopes: d.scopes } : w)) } } : s));
      toast.show("보여 줄 것을 바꿨어요");
    } catch (e) {
      toast.show((e as Error).message || "바꾸지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(null); }
  };

  if (links.status === "loading") return <div className="flex flex-col gap-4 mb-10"><Skeleton className="h-10 rounded-full w-40" /><SkeletonList rows={3} thumb={false} /></div>;
  if (links.status === "error" || !links.data) {
    return (
      <div className="mb-10">
        <EmptyState title="가족 연결을 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
          action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setLinks({ status: "loading", data: null }); reload(); }}>다시 불러오기</Button>} />
      </div>
    );
  }
  const { watching, invites, watchers } = links.data;
  const current = watching.find((w) => w.id === pick) ?? watching[0] ?? null;

  return (
    <div className="flex flex-col gap-10 mb-10">
      <section aria-labelledby="watch-h">
        <SectionHeader title={<span id="watch-h">내가 보는 가족</span>} description="가족이 보여 주기로 한 것만 보여요"
          action={<Button size="sm" icon="plus" onClick={() => { setLabel(""); setMade(null); setInviting(true); }}>가족 초대하기</Button>} />
        {watching.length === 0 ? (
          <EmptyState title="아직 연결한 가족이 없어요" description="초대 링크를 보내면 가족이 보여 줄 것을 골라 동의한 뒤 연결돼요" />
        ) : (
          <>
            {watching.length > 1 && (
              <ChipRow className="mb-4">
                {watching.map((w) => <Chip key={w.id} selected={current?.id === w.id} onClick={() => setPick(w.id)}>{w.label}</Chip>)}
              </ChipRow>
            )}
            {current && <FamilyToday key={current.id} link={current} onEnd={() => setEnding({ id: current.id, title: `${current.label} 연결을 끊을까요?` })} />}
          </>
        )}
        {invites.length > 0 && (
          <ul className="flex flex-col mt-4" aria-label="보낸 초대">
            {invites.map((i) => (
              <ListRow key={i.id} title={`${i.label} · 초대를 기다리는 중`} meta={`${i.expires_at.slice(5, 7).replace(/^0/, "")}월 ${i.expires_at.slice(8, 10).replace(/^0/, "")}일까지 받을 수 있어요`}
                trailing={<span className="flex items-center gap-1">
                  <TextButton onClick={() => copy(i.url, toast)}>링크 복사하기</TextButton>
                  <IconButton icon="trash" label={`${i.label} 초대 지우기`} size="sm" onClick={() => end(i.id)} disabled={busy === i.id} />
                </span>} />
            ))}
          </ul>
        )}
      </section>

      {watchers.length > 0 && (
        <section aria-labelledby="watchers-h">
          <SectionHeader title={<span id="watchers-h">나를 보는 가족</span>} description="보여 줄 것은 나만 바꾸거나 그만둘 수 있어요" />
          <div className="flex flex-col gap-3">
            {watchers.map((w) => (
              <Card key={w.id} className="flex flex-col gap-1">
                <h3 className="text-body font-bold text-ink">{w.who ? `${w.who} 님에게` : "연결된 가족에게"} 보여 주는 것</h3>
                {(Object.keys(SCOPE_LABEL) as (keyof Scopes)[]).map((k) => (
                  <Switch key={k} checked={w.scopes[k]} disabled={busy === w.id} label={SCOPE_LABEL[k].title} description={SCOPE_LABEL[k].hint}
                    onChange={(v) => saveScopes(w.id, { ...w.scopes, [k]: v })} />
                ))}
                <p className="text-caption text-ink-2">체중·건강 목표·먹은 음식 이름은 보여 주지 않아요</p>
                <TextButton className="self-start text-danger" onClick={() => setEnding({ id: w.id, title: `${w.who ? `${w.who} 님에게` : "이 가족에게"} 그만 보여 줄까요?` })}>그만 보여 주기</TextButton>
              </Card>
            ))}
          </div>
        </section>
      )}

      <MedChecks />

      <Sheet open={inviting} onClose={() => setInviting(false)} title="가족 초대하기" size="sm"
        description="링크를 받은 가족이 로그인하고, 무엇을 보여 줄지 골라 동의하면 연결돼요. 링크는 7일 동안 쓸 수 있어요"
        footer={made
          ? <Button block icon="copy" onClick={() => copy(made, toast)}>링크 복사하기</Button>
          : <Button block loading={busy === "invite"} disabled={!label.trim()} onClick={createInvite}>초대 링크 만들기</Button>}>
        {made ? (
          <div className="flex flex-col gap-2">
            <p className="text-body text-ink">초대 링크를 만들었어요</p>
            <p className="rounded-md bg-sunken px-3 py-2 text-label text-ink break-all select-all">{made}</p>
          </div>
        ) : (
          <Field label="부르는 이름" hint="10자까지 · 가족 화면에 이 이름으로 보여요">
            <Input value={label} maxLength={10} name="family_label" placeholder="예: 엄마" onChange={(e) => setLabel(e.target.value)} />
          </Field>
        )}
      </Sheet>

      <ConfirmSheet open={!!ending} onClose={() => setEnding(null)} loading={!!ending && busy === ending.id}
        title={ending?.title || ""} description="끊으면 서로의 기록이 더는 보이지 않아요. 다시 연결하려면 새 초대가 필요해요"
        confirmLabel="연결 끊기" onConfirm={() => ending && end(ending.id)} />
    </div>
  );
}

/** 보는 사람의 오늘 화면 — 고르지 않은 칸은 '보여 주기로 하지 않았어요' */
function FamilyToday({ link, onEnd }: { link: Links["watching"][number]; onEnd: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; today: Today | null }>({ status: "loading", today: null });
  const [attempt, setAttempt] = useState(0);
  const [alert, setAlert] = useState(link.alert_evening);
  const seq = useRef(0);

  useEffect(() => {
    const n = ++seq.current;
    fetch(`/api/family/links/${link.id}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (n === seq.current) setState({ status: "done", today: d.today }); })
      .catch(() => { if (n === seq.current) setState({ status: "error", today: null }); });
  }, [link.id, attempt]);

  const toggleAlert = async (v: boolean) => {
    setAlert(v);
    const r = await fetch("/api/family/links", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: link.id, alert_evening: v }) }).catch(() => null); // ds-allow: 실패는 바로 아래에서 알림
    if (!r?.ok) { setAlert(!v); toast.show("알림 설정을 바꾸지 못했어요. 다시 시도해 주세요", { tone: "danger" }); }
  };

  if (state.status === "loading") return <SkeletonList rows={4} thumb={false} />;
  if (state.status === "error" || !state.today) {
    return <EmptyState title={`${link.label}의 오늘을 불러오지 못했어요`} description="연결이 잠깐 끊겼을 수 있어요"
      action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading", today: null }); setAttempt((n) => n + 1); }}>다시 불러오기</Button>} />;
  }
  const t = state.today;
  const done = t.meals?.filter((m) => m.at).length ?? 0;
  const notShared = <p className="text-label text-ink-2">보여 주기로 하지 않은 항목이에요</p>;

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="오늘 끼니" className="flex flex-col gap-3">
        <span className="text-label text-ink-2 num">{Number(t.date.slice(5, 7))}월 {Number(t.date.slice(8, 10))}일 {weekday(t.date)}요일</span>
        {t.meals ? (
          <>
            <Stat label="오늘 기록한 끼니" value={done} unit="끼" size="lg" emphasis />
            <Card className="flex flex-col p-0">
              {t.meals.map((m) => (
                <ListRow key={m.meal} className="px-4" title={MEAL_LABEL[m.meal]}
                  trailing={m.at ? <span className="text-label text-positive font-medium">기록했어요 <span className="num text-ink-2 font-regular">{m.at}</span></span> : <span className="text-label text-ink-2">아직이에요</span>} />
              ))}
            </Card>
          </>
        ) : notShared}
      </section>

      <section aria-label="이번 주 고른 제품" className="flex flex-col gap-2">
        <h3 className="text-body font-bold text-ink">이번 주 고른 제품</h3>
        {!t.products ? notShared : t.products.length === 0 ? <p className="text-label text-ink-2">이번 주에 기록한 제품이 없어요</p> : (
          <>
            {t.product_summary && <p className="text-label text-ink num">나트륨 600mg 이하 {t.product_summary.low_sodium}개 · 단백질 15g 이상 {t.product_summary.protein15}개 <span className="text-ink-2">· 기록한 양 기준</span></p>}
            <ul className="flex flex-col">
              {t.products.map((p, i) => <ListRow key={`${p.name}-${i}`} title={p.name} meta={p.fact || "성분 정보 없음"} trailing={<span className="text-caption text-ink-2">{p.day === t.date ? "오늘" : `${weekday(p.day)}요일`}</span>} />)}
            </ul>
          </>
        )}
      </section>

      <section aria-label="약 먹었는지" className="flex flex-col gap-2">
        <h3 className="text-body font-bold text-ink">약 먹었는지</h3>
        {!t.meds ? notShared : t.meds.length === 0 ? <p className="text-label text-ink-2">아직 약 체크를 만들지 않았어요</p> : (
          <ul className="flex flex-col">
            {t.meds.map((m) => (
              <ListRow key={m.id} title={m.label}
                trailing={m.checked_at ? <span className="text-label text-positive font-medium">먹었어요 <span className="num text-ink-2 font-regular">{m.checked_at}</span></span>
                  : <span className="text-label text-ink-2">{m.remind_at ? <><span className="num">{m.remind_at}</span>에 알려 드려요</> : "아직이에요"}</span>} />
            ))}
          </ul>
        )}
        {t.meds && <p className="text-caption text-ink-2">앱은 먹었는지 체크만 해요 · 약 이름·용량은 보이지 않아요</p>}
      </section>

      {t.numbers && (
        <section aria-label="오늘 숫자" className="flex flex-col gap-1">
          <h3 className="text-body font-bold text-ink">오늘 숫자</h3>
          <p className="text-label text-ink num">열량 {won(t.numbers.kcal)}kcal · 단백질 {won(t.numbers.protein_g)}g · 나트륨 {won(t.numbers.sodium_mg)}mg</p>
        </section>
      )}

      {t.meals && (
        <Switch checked={alert} onChange={toggleAlert} label="저녁 8시까지 기록이 없으면 알려 주기" description={`나에게만 와요 · ${link.label} 쪽에는 재촉 알림이 가지 않아요`} />
      )}
      <p className="text-caption text-ink-2">보여 주기로 한 것 · {shared(link.scopes)} · 바꾸거나 그만두기는 {link.label} 쪽에서만 할 수 있어요
        {" "}<TextButton className="text-caption" onClick={onEnd}>연결 끊기</TextButton></p>
    </div>
  );
}

/** 내 약 체크 — 이름과 알림 시각만. 체크는 오늘 하루씩 */
function MedChecks() {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; items: Med[] }>({ status: "loading", items: [] });
  const [attempt, setAttempt] = useState(0);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [time, setTime] = useState("08:00");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/me/meds")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (alive) setState({ status: "done", items: d.items || [] }); })
      .catch(() => { if (alive) setState({ status: "error", items: [] }); });
    return () => { alive = false; };
  }, [attempt]);

  const call = async (method: "POST" | "PATCH" | "DELETE", body: object, key: string, done: string) => {
    setBusy(key);
    try {
      const r = await fetch("/api/me/meds", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "");
      setState({ status: "done", items: d.items || [] });
      if (done) toast.show(done);
      return true;
    } catch (e) {
      toast.show((e as Error).message || "저장하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
      return false;
    } finally { setBusy(null); }
  };

  return (
    <section aria-labelledby="med-h">
      <SectionHeader title={<span id="med-h">내 약 체크</span>} description="먹었는지 체크하고, 정한 시각에 알려 드려요"
        action={<Button size="sm" variant="secondary" icon="plus" onClick={() => { setLabel(""); setAdding(true); }}>추가하기</Button>} />
      {state.status === "loading" ? <SkeletonList rows={2} thumb={false} />
        : state.status === "error" ? (
          <EmptyState title="약 체크를 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading", items: [] }); setAttempt((n) => n + 1); }}>다시 불러오기</Button>} />
        ) : state.items.length === 0 ? (
          <EmptyState title="아직 약 체크가 없어요" description="'아침 약'처럼 내가 정한 이름으로 만들어요. 약 이름은 적지 않아도 돼요" />
        ) : (
          <ul className="flex flex-col">
            {state.items.map((m) => (
              <ListRow key={m.id} title={m.label} meta={m.remind_at ? <span className="num">{m.remind_at} 알림</span> : "알림 없음"}
                leading={<Checkbox aria-label={`${m.label} 먹었어요`} checked={!!m.checked_at} disabled={busy === m.id}
                  onChange={(e) => call("PATCH", { id: m.id, checked: e.target.checked }, m.id, e.target.checked ? `${m.label} 먹었어요로 체크했어요` : "체크를 풀었어요")} />}
                trailing={<span className="flex items-center gap-2">
                  {m.checked_at && <span className="text-caption text-positive num">{m.checked_at}</span>}
                  <IconButton icon="trash" label={`${m.label} 지우기`} size="sm" disabled={busy === m.id} onClick={() => call("DELETE", { id: m.id }, m.id, "약 체크를 지웠어요")} />
                </span>} />
            ))}
          </ul>
        )}
      <p className="text-caption text-ink-2 mt-2">앱은 먹었는지 체크와 시간 알림만 해요. 먹는 법이나 함께 먹으면 안 되는 것은 약사·의사에게 물어봐 주세요</p>

      <Sheet open={adding} onClose={() => setAdding(false)} title="약 체크 추가하기" size="sm"
        footer={<Button block loading={busy === "add"} disabled={!label.trim()} onClick={async () => { if (await call("POST", { label, remind_at: time || null }, "add", "약 체크를 추가했어요")) setAdding(false); }}>추가하기</Button>}>
        <div className="flex flex-col gap-4">
          <Field label="이름" hint="20자까지 · 예: 아침 약, 저녁 영양제">
            <Input value={label} maxLength={20} name="med_label" placeholder="예: 아침 약" onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="알림 시각" hint="이 시각부터 1시간 안에 체크하지 않았으면 한 번 알려 드려요 · 비우면 알림 없음">
            <Input type="time" value={time} name="med_time" onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
      </Sheet>
    </section>
  );
}
