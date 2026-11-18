"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar, Button, EmptyState, ListRow, SearchField, Sheet, SkeletonList } from "@/components/ui";

/**
 * 글에 사람 태그하기 — 커뮤니티 이름으로 찾는다. 서로 팔로우하지 않아도 찾고(인플루언서 포함),
 * 태그할 수 있는지는 받는 사람 설정으로 서버가 정한다(못 하면 '태그를 받지 않는 사람이에요' 한 줄).
 * 승인해야 보이는 사람은 '승인하면 보여요'. 글마다 10명까지.
 */
export type TagPerson = { id: string; nickname: string; pending?: boolean };
type Hit = TagPerson & { can_tag: boolean; reason?: string };
type State = { status: "idle" | "loading" | "error" | "done"; items: Hit[] };
export const TAG_LIMIT = 10;

export default function PeopleTagSheet({ open, onClose, chosen, onAdd }: {
  open: boolean; onClose: () => void; chosen: TagPerson[]; onAdd: (p: TagPerson) => void;
}) {
  const [q, setQ] = useState("");
  const [state, setState] = useState<State>({ status: "idle", items: [] });
  const [attempt, setAttempt] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    const my = ++seq.current;
    if (!term) { setState({ status: "idle", items: [] }); return; } // eslint-disable-line react-hooks/set-state-in-effect -- 지우면 목록도 비운다
    setState((s) => ({ status: "loading", items: s.items }));
    const t = setTimeout(() => {
      fetch(`/api/community/people?q=${encodeURIComponent(term)}`)
        .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || String(r.status)); return d.people as Hit[]; })
        .then((items) => { if (my === seq.current) setState({ status: "done", items }); })
        .catch((e) => { console.error(e); if (my === seq.current) setState({ status: "error", items: [] }); });
    }, 250);
    return () => clearTimeout(t);
  }, [q, attempt]);

  const full = chosen.length >= TAG_LIMIT;
  return (
    <Sheet open={open} onClose={onClose} title="사람 태그하기" size="sm"
      description={`커뮤니티 이름으로 찾아요 · ${TAG_LIMIT}명까지. 상대가 태그를 받기로 한 경우에만 붙어요`}>
      <div className="flex flex-col gap-3">
        <SearchField value={q} onChange={setQ} onSubmit={() => setAttempt((n) => n + 1)} placeholder="이름 앞부분" buttonLabel="찾기" autoFocus />
        {state.status === "idle" && <p className="text-label text-ink-2 py-4 text-center">태그할 사람의 이름을 적어 주세요</p>}
        {state.status === "loading" && state.items.length === 0 && <SkeletonList rows={3} thumb={false} />}
        {state.status === "error" && (
          <EmptyState title="사람을 찾지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => setAttempt((n) => n + 1)}>다시 불러오기</Button>} />
        )}
        {state.status === "done" && state.items.length === 0 && <p className="text-label text-ink-2 py-4 text-center">‘{q.trim()}’로 시작하는 이름이 없어요</p>}
        {state.items.length > 0 && state.status !== "error" && (
          <ul className="flex flex-col">
            {state.items.map((h) => {
              const added = chosen.some((c) => c.id === h.id);
              return (
                <ListRow key={h.id} leading={<Avatar name={h.nickname} />} title={h.nickname}
                  meta={!h.can_tag ? h.reason : h.pending ? "승인하면 글에 보여요" : undefined}
                  trailing={h.can_tag
                    ? <Button size="sm" variant={added ? "ghost" : "secondary"} icon={added ? "check" : "plus"} disabled={added || full}
                        onClick={() => onAdd({ id: h.id, nickname: h.nickname, pending: h.pending })}>{added ? "태그함" : "태그하기"}</Button>
                    : undefined} />
              );
            })}
          </ul>
        )}
        {full && <p className="text-caption text-ink-2">한 글에 {TAG_LIMIT}명까지 태그할 수 있어요</p>}
      </div>
    </Sheet>
  );
}
