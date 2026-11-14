"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Chip, ChipRow, EmptyState, Field, SkeletonList, Textarea, timeAgo, useToast } from "@/components/ui";
import { FULFIL_LABEL, INQUIRY_KIND_LABEL, INQUIRY_LATE_HOURS, type Fulfil } from "@/lib/order-status";
import type { PartnerInquiry } from "@/lib/partner/inquiries";

type Status = "open" | "answered";
type Load = { status: "loading" | "error" | "done"; data: PartnerInquiry[]; counts?: { open: number; late: number }; readOnly?: boolean; hasMore?: boolean; page?: number; error?: string };
const md = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" });

/**
 * 주문 > 문의 — 주문자가 남긴 문의에 답한다. 답할 문의는 오래된 것부터, 답한 문의는 최근 것부터 50개씩.
 * 주문자는 업체마다 다른 가명 번호로만 보인다. 답은 한 번이고, 질병·치료 효능을 말하는 표현은 서버가 막는다. 관리자 보기는 읽기 전용
 */
export function Inquiries({ qs, onChanged }: { qs: string; onChanged: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<Status>("open");
  const [state, setState] = useState<Load>({ status: "loading", data: [] });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async (s: Status, page = 0) => {
    const my = ++seq.current; // 보기를 빨리 바꾸면 마지막 응답만
    try {
      const r = await fetch(`/api/partner/inquiries?${qs}&status=${s}&page=${page}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (my !== seq.current) return;
      setState((cur) => ({ status: "done", data: page > 0 ? [...cur.data, ...d.inquiries] : d.inquiries, counts: d.counts, readOnly: d.read_only, hasMore: d.has_more, page }));
    } catch (e) {
      if (my !== seq.current) return;
      if (page > 0) toast.show("더 불러오지 못했어요. 다시 시도해 주세요", { tone: "danger" });
      else setState({ status: "error", data: [], error: (e as Error).message || "불러오지 못했어요" });
    } finally { if (my === seq.current) setMore(false); }
  }, [qs, toast]);
  useEffect(() => { load(status); }, [load, status]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const pick = (s: Status) => { setState((cur) => ({ ...cur, status: "loading", data: [] })); setStatus(s); };

  const answer = async (q: PartnerInquiry) => {
    const text = (drafts[q.id] || "").trim();
    if (text.length < 2) return;
    setBusy(q.id);
    try {
      const r = await fetch(`/api/partner/inquiries?${qs}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: q.id, answer: text }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error);
      toast.show("답했어요. 주문자에게 알렸어요");
      setDrafts((cur) => { const next = { ...cur }; delete next[q.id]; return next; });
      await load(status);
      onChanged(); // 주문 탭 건수·홈 할 일
    } catch (e) {
      toast.show(`답하지 못했어요. ${(e as Error).message || "다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setBusy(null); }
  };

  const c = state.counts;
  const ro = !!state.readOnly;
  return (
    <section>
      <ChipRow className="mb-3">
        <Chip selected={status === "open"} onClick={() => pick("open")}>답할 문의{c && <span className="num ml-1">{c.open}</span>}</Chip>
        <Chip selected={status === "answered"} onClick={() => pick("answered")}>답한 문의</Chip>
      </ChipRow>
      {status === "open" && c && c.late > 0 && (
        <p className="text-label text-ink mb-3">{INQUIRY_LATE_HOURS}시간이 지나도록 답하지 않은 문의가 <span className="num font-bold">{c.late}</span>건 있어요</p>
      )}
      {state.status === "loading" ? <SkeletonList rows={3} thumb={false} />
        : state.status === "error" ? (
          <EmptyState title="문의를 불러오지 못했어요" description={state.error}
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading", data: [] }); load(status); }}>다시 불러오기</Button>} />
        ) : state.data.length === 0 ? (
          status === "open"
            ? <EmptyState title="답할 문의가 없어요" description="주문자가 내 주문에서 문의를 남기면 여기 모이고, 담당자에게 푸시로 알려요" />
            : <EmptyState title="아직 답한 문의가 없어요" description="답한 문의는 여기서 다시 볼 수 있어요" />
        ) : (
          <div className="flex flex-col gap-3">
            {state.data.map((q) => (
              <Card key={q.id}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-caption text-ink-2 min-w-0">
                    고객 <span className="num">{q.customer}</span> · 주문 <span className="num">{q.order_id.slice(0, 8)}</span>
                    {q.ordered_at && <> · {md(q.ordered_at)} 결제</>}{q.status && <> · {FULFIL_LABEL[q.status as Fulfil] || q.status}</>}
                  </p>
                  <span className="flex gap-1 shrink-0">
                    {q.late && <Badge tone="danger">하루 지남</Badge>}
                    <Badge>{INQUIRY_KIND_LABEL[q.kind]}</Badge>
                  </span>
                </div>
                {q.lines.length > 0 && (
                  <p className="text-caption text-ink-2 mt-1 line-clamp-2">{q.lines.map((l) => `${l.name} ${l.quantity}개`).join(" · ")}</p>
                )}
                <p className="text-body text-ink mt-3 whitespace-pre-line">{q.body}</p>
                <p className="text-caption text-ink-3 mt-1">{timeAgo(q.created_at)}</p>
                {q.answer ? (
                  <div className="mt-3 pt-3 border-t border-line">
                    <p className="text-caption text-ink-2">내 답 · {q.answered_at ? timeAgo(q.answered_at) : ""}</p>
                    <p className="text-label text-ink mt-1 whitespace-pre-line">{q.answer}</p>
                  </div>
                ) : !ro && (
                  <div className="mt-3 pt-3 border-t border-line flex flex-col gap-2">
                    <Field label="답" hint="주문자에게 바로 알려요. 한 번 답하면 고칠 수 없어요 · 효능·질병 표현은 쓸 수 없어요">
                      <Textarea value={drafts[q.id] || ""} onChange={(e) => setDrafts((cur) => ({ ...cur, [q.id]: e.target.value }))} maxLength={1000} rows={3}
                        placeholder="주문자가 바로 알 수 있게 짧고 분명하게 적어 주세요" />
                    </Field>
                    <div className="flex justify-end">
                      <Button size="sm" loading={busy === q.id} disabled={(drafts[q.id] || "").trim().length < 2} onClick={() => answer(q)}>답하기</Button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
            {status === "answered" && state.hasMore && (
              <Button variant="ghost" loading={more} onClick={() => { setMore(true); load(status, (state.page || 0) + 1); }}>더 보기</Button>
            )}
          </div>
        )}
    </section>
  );
}
