"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon, Skeleton } from "@/components/ui";

/**
 * 피드 위 챌린지 한 줄 — 하고 있으면 내 진행("나트륨 2,000mg 이하 · 7일 중 3일"), 아니면 지금 하는 사람 수.
 * 누르면 /community/challenges. 불러오지 못하면 이름만 있는 줄로 (길은 그대로 남긴다).
 */
type Item = { id: string; title: string; active_count: number; days: number; me: { done_count: number; finished: boolean } | null };

export default function ChallengeEntry() {
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; items: Item[] }>({ status: "loading", items: [] });

  useEffect(() => {
    let alive = true;
    fetch("/api/community/challenges")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (alive) setState({ status: "done", items: d.challenges || [] }); })
      .catch(() => { if (alive) setState({ status: "error", items: [] }); });
    return () => { alive = false; };
  }, []);

  if (state.status === "loading") return <Skeleton className="h-12 w-full rounded-md my-3" />;
  if (state.status === "done" && state.items.length === 0) return null;

  const mine = state.items.find((c) => c.me && !c.me.finished);
  const people = state.items.reduce((s, c) => s + c.active_count, 0);
  return (
    <Link href="/community/challenges"
      className="flex items-center gap-3 min-h-12 py-3 border-b border-line hover:bg-sunken -mx-2 px-2 rounded-md transition-colors">
      <Icon name="flag" size={20} className="text-brand-ink shrink-0" />
      <span className="flex-1 min-w-0 text-label text-ink truncate">
        {mine ? (
          <><b className="font-bold">{mine.title}</b> · <span className="num">{mine.days}</span>일 중 <span className="num font-bold text-brand-ink">{mine.me!.done_count}</span>일</>
        ) : state.status === "error" ? (
          <b className="font-bold">챌린지</b>
        ) : (
          <><b className="font-bold">챌린지</b> · {people > 0 ? <>지금 <span className="num">{people}</span>명이 하고 있어요</> : <>식단 기록으로 일주일 도전해 보세요</>}</>
        )}
      </span>
      <Icon name="chevron-right" size={18} className="text-ink-3 shrink-0" />
    </Link>
  );
}
