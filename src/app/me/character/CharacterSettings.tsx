"use client";

import { useEffect, useState } from "react";
import { BottomBar, Button, Card, ChoiceCard, EmptyState, Mascot, MASCOTS, Skeleton, useToast } from "@/components/ui";
import type { MascotMood } from "@/components/ui";
import { lineOf, type MascotPrefs } from "@/lib/mascot";

/**
 * 캐릭터 고르기 — 끼록이·람이·끼냥이·캐릭터 없이. 캐릭터를 고르면 표정·삐지기가 함께 켜지고, 끄려면 '캐릭터 없이'.
 * 위 미리 보기는 지금 내 기록으로 정해진 표정 (/api/me/mascot). 저장하기를 눌러야 바뀐다.
 */
type Data = { prefs: MascotPrefs; mood: MascotMood; welcome_back: boolean; streak: number; meals: number };

export function CharacterSettings() {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data: Data | null }>({ status: "loading", data: null });
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<MascotPrefs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/me/mascot")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (alive) { setState({ status: "done", data: d }); setDraft(d.prefs); } })
      .catch(() => { if (alive) setState({ status: "error", data: null }); });
    return () => { alive = false; };
  }, [attempt]);

  if (state.status === "loading") return <div className="flex flex-col gap-4"><Skeleton className="h-32 rounded-lg" /><Skeleton className="h-64 rounded-lg" /></div>;
  if (state.status === "error" || !state.data || !draft) {
    return (
      <EmptyState title="캐릭터 설정을 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
        action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading", data: null }); setAttempt((n) => n + 1); }}>다시 불러오기</Button>} />
    );
  }
  const d = state.data;
  const changed = JSON.stringify(draft) !== JSON.stringify(d.prefs);
  const kind = draft.kind === "none" ? null : draft.kind;
  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/me/mascot", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "");
      setState({ status: "done", data: { ...d, prefs: j.prefs } });
      setDraft(j.prefs);
      toast.show("캐릭터 설정을 저장했어요");
    } catch {
      toast.show("저장하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col gap-8 pb-24">
      <Card className="flex items-center gap-4 bg-sunken border-transparent">
        {kind ? <Mascot kind={kind} mood={d.mood} size={96} streak={d.streak} /> : (
          <span aria-hidden="true" className="size-20 shrink-0 rounded-lg bg-surface flex items-center justify-center text-title font-bold text-ink-2">가</span>
        )}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <p className="text-body text-ink">{kind ? lineOf(kind, { mood: d.mood, welcomeBack: d.welcome_back }, { streak: d.streak, meals: d.meals }) : "캐릭터 없이 글자로만 알려 드려요"}</p>
          <p className="text-caption text-ink-2">지금 내 기록으로 정해진 표정이에요 · 내 화면에만 나와요</p>
        </div>
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby="pick-h">
        <h2 id="pick-h" className="text-body font-bold text-ink">같이 할 캐릭터</h2>
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-labelledby="pick-h">
          {MASCOTS.map((m) => (
            <ChoiceCard key={m.kind} align="center" selected={draft.kind === m.kind} onClick={() => setDraft({ ...draft, kind: m.kind })}
              title={<span className="flex flex-col items-center gap-1"><Mascot kind={m.kind} mood="wait" size={56} />{m.name}</span>} description={m.about} />
          ))}
          <ChoiceCard align="center" selected={draft.kind === "none"} onClick={() => setDraft({ ...draft, kind: "none" })}
            title={<span className="flex flex-col items-center gap-1"><span aria-hidden="true" className="size-14 rounded-md bg-sunken flex items-center justify-center text-title font-bold text-ink-2">가</span>캐릭터 없이</span>}
            description="글자로만 담백하게" />
        </div>
      </section>

      <BottomBar>
        <Button block loading={saving} disabled={!changed} onClick={save}>저장하기</Button>
      </BottomBar>
    </div>
  );
}
