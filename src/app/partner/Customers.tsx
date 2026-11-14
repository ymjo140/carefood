"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge, Button, Card, CardButton, EmptyState, Field, HowCounted, AsOf, ListRow, SectionHeader, Select, Sheet, SkeletonList, Skeleton,
  Tabs, timeAgo, useToast,
} from "@/components/ui";
import { STAGES, type Stage } from "@/lib/partner/customer-stages";
import { Segments } from "./Segments";
import { Coupons, type CouponRow } from "./Coupons";
import { Flows } from "./Flows";
import type { Tab } from "@/lib/partner/tabs";

type Customer = {
  code: string; stage: Stage; orders: number; canceled: number; first_at: string; last_at: string; spend: number;
  avg_gap: number | null; top: string[]; ads: boolean; coupons: number;
};
type List = { as_of: string; counts: Record<Stage, number>; total: number; ads: number; customers: Customer[] };
type Detail = Customer & {
  history: { order_id: string; at: string; amount: number; discount: number; status: string; first: boolean; lines: { name: string; quantity: number }[] }[];
  grants: { id: string; name: string; source: string; granted_at: string; expires_at: string; used_at: string | null; discount: number; status: string }[];
};
type View = "customers" | "coupons" | "flows" | "find";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const STAGE_KEYS = Object.keys(STAGES) as Stage[];
const ORDER_STATUS: Record<string, string> = { new: "새 주문", accepted: "출고 준비", shipped: "배송 중", delivered: "배송 완료", canceled: "취소" };
const GRANT_STATUS: Record<string, string> = { active: "쓸 수 있음", used: "씀", expired: "기간 끝남", revoked: "거둬들임" };
const SOURCE: Record<string, string> = { manual: "직접 줌", flow: "자동 알림", influencer: "협업" };

/**
 * 고객 탭 — 내 고객(앱에서 우리 제품을 결제한 사람) · 혜택(쿠폰) · 자동 알림 · 새 고객 찾기(고객층) (v3 10.2)
 * 사람은 업체마다 다른 가명 번호로만 보인다. 연락처·이름·건강 목표는 없고, 알림은 앱 알림으로만 간다.
 */
