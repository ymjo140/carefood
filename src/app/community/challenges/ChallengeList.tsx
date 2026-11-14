"use client";

import { useEffect, useState } from "react";
import { Button, Card, ConfirmSheet, DayDots, EmptyState, SkeletonList, TextLink, useToast } from "@/components/ui";
import ShareCardSheet from "@/components/community/ShareCardSheet";
import { METRIC_META, metricValue, type ChallengeMetric, type DayState } from "@/lib/challenges";

/**
 * 챌린지 목록 — 규칙 · 지금 하는 사람 수 · (참여했으면) 날짜 줄과 해낸 날 수.
 * 달성 여부는 식단 기록의 성분 합계로만 계산한다. 다른 사람의 기록은 보이지 않는다.
 * 하루라도 해냈으면 '인증하기' — 해낸 날 줄을 9:16 카드로 그려 인스타 스토리에 올린다.
 */
type Run = {
  started_on: string; ends_on: string; finished: boolean; done_count: number; finished_runs: number;
  days: { date: string; state: DayState; value: number | null }[]; today_value: number | null;
};
type Item = { id: string; title: string; rule: string; metric: ChallengeMetric; target: number; days: number; active_count: number; finished_count: number; me: Run | null };

export function ChallengeList() {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; items: Item[] }>({ status: "loading", items: [] });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<Item | null>(null);
  const [card, setCard] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/community/challenges")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (alive) setState({ status: "done", items: d.challenges || [] }); })
      .catch(() => { if (alive) setState({ status: "error", items: [] }); });
    return () => { alive = false; };
  }, [attempt]);

  const join = async (c: Item) => {
    setBusy(c.id);
    try {
      const r = await fetch("/api/community/challenges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challenge_id: c.id }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error);
      if (d.challenge) setState((s) => ({ ...s, items: s.items.map((x) => (x.id === c.id ? d.challenge : x)) }));
      toast.show(c.me ? "오늘부터 다시 시작했어요" : "참여했어요. 오늘부터 식단을 기록하면 하루씩 채워져요");
    } catch {
      toast.show("참여하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(null); }
  };

  const leave = async (c: Item) => {
    setBusy(c.id);
    try {
      const r = await fetch("/api/community/challenges", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challenge_id: c.id }) });
      if (!r.ok) throw new Error(String(r.status));
      setState((s) => ({ ...s, items: s.items.map((x) => (x.id === c.id ? { ...x, me: null, active_count: Math.max(0, x.active_count - (x.me && !x.me.finished ? 1 : 0)) } : x)) }));
      setLeaving(null);
      toast.show("챌린지를 그만뒀어요");
    } catch {
      toast.show("그만두지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(null); }
  };

  if (state.status === "loading") return <SkeletonList rows={4} thumb={false} />;
  if (state.status === "error") {
    return (
      <EmptyState title="챌린지를 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
        action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading", items: [] }); setAttempt((n) => n + 1); }}>다시 불러오기</Button>} />
    );
  }
  if (state.items.length === 0) {
    return <EmptyState title="지금 열린 챌린지가 없어요" description="새 챌린지가 열리면 여기에 나와요" />;
  }

  // 하고 있는 것 먼저
  const items = [...state.items].sort((a, b) => Number(!!b.me && !b.me.finished) - Number(!!a.me && !a.me.finished));

  return (
    <>
      <ul className="flex flex-col gap-3">
        {items.map((c) => {
          const m = METRIC_META[c.metric];
          const run = c.me;
          return (
            <li key={c.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                  <h2 className="text-body font-bold text-ink">{c.title}</h2>
                  <p className="text-label text-ink-2">{c.rule}을 <span className="num">{c.days}</span>일 동안 채워요</p>
                  {/* 0명이면 '지금 0명이 하고 있어요' 대신 아무것도 적지 않는다 — 참여 수는 사람이 있을 때만 */}
                  {(c.active_count > 0 || c.finished_count > 0) && (
                    <p className="text-caption text-ink-2">
                      {c.active_count > 0 && <>지금 <span className="num">{c.active_count}</span>명이 하고 있어요</>}
                      {c.active_count > 0 && c.finished_count > 0 && " · "}
                      {c.finished_count > 0 && <><span className="num">{c.finished_count}</span>명이 마쳤어요</>}
                    </p>
                  )}
                </div>

                {run ? (
                  <div className="flex flex-col gap-2.5">
                    <DayDots days={run.days} />
                    <p className="text-label text-ink">
                      <span className="num">{c.days}</span>일 중 <span className="num font-bold text-brand-ink">{run.done_count}</span>일 해냈어요
                      {run.finished && <span className="text-ink-2"> · 끝났어요</span>}
                    </p>
                    {!run.finished && (
                      <p className="text-label text-ink-2">
                        {run.today_value == null
                          ? <>오늘 아직 기록이 없어요 · <TextLink href="/diary">기록하기</TextLink></>
                          : <>오늘 지금까지 {m.label} <span className="num font-bold text-ink">{metricValue(c.metric, run.today_value)}</span>
                              {" "}· 기준 <span className="num">{metricValue(c.metric, c.target)}</span> {m.max ? "이하" : "이상"}</>}
                      </p>
                    )}
                    <div className="flex gap-2">
                      {run.done_count > 0 && <Button size="sm" icon="share" onClick={() => setCard(c.id)}>인증하기</Button>}
                      {run.finished
                        ? <Button size="sm" variant="secondary" icon="refresh" loading={busy === c.id} onClick={() => join(c)}>다시 하기</Button>
                        : <Button size="sm" variant="ghost" disabled={busy === c.id} onClick={() => setLeaving(c)}>그만두기</Button>}
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="secondary" icon="plus" className="self-start" loading={busy === c.id} onClick={() => join(c)}>참여하기</Button>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
      <p className="text-caption text-ink-2 mt-4">성분 정보가 없는 음식은 0으로 셈해요. 다른 사람에게는 참여한 사람 수만 보이고, 내 기록은 보이지 않아요.</p>

      <ConfirmSheet open={!!leaving} onClose={() => setLeaving(null)} loading={!!leaving && busy === leaving.id}
        title={leaving ? `${leaving.title} 챌린지를 그만둘까요?` : ""}
        description="지금까지 채운 날은 사라져요. 식단 기록은 그대로 남아요"
        confirmLabel="그만두기" onConfirm={() => leaving && leave(leaving)} />
      <ShareCardSheet target={card ? { kind: "challenge", id: card } : null} open={!!card} onClose={() => setCard(null)} />
    </>
  );
}
