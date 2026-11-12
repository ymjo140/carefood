"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, EmptyState, Notice, SectionHeader, SkeletonList, buttonClass, useToast } from "@/components/ui";

type Settlement = { commission: number; order_sales: number; order_fee: number; status: "closed" | "paid"; closed_at: string; paid_at: string | null };
type Month = {
  month: string; clicks: number; orders: number; confirmed: number; confirmed_amount: number; commission: number; canceled: number;
  order_sales: number; order_fee: number; open: boolean; settlement: Settlement | null;
};
type Data = { commission_rate: number | null; attribution_days: number; months: Month[] };
type RowError = { row: number; sku?: string; message: string };
type Result = { rows: number; saved: number; error: number; errors: RowError[] };

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 정산 — 달별 클릭·주문·수수료, 마감·입금 상태, 주문 내역 올리기 */
export function Commission({ qs }: { qs: string }) {
  const toast = useToast();
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
                      {appOrders && <th className="text-right font-medium px-4 py-2.5 whitespace-nowrap">앱 주문 수수료</th>}
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
                        </td>
                        <td className="px-3 py-2.5 num text-right text-ink">{m.clicks.toLocaleString("ko-KR")}</td>
                        <td className="px-3 py-2.5 num text-right text-ink">{m.orders.toLocaleString("ko-KR")}</td>
                        <td className="px-3 py-2.5 num text-right text-ink">{m.canceled.toLocaleString("ko-KR")}</td>
                        <td className="px-3 py-2.5 num text-right text-ink whitespace-nowrap">{won(m.confirmed_amount)}</td>
                        <td className={`py-2.5 num text-right font-bold text-ink whitespace-nowrap ${appOrders ? "px-3" : "px-4"}`}>
                          {won(s ? s.commission : m.commission)}
                          {drift !== 0 && <span className="block text-caption font-regular text-ink-2">마감 뒤 {drift > 0 ? "+" : "−"}{won(Math.abs(drift))}</span>}
                        </td>
                        {appOrders && <td className="px-3 py-2.5 num text-right text-ink whitespace-nowrap">{won(s ? s.order_sales : m.order_sales)}</td>}
                        {appOrders && <td className="px-4 py-2.5 num text-right text-ink whitespace-nowrap">{won(s ? s.order_fee : m.order_fee)}</td>}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
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
    </section>
  );
}
