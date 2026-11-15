"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  BackButton, BottomBar, Buddy, Button, ChatBubble, ChatTyping, Chip, ChipRow, ConfirmSheet, EmptyState, Input, LinkButton, Skeleton, TextButton, TextLink, useToast,
} from "@/components/ui";
import type { MascotMood } from "@/components/ui";
import { josa, type IngredientKey, type PersonalityKey, type StageKey } from "@/lib/buddy";

/**
 * 캐릭터와 이야기하기 (/api/me/buddy/chat) — 심심이처럼 아무 말이나 하면, 같이 다니는 재료 캐릭터가 오늘 내 기록·목표를 알고 제 성격대로 답한다.
 * 들어오면 캐릭터가 먼저 말한다(오늘 첫 인사 · 새로 적은 음식에 반응). 하루 한도가 있다(남은 횟수를 입력 줄 아래에).
 * 네 상태: 불러오는 중(말풍선 자리) · 비어 있음(캐릭터 없음·꺼 둠) · 실패(다시 불러오기) · 채워짐.
 * 늦게 온 불러오기 응답은 버리고(요청 번호), 보내는 동안은 다시 보내지 않는다.
 */
type Msg = { id: string; role: "me" | "buddy"; text: string };
type Data = {
  on: boolean; ai: boolean; mood: MascotMood; wraps: number; limit: number; left: number; quick: string[];
  stage: { key: StageKey; name: string };
  buddy: { id: string; ingredient: IngredientKey; personality: PersonalityKey; name: string } | null;
  messages: Msg[];
};

export function BuddyChat() {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [reload, setReload] = useState(0);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState<"closed" | "open" | "busy">("closed");
  const seq = useRef(0);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const n = ++seq.current;
    fetch("/api/me/buddy/chat")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d as Data; })
      .then((d) => { if (n === seq.current) { setData(d); setStatus("ready"); } })
      .catch((e) => { console.error("캐릭터 이야기를 불러오지 못했어요:", (e as Error).message); if (n === seq.current) setStatus("error"); });
  }, [reload]);

  const count = data?.messages.length ?? 0;
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [count, sending]);

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
  }, [data?.buddy, sending, toast]);

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

  const top = (
    <div className="flex items-center justify-between gap-3 mb-3">
      <BackButton fallback="/diary" />
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
      {data.ai && <p className="text-caption text-ink-3 mb-5">답은 AI가 만들어요. 오늘 기록한 음식과 목표 숫자만 함께 보내고, 이름·연락처·건강 정보는 보내지 않아요</p>}

      <section aria-label={`${b.name}${josa(b.name, "과", "와")} 이야기`} aria-live="polite" className="flex flex-col gap-2 pb-48">
        {data.messages.length === 0 && <p className="text-label text-ink-2 py-6 text-center">아래에서 말을 걸어 보세요</p>}
        {data.messages.map((m, i) => (
          <ChatBubble key={m.id} from={m.role} avatar={m.role === "buddy" && data.messages[i - 1]?.role !== "buddy" ? face(40) : null}
            className={i > 0 && data.messages[i - 1].role !== m.role ? "mt-2" : undefined}>
            {m.text}
          </ChatBubble>
        ))}
        {sending && <ChatTyping avatar={face(40)} label={`${b.name}${josa(b.name, "이", "가")} 답을 쓰고 있어요`} />}
        {data.messages.length > 0 && (
          <TextButton className="self-center mt-4 text-ink-2" onClick={() => setClearing("open")}>이야기 지우기</TextButton>
        )}
        <div ref={end} />
      </section>

      <BottomBar>
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

      <ConfirmSheet open={clearing !== "closed"} onClose={() => setClearing("closed")} title="이야기를 모두 지울까요?"
        description="지운 이야기는 되돌릴 수 없어요. 캐릭터와 기록은 그대로 남아요" confirmLabel="지우기" tone="danger"
        loading={clearing === "busy"} onConfirm={clearAll} />
    </>
  );
}
