"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BarList, Button, Card, EmptyState, HowCounted, Notice, SectionHeader, Select, Sheet, SkeletonList, Stat, TextButton, TrendChart, buttonClass } from "@/components/ui";
import type { DisputeTarget } from "./Disputes";

type Stage = { amount: number; count: number };
type Day = { day: string; orders: number; sales: number; discount: number; shipping: number; fee: number; payout: number; prev_payout: number | null };
type Board = {
  month: string; months_available: string[]; today: string; rates: { link: number | null; order: number | null }; pay_day: number; confirm_days: number;
  next: { date: string; overdue: boolean; months: string[]; app: number; link: number; net: number };
  this_month: { month: string; pay_date: string; app: number; link: number; net: number };
  pending: { amount: number; count: number; next_auto: string | null };
  flow: { preparing: Stage; shipping: Stage; delivered: Stage; confirmed: Stage; paid: Stage };
  daily: Day[]; mismatches: { month: string; expected: number; paid: number }[];
};
type DayDetail = { rate: number | null; rows: { order: string; paid_day: string; delivered_day: string | null; confirmed_day: string; confirm_by: "buyer" | "auto" | "return" | null; kind?: "order" | "return_fee"; lines: { name: string; qty: number; amount: number }[]; sales: number; discount: number; shipping: number; fee: number; payout: number }[] };

const n = (v: number) => v.toLocaleString("ko-KR");
const won = (v: number) => `${v < 0 ? "−" : ""}${n(Math.abs(v))}원`;
const md = (day: string) => `${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일`;

/**
 * 정산 대시보드 — 다음 지급일에 받을 돈(앱 주문 대금 − 구매 링크 수수료) · 이번 달 확정 · 확정 전 · 이번 달 구매 링크 수수료,
 * 돈의 흐름(결제 → 배송 → 확정 → 지급), 날짜별 장부(구매확정일)와 주문별 상세, 달 엑셀. 입금이 계산과 다르면 맨 위에 알린다.
 */
