"use client";

import { useEffect, useRef, useState } from "react";
import { Button, EmptyState, Icon, LinkButton, ListRow, Sheet, SkeletonList } from "@/components/ui";

/**
 * 챌린지 인증 — 하고 있는 챌린지 하나 고르기 (올리기 → 챌린지 인증).
 * 고르면 인증 카드(ShareCardSheet)가 열리고, 거기서 인스타 공유나 '오늘끼록 스토리에도 올리기'.
 * 끝난 챌린지는 빼고, 지금 하고 있는 것만 (해낸 날 / 전체 날).
 */
type Mine = { id: string; title: string; days: number; me: { done_count: number; finished: boolean } | null };

export default function CertPickSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (challengeId: string) => void }) {
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; items: Mine[] }>({ status: "loading", items: [] });
  const [attempt, setAttempt] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const n = ++seq.current;
    setState({ status: "loading", items: [] }); // eslint-disable-line react-hooks/set-state-in-effect -- 열 때마다 새로
    fetch("/api/community/challenges")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "");
        if (n !== seq.current) return;
        const items = ((d.challenges || []) as Mine[]).filter((c) => c.me && !c.me.finished);
        setState({ status: "done", items });
      })
      .catch(() => { if (n === seq.current) setState({ status: "error", items: [] }); });
  }, [open, attempt]);

  return (
    <Sheet open={open} onClose={onClose} title="챌린지 인증" description="인증할 챌린지를 골라요. 해낸 날이 카드로 만들어져요" size="sm">
      {state.status === "loading" && <SkeletonList rows={3} thumb={false} />}
      {state.status === "error" && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-label text-ink">챌린지를 불러오지 못했어요</p>
          <Button size="sm" variant="secondary" icon="refresh" onClick={() => setAttempt((n) => n + 1)}>다시 불러오기</Button>
        </div>
      )}
      {state.status === "done" && state.items.length === 0 && (
        <EmptyState title="하고 있는 챌린지가 없어요" description="챌린지에 참여하거나 직접 만들면 여기서 인증할 수 있어요"
          action={<LinkButton href="/community/challenges" size="sm" variant="secondary">챌린지 보기</LinkButton>} />
      )}
      {state.status === "done" && state.items.length > 0 && (
        <div className="flex flex-col gap-1">
          {state.items.map((c) => (
            <ListRow key={c.id} onClick={() => onPick(c.id)} leading={<Icon name="flag" size={20} className="text-ink-2" />}
              title={c.title} meta={<><span className="num">{c.me?.done_count ?? 0}</span>/<span className="num">{c.days}</span>일 해냈어요</>} />
          ))}
        </div>
      )}
    </Sheet>
  );
}
