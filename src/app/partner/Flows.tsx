"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, EmptyState, Field, Input, Notice, SectionHeader, Select, Sheet, SkeletonList, Switch, Textarea, useToast } from "@/components/ui";
import type { CouponRow } from "./Coupons";

type Flow = {
  kind: "first_thanks" | "replenish" | "winback"; is_on: boolean; coupon_id: string | null; title: string; body: string; delay_days: number;
  updated_at: string | null; label: string; when: string; sent_30: number;
};
const DAYS_LABEL: Record<Flow["kind"], string> = { first_thanks: "도착하고 며칠 뒤", replenish: "한 번만 산 고객은 며칠 뒤", winback: "마지막 주문 뒤 며칠" };

/**
 * 자동 알림 — 첫 주문 감사 · 다시 살 때 · 다시 찾아 주세요 (v3 10.2)
 * 켜 두면 30분마다 조건이 된 고객에게 한 번씩 간다. 광고라 광고 수신 동의자에게만, 같은 업체 알림은 한 사람에게 7일에 한 번.
 * 켜고 끄기·고치기 뒤에 목록을 다시 불러온다.
 */
export function Flows({ qs, coupons, toCoupons }: { qs: string; coupons: { status: string; list: CouponRow[] }; toCoupons: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; flows?: Flow[]; readOnly?: boolean; ready?: boolean; error?: string }>({ status: "loading" });
  const [edit, setEdit] = useState<Flow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const r = await fetch(`/api/partner/flows?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (my === seq.current) setState({ status: "done", flows: d.flows, readOnly: d.read_only, ready: d.ready });
    } catch (e) { if (my === seq.current) setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const save = async (f: Flow) => {
    setBusy(f.kind);
    try {
      const r = await fetch(`/api/partner/flows?${qs}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: f.kind, is_on: f.is_on, title: f.title, body: f.body, delay_days: f.delay_days, coupon_id: f.coupon_id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.show(f.is_on ? `${f.label} 알림을 켰어요` : `${f.label} 알림을 저장했어요`);
      setEdit(null);
      load();
    } catch (e) {
      toast.show(`${(e as Error).message || "저장하지 못했어요. 다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setBusy(null); }
  };

  const active = coupons.list.filter((c) => c.status === "active");
  const nameOf = (id: string | null) => coupons.list.find((c) => c.id === id)?.name;
  return (
    <section>
      <SectionHeader title="자동 알림" description="켜 두면 조건이 된 고객에게 한 번씩 저절로 가요. 광고 수신에 동의한 고객에게만, 같은 업체 알림은 7일에 한 번" />
      {state.status === "loading" ? <SkeletonList rows={3} thumb={false} /> : state.status === "error" ? (
        <EmptyState title="자동 알림을 불러오지 못했어요" description={state.error}
          action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(); }}>다시 불러오기</Button>} />
      ) : !state.ready ? (
        <EmptyState title="자동 알림을 준비하고 있어요" description="준비가 끝나면 여기에서 켤 수 있어요" />
      ) : (
        <div className="flex flex-col gap-3">
          {(state.flows || []).map((f) => (
            <Card key={f.kind}>
              <Switch checked={f.is_on} disabled={state.readOnly || busy === f.kind} label={f.label}
                description={`${f.when} · 지난 30일 ${f.sent_30}명에게 보냄`} onChange={(on) => save({ ...f, is_on: on })} />
              <div className="mt-2 pt-3 border-t border-line flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-label text-ink">{f.title}</p>
                  <p className="text-caption text-ink-2 mt-0.5">{f.body}</p>
                  <p className="text-caption text-ink-2 mt-1">
                    {DAYS_LABEL[f.kind]} <span className="num">{f.delay_days}</span>일 · {f.coupon_id ? `쿠폰: ${nameOf(f.coupon_id) || "고른 쿠폰"}` : "쿠폰 없음"}
                  </p>
                </div>
                {!state.readOnly && <Button size="sm" variant="secondary" onClick={() => setEdit({ ...f })}>고치기</Button>}
              </div>
            </Card>
          ))}
          <Notice>앞에 (광고)와 업체 이름, 끝에 받지 않는 방법이 저절로 붙어요. 밤 9시~아침 8시에는 야간 수신에 동의한 고객에게만 가요</Notice>
        </div>
      )}

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit ? `${edit.label} 고치기` : ""}
        footer={<><Button variant="secondary" block onClick={() => setEdit(null)}>취소</Button><Button block loading={!!edit && busy === edit.kind} onClick={() => edit && save(edit)}>저장하기</Button></>}>
        {edit && (
          <div className="flex flex-col gap-4">
            <Field label="제목" hint="30자까지"><Input value={edit.title} maxLength={30} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="본문" hint="120자까지 · 효능·질병 표현은 쓸 수 없어요"><Textarea value={edit.body} maxLength={120} rows={3} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></Field>
            <Field label={`${DAYS_LABEL[edit.kind]} (일)`} hint="1~180일">
              <Input inputMode="numeric" value={String(edit.delay_days)} onChange={(e) => setEdit({ ...edit, delay_days: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
            </Field>
            <Field label="같이 줄 쿠폰" hint={active.length ? "알림과 함께 쿠폰을 줘요" : undefined}>
              {active.length ? (
                <Select value={edit.coupon_id || ""} onChange={(e) => setEdit({ ...edit, coupon_id: e.target.value || null })}>
                  <option value="">쿠폰 없이</option>
                  {active.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.text}</option>)}
                </Select>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-label text-ink-2">만든 쿠폰이 없어요</span>
                  <Button size="sm" variant="secondary" onClick={() => { setEdit(null); toCoupons(); }}>쿠폰 만들기</Button>
                </div>
              )}
            </Field>
          </div>
        )}
      </Sheet>
    </section>
  );
}
