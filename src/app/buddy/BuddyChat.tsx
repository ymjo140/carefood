"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  BottomBar, Buddy, Button, ChatBubble, ChatPicks, ChatPlan, ChatTyping, Chip, ChipRow, ConfirmSheet, EmptyState, Input, LinkButton, Skeleton, TextButton, TextLink, useToast,
} from "@/components/ui";
import type { MascotMood } from "@/components/ui";
import { SupplementSheet } from "./SupplementSheet";
import { useRouter } from "next/navigation";
import { DAY_KEYS, DAY_LABEL, MEAL_LABEL, dayKcal, planGrid, planKind, type PlanPick } from "@/lib/chat-plans";
import { josa, type IngredientKey, type PersonalityKey, type StageKey } from "@/lib/buddy";

/**
 * 캐릭터와 이야기하기 (/api/me/buddy/chat) — 심심이처럼 아무 말이나 하면, 같이 다니는 재료 캐릭터가 오늘 내 기록·목표를 알고 제 성격대로 답한다.
 * 들어오면 캐릭터가 먼저 말한다(오늘 첫 인사 · 새로 적은 음식에 반응). 하루 한도가 있다(남은 횟수를 입력 줄 아래에).
 * 네 상태: 불러오는 중(말풍선 자리) · 비어 있음(캐릭터 없음·꺼 둠) · 실패(다시 불러오기) · 채워짐.
 * 늦게 온 불러오기 응답은 버리고(요청 번호), 보내는 동안은 다시 보내지 않는다.
 */
type Msg = { id: string; role: "me" | "buddy"; text: string; items?: PlanPick[] | null };
type Data = {
  on: boolean; ai: boolean; mood: MascotMood; wraps: number; limit: number; left: number; quick: string[];
  stage: { key: StageKey; name: string };
  buddy: { id: string; ingredient: IngredientKey; personality: PersonalityKey; name: string } | null;
  messages: Msg[];
  /** 영양제 — 등록한 수 · 때가 지났는데 안 먹은 수 */
  supps?: { count: number; due: number };
};