export function CustomersTab({ qs, go, prefill }: { qs: string; go: (tab: Tab, opts?: { filter?: string; need?: string; goal?: string }) => void; prefill: { need?: string; goal?: string } | null }) {
  const [view, setView] = useState<View>(prefill ? "find" : "customers");
  const [coupons, setCoupons] = useState<{ status: "loading" | "error" | "done"; list: CouponRow[]; readOnly: boolean }>({ status: "loading", list: [], readOnly: true });
  const cSeq = useRef(0);
  // 쿠폰 목록은 고객 화면(혜택 주기)·혜택·자동 알림이 같이 쓴다 — 만들기·주기·멈추기 뒤에 다시 불러온다
  const loadCoupons = useCallback(async () => {
    const my = ++cSeq.current;
    try {
      const r = await fetch(`/api/partner/coupons?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (my === cSeq.current) setCoupons({ status: "done", list: d.coupons, readOnly: d.read_only });
    } catch { if (my === cSeq.current) setCoupons((c) => ({ ...c, status: "error" })); } // 화면마다 쿠폰 실패 상태를 그린다
  }, [qs]);
  useEffect(() => { loadCoupons(); }, [loadCoupons]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  return (
    <div className="flex flex-col gap-6">
      <Tabs<View> value={view} onChange={setView} label="고객 보기"
        items={[{ value: "customers", label: "내 고객" }, { value: "coupons", label: "혜택" }, { value: "flows", label: "자동 알림" }, { value: "find", label: "새 고객 찾기" }]} />
      {view === "customers" && <MyCustomers qs={qs} coupons={coupons} onCoupons={loadCoupons} toCoupons={() => setView("coupons")} />}
      {view === "coupons" && <Coupons qs={qs} state={coupons} reload={loadCoupons} />}
      {view === "flows" && <Flows qs={qs} coupons={coupons} toCoupons={() => setView("coupons")} />}
      {view === "find" && <Segments qs={qs} go={go} prefill={prefill} />}
    </div>
  );
}

function MyCustomers({ qs, coupons, onCoupons, toCoupons }: {
  qs: string; coupons: { status: string; list: CouponRow[]; readOnly: boolean }; onCoupons: () => void; toCoupons: () => void;
}) {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data?: List; error?: string }>({ status: "loading" });
  const [stage, setStage] = useState<Stage | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ status: "loading" | "error" | "done"; data?: Detail; error?: string }>({ status: "loading" });
  const [give, setGive] = useState<{ stage?: Stage; code?: string } | null>(null);
  const [couponId, setCouponId] = useState("");
  const [busy, setBusy] = useState(false);
  const seq = useRef(0), dSeq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const r = await fetch(`/api/partner/customers?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (my === seq.current) setState({ status: "done", data: d });
    } catch (e) { if (my === seq.current) setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const loadDetail = useCallback(async (code: string) => {
    const my = ++dSeq.current; // 다른 고객을 빨리 열면 늦게 온 앞 응답을 버린다
    setDetail({ status: "loading" });
    try {
      const r = await fetch(`/api/partner/customers/${code}?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (my === dSeq.current) setDetail({ status: "done", data: d });
    } catch (e) { if (my === dSeq.current) setDetail({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);
  const openCustomer = (code: string) => { setOpen(code); loadDetail(code); };

  const active = coupons.list.filter((c) => c.status === "active");
  const grant = async () => {
    if (!give || !couponId) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/partner/coupons/${couponId}?${qs}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "grant", ...(give.code ? { codes: [give.code] } : { stage: give.stage }) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.show(`쿠폰을 ${d.granted}명에게 줬어요${d.skipped ? ` · 이미 가진 ${d.skipped}명은 건너뛰었어요` : ""}${d.notified ? ` · ${d.notified}명에게 알렸어요` : ""}`);
      setGive(null); setCouponId("");
      load(); onCoupons();
      if (open) loadDetail(open);
    } catch (e) {
      toast.show(`${(e as Error).message || "쿠폰을 주지 못했어요. 다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setBusy(false); }
  };

  if (state.status === "loading") return <div className="flex flex-col gap-4"><div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div><SkeletonList rows={4} thumb={false} /></div>;
  if (state.status === "error" || !state.data) return (
    <EmptyState title="고객을 불러오지 못했어요" description={state.error}
      action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(); }}>다시 불러오기</Button>} />
  );
  const d = state.data;
  if (d.total === 0) return <EmptyState title="아직 앱에서 우리 제품을 산 고객이 없어요" description="앱 주문이 들어오면 주문 횟수와 마지막 주문으로 고객을 나눠 보여 드려요. 그 전에는 '새 고객 찾기'에서 알릴 수 있어요" />;
  const list = stage ? d.customers.filter((c) => c.stage === stage) : d.customers;

  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionHeader title={<>내 고객 <span className="num text-ink-2 font-regular">{d.total}</span>명</>}
          description={<>혜택 알림을 받는 고객 <span className="num">{d.ads}</span>명 — 광고 수신에 동의한 사람에게만 알림이 가요</>} />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {STAGE_KEYS.map((k) => (
            <CardButton key={k} onClick={() => setStage(stage === k ? null : k)} aria-pressed={stage === k}
              className={stage === k ? "border-brand-ink bg-brand-soft" : undefined}>
              <p className="text-label font-medium text-ink">{STAGES[k].label}</p>
              <p className="num text-title font-bold text-ink mt-1">{d.counts[k]}<span className="text-label font-medium text-ink-2 ml-0.5">명</span></p>
              <p className="text-caption text-ink-2 mt-1">{STAGES[k].todo}</p>
            </CardButton>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <HowCounted>
            앱에서 결제한 주문 중 우리 묶음이 통째로 취소되지 않은 것을 세요. {STAGE_KEYS.map((k) => `${STAGES[k].label}: ${STAGES[k].rule}`).join(" · ")}. 날짜는 한국 시간이에요
          </HowCounted>
          <AsOf at={d.as_of} />
        </div>
      </section>

      <section>
        <SectionHeader title={stage ? `${STAGES[stage].label} 고객` : "모든 고객"} description={stage ? STAGES[stage].rule : "마지막 주문이 최근인 순서"}
          action={stage && !coupons.readOnly ? <Button size="sm" variant="secondary" disabled={list.length === 0} onClick={() => setGive({ stage })}>이 고객들에게 혜택 주기</Button> : undefined} />
        {list.length === 0 ? <EmptyState title="이 단계 고객이 없어요" description="다른 단계를 눌러 보세요" /> : (
          <Card padding="none">
            <ul className="divide-y divide-line">
              {list.slice(0, 300).map((c) => (
                <li key={c.code}>
                  <ListRow onClick={() => openCustomer(c.code)}
                    title={<span className="flex flex-wrap items-center gap-2"><span className="num">고객 {c.code}</span><Badge tone={c.stage === "first" ? "brand" : "neutral"}>{STAGES[c.stage].label}</Badge></span>}
                    meta={<>주문 <span className="num">{c.orders}</span>번 · 마지막 {timeAgo(c.last_at)} · <span className="num">{won(c.spend)}</span>{c.top[0] ? ` · ${c.top[0]}` : ""}</>}
                    trailing={<span className="text-caption text-ink-2 whitespace-nowrap">{c.ads ? "알림 받음" : "알림 안 받음"}{c.coupons ? ` · 쿠폰 ${c.coupons}` : ""}</span>} />
                </li>
              ))}
            </ul>
          </Card>
        )}
        {list.length > 300 && <p className="text-caption text-ink-2 mt-2">최근 300명까지 보여요. 단계를 눌러 좁혀 보세요</p>}
      </section>

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? `고객 ${open}` : ""} size="lg"
        footer={detail.status === "done" && !coupons.readOnly ? <Button block variant="secondary" onClick={() => setGive({ code: open! })}>이 고객에게 혜택 주기</Button> : undefined}>
        {detail.status === "loading" ? <SkeletonList rows={3} thumb={false} /> : detail.status === "error" || !detail.data ? (
          <EmptyState title="고객을 불러오지 못했어요" description={detail.error}
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => open && loadDetail(open)}>다시 불러오기</Button>} />
        ) : <CustomerDetail d={detail.data} />}
      </Sheet>

      <Sheet open={!!give} onClose={() => setGive(null)} title="혜택 주기" size="sm"
        description={give?.code ? `고객 ${give.code}에게 쿠폰을 줘요` : give?.stage ? `${STAGES[give.stage].label} 고객 ${d.counts[give.stage]}명에게 쿠폰을 줘요` : undefined}
        footer={active.length ? <><Button variant="secondary" block onClick={() => setGive(null)}>취소</Button><Button block loading={busy} disabled={!couponId} onClick={grant}>쿠폰 주기</Button></> : undefined}>
        {coupons.status === "loading" ? <Skeleton className="h-11 w-full" /> : coupons.status === "error" ? (
          <EmptyState title="쿠폰을 불러오지 못했어요" action={<Button size="sm" variant="secondary" icon="refresh" onClick={onCoupons}>다시 불러오기</Button>} />
        ) : active.length === 0 ? (
          <EmptyState title="줄 수 있는 쿠폰이 없어요" description="혜택에서 쿠폰을 먼저 만들어요" action={<Button size="sm" variant="secondary" onClick={() => { setGive(null); setOpen(null); toCoupons(); }}>쿠폰 만들기</Button>} />
        ) : (
          <div className="flex flex-col gap-3">
            <Field label="쿠폰">
              <Select value={couponId} onChange={(e) => setCouponId(e.target.value)}>
                <option value="">쿠폰 고르기</option>
                {active.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.text} · {c.valid_days}일</option>)}
              </Select>
            </Field>
            <p className="text-caption text-ink-2">
              쿠폰은 모두 받고, 결제할 때 저절로 쓰여요. 받았다는 알림은 광고라 광고 수신에 동의한 고객에게만 가고, 밤 9시~아침 8시에는 야간 수신에 동의한 고객에게만 가요.
              이미 같은 쿠폰을 가진 고객은 건너뛰어요
            </p>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function CustomerDetail({ d }: { d: Detail }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-3">
        <div><p className="text-caption text-ink-2">주문</p><p className="num text-title font-bold text-ink">{d.orders}<span className="text-label text-ink-2 font-medium">번</span></p></div>
        <div><p className="text-caption text-ink-2">누적 금액</p><p className="num text-title font-bold text-ink whitespace-nowrap">{d.spend.toLocaleString("ko-KR")}<span className="text-label text-ink-2 font-medium">원</span></p></div>
        <div><p className="text-caption text-ink-2">주문 간격</p><p className="num text-title font-bold text-ink">{d.avg_gap ?? "—"}<span className="text-label text-ink-2 font-medium">{d.avg_gap !== null ? "일" : ""}</span></p></div>
      </div>
      <p className="text-label text-ink-2">
        {STAGES[d.stage].label} · 첫 주문 {new Date(d.first_at).toLocaleDateString("ko-KR")} · 마지막 주문 {timeAgo(d.last_at)} · {d.ads ? "혜택 알림을 받아요" : "혜택 알림을 받지 않아요 (쿠폰은 결제할 때 쓰여요)"}
        {d.top.length > 0 && <> · 자주 산 제품 {d.top.join(", ")}</>}
      </p>
      <section>
        <p className="text-label font-bold text-ink mb-2">주문 이력</p>
        <ul className="divide-y divide-line border-y border-line">
          {d.history.map((o) => (
            <li key={o.order_id} className="py-2.5 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-label text-ink flex flex-wrap items-center gap-2">
                  {new Date(o.at).toLocaleDateString("ko-KR")} · {ORDER_STATUS[o.status] || o.status}{o.first && <Badge tone="brand">첫 주문</Badge>}
                </p>
                <p className="text-caption text-ink-2 mt-0.5">{o.lines.map((l) => `${l.name} ×${l.quantity}`).join(", ") || "—"}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="num text-label text-ink whitespace-nowrap">{(o.amount - o.discount).toLocaleString("ko-KR")}원</p>
                {o.discount > 0 && <p className="num text-caption text-ink-2 whitespace-nowrap">쿠폰 −{o.discount.toLocaleString("ko-KR")}원</p>}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <p className="text-label font-bold text-ink mb-2">받은 혜택</p>
        {d.grants.length === 0 ? <p className="text-label text-ink-2">아직 준 쿠폰이 없어요</p> : (
          <ul className="divide-y divide-line border-y border-line">
            {d.grants.map((g) => (
              <li key={g.id} className="py-2.5 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-label text-ink">{g.name}</p>
                  <p className="text-caption text-ink-2 mt-0.5">{SOURCE[g.source] || g.source} · {timeAgo(g.granted_at)} 줌 · {new Date(g.expires_at).toLocaleDateString("ko-KR")}까지</p>
                </div>
                <span className="text-caption text-ink-2 whitespace-nowrap">{GRANT_STATUS[g.status] || g.status}{g.status === "used" && g.discount ? ` · −${g.discount.toLocaleString("ko-KR")}원` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
