"use client";

import { useEffect, useState } from "react";
import { Button, Card, Chip, ConfirmSheet, DayDots, EmptyState, Sheet, SkeletonList, TextButton, TextLink, useToast } from "@/components/ui";
import ShareCardSheet from "@/components/community/ShareCardSheet";
import ChallengeCreateSheet from "@/components/community/ChallengeCreateSheet";
import { getOrCreateNickname } from "@/lib/nickname";
import { todayKst } from "@/lib/day";
import { METRIC_META, metricValue, type ChallengeMetric, type DayState } from "@/lib/challenges";

/**
 * 챌린지 목록 — 규칙 · 지금 하는 사람 수 · (참여했으면) 날짜 줄과 해낸 날 수.
 * 달성 여부는 식단 기록의 성분 합계로만 계산한다. 다른 사람의 기록은 보이지 않는다.
 * 참여 = 내 묶음. '친구 초대하기'(하루라도 해냈으면 '인증하기')는 해낸 날 줄을 9:16 카드로 그리고, 그 카드의 링크가 내 묶음 초대(/j/<code>)다.
 * '친구랑 날짜 정해 시작하기' — 내일·다음 월요일에 시작하는 묶음을 열고 바로 초대 카드를 띄운다.
 * 진행표(/community/challenges/g/[id])에서 같이 하는 사람의 해낸 날을 본다.
 */
type Run = {
  started_on: string; ends_on: string; finished: boolean; done_count: number; finished_runs: number; goal: number; reached: boolean;
  days: { date: string; state: DayState; value: number | null }[]; today_value: number | null;
  group: { id: string; code: string; start_on: string; member_count: number; is_host: boolean } | null;
};
type Start = "today" | "tomorrow" | "monday";
const START_LABEL: Record<Start, string> = { today: "오늘", tomorrow: "내일", monday: "다음 월요일" };
type Item = {
  id: string; title: string; rule: string; metric: ChallengeMetric; target: number; days: number; active_count: number; finished_count: number; me: Run | null;
  /** user: 사람이 만든 챌린지(링크로만 들어옴) */
  kind?: "official" | "user"; mine_created?: boolean; note?: string | null;
};