export function BuddyChat() {
  const toast = useToast();
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  /** 일주일 추천 → 식단 리스트에 저장하고 일주일 화면에서 연다 (거기서 고치고 다시 저장) */
  const saveWeek = async (m: Msg) => {
    if (!m.items?.length || saving) return;
    setSaving(m.id);
    try {
      const r = await fetch("/api/meal-plans", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "AI 추천 일주일 식단", grid: planGrid(m.items), tags: ["AI 추천"] }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.id) throw new Error(d.error || "");
      toast.show("일주일 식단에 담았어요. 고친 뒤 저장하면 돼요");
      router.push(`/weekly-box?plan=${encodeURIComponent(d.id)}`);
    } catch (e) {
      console.error("일주일 식단에 담지 못했어요:", (e as Error).message);
      toast.show("일주일 식단에 담지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setSaving(null); }
  };
  const [data, setData] = useState<Data | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [reload, setReload] = useState(0);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState<"closed" | "open" | "busy">("closed");
  const [suppOpen, setSuppOpen] = useState(false);
  const seq = useRef(0);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const n = ++seq.current;
    fetch("/api/me/buddy/chat")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d as Data; })
      .then((d) => { if (n === seq.current) { setData(d); setStatus("ready"); } })
      .catch((e) => { console.error("캐릭터 이야기를 불러오지 못했어요:", (e as Error).message); if (n === seq.current) setStatus("error"); });
  }, [reload]);

  // 식단 탭 요약 카드의 'AI에게 묻기'로 왔으면(?ask=) 그 말을 입력 줄에 넣어 둔다 — 보내기는 사용자가 (하루 한도를 쓰므로)
  useEffect(() => {
    const ask = new URLSearchParams(window.location.search).get("ask");
    if (ask) setText(ask.slice(0, 300)); // eslint-disable-line react-hooks/set-state-in-effect -- 주소는 화면을 그린 뒤에 읽는다
  }, []);

  const count = data?.messages.length ?? 0;
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [count, sending]);

  const suppDue = data?.supps?.due ?? 0;
  const send = useCallback(async (raw: string) => {
    const say = raw.replace(/\s+/g, " ").trim();
    if (!say || sending || !data?.buddy) return;
    const temp: Msg = { id: `temp-${Date.now()}`, role: "me", text: say };
    setSending(true);
    setText("");
    setData((d) => d && { ...d, messages: [...d.messages, temp] });
    try {
      const r = await fetch("/api/me/buddy/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: say }) });
      const d = await r.json();
      if (!r.ok) {
        if (r.status === 429) setData((x) => x && { ...x, left: 0 });
        throw new Error(r.status === 429 || r.status === 400 ? d.error : "");
      }
      // 영양제를 먹었다고 했으면 빠른 말·묻기가 바뀐다 — 새로 불러온다
      if (suppDue) setReload((k) => k + 1);
      setData((x) => x && {
        ...x, left: d.left,
        messages: [...x.messages.filter((m) => m.id !== temp.id), { id: String(d.mine.id), role: "me", text: say }, d.reply as Msg],
      });
    } catch (e) {
      setData((x) => x && { ...x, messages: x.messages.filter((m) => m.id !== temp.id) });
      setText(say);
      toast.show((e as Error).message || "보내지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally {
      setSending(false);
    }
  }, [data?.buddy, suppDue, sending, toast]);

  const clearAll = async () => {
    setClearing("busy");
    try {
      const r = await fetch("/api/me/buddy/chat", { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error);
      setClearing("closed");
      toast.show("이야기를 지웠어요");
      setReload((k) => k + 1);
    } catch (e) {
      console.error("이야기를 지우지 못했어요:", (e as Error).message);
      setClearing("open");
      toast.show("이야기를 지우지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
  };

  // AI 탭의 첫 화면 — 뒤로 가기 없이, 오른쪽에 피드백(주간 리포트)과 관리
  const top = (
    <div className="flex items-center justify-end gap-4 mb-3 min-h-11">
      <TextLink href="/diary/report" className="text-label">주간 리포트</TextLink>
      {data?.buddy && <TextButton onClick={() => setSuppOpen(true)}>영양제{data.supps?.due ? ` · ${data.supps.due}개 아직` : ""}</TextButton>}
      <TextLink href="/me/character" className="text-label">캐릭터 관리</TextLink>
    </div>
  );

  if (status === "loading") {
    return (
      <>
        {top}
        <div className="flex items-center gap-3 mb-6"><Skeleton className="size-16 rounded-full" /><Skeleton className="h-6 w-40" /></div>
        <div className="flex flex-col gap-3" aria-label="불러오는 중">
          <Skeleton className="h-12 w-3/4 rounded-lg" /><Skeleton className="h-12 w-1/2 rounded-lg self-end" /><Skeleton className="h-12 w-2/3 rounded-lg" />
        </div>
      </>
    );
  }
  if (status === "error" || !data) {
    return (
      <>
        {top}
        <EmptyState title="이야기를 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
          action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setStatus("loading"); setReload((k) => k + 1); }}>다시 불러오기</Button>} />
      </>
    );
  }
  if (!data.on) {
    return (
      <>
        {top}
        <EmptyState title="캐릭터를 꺼 두었어요" description="켜면 오늘 기록을 같이 보며 이야기할 수 있어요"
          action={<LinkButton href="/me/character" size="sm" variant="secondary">캐릭터 켜기</LinkButton>} />
      </>
    );
  }
  if (!data.buddy) {
    return (
      <>
        {top}
        <EmptyState title="아직 같이 다니는 캐릭터가 없어요" description={data.wraps ? "보자기를 풀면 같이 먹을 캐릭터가 나와요" : "기록을 이어 가면 보자기가 와요"}
          action={<LinkButton href="/me/character" size="sm" variant="secondary">{data.wraps ? "보자기 풀기" : "캐릭터 보기"}</LinkButton>} />
      </>
    );
  }

  const b = data.buddy;
  const face = (size: number) => <Buddy ingredient={b.ingredient} personality={b.personality} mood={data.mood} stage={data.stage.key} size={size} decorative />;
  const submit = (e: FormEvent) => { e.preventDefault(); void send(text); };
  const out = data.left <= 0;

  return (
    <>
      {top}
      <header className="flex items-center gap-3 mb-2">
        {face(64)}
        <div className="min-w-0">
          <h1 className="text-title font-bold text-ink">{b.name}</h1>
          <p className="text-label text-ink-2">{data.stage.name} · 오늘 기록을 같이 보며 이야기해요</p>
        </div>
      </header>
      {data.ai && <p className="text-caption text-ink-3 mb-5">답은 AI가 만들어요. 오늘 기록한 음식·목표 숫자·영양제 체크만 함께 보내고, 이름·연락처·건강 정보는 보내지 않아요</p>}

      <section aria-label={`${b.name}${josa(b.name, "과", "와")} 이야기`} aria-live="polite" className="flex flex-col gap-2 pb-64">
        {data.messages.length === 0 && <p className="text-label text-ink-2 py-6 text-center">아래에서 말을 걸어 보세요</p>}
        {data.messages.map((m, i) => (
          <ChatBubble key={m.id} from={m.role} avatar={m.role === "buddy" && data.messages[i - 1]?.role !== "buddy" ? face(40) : null}
            className={i > 0 && data.messages[i - 1].role !== m.role ? "mt-2" : undefined}>
            {m.text}
          </ChatBubble>
        )).flatMap((el, i) => {
          const msg = data.messages[i];
          const items = msg.items;
          if (!items?.length) return [el];
          const kind = planKind(items);
          const by = `${b.name}${josa(b.name, "이", "가")}`;
          if (kind === "week") {
            const groups = DAY_KEYS.map((d) => ({
              key: d, title: `${DAY_LABEL[d]}요일`, meta: `${dayKcal(items, d).toLocaleString("ko-KR")}kcal`,
              items: items.filter((x) => x.slot?.day === d).map((x) => ({ ...x, name: `${MEAL_LABEL[x.slot!.meal] || "끼니"} ${x.name}`, facts: x.cell?.calories != null ? `${x.cell.calories.toLocaleString("ko-KR")}kcal` : x.facts })),
            })).filter((g) => g.items.length);
            return [el, <ChatPlan key={`${msg.id}-plan`} compact groups={groups} label={`${by} 짠 일주일 식단`}
              action={<Button block icon="calendar" loading={saving === msg.id} disabled={!!saving} onClick={() => void saveWeek(msg)}>일주일 식단에 담기</Button>} />];
          }
          if (kind === "day") {
            const meals = [...new Set(items.map((x) => x.slot!.meal))];
            const groups = meals.map((m) => ({ key: m, title: MEAL_LABEL[m] || "끼니", items: items.filter((x) => x.slot?.meal === m) }));
            return [el, <ChatPlan key={`${msg.id}-plan`} groups={groups} label={`${by} 고른 오늘 하루 식단`}
              action={<LinkButton block variant="secondary" href="/diary">식단에 기록하러 가기</LinkButton>} />];
          }
          return [el, <ChatPicks key={`${msg.id}-picks`} items={items} label={`${by} 고른 추천`} />];
        })}
        {sending && <ChatTyping avatar={face(40)} label={`${b.name}${josa(b.name, "이", "가")} 답을 쓰고 있어요`} />}
        {data.messages.length > 0 && (
          <TextButton className="self-center mt-4 text-ink-2" onClick={() => setClearing("open")}>이야기 지우기</TextButton>
        )}
        <div ref={end} className="scroll-mb-56" aria-hidden="true" />
      </section>

      <BottomBar overNav>
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          {!out && (
            <ChipRow>
              {data.quick.map((q) => <Chip key={q} size="sm" disabled={sending} onClick={() => void send(q)}>{q}</Chip>)}
            </ChipRow>
          )}
          <form className="flex gap-2" onSubmit={submit}>
            <Input value={text} onChange={(e) => setText(e.target.value)} name="buddy_say" maxLength={300} disabled={out}
              placeholder={out ? "오늘은 다 이야기했어요. 내일 또 만나요" : `${b.name}에게 말 걸기`} aria-label={`${b.name}에게 할 말`} />
            <Button type="submit" className="shrink-0" disabled={!text.trim() || out} loading={sending}>보내기</Button>
          </form>
          <p className="text-caption text-ink-3 num">오늘 {data.left}번 더 이야기할 수 있어요</p>
        </div>
      </BottomBar>

      <SupplementSheet open={suppOpen} onClose={() => setSuppOpen(false)} onChanged={() => setReload((k) => k + 1)} />
      <ConfirmSheet open={clearing !== "closed"} onClose={() => setClearing("closed")} title="이야기를 모두 지울까요?"
        description="지운 이야기는 되돌릴 수 없어요. 캐릭터와 기록은 그대로 남아요" confirmLabel="지우기" tone="danger"
        loading={clearing === "busy"} onConfirm={clearAll} />
    </>
  );
}
