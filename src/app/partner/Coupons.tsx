"use client";

import { useState } from "react";
import { Badge, Button, Card, ChoiceList, ConfirmSheet, EmptyState, Field, Input, ListRow, Notice, SectionHeader, Sheet, SkeletonList, TextButton, useToast } from "@/components/ui";
import { COUPON_KIND, couponText, type Coupon, type CouponKind } from "@/lib/partner/coupon-text";

export type CouponRow = Coupon & { text: string; granted: number; used: number; discount: number };
type State = { status: "loading" | "error" | "done"; list: CouponRow[]; readOnly: boolean };

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const blank = { name: "", kind: "amount" as CouponKind, value: "3000", max_discount: "", min_order: "20000", valid_days: "14" };
type Form = typeof blank & { id?: string; locked?: boolean };
/** 쿠폰 → 고치기 칸 (copy 면 새로 만들 복사본) */
const formOf = (c: CouponRow, copy: boolean): Form => ({
  ...(copy ? {} : { id: c.id, locked: c.granted > 0 }),
  name: copy ? `${c.name} 복사`.slice(0, 30) : c.name, kind: c.kind, value: String(c.value),
  max_discount: c.max_discount ? String(c.max_discount) : "", min_order: String(c.min_order), valid_days: String(c.valid_days),
});

/**
 * 혜택 — 업체가 만드는 쿠폰 (v3 10.2). 정액·정률·무료배송, 최소 주문 금액, 쓸 수 있는 날 수.
 * 업체 부담이라 정산에서 판매액에서 빠진다. 결제할 때 업체 묶음마다 할인이 가장 큰 하나가 저절로 쓰인다.
 * 만들기·고치기·멈추기 뒤에 쿠폰 목록을 다시 불러온다(reload) — 고객 화면의 '혜택 주기'도 같은 목록을 쓴다.
 * 고치기: 아직 아무에게도 안 준 쿠폰은 모든 칸, 이미 준 쿠폰은 이름만 (받은 사람의 할인이 바뀌지 않게). 금액은 복사해서 새로 만든다.
 */
