"use client";

import { useEffect, useState } from "react";
import { Avatar, Button, Card, EmptyState, LinkButton, SkeletonList, useToast } from "@/components/ui";
import { timeAgo } from "@/components/ui/FeedPost";

type Blocked = { user_id: string; nickname: string; created_at: string };

export function BlockedList() {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; items: Blocked[] }>({ status: "loading", items: [] });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/community/block")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (alive) setState({ status: "done", items: d.blocked || [] }); })
      .catch(() => { if (alive) setState({ status: "error", items: [] }); });
    return () => { alive = false; };
  }, [attempt]);

  const unblock = async (b: Blocked) => {
    setBusy(b.user_id);
    try {
      const r = await fetch("/api/community/block", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: b.user_id }) });
      if (!r.ok) throw new Error(String(r.status));
      setState((s) => ({ ...s, items: s.items.filter((x) => x.user_id !== b.user_id) }));
      toast.show(`${b.nickname} 님 차단을 풀었어요`);
    } catch {
      toast.show("차단을 풀지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(null); }
  };

  if (state.status === "loading") return <SkeletonList rows={3} />;
  if (state.status === "error") {
    return (
      <Card className="flex flex-col items-start gap-3">
        <p className="text-label text-ink">목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요</p>
        <Button variant="secondary" size="sm" icon="refresh" onClick={() => { setState({ status: "loading", items: [] }); setAttempt((n) => n + 1); }}>다시 불러오기</Button>
      </Card>
    );
  }
  if (state.items.length === 0) {
    return <EmptyState title="차단한 사람이 없어요" description="글의 ··· 메뉴에서 차단할 수 있어요" action={<LinkButton href="/community" variant="secondary" size="sm">피드 보기</LinkButton>} />;
  }
  return (
    <ul className="flex flex-col">
      {state.items.map((b) => (
        <li key={b.user_id} className="flex items-center gap-3 py-3 border-b border-line">
          <Avatar name={b.nickname} />
          <div className="flex-1 min-w-0">
            <p className="text-body font-medium text-ink truncate">{b.nickname}</p>
            <p className="text-caption text-ink-2">{timeAgo(b.created_at)} 차단</p>
          </div>
          <Button size="sm" variant="secondary" loading={busy === b.user_id} disabled={!!busy} onClick={() => unblock(b)}>차단 풀기</Button>
        </li>
      ))}
    </ul>
  );
}
