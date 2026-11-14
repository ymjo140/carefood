"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, EmptyState, Field, SectionHeader, Sheet, SkeletonList, Textarea, timeAgo, useToast } from "@/components/ui";

export type DisputeTarget = { target: "month"; month: string; label: string } | { target: "ledger"; ledger_id: string; label: string };
type Dispute = { id: string; target: "month" | "ledger"; month: string | null; ledger_id: string | null; reason: string; status: "open" | "resolved" | "rejected"; reply: string | null; created_at: string; resolved_at: string | null };
const STATUS: Record<Dispute["status"], string> = { open: "확인 중", resolved: "처리했어요", rejected: "그대로 두기로 했어요" };

/** "다르게 보여요" — 한 줄에 사유를 남기는 시트 */
export function DisputeSheet({ qs, target, onClose, onSent }: { qs: string; target: DisputeTarget | null; onClose: () => void; onSent: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const body = target.target === "month" ? { target: "month", month: target.month, reason } : { target: "ledger", ledger_id: target.ledger_id, reason };
      const r = await fetch(`/api/partner/disputes?${qs}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error);
      toast.show("이의를 남겼어요. 케어푸드가 확인한 뒤 여기 답을 달아요");
      setReason("");
      onSent();
      onClose();
    } catch (e) { toast.show(`남기지 못했어요. ${(e as Error).message || "다시 시도해 주세요"}`, { tone: "danger" }); }
    finally { setBusy(false); }
  };
  return (
    <Sheet open={!!target} onClose={onClose} title="다르게 보여요" description={target?.label}
      footer={<Button className="w-full" loading={busy} disabled={reason.trim().length < 5} onClick={send}>남기기</Button>}>
      <Field label="무엇이 다른가요" hint="예: 11월 주문 12건을 올렸는데 10건만 잡혀요 · 주문 번호를 같이 적어 주면 빨라요">
        <Textarea rows={4} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Sheet>
  );
}

/** 내가 남긴 이의 — 확인 중 · 답 */
export function DisputeList({ qs, refresh }: { qs: string; refresh: number }) {
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; disputes?: Dispute[]; ready?: boolean; error?: string }>({ status: "loading" });
  const seq = useRef(0); // 다시 불러오기가 겹치면 마지막 응답만 쓴다
  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const r = await fetch(`/api/partner/disputes?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (my === seq.current) setState({ status: "done", disputes: d.disputes, ready: d.ready });
    } catch (e) { if (my === seq.current) setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);
  useEffect(() => { load(); }, [load, refresh]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  // 표가 아직 없는 DB(준비 전)에서만 구역을 그리지 않는다. 그 밖에는 불러오는 중 · 비어 있음 · 실패 · 채워짐을 모두 그린다
  if (state.status === "done" && !state.ready) return null;
  return (
    <section className="mt-10">
      <SectionHeader title="남긴 이의" />
      {state.status === "loading" ? <SkeletonList rows={2} thumb={false} />
      : state.status === "error" ? (
        <EmptyState title="남긴 이의를 불러오지 못했어요" description={state.error}
          action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(); }}>다시 불러오기</Button>} />
      ) : !state.disputes?.length ? (
        <EmptyState title="남긴 이의가 없어요" description="정산이나 충전금 내역이 다르게 보이면 그 줄의 '다르게 보여요'를 눌러 남겨 주세요" />
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-line">
            {state.disputes!.map((d) => (
              <li key={d.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-label font-medium text-ink">{d.target === "month" ? <><span className="num">{d.month}</span> 정산</> : "충전금 내역"}</span>
                  <span className={`text-caption whitespace-nowrap ${d.status === "open" ? "text-ink-2" : "text-ink"}`}>{STATUS[d.status]} · {timeAgo(d.resolved_at || d.created_at)}</span>
                </div>
                <p className="text-label text-ink-2 mt-1 whitespace-pre-line">{d.reason}</p>
                {d.reply && <p className="text-label text-ink mt-2 pl-3 border-l-2 border-line-strong whitespace-pre-line">케어푸드: {d.reply}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
