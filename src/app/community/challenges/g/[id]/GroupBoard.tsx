"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  BottomBar, Button, EmptyState, IconButton, LinkButton, MemberProgressRow, Notice, Page, PageHeader, SkeletonList, TextLink, useToast,
} from "@/components/ui";
import ShareCardSheet from "@/components/community/ShareCardSheet";
import { daysBetween, monthDay, todayKst } from "@/lib/day";

/**
 * 같이 하는 챌린지 진행표 (/community/challenges/g/[id]) — 같은 묶음 사람만 본다.
 * 사람마다 한 줄: 날짜 점 · 해낸 날/목표 · 응원(같은 사람에게 하루 한 번). 무엇을 먹었는지·성분 숫자는 없다.
 * 1순위: 오늘 아직이면 '오늘 기록하기', 하루라도 해냈으면 '인증 카드 만들기'(= 친구 초대 링크가 붙은 카드)
 * ?joined=1 — 링크로 막 들어왔을 때 한 번 안내
 */
type Member = { user_id: string; nickname: string; is_me: boolean; is_host: boolean; days: { date: string; state: "done" | "missed" | "today" | "future" | "before" }[]; done_count: number; goal: number; reached: boolean; cheered: boolean };
type Board = {
  group: { id: string; code: string; start_on: string; ends_on: string; member_count: number; max_members: number; is_host: boolean; finished: boolean };
  challenge: { id: string; title: string; rule: string; days: number };
  members: Member[]; cheers_received: number; logged_in: boolean;
};

const md = (d: string) => { const { month, date } = monthDay(d); return `${month}/${date}`; };

