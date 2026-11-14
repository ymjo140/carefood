"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  Button, Chip, CommentItem, ConfirmSheet, Icon, Input, SectionHeader, SkeletonList, useToast,
} from "@/components/ui";

/**
 * 공구 질문 — 사려는 사람이 묻고 진행자가 답한다 (인플루언서 공구의 댓글 문의).
 * 네 상태: 불러오는 중 · 실패(다시 불러오기) · 비어 있음(첫 질문 안내) · 채워짐.
 * 진행자는 자기 공구의 질문을 지울 수 있고, 다른 사람은 자기 것만.
 */
type Q = { id: string; parent_id: string | null; author_nickname: string; content: string; created_at: string; is_mine: boolean; is_host: boolean };
export type QuestionsHandle = { focus: () => void };

export const Questions = forwardRef<QuestionsHandle, { groupBuyId: string; hostName: string; closed?: boolean; onCount: (n: number) => void }>(
  function Questions({ groupBuyId, hostName, closed = false, onCount }, ref) {
    const toast = useToast();
    const [state, setState] = useState<{ status: "loading" | "error" | "done"; items: Q[]; canModerate: boolean }>({ status: "loading", items: [], canModerate: false });
    const [attempt, setAttempt] = useState(0);
    const [text, setText] = useState("");
    const [replyTo, setReplyTo] = useState<{ id: string; nick: string } | null>(null);
    const [sending, setSending] = useState(false);
    const [removing, setRemoving] = useState<Q | null>(null);
    const [busy, setBusy] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }), []);

    useEffect(() => {
      let alive = true;
      setState((s) => ({ ...s, status: "loading" }));
      fetch(`/api/community/group-buy/${groupBuyId}/comments`)
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          if (alive) setState({ status: "done", items: d.comments || [], canModerate: !!d.can_moderate });
        })
        .catch(() => { if (alive) setState((s) => ({ ...s, status: "error" })); });
      return () => { alive = false; };
    }, [groupBuyId, attempt]);

    const tops = state.items.filter((q) => !q.parent_id);
    const kids = (id: string) => state.items.filter((q) => q.parent_id === id);

    const send = async () => {
      const content = text.trim();
      if (!content) return;
      setSending(true);
      try {
        const res = await fetch(`/api/community/group-buy/${groupBuyId}/comments`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, parent_id: replyTo?.id ?? null }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error);
        setState((s) => {
          const items = [...s.items, d.comment as Q];
          onCount(items.length);
          return { ...s, items };
        });
        setText(""); setReplyTo(null);
        toast.show(replyTo ? "답을 남겼어요" : "질문을 남겼어요");
      } catch (e) {
        toast.show(e instanceof Error && e.message ? e.message : "남기지 못했어요. 다시 시도해 주세요", { tone: "danger" });
      } finally { setSending(false); }
    };

    const remove = async () => {
      if (!removing) return;
      setBusy(true);
      try {
        const res = await fetch(`/api/community/group-buy/${groupBuyId}/comments?comment_id=${removing.id}`, { method: "DELETE" });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error);
        setState((s) => {
          const items = s.items.filter((q) => q.id !== removing.id && q.parent_id !== removing.id);
          onCount(items.length);
          return { ...s, items };
        });
        toast.show("삭제했어요");
        setRemoving(null);
      } catch {
        toast.show("지우지 못했어요. 다시 시도해 주세요", { tone: "danger" });
      } finally { setBusy(false); }
    };

    const canDelete = (q: Q) => q.is_mine || state.canModerate;
    const reply = (q: Q, nick: string) => { setReplyTo({ id: q.id, nick }); input.current?.focus(); };

    return (
      <section aria-label="질문" className="flex flex-col gap-3">
        <SectionHeader title={<>질문 {state.status === "done" && state.items.length > 0 && <span className="num text-ink-2">{state.items.length}</span>}</>}
          description={closed ? "마감된 공구라 새 질문은 받지 않아요" : `양·보관·맛처럼 궁금한 걸 ${hostName} 님에게 물어보세요`} />

        {!closed && <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
          {replyTo && (
            <Chip size="sm" selected className="self-start" aria-label={`${replyTo.nick} 님에게 답하기 그만두기`} onClick={() => setReplyTo(null)}>
              {replyTo.nick} 님에게 답하기 <Icon name="close" size={14} />
            </Chip>
          )}
          <div className="flex gap-2">
            <Input ref={input} value={text} name="group_buy_question" maxLength={300} aria-label={replyTo ? "답" : "질문"}
              placeholder={replyTo ? `${replyTo.nick} 님에게 답하기` : "예: 한 팩 양이 얼마나 돼요?"} onChange={(e) => setText(e.target.value)} />
            <Button type="submit" variant="secondary" className="shrink-0" disabled={!text.trim()} loading={sending}>{replyTo ? "답하기" : "질문하기"}</Button>
          </div>
        </form>}

        {state.status === "loading" && <SkeletonList rows={2} thumb={false} />}
        {state.status === "error" && (
          <div className="flex items-center gap-2 text-label text-danger">
            질문을 불러오지 못했어요
            <Button size="sm" variant="ghost" icon="refresh" onClick={() => setAttempt((n) => n + 1)}>다시 불러오기</Button>
          </div>
        )}
        {state.status === "done" && tops.length === 0 && (
          <p className="text-label text-ink-2 py-4">{closed ? "남은 질문이 없어요" : "아직 질문이 없어요. 궁금한 게 있으면 첫 질문을 남겨 보세요"}</p>
        )}
        {state.status === "done" && tops.length > 0 && (
          <ul className="flex flex-col">
            {tops.map((q) => {
              const answers = kids(q.id);
              return (
                <li key={q.id} className="flex flex-col">
                  <CommentItem nickname={q.author_nickname} badge={q.is_host ? "진행자" : undefined} createdAt={q.created_at} content={q.content}
                    line={answers.length > 0} onReply={closed ? undefined : () => reply(q, q.author_nickname)} onDelete={canDelete(q) ? () => setRemoving(q) : undefined} />
                  {answers.map((a) => (
                    <CommentItem key={a.id} nested nickname={a.author_nickname} badge={a.is_host ? "진행자" : undefined} createdAt={a.created_at} content={a.content}
                      onReply={closed ? undefined : () => reply(q, a.author_nickname)} onDelete={canDelete(a) ? () => setRemoving(a) : undefined} />
                  ))}
                </li>
              );
            })}
          </ul>
        )}

        <ConfirmSheet open={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} loading={busy}
          title="이 글을 지울까요?" description={removing && !removing.parent_id ? "달린 답도 함께 지워져요" : "지우면 되돌릴 수 없어요"} confirmLabel="삭제하기" tone="danger" />
      </section>
    );
  },
);
