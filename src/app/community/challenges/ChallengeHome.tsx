"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card, EmptyState, LinkButton, ListRow, SectionHeader, Skeleton, SkeletonList, Stat, Tabs, TextButton, useToast } from "@/components/ui";
import { MascotBanner } from "@/components/community/MascotBanner";
import { getOrCreateNickname } from "@/lib/nickname";
import { ChallengeList } from "./ChallengeList";

/**
 * 챌린지 홈 — 내 캐릭터 → 지금 시즌(없으면 다음 시즌) → 나에게 맞는 챌린지 → 챌린지 순위 → 내 챌린지·기본 챌린지.
 * 순위는 챌린지끼리 (사람 이름·열량 숫자 없음). 추천 이유의 숫자는 내 기록이라 나에게만 보인다.
 */
export type SeasonView = {
  id: string; slug: string; title: string; intro: string | null; start_on: string; ends_on: string; days: number;
  days_left: number | null; starts_in: number | null; people: number | null; watching: boolean; closed: boolean;
  late: { remaining: number; goal: number } | null;
  challenges: {
    id: string; title: string; rule: string; metric: string; target: number | null; macro: { label: string; c: number[]; p: number[]; f: number[] } | null;
    people: number | null; mine: { challenge_id: string; version: boolean; target: number | null } | null;
    tiers: { kcal: number; people: number | null }[] | null; editable: boolean;
  }[];
};
type Seasons = { current: SeasonView | null; next: SeasonView | null; my_tier: number; goal_kcal: number | null };
type Pick = { kind: "season" | "template"; challenge_id?: string; metric: string; target: number; days: number; title: string; reason: string };
type RankRow = { id: string; title: string; meta: string; value: string; kind: string; metric: string; mine: boolean };
type Discover = { picks: Pick[]; ranks: { popular: RankRow[]; completed: RankRow[]; friends: RankRow[] }; follows: number };
type RankTab = "popular" | "completed" | "friends";

export const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;
const RANK_NOTE: Record<RankTab, string> = { popular: "최근 7일 시작한 사람", completed: "끝난 사람 중 목표를 채운 비율", friends: "내가 팔로우한 사람" };