export default function GroupBoard() {
  const { id } = useParams<{ id: string }>();
  const joined = useSearchParams().get("joined") === "1";
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "forbidden" | "missing" | "done"; board: Board | null; code?: string; error?: string }>({ status: "loading", board: null });
  const [attempt, setAttempt] = useState(0);
  const [card, setCard] = useState(false);
  const [cheering, setCheering] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const n = ++seq.current;
    fetch(`/api/community/challenges/groups/${id}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (n !== seq.current) return;
        if (r.status === 403) { setState({ status: "forbidden", board: null, code: d.code }); return; }
        if (r.status === 404) { setState({ status: "missing", board: null }); return; }
        if (!r.ok) throw new Error(d.error || "");
        setState({ status: "done", board: d });
      })
      .catch((e) => { if (n === seq.current) setState({ status: "error", board: null, error: (e as Error).message || undefined }); });
  }, [id, attempt]);

  useEffect(() => {
    if (!joined) return;
    toast.show("같이 하기로 했어요. 식단을 기록하면 하루씩 채워져요");
    router.replace(`/community/challenges/g/${id}`); // 새로 고쳐도 다시 뜨지 않게
  }, [joined, id, router, toast]);

  const cheer = async (m: Member) => {
    setCheering(m.user_id);
    try {
      const r = await fetch(`/api/community/challenges/groups/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: m.user_id }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "");
      setState((s) => (s.board ? { ...s, board: { ...s.board, members: s.board.members.map((x) => (x.user_id === m.user_id ? { ...x, cheered: true } : x)) } } : s));
      toast.show(`${m.nickname}님을 응원했어요`);
    } catch (e) {
      toast.show((e as Error).message || "응원하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setCheering(null); }
  };

  if (state.status === "loading") {
    return <Page width="narrow"><div role="status" aria-label="불러오는 중"><SkeletonList rows={4} /></div></Page>;
  }
  if (state.status === "forbidden") {
    return (
      <Page width="narrow">
        <EmptyState title="같이 하는 사람만 볼 수 있어요" description="초대 화면에서 같이 하기를 누르면 진행표를 볼 수 있어요"
          action={state.code ? <LinkButton href={`/j/${state.code}`} size="sm" variant="secondary">초대 화면으로</LinkButton> : undefined} />
      </Page>
    );
  }
  if (state.status === "missing") {
    return (
      <Page width="narrow">
        <EmptyState title="진행표를 찾지 못했어요" description="챌린지를 그만뒀거나 주소가 바뀌었을 수 있어요"
          action={<LinkButton href="/community/challenges" size="sm" variant="secondary">챌린지 보기</LinkButton>} />
      </Page>
    );
  }
  if (state.status === "error" || !state.board) {
    return (
      <Page width="narrow">
        <EmptyState title="진행표를 불러오지 못했어요" description={state.error || "연결이 잠깐 끊겼을 수 있어요"}
          action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading", board: null }); setAttempt((n) => n + 1); }}>다시 불러오기</Button>} />
      </Page>
    );
  }

  const b = state.board;
  const me = b.members.find((m) => m.is_me);
  const today = todayKst();
  const dayN = daysBetween(b.group.start_on, today) + 1;
  const when = today < b.group.start_on ? `${daysBetween(today, b.group.start_on)}일 뒤 시작` : b.group.finished ? "끝났어요" : `${dayN}일째`;
  const todayDone = me?.days.find((d) => d.date === today)?.state === "done";
  const alone = b.members.length <= 1;

  return (
    <Page width="narrow" className="pb-32">
      <div className="-ml-2 mb-2">
        <LinkButton href="/community/challenges" variant="ghost" size="sm" icon="chevron-left">챌린지</LinkButton>
      </div>
      <PageHeader title={b.challenge.title}
        description={<>{md(b.group.start_on)} ~ {md(b.group.ends_on)} · {when} · <span className="num">{b.group.member_count}</span>명이 같이 해요</>}
        actions={!b.group.finished ? <Button size="sm" variant="secondary" icon="users" onClick={() => setCard(true)}>친구 초대하기</Button> : undefined} />

      {b.cheers_received > 0 && (
        <p className="text-label text-ink mb-3">오늘 <span className="num font-bold text-brand-ink">{b.cheers_received}</span>명에게 응원을 받았어요</p>
      )}

      <section aria-label="같이 하는 사람">
        <ul className="flex flex-col divide-y divide-line">
          {b.members.map((m) => (
            <MemberProgressRow key={m.user_id} name={m.nickname} me={m.is_me} host={m.is_host} days={m.days} done={m.done_count} goal={m.goal} reached={m.reached}
              action={m.is_me || b.group.finished ? undefined : (
                <IconButton icon="heart" size="sm" active={m.cheered} disabled={m.cheered || cheering === m.user_id}
                  label={m.cheered ? `${m.nickname}님을 오늘 응원했어요` : `${m.nickname}님 응원하기`} onClick={() => cheer(m)} />
              )} />
          ))}
        </ul>
        {alone && (
          <EmptyState className="mt-4" title="아직 혼자 하고 있어요" description="인증 카드를 인스타에 올리면 링크로 친구가 같이 할 수 있어요"
            action={<Button size="sm" variant="secondary" icon="users" onClick={() => setCard(true)}>친구 초대하기</Button>} />
        )}
      </section>

      <p className="text-caption text-ink-2 mt-5">{b.challenge.rule}을 채운 날이 해낸 날이에요. 같이 하는 사람에게는 닉네임과 해낸 날만 보이고, 무엇을 먹었는지는 보이지 않아요. <TextLink href="/community/challenges">챌린지 목록</TextLink></p>
      {me && !b.logged_in && <Notice className="mt-3" icon="info">다른 기기나 홈 화면 앱에서 이어 하려면 로그인해 주세요. 로그인하면 이 기기의 기록이 계정으로 옮겨져요</Notice>}

      <BottomBar>
        {me && (me.done_count > 0 || todayDone)
          ? <Button block icon="share" onClick={() => setCard(true)}>인증 카드 만들기</Button>
          : <LinkButton block href="/diary">오늘 기록하기</LinkButton>}
      </BottomBar>

      <ShareCardSheet target={card ? { kind: "challenge", id: b.challenge.id } : null} open={card} onClose={() => setCard(false)} />
    </Page>
  );
}