export function ChallengeList() {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; items: Item[] }>({ status: "loading", items: [] });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<Item | null>(null);
  const [card, setCard] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [planning, setPlanning] = useState<Item | null>(null);
  const [start, setStart] = useState<Start>("tomorrow");

  useEffect(() => {
    let alive = true;
    fetch("/api/community/challenges")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (alive) setState({ status: "done", items: d.challenges || [] }); })
      .catch(() => { if (alive) setState({ status: "error", items: [] }); });
    return () => { alive = false; };
  }, [attempt]);

  /** invite: 친구랑 날짜 정해 시작 — 묶음을 열고 바로 초대 카드 */
  const join = async (c: Item, when: Start = "today", invite = false) => {
    setBusy(c.id);
    try {
      const r = await fetch("/api/community/challenges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challenge_id: c.id, start: when, nickname: getOrCreateNickname() }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "");
      if (d.challenge) setState((s) => ({ ...s, items: s.items.map((x) => (x.id === c.id ? d.challenge : x)) }));
      if (!invite) toast.show(c.me ? "오늘부터 다시 시작했어요" : "참여했어요. 오늘부터 식단을 기록하면 하루씩 채워져요");
      else {
        // 날짜를 정해 연 묶음 — 바로 초대 카드
        setPlanning(null);
        toast.show(`${when === "today" ? "오늘부터" : START_LABEL[when]} 같이 하는 묶음을 열었어요. 친구에게 링크를 보내 주세요`);
        setCard(c.id);
      }
    } catch (e) {
      toast.show((e as Error).message || "참여하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
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
  // 하고 있는 것 먼저
  const items = [...state.items].sort((a, b) => Number(!!b.me && !b.me.finished) - Number(!!a.me && !a.me.finished));
  const create = (
    <ChallengeCreateSheet open={creating} onClose={() => setCreating(false)}
      onCreated={(r) => { setCreating(false); setAttempt((n) => n + 1); setCard(r.challenge_id); }} />
  );

  if (state.items.length === 0) {
    return (
      <>
        <EmptyState title="지금 열린 챌린지가 없어요" description="규칙을 골라 내 챌린지를 만들고 친구를 초대할 수 있어요"
          action={<Button size="sm" icon="plus" onClick={() => setCreating(true)}>챌린지 만들기</Button>} />
        {create}
      </>
    );
  }

  return (
    <>
      <Button block icon="plus" className="mb-4" onClick={() => setCreating(true)}>내 챌린지 만들기</Button>
      <ul className="flex flex-col gap-3">
        {items.map((c) => {
          const m = METRIC_META[c.metric];
          const run = c.me;
          return (
            <li key={c.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                  {c.kind === "user" && <p className="text-caption text-brand-ink">{c.mine_created ? "내가 만든 챌린지" : "초대받은 챌린지"}</p>}
                  <h2 className="text-body font-bold text-ink">{c.title}</h2>
                  {c.note && <p className="text-label text-ink">“{c.note}”</p>}
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
                      <span className="text-ink-2"> · 목표 <span className="num">{run.goal}</span>일{run.reached ? " 채웠어요" : ""}</span>
                      {run.finished && <span className="text-ink-2"> · 끝났어요</span>}
                    </p>
                    {run.group && (
                      <p className="text-label text-ink-2">
                        {run.group.member_count > 1 ? <><span className="num">{run.group.member_count}</span>명이 같이 해요 · </> : "혼자 하고 있어요 · "}
                        <TextLink href={`/community/challenges/g/${run.group.id}`}>진행표 보기</TextLink>
                      </p>
                    )}
                    {!run.finished && (
                      <p className="text-label text-ink-2">
                        {run.group && run.group.start_on > todayKst()
                          ? <><span className="num">{Number(run.group.start_on.slice(5, 7))}</span>월 <span className="num">{Number(run.group.start_on.slice(8, 10))}</span>일에 시작해요 · 그 전에 친구를 불러 보세요</>
                          : run.today_value == null
                          ? <>오늘 아직 기록이 없어요 · <TextLink href="/diary">기록하기</TextLink></>
                          : <>오늘 지금까지 {m.label} <span className="num font-bold text-ink">{metricValue(c.metric, run.today_value)}</span>
                              {" "}· 기준 <span className="num">{metricValue(c.metric, c.target)}</span> {m.max ? "이하" : "이상"}</>}
                      </p>
                    )}
                    <div className="flex gap-2">
                      {(run.done_count > 0 || !run.finished) && (
                        <Button size="sm" variant="secondary" icon={run.done_count > 0 ? "share" : "users"} onClick={() => setCard(c.id)}>{run.done_count > 0 ? "인증하기" : "친구 초대하기"}</Button>
                      )}
                      {run.finished
                        ? <Button size="sm" variant="secondary" icon="refresh" loading={busy === c.id} onClick={() => join(c)}>다시 하기</Button>
                        : <Button size="sm" variant="ghost" disabled={busy === c.id} onClick={() => setLeaving(c)}>그만두기</Button>}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <Button size="sm" variant="secondary" icon="plus" loading={busy === c.id} onClick={() => join(c)}>오늘 참여하기</Button>
                    <TextButton onClick={() => { setStart("tomorrow"); setPlanning(c); }}>친구랑 날짜 정해 시작하기</TextButton>
                  </div>
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
      {create}

      {/* 친구랑 날짜 정해 시작 — 그날 시작하는 묶음을 열고 초대 카드 */}
      <Sheet open={!!planning} onClose={() => setPlanning(null)} title={planning ? `${planning.title} 같이 시작하기` : ""} size="sm"
        description="고른 날 모두 같이 시작해요. 열고 나면 인스타·카톡으로 보낼 초대 카드가 떠요"
        footer={<Button block loading={!!planning && busy === planning.id} onClick={() => planning && join(planning, start, true)}>묶음 열고 초대하기</Button>}>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="시작일">
          {(["today", "tomorrow", "monday"] as const).map((k) => (
            <Chip key={k} role="radio" aria-checked={start === k} selected={start === k} onClick={() => setStart(k)}>{START_LABEL[k]}</Chip>
          ))}
        </div>
        <p className="text-caption text-ink-2 mt-3">이미 하고 있는 챌린지라면 지금 묶음에서 빠져 새 묶음으로 옮겨요. 시작한 뒤에도 남은 날이 3일 이상이면 친구가 들어올 수 있어요</p>
      </Sheet>
    </>
  );
}