export function ChallengeHome() {
  const toast = useToast();
  const [reload, setReload] = useState(0);
  const [seasons, setSeasons] = useState<{ status: "loading" | "error" | "done"; data: Seasons | null }>({ status: "loading", data: null });
  const [disc, setDisc] = useState<{ status: "loading" | "error" | "done"; data: Discover | null }>({ status: "loading", data: null });
  const [tab, setTab] = useState<RankTab>("popular");
  const [busy, setBusy] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const n = ++seq.current;
    fetch("/api/community/seasons")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (n === seq.current) setSeasons({ status: "done", data: d }); })
      .catch(() => { if (n === seq.current) setSeasons({ status: "error", data: null }); });
    fetch("/api/community/challenges/discover")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (n === seq.current) setDisc({ status: "done", data: d }); })
      .catch(() => { if (n === seq.current) setDisc({ status: "error", data: null }); });
  }, [reload]);
  const again = () => { setSeasons({ status: "loading", data: null }); setDisc({ status: "loading", data: null }); setReload((x) => x + 1); };

  const post = async (url: string, body: object, done: string, key: string) => {
    setBusy(key);
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, nickname: getOrCreateNickname() }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "");
      toast.show(done);
      setReload((x) => x + 1);
      return true;
    } catch (e) {
      toast.show((e as Error).message || "시작하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
      return false;
    } finally { setBusy(null); }
  };

  const follow = (p: Pick) => p.kind === "season"
    ? post("/api/community/seasons", { action: "join", challenge_id: p.challenge_id, ...(p.metric === "kcal_band" ? { target: p.target } : {}) }, "시즌 챌린지를 시작했어요. 식단을 기록하면 하루씩 채워져요", p.title)
    : post("/api/community/challenges/new", { metric: p.metric, target: p.target, days: p.days, start: "today" }, "오늘부터 시작했어요. 식단을 기록하면 하루씩 채워져요", p.title);
  const joinRank = (r: RankRow) => r.kind === "season"
    ? post("/api/community/seasons", { action: "join", challenge_id: r.id }, "시즌 챌린지를 시작했어요", r.id)
    : post("/api/community/challenges", { challenge_id: r.id, start: "today" }, "오늘부터 시작했어요", r.id);
  const watch = (s: SeasonView) => post("/api/community/seasons", { action: "watch", season_id: s.id, on: !s.watching }, s.watching ? "시작 알림을 껐어요" : "시즌이 시작하는 날 아침에 알려 드려요", s.id);

  const sv = seasons.data;
  const main = sv?.current ?? sv?.next ?? null;
  const ranks = disc.data?.ranks[tab] ?? [];

  return (
    <div className="flex flex-col gap-8">
      <MascotBanner reloadKey={reload} />

      {/* ── 시즌 ── */}
      {seasons.status === "loading" ? <Skeleton className="h-56 rounded-lg" />
        : seasons.status === "error" ? (
          <EmptyState title="시즌을 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={again}>다시 불러오기</Button>} />
        ) : main ? (
          <Card className="flex flex-col gap-4" aria-label="시즌">
            <div className="flex flex-col gap-1">
              <span className="text-caption text-ink-2">
                {main.title.split(" · ")[0]} · {md(main.start_on)} ~ {md(main.ends_on)}
                {main.starts_in != null ? ` · ${main.starts_in}일 뒤 시작` : ""}
              </span>
              <h2 className="text-title font-bold text-ink text-balance">{main.title.split(" · ").slice(1).join(" · ") || main.title}</h2>
              {main.intro && <p className="text-label text-ink-2">{main.intro}</p>}
            </div>
            <div className="flex items-end gap-6">
              {main.days_left != null
                ? <Stat label="남았어요" value={main.days_left} unit="일" size="lg" emphasis />
                : <Stat label="뒤에 시작해요" value={main.starts_in ?? 0} unit="일" size="lg" emphasis />}
              {main.people != null && <Stat label="같이 하는 중" value={main.people.toLocaleString("ko-KR")} unit="명" />}
            </div>
            <LinkButton block href={`/community/challenges/s/${main.slug}`}>{main.days_left != null ? "시즌에서 고르기" : "미리 보고 고르기"}</LinkButton>
            {sv?.current && sv.next ? (
              <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                <span className="text-label text-ink">{sv.next.title.split(" · ")[0]} · {md(sv.next.start_on)} 시작 · {sv.next.days / 7}주</span>
                <TextButton disabled={busy === sv.next.id} onClick={() => watch(sv.next!)}>{sv.next.watching ? "알림 끄기" : "시작 알림 받기"}</TextButton>
              </div>
            ) : !sv?.current && main ? (
              <TextButton className="self-start" disabled={busy === main.id} onClick={() => watch(main)}>{main.watching ? "시작 알림 끄기" : "시작하는 날 알림 받기"}</TextButton>
            ) : null}
          </Card>
        ) : null}

      {/* ── 나에게 맞는 챌린지 ── */}
      <section aria-labelledby="pick-h">
        <SectionHeader title={<span id="pick-h">나에게 맞는 챌린지</span>} description="지난 2주 기록을 보고 골랐어요 · 이유의 숫자는 나만 봐요" />
        {disc.status === "loading" ? <SkeletonList rows={3} thumb={false} />
          : disc.status === "error" ? (
            <EmptyState title="추천을 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
              action={<Button size="sm" variant="secondary" icon="refresh" onClick={again}>다시 불러오기</Button>} />
          ) : !disc.data?.picks.length ? (
            <EmptyState title="지금 추천할 챌린지가 없어요" description="이미 맞는 챌린지를 하고 있거나, 기록이 더 쌓이면 골라 드려요" />
          ) : (
            <Card className="flex flex-col p-0">
              {disc.data.picks.map((p) => (
                <ListRow key={p.title} className="px-4" title={p.title} meta={p.reason}
                  trailing={<Button size="sm" variant="secondary" loading={busy === p.title} onClick={() => follow(p)}>나도 하기</Button>} />
              ))}
            </Card>
          )}
      </section>

      {/* ── 챌린지 순위 ── */}
      <section aria-labelledby="rank-h">
        <SectionHeader title={<span id="rank-h">챌린지 순위</span>} description={`${RANK_NOTE[tab]} · 사람 순위는 없어요`} />
        <Tabs variant="line" label="순위 기준" value={tab} onChange={setTab}
          items={[{ value: "popular", label: "많이 하는" }, { value: "completed", label: "끝까지 많이 한" }, { value: "friends", label: "친구들이 하는" }]} />
        {disc.status === "loading" ? <SkeletonList rows={4} thumb={false} className="mt-3" />
          : disc.status === "error" ? null
          : ranks.length === 0 ? (
            <EmptyState className="mt-3" title={tab === "popular" ? "이번 주에 시작한 챌린지가 아직 없어요" : tab === "completed" ? "끝낸 사람이 10명 넘는 챌린지가 아직 없어요" : disc.data?.follows ? "팔로우한 사람이 지금 하는 챌린지가 없어요" : "팔로우한 사람이 없어요"}
              description={tab === "friends" && !disc.data?.follows ? "피드에서 마음에 드는 사람을 팔로우하면 여기에 보여요" : "먼저 시작하면 여기에 올라와요"} />
          ) : (
            <ol className="flex flex-col mt-1">
              {ranks.map((r, i) => (
                <ListRow key={r.id} leading={<span className="w-5 text-center num font-bold text-brand-ink">{i + 1}</span>} title={r.title} meta={r.meta}
                  trailing={<span className="flex flex-col items-end">
                    <span className="num text-label font-bold text-ink whitespace-nowrap">{r.value}</span>
                    {r.mine ? <span className="text-caption text-positive font-medium min-h-8 inline-flex items-center">하고 있어요</span>
                      : <TextButton className="text-caption min-h-8" disabled={busy === r.id} onClick={() => joinRank(r)}>나도 하기</TextButton>}
                  </span>} />
              ))}
            </ol>
          )}
      </section>

      {/* ── 내 챌린지 · 기본 챌린지 ── */}
      <section aria-labelledby="mine-h">
        <SectionHeader title={<span id="mine-h">내 챌린지</span>} description="하고 있는 것 · 기본 챌린지 · 직접 만들기" />
        <ChallengeList reloadKey={reload} />
      </section>
    </div>
  );
}
