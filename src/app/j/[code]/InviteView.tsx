"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AvatarStack, BottomBar, Button, Card, EmptyState, LinkButton, Notice, Page, ShareCardPreview, Skeleton, useToast,
} from "@/components/ui";
import { monthDay, weekday } from "@/lib/day";

/**
 * 초대 링크를 받은 화면 (/j/<code>) — 인스타·카톡 링크로 들어온 사람이 처음 보는 곳.
 * 1순위는 '같이 하기' 하나. 가입 없이 바로 참여하고 진행표로 간다.
 * 위: 연 사람의 인증 카드 → 챌린지 이름·규칙·기간 → 같이 하는 사람 → 무엇이 보이는지 안내
 * 상태: open(같이 하기) · member(진행표 보기) · closed/full(같은 챌린지 내 날짜로) · blocked(챌린지 목록)
 */
type Invite = {
  group: { id: string; code: string; start_on: string; ends_on: string; member_count: number; max_members: number };
  challenge: { id: string; title: string; rule: string; days: number };
  host: string; members: string[];
  status: "member" | "open" | "closed" | "full" | "blocked";
  starts_in: number;
  late: { remaining: number; goal: number; from: string; ends_on: string } | null;
  card_url: string | null;
};

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const dayLabel = (d: string) => { const { month, date } = monthDay(d); return `${month}월 ${date}일 (${WEEK[weekday(d)]})`; };

export default function InviteView() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "missing" | "done"; data: Invite | null; error?: string }>({ status: "loading", data: null });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, status: "loading" })); // eslint-disable-line react-hooks/set-state-in-effect -- 다시 불러오기
    fetch(`/api/j/${code}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (r.status === 404) { if (alive) setState({ status: "missing", data: null }); return; }
        if (!r.ok) throw new Error(d.error || "");
        if (alive) setState({ status: "done", data: d });
      })
      .catch((e) => { if (alive) setState({ status: "error", data: null, error: (e as Error).message || undefined }); });
    return () => { alive = false; };
  }, [code, attempt]);

  const join = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/j/${code}`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        // 그사이 꽉 찼거나 닫혔으면 화면을 다시 불러 그 상태를 보여 준다
        if (r.status === 409) setAttempt((n) => n + 1);
        throw new Error(d.error || "");
      }
      router.push(`/community/challenges/g/${d.group_id}?joined=1`);
    } catch (e) {
      toast.show((e as Error).message || "같이 하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
      setBusy(false);
    }
  };

  /** 닫힌 묶음 — 같은 챌린지를 오늘부터 혼자(나중에 친구 초대) */
  const startOwn = async () => {
    if (!state.data) return;
    setBusy(true);
    try {
      const r = await fetch("/api/community/challenges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challenge_id: state.data.challenge.id }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok && r.status !== 409) throw new Error(d.error || "");
      if (d.group_id) router.push(`/community/challenges/g/${d.group_id}?joined=1`);
      else router.push("/community/challenges");
    } catch (e) {
      toast.show((e as Error).message || "시작하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
      setBusy(false);
    }
  };

  if (state.status === "loading") {
    return (
      <Page width="narrow">
        <div role="status" aria-label="불러오는 중" className="flex flex-col gap-4">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="mx-auto w-full max-w-56 aspect-9/16" />
          <Skeleton className="h-7 w-4/5" />
          <Skeleton className="h-12 w-full" />
        </div>
      </Page>
    );
  }
  if (state.status === "missing") {
    return (
      <Page width="narrow">
        <EmptyState title="초대 링크를 찾지 못했어요" description="챌린지가 끝났거나 주소가 바뀌었을 수 있어요"
          action={<LinkButton href="/community/challenges" size="sm" variant="secondary">챌린지 보기</LinkButton>} />
      </Page>
    );
  }
  if (state.status === "error" || !state.data) {
    return (
      <Page width="narrow">
        <EmptyState title="초대를 불러오지 못했어요" description={state.error || "연결이 잠깐 끊겼을 수 있어요"}
          action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => setAttempt((n) => n + 1)}>다시 불러오기</Button>} />
      </Page>
    );
  }

  const d = state.data;
  const people = Math.max(d.group.member_count, d.members.length);
  return (
    <Page width="narrow" className="pb-32">
      <p className="text-label text-ink-2 mb-4"><span className="font-bold text-ink">{d.host}</span>님이 같이 하자고 초대했어요</p>

      {d.card_url && <ShareCardPreview src={d.card_url} alt={`${d.host}님의 인증 카드`} className="mb-5" />}

      <h1 className="text-title font-bold text-ink text-balance">{d.challenge.title}</h1>
      <p className="text-label text-ink-2 mt-1">{d.challenge.rule}을 채워요. 식단을 기록하면 저절로 하루씩 채워져요</p>

      <Card className="mt-5 flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-label text-ink-2">기간</span>
          <span className="text-label text-ink text-right">{dayLabel(d.group.start_on)} ~ {dayLabel(d.group.ends_on)} · <span className="num">{d.challenge.days}</span>일</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-label text-ink-2">같이 하는 사람</span>
          <span className="flex items-center gap-2">
            {people > 1 && <AvatarStack names={d.members} />}
            <span className="text-label text-ink"><span className="num font-bold">{people}</span>명</span>
          </span>
        </div>
        {d.status === "open" && d.starts_in > 0 && (
          <p className="text-label text-ink"><span className="num font-bold text-brand-ink">{d.starts_in}</span>일 뒤에 같이 시작해요</p>
        )}
        {d.late && (
          <p className="text-label text-ink">이미 시작했어요. 오늘 들어오면 오늘부터 <span className="num">{d.late.remaining}</span>일 중 <span className="num font-bold">{d.late.goal}</span>일을 채우면 해낸 거예요</p>
        )}
      </Card>

      <Notice className="mt-4" icon="lock">같이 하는 사람에게는 닉네임과 해낸 날만 보여요. 무엇을 먹었는지·성분 숫자는 보이지 않아요</Notice>
      {d.status === "closed" && <Notice className="mt-3" icon="info">이 묶음은 남은 날이 3일보다 적어 더 들어갈 수 없어요. 같은 챌린지를 오늘부터 시작할 수 있어요</Notice>}
      {d.status === "full" && <Notice className="mt-3" icon="info">자리가 꽉 찼어요 (<span className="num">{d.group.max_members}</span>명). 같은 챌린지를 오늘부터 시작할 수 있어요</Notice>}
      {d.status === "blocked" && <Notice className="mt-3" icon="info">이 초대로는 들어갈 수 없어요. 다른 챌린지를 둘러볼 수 있어요</Notice>}

      <BottomBar>
        {d.status === "open" && <Button block loading={busy} onClick={join}>같이 하기</Button>}
        {d.status === "member" && <LinkButton block href={`/community/challenges/g/${d.group.id}`}>진행표 보기</LinkButton>}
        {(d.status === "closed" || d.status === "full") && <Button block loading={busy} onClick={startOwn}>오늘부터 시작하기</Button>}
        {d.status === "blocked" && <LinkButton block variant="secondary" href="/community/challenges">챌린지 보기</LinkButton>}
      </BottomBar>
    </Page>
  );
}
