"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, EmptyState, Input, SectionHeader, SkeletonList, useToast } from "@/components/ui";
import type { PayoutItem, Unclosed } from "@/lib/partner/payout-queue";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
type Data = { items: PayoutItem[]; unclosed: Unclosed[]; month: string };

/**
 * 지급 대기열 — 업체 전체에서 마감했지만 정산을 끝내지 않은 달을 지급일 순으로. 실제 보낸 금액을 적고 '정산 끝내기'.
 * 지난 달을 아직 마감하지 못한 업체(수수료율 없음 등)는 위에 따로 — 고친 뒤 여기서 마감한다
 */
export function AdminPayouts({ refresh = 0 }: { refresh?: number }) {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data?: Data; error?: string }>({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [paid, setPaid] = useState<Record<string, string>>({});
  const seq = useRef(0);
  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const r = await fetch("/api/admin/partners/payouts");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (my === seq.current) setState({ status: "done", data: d });
    } catch (e) { if (my === seq.current) setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, []);
  useEffect(() => { load(); }, [load, refresh]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const act = async (partnerId: string, month: string, action: "close" | "paid") => {
    const key = `${partnerId}:${month}`;
    setBusy(key);
    try {
      const amt = (paid[key] || "").replace(/[^\d-]/g, "");
      const r = await fetch("/api/admin/partners/settlements", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partner_id: partnerId, month, action, ...(action === "paid" && amt ? { paid_amount: Number(amt) } : {}) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error);
      toast.show(action === "close" ? `${month} 정산을 마감했어요` : `${month} 정산을 끝냈어요`);
      await load();
    } catch (e) {
      toast.show(`${action === "close" ? "마감" : "정산을 끝내"}하지 못했어요. ${(e as Error).message || "다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setBusy(null); }
  };

  const d = state.data;
  const total = d ? d.items.reduce((s, i) => s + Math.max(0, i.net), 0) : 0;
  return (
    <section className="mt-10">
      <SectionHeader title="지급 대기" description="마감했지만 정산을 끝내지 않은 달 · 지급일은 다음 달 10일"
        action={d && d.items.length > 0 ? <span className="text-caption text-ink-2">보낼 돈 <span className="num font-bold text-ink">{won(total)}</span></span> : undefined} />
      {state.status === "loading" ? <SkeletonList rows={2} thumb={false} />
        : state.status === "error" || !d ? (
          <EmptyState title="지급 대기를 불러오지 못했어요" description={state.error}
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(); }}>다시 불러오기</Button>} />
        ) : (
          <>
            {d.unclosed.length > 0 && (
              <div className="mb-4">
                <p className="text-label font-medium text-ink mb-1"><span className="num">{d.month}</span> 아직 마감하지 못한 업체 <span className="num">{d.unclosed.length}</span>곳</p>
                <ul className="divide-y divide-line">
                  {d.unclosed.map((u) => (
                    <li key={u.partner_id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 text-label">
                        <span className="text-ink">{u.name}</span>
                        {u.reason ? <span className="block text-caption text-danger">{u.reason}</span>
                          : u.net !== null && <span className="block text-caption text-ink-2">미리 센 금액 <span className="num">{won(u.net)}</span></span>}
                      </span>
                      <Button size="sm" variant="secondary" loading={busy === `${u.partner_id}:${u.month}`} onClick={() => act(u.partner_id, u.month, "close")}>마감하기</Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {d.items.length === 0 ? (
              <EmptyState title="정산을 끝낼 달이 없어요" description="달을 마감하면 지급일 순으로 여기 모여요. 지난 달은 1일에 저절로 마감해요" />
            ) : (
              <ul className="divide-y divide-line">
                {d.items.map((i) => {
                  const key = `${i.partner_id}:${i.month}`;
                  const noBank = i.net > 0 && !i.bank.account;
                  return (
                    <li key={key} className="py-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-label text-ink flex flex-wrap items-center gap-x-2">
                          <span className="font-bold">{i.name}</span>
                          <span className="num">{i.month}</span>
                          <span className={i.overdue ? "text-danger" : "text-ink-2"}>지급일 <span className="num">{i.pay_date}</span>{i.overdue && " · 지났어요"}</span>
                          {i.auto_closed && <Badge>자동 마감</Badge>}
                        </p>
                        <p className="text-caption text-ink-2 mt-0.5">
                          {i.net >= 0 ? "보낼 돈" : "받을 돈"} <span className="num font-bold text-ink">{won(Math.abs(i.net))}</span>
                          {" "}(앱 주문 대금 <span className="num">{won(i.order_payout)}</span> − 구매 링크 수수료 <span className="num">{won(i.commission)}</span>)
                        </p>
                        <p className={`text-caption mt-0.5 ${noBank ? "text-danger" : "text-ink-2"}`}>
                          {i.bank.account ? <>{i.bank.name || "은행 없음"} · {i.bank.holder || "예금주 없음"} · <span className="num">{i.bank.account}</span></> : "정산 계좌를 아직 받지 못했어요"}
                          {i.tax_email && <> · 세금계산서 {i.tax_email}</>}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input aria-label={`${i.name} ${i.month} 실제 보낸 금액`} inputMode="numeric" className="num w-40" placeholder={`보낸 금액 ${i.net.toLocaleString("ko-KR")}`}
                          value={paid[key] || ""} onChange={(e) => setPaid({ ...paid, [key]: e.target.value.replace(/[^\d,-]/g, "") })} />
                        <Button size="sm" variant="secondary" loading={busy === key} onClick={() => act(i.partner_id, i.month, "paid")}>정산 끝내기</Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
    </section>
  );
}
