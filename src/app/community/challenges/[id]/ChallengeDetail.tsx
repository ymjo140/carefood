"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  BackButton, BottomBar, Button, DayDots, EmptyState, LinkButton, ListRow, Page, PageHeader, ProofGrid, SectionHeader, Skeleton, SkeletonList, TextLink, useToast,
  type DayDot,
} from "@/components/ui";
import { getOrCreateNickname } from "@/lib/nickname";
import { monthDay, todayKst } from "@/lib/day";

/**
 * 챌린지 상세 (/community/challenges/[id]) — 규칙과 인증 방법 → (공식) 기수 → 내 진행 → 인증 사진 모음.
 * 1순위 하나(BottomBar): 안 했으면 참여하기, 하고 있으면 오늘 인증 올리기, 오늘 해냈으면 같이 하는 보드.
 * 인증 사진 모음은 사진·닉네임·날짜만 — 숫자·순위로 사람끼리 비교하지 않는다.
 */
type Detail = {
  challenge: { id: string; title: string; rule: string; days: number; kind: string; proof: "photo" | "none"; note: string | null; cover_url: string | null; how_to: string | null; recent_count: number };
  me: { days: DayDot[]; done_count: number; goal: number; reached: boolean; finished: boolean; group: { id: string; code: string; start_on: string; member_count: number } | null } | null;
  cohorts: { start_on: string; ends_on: string; apply_until: string; state: "recruiting" | "running" | "soon"; joined: number }[];
};
type Proof = { id: string; photo: string; full: string; post_id: string; day: string; nickname: string; album: boolean };

const md = (d: string) => { const { month, date } = monthDay(d); return `${month}/${date}`; };