export function Payout({ qs, onDispute }: { qs: string; onDispute?: (t: DisputeTarget) => void }) {
  const [month, setMonth] = useState("");
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data?: Board; error?: string }>({ status: "loading" });
  const [day, setDay] = useState<{ day: string; status: "loading" | "error" | "done"; data?: DayDetail; error?: string } | null>(null);
  const seq = useRef(0), daySeq = useRef(0);

  const load = useCallback(async (m: string) => {
    const my = ++seq.current; // 달을 빨리 바꾸면 마지막 응답만
    try {
      const r = await fetch(`/api/partner/settlement?${qs}${m ? `&month=${m}` : ""}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (my === seq.current) setState({ status: "done", data: d });
    } catch (e) { if (my === seq.current) setState({ status: "error", error: (e as Error).message || "정산을 불러오지 못했어요" }); }
  }, [qs]);
  useEffect(() => { load(month); }, [load, month]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const openDay = async (d: string) => {
    const my = ++daySeq.current;
    setDay({ day: d, status: "loading" });
    try {
      const r = await fetch(`/api/partner/settlement?${qs}&day=${d}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (my === daySeq.current) setDay({ day: d, status: "done", data: j });
    } catch (e) { if (my === daySeq.current) setDay({ day: d, status: "error", error: (e as Error).message || "주문을 불러오지 못했어요" }); }
  };

  if (state.status === "loading" && !state.data) return <SkeletonList rows={3} thumb={false} />;
  if (state.status === "error" || !state.data) return (
    <EmptyState title="정산을 불러오지 못했어요" description={state.error}
      action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(month); }}>다시 불러오기</Button>} />
  );
  const d = state.data;
  const f = d.flow;
  const anyApp = f.preparing.count + f.shipping.count + f.delivered.count + f.confirmed.count + f.paid.count > 0 || d.daily.some((x) => x.orders > 0) || d.next.app !== 0;
  const days = d.daily.filter((x) => x.orders > 0).slice().reverse();
  const total = d.daily.reduce((a, x) => ({ orders: a.orders + x.orders, sales: a.sales + x.sales, discount: a.discount + x.discount, shipping: a.shipping + x.shipping, fee: a.fee + x.fee, payout: a.payout + x.payout }), { orders: 0, sales: 0, discount: 0, shipping: 0, fee: 0, payout: 0 });

  return (
    <div className="flex flex-col gap-8">
      {d.mismatches.map((m) => (
        <Notice key={m.month} tone="danger" title={`${m.month} 정산 금액이 계산과 달라요`}>
          보낸 금액 <span className="num">{won(m.paid)}</span> · 계산 <span className="num">{won(m.expected)}</span> · 차이 <span className="num">{won(m.paid - m.expected)}</span>
          {onDispute && <span className="block mt-2"><TextButton onClick={() => onDispute({ target: "month", month: m.month, label: `${m.month} 정산 입금 차이` })}>다르게 보여요</TextButton></span>}
        </Notice>
      ))}

      <section>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="col-span-2 sm:col-span-1">
            <Stat label={`${md(d.next.date)} ${d.next.net < 0 ? "낼 돈" : "받을 돈"}`} value={n(Math.abs(d.next.net))} unit="원" emphasis />
            <p className="text-caption text-ink-2 mt-1">
              {d.next.months.length ? <>{d.next.months.join(", ")} 확정분 · 앱 주문 대금 <span className="num">{won(d.next.app)}</span> − 구매 링크 수수료 <span className="num">{won(d.next.link)}</span></> : "지난 달까지 정산할 돈이 없어요"}
            </p>
            {d.next.overdue && <p className="text-caption text-danger mt-1">지급일이 지났어요. 받지 못했으면 아래 &lsquo;다르게 보여요&rsquo;로 알려 주세요</p>}
          </Card>
          <Card>
            <Stat label="이번 달 확정 (지금까지)" value={n(d.this_month.app)} unit="원" />
            <p className="text-caption text-ink-2 mt-1">{md(d.this_month.pay_date)}에 드려요</p>
          </Card>
          <Card>
            <Stat label="확정 전" value={n(d.pending.amount)} unit="원" />
            <p className="text-caption text-ink-2 mt-1"><span className="num">{n(d.pending.count)}</span>건{d.pending.next_auto && <> · 가장 빠른 자동 확정 {md(d.pending.next_auto)}</>}</p>
          </Card>
          <Card className="col-span-2 sm:col-span-1">
            <Stat label="이번 달 구매 링크 수수료" value={n(d.this_month.link)} unit="원" />
            <p className="text-caption text-ink-2 mt-1">받을 돈에서 빼요{d.rates.link !== null && <> · <span className="num">{d.rates.link}</span>%</>}</p>
          </Card>
        </div>
        <HowCounted className="mt-3">
          앱 주문 대금은 구매확정된 달에 모아 다음 달 {d.pay_day}일에 드려요. 구매확정은 구매자가 &lsquo;구매확정하기&rsquo;를 누른 때, 아니면 배송 완료 {d.confirm_days}일 뒤예요.
          받을 돈 = 판매액 − 업체 쿠폰 할인 + 배송비(마음이 바뀐 반품의 반품 배송비 포함) − 앱 주문 수수료{d.rates.order !== null && <>(<span className="num">{d.rates.order}</span>%, 주문마다 원 단위 반올림)</>} − 구매 링크 수수료.
          마감한 달은 마감한 숫자로 보여요
        </HowCounted>
      </section>

      {!anyApp ? (
        <EmptyState title="아직 앱 주문 정산이 없어요" description="앱에서 주문이 들어와 배송 완료·구매확정되면 여기 날짜별로 쌓여요. 구매 링크 수수료는 아래 달별 정산에 있어요" />
      ) : (
        <>
          <section>
            <SectionHeader title="돈의 흐름" description="최근 90일에 결제한 주문의 상품 금액이에요" />
            <Card>
              <BarList rows={[
                { key: "preparing", label: "결제 · 배송 준비", value: f.preparing.amount, display: won(f.preparing.amount), sub: `${n(f.preparing.count)}건` },
                { key: "shipping", label: "배송 중", value: f.shipping.amount, display: won(f.shipping.amount), sub: `${n(f.shipping.count)}건` },
                { key: "delivered", label: "배송 완료 · 확정 기다림", value: f.delivered.amount, display: won(f.delivered.amount), sub: `${n(f.delivered.count)}건` },
                { key: "confirmed", label: "확정 · 지급 전", value: f.confirmed.amount, display: won(f.confirmed.amount), sub: `${n(f.confirmed.count)}건` },
                { key: "paid", label: "지급 끝", value: f.paid.amount, display: won(f.paid.amount), sub: `${n(f.paid.count)}건` },
              ]} />
            </Card>
          </section>

          <section>
            <SectionHeader title="날짜별 장부" description="구매확정된 날 기준이에요. 날짜를 누르면 주문별로 볼 수 있어요"
              action={d.months_available.length > 1 ? (
                <Select aria-label="정산 달" value={d.month} onChange={(e) => { setMonth(e.target.value); }} className="w-32">
                  {d.months_available.map((m) => <option key={m} value={m}>{m}</option>)}
                </Select>
              ) : undefined} />
            <Card>
              <TrendChart label={`${d.month} 받을 돈`} prevLabel="지난 달 같은 날" format={won}
                data={d.daily.map((x) => ({ label: `${Number(x.day.slice(5, 7))}/${Number(x.day.slice(8, 10))}`, value: x.payout, prev: x.prev_payout }))} />
            </Card>
            {days.length === 0 ? (
              <p className="text-label text-ink-2 mt-3">{d.month}에 구매확정된 주문이 아직 없어요</p>
            ) : (
              <Card padding="none" className="overflow-x-auto mt-3">
                <table className="w-full text-label">
                  <thead>
                    <tr className="text-ink-2 border-b border-line">
                      <th className="text-left font-medium px-4 py-2.5 whitespace-nowrap">확정일</th>
                      <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">주문</th>
                      <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">판매액</th>
                      <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap hidden sm:table-cell">쿠폰 할인</th>
                      <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap hidden sm:table-cell">배송비</th>
                      <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap hidden sm:table-cell">수수료</th>
                      <th className="text-right font-medium px-4 py-2.5 whitespace-nowrap">받을 돈</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {days.map((x) => (
                      <tr key={x.day}>
                        <td className="px-4 py-2.5 whitespace-nowrap"><TextButton onClick={() => openDay(x.day)}>{md(x.day)}</TextButton></td>
                        <td className="px-3 py-2.5 num text-right text-ink whitespace-nowrap">{n(x.orders)}</td>
                        <td className="px-3 py-2.5 num text-right text-ink whitespace-nowrap">{n(x.sales)}</td>
                        <td className="px-3 py-2.5 num text-right text-ink-2 whitespace-nowrap hidden sm:table-cell">{x.discount ? `−${n(x.discount)}` : "0"}</td>
                        <td className="px-3 py-2.5 num text-right text-ink-2 whitespace-nowrap hidden sm:table-cell">+{n(x.shipping)}</td>
                        <td className="px-3 py-2.5 num text-right text-ink-2 whitespace-nowrap hidden sm:table-cell">−{n(x.fee)}</td>
                        <td className="px-4 py-2.5 num text-right font-bold text-ink whitespace-nowrap">{n(x.payout)}</td>
                      </tr>
                    ))}
                    <tr className="bg-sunken">
                      <td className="px-4 py-2.5 font-bold text-ink whitespace-nowrap">합계</td>
                      <td className="px-3 py-2.5 num text-right text-ink whitespace-nowrap">{n(total.orders)}</td>
                      <td className="px-3 py-2.5 num text-right text-ink whitespace-nowrap">{n(total.sales)}</td>
                      <td className="px-3 py-2.5 num text-right text-ink-2 whitespace-nowrap hidden sm:table-cell">{total.discount ? `−${n(total.discount)}` : "0"}</td>
                      <td className="px-3 py-2.5 num text-right text-ink-2 whitespace-nowrap hidden sm:table-cell">+{n(total.shipping)}</td>
                      <td className="px-3 py-2.5 num text-right text-ink-2 whitespace-nowrap hidden sm:table-cell">−{n(total.fee)}</td>
                      <td className="px-4 py-2.5 num text-right font-bold text-ink whitespace-nowrap">{n(total.payout)}</td>
                    </tr>
                  </tbody>
                </table>
              </Card>
            )}
            <div className="mt-3">
              <a href={`/api/partner/settlement/export?${qs}${qs ? "&" : ""}month=${d.month}`} className={buttonClass({ variant: "secondary", size: "sm" })}>{d.month} 정산 엑셀 내려받기</a>
              <p className="text-caption text-ink-2 mt-1">요약 · 날짜별 · 주문별 시트예요. 세무·장부에 그대로 옮길 수 있어요</p>
            </div>
          </section>
        </>
      )}

      <Sheet open={!!day} onClose={() => setDay(null)} title={day ? `${md(day.day)} 구매확정된 주문` : ""}>
        {day?.status === "loading" ? <SkeletonList rows={3} thumb={false} />
          : day?.status === "error" ? (
            <EmptyState title="주문을 불러오지 못했어요" description={day.error}
              action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => openDay(day.day)}>다시 불러오기</Button>} />
          ) : day?.data && day.data.rows.length === 0 ? <EmptyState title="이날 구매확정된 주문이 없어요" description="다른 날짜를 골라 보세요" />
          : day?.data && (
            <ul className="flex flex-col divide-y divide-line">
              {day.data.rows.map((r) => (
                <li key={`${r.order}-${r.kind || "order"}`} className="py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-label font-medium text-ink">주문 <span className="num">{r.order}</span></span>
                    <span className="num text-label font-bold text-ink whitespace-nowrap">{won(r.payout)}</span>
                  </div>
                  <p className="text-caption text-ink-2 mt-0.5">
                    {r.kind === "return_fee"
                      ? <>결제 {md(r.paid_day)} · 반품을 마친 날 정산 · 주문자 환불에서 뺀 반품 배송비</>
                      : <>결제 {md(r.paid_day)}{r.delivered_day && <> · 배송 완료 {md(r.delivered_day)}</>} · {r.confirm_by === "buyer" ? "구매자가 확정" : `${d.confirm_days}일 지나 자동 확정`}</>}
                  </p>
                  {r.kind === "return_fee"
                    ? <p className="text-caption text-ink mt-1">{r.lines.map((l) => l.name.replace(/^반품 배송비 · /, "")).join(", ")}</p>
                    : <p className="text-caption text-ink mt-1">{r.lines.map((l) => `${l.name} × ${l.qty}`).join(", ")}</p>}
                  <p className="text-caption text-ink-2 mt-0.5 num">
                    {r.kind === "return_fee" ? <>반품 배송비 {n(r.shipping)}</> : <>판매 {n(r.sales)}{r.discount > 0 && <> − 쿠폰 {n(r.discount)}</>} + 배송비 {n(r.shipping)} − 수수료 {n(r.fee)}</>}
                  </p>
                </li>
              ))}
            </ul>
          )}
      </Sheet>
    </div>
  );
}
