"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, EmptyState, Icon, LinkButton, SkeletonList, cn, type IconName } from "@/components/ui";
import { timeAgo } from "@/components/ui/FeedPost";
import { getNotifSeen, markNotifSeen } from "@/lib/notif-seen";

type Item = { id: string; type: "comment" | "like" | "follow"; at: string; who: string; count?: number; text?: string; post_id?: string; post_excerpt?: string };

const ICON: Record<Item["type"], IconName> = { comment: "message", like: "heart", follow: "user" };

export function NotificationList() {
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; items: Item[] }>({ status: "loading", items: [] });
  const [seen] = useState(() => (typeof window === "undefined" ? 0 : getNotifSeen()));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/notifications")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (!alive) return;
        setState({ status: "done", items: d.items || [] });
        markNotifSeen();
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
                {n.type === "comment" && <><b className="font-bold">{n.who}</b> 님이 답글을 남겼어요</>}
                {n.type === "like" && <>내 글을 <b className="num font-bold">{n.count}</b>명이 좋아해요</>}
                {n.type === "follow" && <><b className="font-bold">{n.who}</b> 님이 나를 팔로우했어요</>}
              </span>
              {n.text && <span className="text-label text-ink-2 line-clamp-2">“{n.text}”</span>}
              {n.post_excerpt && n.type !== "comment" && <span className="text-caption text-ink-2 line-clamp-1">{n.post_excerpt}</span>}
              <span className="text-caption text-ink-3">{timeAgo(n.at)}{isNew && <span className="text-brand-ink font-medium"> · 새 소식</span>}</span>
            </span>
          </>
        );
        return (
          <li key={n.id} className="border-b border-line">
            {n.post_id ? (
              <Link href={`/community/${n.post_id}`} className="flex gap-3 py-3.5 hover:bg-sunken -mx-2 px-2 rounded-md transition-colors">{body}</Link>
            ) : (
              <div className="flex gap-3 py-3.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
