"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, EmptyState, Field, Input, Notice, SectionHeader, SkeletonList, TextButton, buttonClass, useToast } from "@/components/ui";
import { DisputeList, DisputeSheet, type DisputeTarget } from "./Disputes";

/** 표 줄 안의 '다르게 보여요' — 줄마다 있어 눈에 덜 띄게 글자 버튼으로 */
function DisputeButton({ onClick }: { onClick: () => void }) {
  return <TextButton onClick={onClick}>다르게 보여요</TextButton>;
}

type Settlement = { commission: number; order_sales: number; order_shipping: number; order_discount?: number; order_fee: number; status: "closed" | "paid"; closed_at: string; paid_at: string | null };
type Month = {
  month: string; clicks: number; orders: number; confirmed: number; confirmed_amount: number; commission: number; canceled: number;
  order_sales: number; order_shipping: number; order_discount?: number; order_fee: number; open: boolean; settlement: Settlement | null;
};
type Data = { commission_rate: number | null; order_commission_rate: number | null; attribution_days: number; months: Month[] };
const payout = (m: { order_sales: number; order_shipping: number; order_discount?: number; order_fee: number }) => m.order_sales - (m.order_discount || 0) + m.order_shipping - m.order_fee;
type RowError = { row: number; sku?: string; message: string };
type Result = { rows: number; saved: number; error: number; errors: RowError[] };

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 정산 — 달별 클릭·주문·수수료, 마감·입금 상태, 주문 내역 올리기 */
export function Commission({ qs, readOnly = false }: { qs: string; readOnly?: boolean }) {
  const toast = useToast();
  const [dispute, setDispute] = useState<DisputeTarget | null>(null);
  const [disputeTick, setDisputeTick] = useState(0);
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data?: Data; error?: string }>({ status: "loading" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/partner/conversions?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setState({ status: "done", data: d });
    } catch (e) { setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/partner/conversions?${qs}`, { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setResult(d);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      toast.show(`주문 ${d.saved}건을 올렸어요`);
      load();
    } catch (e) {
      toast.show(`올리지 못했어요. ${(e as Error).message || "다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setBusy(false); }
  };

  const appOrders = !!state.data?.months.some((m) => m.order_sales > 0 || (m.settlement?.order_sales || 0) > 0);
  return (
    <section>
      <SectionHeader title="정산"
        action={<a href="/api/partner/template?kind=orders" className={buttonClass({ variant: "ghost", size: "sm" })}>주문 양식 내려받기</a>} />
      {state.status === "loading" ? <SkeletonList rows={2} thumb={false} />
        : state.status === "error" || !state.data ? (
          <EmptyState title="수수료 현황을 불러오지 못했어요" description={state.error}
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(); }}>다시 불러오기</Button>} />
        ) : (
          <>
            <p className="text-label text-ink-2 mb-3">
              케어푸드 구매 링크에는 <span className="num">cf_click</span> 번호가 붙어요. 그 번호로 들어온 주문을 올리면
              클릭 뒤 <span className="num">{state.data.attribution_days}</span>일 안의 구매확정 금액에
              {state.data.commission_rate === null ? " 계약한 수수료율" : <> <span className="num">{state.data.commission_rate}</span>%</>}을 계산해요.
              번호에는 고객을 알아볼 정보가 없어요. 달이 끝나면 케어푸드가 그 달을 마감하고, 마감한 금액으로 정산해요.
            </p>
            {state.data.months.length === 0 ? (
              <EmptyState title="아직 클릭이나 주문이 없어요" description="제품이 앱에 보이고 구매 링크가 눌리면 여기 달별로 모여요" />
            ) : (
              <Card padding="none" className="overflow-x-auto">
                <table className="w-full text-label">
                  <thead>
                    <tr className="text-ink-2 border-b border-line">
                      <th className="text-left font-medium px-4 py-2.5 whitespace-nowrap">달</th>
                      <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">클릭</th>
                      <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">주문</th>
                      <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">취소·반품</th>
                      <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">구매확정 금액</th>
                      <th className={`text-right font-medium py-2.5 whitespace-nowrap ${appOrders ? "px-3" : "px-4"}`}>수수료</th>
                      {appOrders && <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">앱 주문 판매</th>}
                      {appOrders && <th className="text-right font-medium px-4 py-2.5 whitespace-nowrap">받을 금액</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {state.data.months.map((m) => {
                      const s = m.settlement;
                      const drift = s ? m.commission - s.commission : 0;
                      return (
                      <tr key={m.month}>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="num text-ink">{m.month}</span>
                          <span className={`block text-caption ${s?.status === "paid" ? "text-positive" : "text-ink-2"}`}>
                            {s?.status === "paid" ? "정산 끝" : s ? "마감" : m.open ? "집계 중" : "마감 전"}
                          </span>
                          {!readOnly && <DisputeButton onClick={() => setDispute({ target: "month", month: m.month, label: `${m.month} 정산` })} />}
                        </td>
                        <td className="px-3 py-2.5 num text-right text-ink whitespace-nowrap">{m.clicks.toLocaleString("ko-KR")}</td>
                        <td className="px-3 py-2.5 num text-right text-ink whitespace-nowrap">{m.orders.toLocaleString("ko-KR")}</td>
                        <td className="px-3 py-2.5 num text-right text-ink whitespace-nowrap">{m.canceled.toLocaleString("ko-KR")}</td>
                        <td className="px-3 py-2.5 num text-right text-ink whitespace-nowrap">{won(m.confirmed_amount)}</td>
                        <td className={`py-2.5 num text-right font-bold text-ink whitespace-nowrap ${appOrders ? "px-3" : "px-4"}`}>
                          {won(s ? s.commission : m.commission)}
                          {drift !== 0 && <span className="block text-caption font-regular text-ink-2">마감 뒤 {drift > 0 ? "+" : "−"}{won(Math.abs(drift))}</span>}
                        </td>
                        {appOrders && <td className="px-3 py-2.5 num text-right text-ink whitespace-nowrap">{won(s ? s.order_sales : m.order_sales)}</td>}
                        {appOrders && (
                          <td className="px-4 py-2.5 num text-right font-bold text-ink whitespace-nowrap">
                            {won(payout(s || m))}
                            <span className="block text-caption font-regular text-ink-2">{((s || m).order_discount || 0) > 0 && <>쿠폰 −{won((s || m).order_discount || 0)} · </>}배송비 +{won((s || m).order_shipping)} · 수수료 −{won((s || m).order_fee)}</span>
                          </td>
                        )}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            )}
            {appOrders && (
              <p className="text-caption text-ink-2 mt-2">
                앱 주문은 배송 완료된 달에 판매액 + 배송비 − 수수료
                {state.data.order_commission_rate !== null && <>(<span className="num">{state.data.order_commission_rate}</span>%)</>}를 드려요
              </p>
            )}
            {state.data.months.some((m) => m.settlement && m.commission !== m.settlement.commission) && (
              <p className="text-caption text-ink-2 mt-2">&lsquo;마감 뒤&rsquo;는 마감한 다음에 주문 상태가 바뀌어 달라진 금액이에요. 케어푸드가 확인해 다음 정산에 반영해요</p>
            )}

            <Card className="mt-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className={buttonClass({ variant: "secondary" })}>
                  주문 파일 고르기
                  <input ref={fileRef} type="file" accept=".xlsx" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </label>
                <span className="text-label text-ink-2 min-w-0 truncate">{file ? file.name : "고른 파일이 없어요"}</span>
                <Button variant="secondary" className="ml-auto" disabled={!file} loading={busy} onClick={upload}>주문 올리기</Button>
              </div>
            </Card>
            {result && (
              <Notice className="mt-3" tone={result.error > 0 ? "danger" : "neutral"} title="방금 올린 주문">
                <p><span className="num">{result.rows}</span>줄 중 반영 <span className="num">{result.saved}</span> · 반려 <span className="num">{result.error}</span></p>
                {result.errors.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {result.errors.slice(0, 50).map((e, i) => (
                      <li key={i} className="text-ink"><span className="num">{e.row}</span>줄{e.sku ? <> · <span className="num">{e.sku}</span></> : null} — {e.message}</li>
                    ))}
                  </ul>
                )}
              </Notice>
            )}
          </>
        )}
      <Credits qs={qs} onDispute={readOnly ? undefined : setDispute} />
      <DisputeList qs={qs} refresh={disputeTick} />
      <DisputeSheet qs={qs} target={dispute} onClose={() => setDispute(null)} onSent={() => setDisputeTick((t) => t + 1)} />
    </section>
  );
}

type Ledger = { id: string; kind: "topup" | "hold" | "release" | "charge" | "adjust"; amount: number; status: "requested" | "confirmed" | "canceled"; note: string | null; created_at: string; partner_campaigns: { title: string } | null };
type CreditData = { ready: boolean; unit_price: number | null; balance: number; pending: number; ledger: Ledger[]; read_only: boolean };
const KIND: Record<Ledger["kind"], string> = { topup: "충전", hold: "발송비 잡아 둠", release: "돌려받음", charge: "발송비", adjust: "조정" };

/**
 * 고객층 충전금 — 발송비는 보낼 때 충전금에서 낸다 (11/13 결정). 결제(PG) 전에는 계좌이체로 충전하고,
 * 케어푸드가 입금을 확인하면 반영·세금계산서를 발행한다.
 */
export function Credits({ qs, onDispute }: { qs: string; onDispute?: (t: DisputeTarget) => void }) {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data?: CreditData; error?: string }>({ status: "loading" });
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/partner/crm?view=credits&${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setState({ status: "done", data: d });
    } catch (e) { setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const request = async () => {
    const v = Number(amount.replace(/,/g, ""));
    setBusy(true);
    try {
      const r = await fetch(`/api/partner/crm?${qs}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "topup", amount: v }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error);
      toast.show(`${won(v)} 충전을 신청했어요. 입금 계좌는 담당자 메일로 보내 드려요`);
      setAmount("");
      load();
    } catch (e) { toast.show(`신청하지 못했어요. ${(e as Error).message || "다시 시도해 주세요"}`, { tone: "danger" }); }
    finally { setBusy(false); }
  };

  if (state.status === "done" && !state.data?.ready) return null;
  return (
    <section className="mt-10">
      <SectionHeader title="고객층 충전금" />
      {state.status === "loading" ? <SkeletonList rows={2} thumb={false} />
        : state.status === "error" || !state.data ? (
          <EmptyState title="충전금을 불러오지 못했어요" description={state.error}
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(); }}>다시 불러오기</Button>} />
        ) : (
          <>
            <Card>
              <p className="text-caption text-ink-2">잔액</p>
              <p className="num text-title font-bold text-ink">{won(state.data.balance)}</p>
              <p className="text-label text-ink-2 mt-1">
                {state.data.pending > 0 && <>입금 확인 중 <span className="num">{won(state.data.pending)}</span> · </>}
                건당 발송비 {state.data.unit_price === null ? "정해지지 않았어요" : <span className="num">{won(state.data.unit_price)}</span>}
              </p>
              {!state.data.read_only && (
                <div className="flex flex-wrap items-end gap-2 mt-4">
                  <Field label="충전할 금액 (원)" className="flex-1 min-w-40">
                    <Input inputMode="numeric" value={amount} placeholder="100,000" className="num" onChange={(e) => setAmount(e.target.value.replace(/[^\d,]/g, ""))} />
                  </Field>
                  <Button variant="secondary" loading={busy} disabled={!amount} onClick={request}>충전 신청하기</Button>
                </div>
              )}
              <p className="text-caption text-ink-2 mt-3">1만~1,000만 원. 계좌이체로 입금하면 케어푸드가 확인한 뒤 잔액에 넣고 세금계산서를 보내 드려요</p>
            </Card>
            {state.data.ledger.length > 0 && (
              <Card padding="none" className="overflow-x-auto mt-3">
                <table className="w-full text-label">
                  <thead>
                    <tr className="text-ink-2 border-b border-line">
                      <th className="text-left font-medium px-4 py-2.5 whitespace-nowrap">날짜</th>
                      <th className="text-left font-medium px-3 py-2.5">내용</th>
                      <th className="text-right font-medium px-4 py-2.5 whitespace-nowrap">금액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {state.data.ledger.map((l) => (
                      <tr key={l.id}>
                        <td className="px-4 py-2.5 num text-ink-2 whitespace-nowrap">{l.created_at.slice(0, 10)}</td>
                        <td className="px-3 py-2.5 text-ink">
                          {KIND[l.kind]}{l.partner_campaigns?.title ? ` · ${l.partner_campaigns.title}` : ""}
                          {l.status !== "confirmed" && <span className="text-ink-2"> · {l.status === "requested" ? "입금 확인 중" : "취소"}</span>}
                          {onDispute && <span className="block"><DisputeButton onClick={() => onDispute({ target: "ledger", ledger_id: l.id, label: `${l.created_at.slice(0, 10)} ${KIND[l.kind]} ${l.amount > 0 ? "+" : "−"}${won(Math.abs(l.amount))}` })} /></span>}
                        </td>
                        <td className={`px-4 py-2.5 num text-right whitespace-nowrap ${l.status === "confirmed" ? "text-ink" : "text-ink-3"}`}>
                          {l.amount > 0 ? "+" : "−"}{won(Math.abs(l.amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </>
        )}
    </section>
  );
}