export default function ChallengeDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "forbidden" | "missing" | "done"; data: Detail | null; error?: string }>({ status: "loading", data: null });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [proofs, setProofs] = useState<{ status: "loading" | "error" | "done"; items: Proof[]; next: string | null; more: boolean }>({ status: "loading", items: [], next: null, more: false });
  const pSeq = useRef(0);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, status: s.data ? s.status : "loading" })); // eslint-disable-line react-hooks/set-state-in-effect -- 다시 불러오기
    fetch(`/api/community/challenges/${id}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!alive) return;
        if (r.status === 403) { setState({ status: "forbidden", data: null, error: d.error }); return; }
        if (r.status === 404) { setState({ status: "missing", data: null }); return; }
        if (!r.ok) throw new Error(d.error || "");
        setState({ status: "done", data: d });
      })
      .catch((e) => { if (alive) setState({ status: "error", data: null, error: (e as Error).message || undefined }); });
    return () => { alive = false; };
  }, [id, attempt]);

  const loadProofs = useCallback((before: string | null) => {
    const n = ++pSeq.current;
    setProofs((p) => ({ ...p, status: before ? p.status : "loading", more: !!before }));
    fetch(`/api/community/challenges/${id}/proofs${before ? `?before=${encodeURIComponent(before)}` : ""}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d as { items: Proof[]; next: string | null }; })
      .then((d) => { if (n === pSeq.current) setProofs((p) => ({ status: "done", items: before ? [...p.items, ...d.items] : d.items, next: d.next, more: false })); })
      .catch((e) => {
        console.error("[challenge] 인증 사진", e);
        if (n !== pSeq.current) return;
        if (before) { setProofs((p) => ({ ...p, more: false })); toast.show("사진을 더 불러오지 못했어요. 다시 시도해 주세요", { tone: "danger" }); }
        else setProofs({ status: "error", items: [], next: null, more: false });
      });
  }, [id, toast]);
  useEffect(() => { loadProofs(null); }, [loadProofs]); // eslint-disable-line react-hooks/set-state-in-effect -- 처음 열 때 첫 쪽을 불러온다

  const join = async (start: "today" | "cohort") => {
    setBusy(start);
    try {
      const r = await fetch("/api/community/challenges", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge_id: id, start, nickname: getOrCreateNickname() }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "");
      toast.show(start === "cohort" ? "다음 기수로 참여했어요. 시작하는 날 알려 드려요" : "참여했어요. 오늘 끼니 사진을 올리면 하루가 채워져요");
      setAttempt((n) => n + 1);
      if (d.group_id) router.push(`/community/challenges/g/${d.group_id}?joined=1`);
    } catch (e) {
      toast.show((e as Error).message || "참여하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(null); }
  };

  if (state.status === "loading") return <Page width="narrow"><div role="status" aria-label="불러오는 중" className="flex flex-col gap-4"><Skeleton className="h-8 w-2/3" /><SkeletonList rows={3} /></div></Page>;
  if (state.status === "forbidden" || state.status === "missing") {
    return (
      <Page width="narrow">
        <EmptyState title={state.status === "forbidden" ? "초대 링크로 들어올 수 있는 챌린지예요" : "챌린지를 찾지 못했어요"}
          description={state.status === "forbidden" ? "친구에게 받은 초대 링크를 열어 주세요" : "끝났거나 주소가 바뀌었을 수 있어요"}
          action={<LinkButton href="/community/challenges" size="sm" variant="secondary">챌린지 보기</LinkButton>} />
      </Page>
    );
  }
  if (state.status === "error" || !state.data) {
    return (
      <Page width="narrow">
        <EmptyState title="챌린지를 불러오지 못했어요" description={state.error || "연결이 잠깐 끊겼을 수 있어요"}
          action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => setAttempt((n) => n + 1)}>다시 불러오기</Button>} />
      </Page>
    );
  }

  const { challenge: c, me, cohorts } = state.data;
  const photo = c.proof === "photo";
  const today = todayKst();
  const running = !!me && !me.finished && (!me.group || me.group.start_on <= today);
  const myToday = me?.days.find((d) => d.date === today)?.state;
  const recruiting = cohorts.find((x) => x.state === "recruiting");

  return (
    <Page width="narrow" className="pb-32">
      <div className="-ml-2 mb-2"><BackButton fallback="/community/challenges">챌린지</BackButton></div>
      <PageHeader title={c.title} description={<>{c.rule}을 <span className="num">{c.days}</span>일 동안{c.recent_count > 0 && <> · 최근 <span className="num">{c.recent_count}</span>명이 시작했어요</>}</>} />
      {c.cover_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.cover_url} alt="" className="w-full aspect-4/5 object-cover rounded-lg border border-line mb-6" />
      )}
      {c.note && <p className="text-body text-ink mb-6">“{c.note}”</p>}

      <section className="flex flex-col gap-2 mb-8" aria-label="인증 방법">
        <SectionHeader title="인증 방법" className="mb-1" />
        <ol className="flex flex-col gap-1.5 text-label text-ink list-decimal pl-5">
          <li>{c.rule}을 채워요 — 식단 기록으로 봐요</li>
          {photo && <li>그날 먹은 끼니 사진을 글로 올리고 &lsquo;챌린지 인증&rsquo;을 골라요</li>}
          {photo && <li>사진은 그날 밤 12시까지 올린 것만 인증돼요. 늦은 인증은 없어요</li>}
          {photo && <li>같은 사진을 다른 날 다시 쓰면 인증되지 않아요. 찍은 시각이 없는 사진은 &lsquo;앨범에서 고름&rsquo;으로 보여요</li>}
        </ol>
        {c.how_to && <p className="text-label text-ink-2 whitespace-pre-line">{c.how_to}</p>}
      </section>

      {cohorts.length > 0 && (
        <section className="flex flex-col mb-8" aria-label="기수">
          <SectionHeader title="함께 시작하는 기수" description="격주 월요일에 시작해요" className="mb-1" />
          {cohorts.map((k) => (
            <ListRow key={k.start_on} title={<>{md(k.start_on)} ~ {md(k.ends_on)}</>}
              meta={k.state === "running" ? <>진행 중{k.joined > 0 && <> · <span className="num">{k.joined}</span>명</>}</>
                : k.state === "recruiting" ? <>모집 중 · {md(k.apply_until)}까지{k.joined > 0 && <> · <span className="num">{k.joined}</span>명</>}</>
                : "모집 전 · 시작 2주 전부터 받아요"}
              trailing={k.state === "recruiting" && !running
                ? <Button size="sm" variant="secondary" loading={busy === "cohort"} disabled={!!busy} onClick={() => join("cohort")}>이 기수로 시작하기</Button> : null} />
          ))}
        </section>
      )}

      {me && (
        <section className="flex flex-col gap-2 mb-8" aria-label="내 진행">
          <SectionHeader title="내 진행" className="mb-1" description={<>해낸 날 <span className="num font-bold text-ink">{me.done_count}</span> / 목표 <span className="num">{me.goal}</span>일{me.finished && " · 끝났어요"}</>} />
          <DayDots days={me.days} label="내 날짜별 진행" />
          {photo && myToday === "photo_needed" && <p className="text-label text-ink">식단 기준은 채웠어요. 오늘 사진을 올리면 인증돼요</p>}
          {me.group && <TextLink href={`/community/challenges/g/${me.group.id}`} className="self-start">같이 하는 보드 보기</TextLink>}
        </section>
      )}

      <section aria-label="인증 사진">
        <SectionHeader title="인증 사진" className="mb-2" />
        {proofs.status === "loading" && (
          <div className="grid grid-cols-3 gap-2" role="status" aria-label="불러오는 중">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-square rounded-md" />)}
          </div>
        )}
        {proofs.status === "error" && (
          <EmptyState title="인증 사진을 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => loadProofs(null)}>다시 불러오기</Button>} />
        )}
        {proofs.status === "done" && proofs.items.length === 0 && (
          <EmptyState title="아직 인증 사진이 없어요" description={photo ? "오늘 끼니 사진으로 첫 인증을 올려 보세요" : "이 챌린지는 식단 기록으로만 채워요"}
            action={running && photo ? <LinkButton href="/community?compose=meal" size="sm" variant="secondary" icon="camera">오늘 인증 올리기</LinkButton> : undefined} />
        )}
        {proofs.status === "done" && proofs.items.length > 0 && (
          <div className="flex flex-col gap-3">
            <ProofGrid items={proofs.items.map((p) => ({ id: p.id, photo: p.photo, full: p.full, href: `/community/${p.post_id}`, nickname: p.nickname, day: p.day, album: p.album }))} />
            {proofs.next && <Button variant="secondary" size="sm" className="self-center" loading={proofs.more} onClick={() => loadProofs(proofs.next)}>더 보기</Button>}
            <p className="text-caption text-ink-2">남의 사진이나 몸·체중 사진은 글의 ⋯ 메뉴에서 신고해 주세요</p>
          </div>
        )}
      </section>

      <BottomBar>
        {!me || me.finished
          ? recruiting && !running
            ? <Button block loading={busy === "cohort"} disabled={!!busy} onClick={() => join("cohort")}>{md(recruiting.start_on)} 기수로 참여하기</Button>
            : <Button block loading={busy === "today"} disabled={!!busy} onClick={() => join("today")}>{me?.finished ? "다시 하기" : "오늘 참여하기"}</Button>
          : !running
            ? <LinkButton block variant="secondary" href={me.group ? `/community/challenges/g/${me.group.id}` : "/community/challenges"}>시작 전이에요 · 보드 보기</LinkButton>
            : myToday === "done"
              ? <LinkButton block href={me.group ? `/community/challenges/g/${me.group.id}` : "/community/challenges"}>오늘 해냈어요 · 보드 보기</LinkButton>
              : photo
                ? <LinkButton block icon="camera" href="/community?compose=meal">오늘 인증 올리기</LinkButton>
                : <LinkButton block href="/diary">오늘 기록하기</LinkButton>}
      </BottomBar>
    </Page>
  );
}