export function Coupons({ qs, state, reload }: { qs: string; state: State; reload: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [stop, setStop] = useState<CouponRow | null>(null);

  const preview = form ? couponText({ kind: form.kind, value: Number(form.value) || 0, max_discount: form.max_discount ? Number(form.max_discount) : null, min_order: Number(form.min_order) || 0 }) : "";
  const create = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const { id, locked, ...body } = form;
      void locked;
      const r = await fetch(id ? `/api/partner/coupons/${id}?${qs}` : `/api/partner/coupons?${qs}`, { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.show(id ? "쿠폰을 고쳤어요" : "쿠폰을 만들었어요. 내 고객에서 단계나 고객을 골라 줄 수 있어요");
      setForm(null);
      reload();
    } catch (e) {
      toast.show(`${(e as Error).message || (form.id ? "쿠폰을 고치지 못했어요. 다시 시도해 주세요" : "쿠폰을 만들지 못했어요. 다시 시도해 주세요")}`, { tone: "danger" });
    } finally { setBusy(false); }
  };
  const doStop = async () => {
    if (!stop) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/partner/coupons/${stop.id}?${qs}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stop" }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.show("쿠폰을 멈췄어요. 이미 준 쿠폰은 기간까지 쓸 수 있어요");
      setStop(null);
    } catch (e) {
      toast.show(`${(e as Error).message || "멈추지 못했어요. 다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setBusy(false); reload(); }
  };

  return (
    <section>
      <SectionHeader title="혜택" description="내 고객에게 주는 쿠폰이에요. 할인은 업체 부담이라 정산에서 빠지고, 결제할 때 저절로 쓰여요"
        action={!state.readOnly ? <Button size="sm" onClick={() => setForm({ ...blank })}>쿠폰 만들기</Button> : undefined} />
      {state.status === "loading" ? <SkeletonList rows={2} thumb={false} /> : state.status === "error" ? (
        <EmptyState title="쿠폰을 불러오지 못했어요" action={<Button size="sm" variant="secondary" icon="refresh" onClick={reload}>다시 불러오기</Button>} />
      ) : state.list.length === 0 ? (
        <EmptyState title="아직 만든 쿠폰이 없어요" description="첫 주문 감사, 재구매, 다시 찾아 주세요처럼 고객 단계에 맞는 쿠폰을 만들어 보세요"
          action={!state.readOnly ? <Button size="sm" variant="secondary" onClick={() => setForm({ ...blank })}>쿠폰 만들기</Button> : undefined} />
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-line">
            {state.list.map((c) => (
              <li key={c.id}>
                <ListRow
                  title={<span className="flex flex-wrap items-center gap-2">{c.name}{c.status === "stopped" && <Badge tone="neutral">멈춤</Badge>}</span>}
                  meta={<>{c.text} · 받은 날부터 <span className="num">{c.valid_days}</span>일 · 줌 <span className="num">{c.granted}</span> · 씀 <span className="num">{c.used}</span>
                    {c.granted > 0 && <> (<span className="num">{Math.round((c.used / c.granted) * 100)}</span>%)</>} · 할인 <span className="num">{won(c.discount)}</span></>}
                  trailing={!state.readOnly ? (
                    <span className="flex items-center gap-3">
                      <TextButton onClick={() => setForm(formOf(c, false))}>고치기</TextButton>
                      <TextButton onClick={() => setForm(formOf(c, true))}>복사</TextButton>
                      {c.status === "active" && <TextButton onClick={() => setStop(c)}>멈추기</TextButton>}
                    </span>
                  ) : undefined} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Sheet open={!!form} onClose={() => setForm(null)} title={form?.id ? "쿠폰 고치기" : "쿠폰 만들기"}
        footer={<><Button variant="secondary" block onClick={() => setForm(null)}>취소</Button><Button block loading={busy} onClick={create}>{form?.id ? "저장하기" : "만들기"}</Button></>}>
        {form && (
          <div className="flex flex-col gap-4">
            {form.locked && <Notice>이미 고객에게 준 쿠폰이라 이름만 고칠 수 있어요. 금액·조건을 바꾸려면 목록의 &lsquo;복사&rsquo;로 새로 만들어 주세요</Notice>}
            <Field label="쿠폰 이름" hint="고객에게 보이는 이름 (2~30자)">
              <Input value={form.name} maxLength={30} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 두 번째 주문 감사 쿠폰" />
            </Field>
            <fieldset disabled={form.locked} className="flex flex-col gap-4 disabled:opacity-40">
            <Field label="혜택 종류">
              <ChoiceList<CouponKind> value={form.kind} onChange={(k) => setForm({ ...form, kind: k })}
                options={(Object.keys(COUPON_KIND) as CouponKind[]).map((k) => ({ value: k, label: COUPON_KIND[k] }))} />
            </Field>
            {form.kind === "amount" && (
              <Field label="할인 금액(원)" hint="500원~10만 원"><Input inputMode="numeric" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value.replace(/\D/g, "") })} /></Field>
            )}
            {form.kind === "percent" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="할인율(%)" hint="1~50%"><Input inputMode="numeric" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value.replace(/\D/g, "") })} /></Field>
                <Field label="최대 할인(원)" hint="비우면 제한 없음"><Input inputMode="numeric" value={form.max_discount} onChange={(e) => setForm({ ...form, max_discount: e.target.value.replace(/\D/g, "") })} /></Field>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="최소 주문(원)" hint="우리 제품 상품 금액 기준"><Input inputMode="numeric" value={form.min_order} onChange={(e) => setForm({ ...form, min_order: e.target.value.replace(/\D/g, "") })} /></Field>
              <Field label="쓸 수 있는 날 수" hint="받은 날부터 1~90일"><Input inputMode="numeric" value={form.valid_days} onChange={(e) => setForm({ ...form, valid_days: e.target.value.replace(/\D/g, "") })} /></Field>
            </div>
            </fieldset>
            <p className="text-label text-ink-2">고객에게는 &ldquo;{form.name || "쿠폰 이름"} — {preview}&rdquo;로 보여요</p>
          </div>
        )}
      </Sheet>

      <ConfirmSheet open={!!stop} onClose={() => setStop(null)} onConfirm={doStop} loading={busy}
        title={`${stop?.name || "쿠폰"}을 멈출까요?`} description="더 이상 줄 수 없고 자동 알림에서도 빠져요. 이미 준 쿠폰은 기간까지 쓸 수 있어요" confirmLabel="멈추기" />
    </section>
  );
}
