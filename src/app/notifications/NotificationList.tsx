"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, EmptyState, Icon, LinkButton, SkeletonList, cn, type IconName } from "@/components/ui";
import { timeAgo } from "@/components/ui/FeedPost";

type Item = { id: string; type: "comment" | "reply" | "like" | "follow" | "gb_question" | "gb_answer" | "gb_reached" | "gb_requested" | "ad" | "consent" | "collab" | "ch_cheer" | "ch_join" | "ch_start"; at: string; who: string; count?: number; text?: string; post_id?: string; post_excerpt?: string; user_id?: string; url?: string };

const ICON: Record<Item["type"], IconName> = {
  comment: "message", reply: "message", like: "heart", follow: "user", gb_question: "message", gb_answer: "message", gb_reached: "users", gb_requested: "bell", ad: "tag", consent: "bell", collab: "users", ch_cheer: "heart", ch_join: "users", ch_start: "calendar",
};

export function NotificationList() {
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; items: Item[] }>({ status: "loading", items: [] });
  const [seen, setSeen] = useState(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/notifications")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (!alive) return;
        setSeen(d.seen_at ? Date.parse(d.seen_at) : 0); // 이번에 열기 전 마지막으로 본 시각 → 그 뒤 소식에 '새 소식'
        setState({ status: "done", items: d.items || [] });
        // 다 봤다고 적는다 — 실패하면 다음에 점이 남을 뿐이라 알리지 않는다
        fetch("/api/notifications", { method: "POST" })
          .then((r) => (r.ok ? r.json() : null))
          .then((x) => { if (x?.seen_at) window.dispatchEvent(new CustomEvent("cf-notif-seen", { detail: Date.parse(x.seen_at) })); })
          .catch(() => {}); // ds-allow: 읽음 표시는 보조 — 다음에 다시 적는다
      })
      .catch(() => { if (alive) setState({ status: "error", items: [] }); });
    return () => { alive = false; };
  }, [attempt]);

  if (state.status === "loading") return <SkeletonList rows={4} thumb={false} />;

  if (state.status === "error") {
    return (
      <Card className="flex flex-col items-start gap-3">
        <p className="text-label text-ink">알림을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요</p>
        <Button variant="secondary" size="sm" icon="refresh" onClick={() => { setState({ status: "loading", items: [] }); setAttempt((n) => n + 1); }}>다시 불러오기</Button>
      </Card>
    );
  }

  if (state.items.length === 0) {
    return (
      <EmptyState title="아직 알림이 없어요" description="피드에 글을 올리면 답글·좋아요를 여기서 알려 드려요"
        action={<LinkButton href="/community" variant="secondary" size="sm">피드 보기</LinkButton>} />
    );
  }

  return (
    <ul className="flex flex-col">
      {state.items.map((n) => {
        const isNew = Date.parse(n.at) > seen;
        const body = (
          <>
            <span className={cn("size-9 rounded-full flex items-center justify-center shrink-0", "bg-sunken", isNew ? "text-brand-ink" : "text-ink-2")}>
              <Icon name={ICON[n.type]} size={18} />
            </span>
            <span className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="text-label text-ink">
                {n.type === "comment" && <><b className="font-bold">{n.who}</b> 님이 내 글에 답글을 남겼어요</>}
                {n.type === "reply" && <><b className="font-bold">{n.who}</b> 님이 내 답글에 답글을 남겼어요</>}
                {n.type === "like" && <>내 글을 <b className="num font-bold">{n.count}</b>명이 좋아해요</>}
                {n.type === "follow" && <><b className="font-bold">{n.who}</b> 님이 나를 팔로우했어요</>}
                {n.type === "gb_question" && <><b className="font-bold">{n.who}</b> 님이 내 공구에 질문을 남겼어요</>}
                {n.type === "gb_answer" && <><b className="font-bold">{n.who}</b> 님이 내 질문에 답했어요</>}
                {n.type === "gb_reached" && <>알림 받는 공구에 <b className="num font-bold">{n.count}</b>명이 모였어요</>}
                {n.type === "gb_requested" && <>알림 받는 공구를 판매처에 요청했어요. 판매가 열리면 알려 드려요</>}
                {n.type === "ad" && <>(광고) <b className="font-bold">{n.who}</b> 소식이에요</>}
                {n.type === "consent" && <>업체 소식(광고) 받기 동의를 확인해 주세요</>}
                {n.type === "ch_cheer" && (n.count && n.count > 1
                  ? <><b className="font-bold">{n.who}</b> 님 외 <b className="num font-bold">{n.count - 1}</b>명이 응원했어요</>
                  : <><b className="font-bold">{n.who}</b> 님이 응원했어요</>)}
                {n.type === "ch_join" && <><b className="font-bold">{n.who}</b> 님이 내 초대로 같이 하기로 했어요</>}
                {n.type === "ch_start" && <>내일부터 같이 시작해요. 오늘 밤 미리 알림을 켜 두면 좋아요</>}
                {n.type === "collab" && <><b className="font-bold">{n.who}</b>에서 협업을 제안했어요. 마이 &gt; 협업 제안에서 받거나 거절할 수 있어요</>}
              </span>
              {n.text && n.type !== "ad" && <span className="text-label text-ink-2 line-clamp-2">“{n.text}”</span>}
              {(n.type === "ad" || n.type === "consent") && <span className="text-label text-ink-2 line-clamp-3">{n.text}</span>}
              {n.type === "ad" && <span className="text-caption text-ink-3">받지 않으려면 마이 &gt; 알림 설정에서 끌 수 있어요</span>}
              {n.post_excerpt && n.type !== "comment" && n.type !== "reply" && <span className="text-caption text-ink-2 line-clamp-1">{n.post_excerpt}</span>}
              <span className="text-caption text-ink-3">{timeAgo(n.at)}{isNew && <span className="text-brand-ink font-medium"> · 새 소식</span>}</span>
            </span>
          </>
        );
        return (
          <li key={n.id} className="border-b border-line">
            {n.url ? (
              <a href={n.url} className="flex gap-3 py-3.5 hover:bg-sunken -mx-2 px-2 rounded-md transition-colors">{body}</a>
            ) : n.post_id || n.user_id ? (
              <Link href={n.post_id ? `/community/${n.post_id}` : `/community/u/${encodeURIComponent(n.user_id!)}`} className="flex gap-3 py-3.5 hover:bg-sunken -mx-2 px-2 rounded-md transition-colors">{body}</Link>
            ) : (
              <div className="flex gap-3 py-3.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
