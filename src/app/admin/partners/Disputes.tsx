"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, EmptyState, Field, SectionHeader, SkeletonList, Textarea, timeAgo, useToast } from "@/components/ui";

type Dispute = {
  id: string; partner_id: string; target: "month" | "ledger"; month: string | null; reason: string; status: "open" | "resolved" | "rejected";
  reply: string | null; created_at: string; resolved_at: string | null; partners: { name: string } | null;
  partner_credit_ledger: { kind: string; amount: number; created_at: string; note: string | null } | null;
};
const KIND: Record<string, string> = { topup: "충전", hold: "발송비 잡아 둠", release: "돌려받음", charge: "발송비", adjust: "조정" };
const won = (v: number) => `${v > 0 ? "+" : "−"}${Math.abs(v).toLocaleString("ko-KR")}원`;

/**
 * 관리자 — 정산 이의 (v3 7.7). 업체가 달 정산·충전금 내역에 남긴 "다르게 보여요"에 답하고 닫는다.
 * 금액을 고치는 일은 정산 마감·충전금 조정에서 따로 하고, 여기서는 무엇을 했는지 답을 남긴다.
 */
export function AdminDisputes() {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; open?: Dispute[]; recent?: Dispute[]; ready?: boolean; error?: string }>({ status: "loading" });
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/partners/disputes");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setState({ status: "done", open: d.open, recent: d.recent, ready: d.ready });
    } catch (e) { setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, []);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const answer = async (d: Dispute, status: "resolved" | "rejected") => {
    setBusy(`${d.id}:${status}`);
    try {
      const r = await fetch("/api/admin/partners/disputes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: d.id, status, reply: replies[d.id] || "" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error);
      toast.show("답을 남기고 닫았어요");
      await load();
    } catch (e) { toast.show(`답하지 못했어요. ${(e as Error).message}`, { tone: "danger" }); }
    finally { setBusy(null); }
  };

  const what = (d: Dispute) => d.target === "month" ? <><span className="num">{d.month}</span> 정산</>
    : d.partner_credit_ledger ? <>충전금 · {d.partner_credit_ledger.created_at.slice(0, 10)} {KIND[d.partner_credit_ledger.kind] || d.partner_credit_ledger.kind} <span className="num">{won(d.partner_credit_ledger.amount)}</span></> : "충전금 내역";

  if (state.status === "done" && !state.ready) return null;
  return (
    <section className="mt-10">
      <SectionHeader title="정산 이의" action={state.status === "done" ? <span className="text-caption text-ink-2">답을 기다리는 것 <span className="num">{state.open!.length}</span>건</span> : undefined} />
      {state.status === "loading" ? <SkeletonList rows={2} thumb={false} />
        : state.status === "error" ? (
          <EmptyState title="정산 이의를 불러오지 못했어요" description={state.error}
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(); }}>다시 불러오기</Button>} />
        ) : state.open!.length === 0 ? (
          <p className="text-label text-ink-2">답을 기다리는 이의가 없어요</p>
        ) : (
          <div className="flex flex-col gap-3">
            {state.open!.map((d) => (
              <Card key={d.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-label font-medium text-ink">{d.partners?.name || "업체"} · {what(d)}</p>
                  <span className="text-caption text-ink-2 whitespace-nowrap">{timeAgo(d.created_at)}</span>
                </div>
                <p className="text-label text-ink-2 mt-1 whitespace-pre-line">{d.reason}</p>
                <Field label="업체에 보낼 답" className="mt-3">
                  <Textarea rows={2} maxLength={1000} value={replies[d.id] || ""} onChange={(e) => setReplies({ ...replies, [d.id]: e.target.value })}
                    placeholder="예: 11월 주문 2건이 취소로 들어와 빠졌어요. 다음 정산에 반영했어요" />
                </Field>
                <div className="flex flex-wrap justify-end gap-2 mt-3">
                  <Button size="sm" variant="ghost" disabled={(replies[d.id] || "").trim().length < 2} loading={busy === `${d.id}:rejected`} onClick={() => answer(d, "rejected")}>그대로 두기</Button>
                  <Button size="sm" variant="secondary" disabled={(replies[d.id] || "").trim().length < 2} loading={busy === `${d.id}:resolved`} onClick={() => answer(d, "resolved")}>처리하기</Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      {state.status === "done" && state.recent!.length > 0 && (
        <details className="mt-3">
          <summary className="text-label text-ink-2 cursor-pointer">최근 30일에 닫은 이의 <span className="num">{state.recent!.length}</span>건</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {state.recent!.map((d) => (
              <li key={d.id} className="text-label text-ink-2">
                {d.partners?.name} · {what(d)} — {d.status === "resolved" ? "처리" : "그대로"} · {d.reply}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
