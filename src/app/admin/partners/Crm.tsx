"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Notice, SectionHeader, Select, SkeletonList, Textarea, timeAgo, useToast } from "@/components/ui";

type Hit = { phrase: string; why: string; suggest?: string };
type Campaign = {
  id: string; partner_id: string; title: string; body: string; send_at: string; night: boolean; status: "review" | "sending";
  estimate_count: number; held_amount: number; unit_price: number; created_at: string; summary: string; hits: Hit[];
  preview: { title: string; body: string }; partners: { name: string } | null; products: { name: string } | null;
};
type Topup = { id: string; partner_id: string; amount: number; note: string | null; created_at: string; partners: { name: string } | null };
type PartnerPrice = { id: string; name: string; crm_unit_price: number | null; balance: number };
type Data = { ready: boolean; campaigns: Campaign[]; topups: Topup[]; partners: PartnerPrice[] };
const won = (v: number) => `${v.toLocaleString("ko-KR")}원`;
const when = (iso: string) => new Date(iso).toLocaleString("ko-KR", { month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" });

/**
 * 관리자 — 고객층 발송 검수 · 충전 입금 확인 · 업체별 건당 발송비 (v3 7.5·8장)
 * 검수 기준: 질병·효능 표현, 체험기·전문가 추천, 발송 빈도. 반려하면 잡아 둔 발송비가 돌아간다.
 */
export function AdminCrm() {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data?: Data; error?: string }>({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [price, setPrice] = useState<{ partner: string; value: string }>({ partner: "", value: "" });

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/partners/crm");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setState({ status: "done", data: d });
    } catch (e) { setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, []);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const act = async (key: string, body: Record<string, unknown>, done: string) => {
    setBusy(key);
    try {
      const r = await fetch("/api/admin/partners/crm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error);
      toast.show(d.note ? `${done}. ${d.note}` : done);
      load();
    } catch (e) { toast.show(`처리하지 못했어요. ${(e as Error).message}`, { tone: "danger" }); }
    finally { setBusy(null); }
  };

  if (state.status === "loading") return <section className="mt-10"><SectionHeader title="고객층 발송" /><SkeletonList rows={2} thumb={false} /></section>;
  if (state.status === "error" || !state.data) {
    return (
      <section className="mt-10">
        <SectionHeader title="고객층 발송" />
        <EmptyState title="고객층 발송을 불러오지 못했어요" description={state.error}
          action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(); }}>다시 불러오기</Button>} />
      </section>
    );
  }
  const d = state.data;
  if (!d.ready) {
    return (
      <section className="mt-10">
        <SectionHeader title="고객층 발송" />
        <Notice icon="info">고객층 표가 아직 없어요. 마이그레이션 20261114_partner_crm.sql 을 적용하면 열려요</Notice>
      </section>
    );
  }
  const chosen = d.partners.find((p) => p.id === price.partner);

  return (
    <section className="mt-10 flex flex-col gap-6">
      <div>
        <SectionHeader title="고객층 발송 검수" action={<span className="text-caption text-ink-2"><span className="num">{d.campaigns.filter((c) => c.status === "review").length}</span>건</span>} />
        {d.campaigns.length === 0 ? (
          <EmptyState title="검수할 발송이 없어요" description="업체가 고객층 발송을 요청하면 여기 모여요" />
        ) : (
          <div className="flex flex-col gap-3">
            {d.campaigns.map((c) => (
              <Card key={c.id}>
                <div className="flex items-start gap-3">
                  <span className="flex-1 min-w-0">
                    <span className="block text-body font-bold text-ink">{c.partners?.name} · {c.title}</span>
                    <span className="block text-caption text-ink-2">{when(c.send_at)}{c.night ? " · 밤(야간 동의자만)" : ""} · 약 <span className="num">{c.estimate_count.toLocaleString("ko-KR")}</span>명 · 잡아 둔 {won(c.held_amount)} · {timeAgo(c.created_at)} 요청</span>
                    <span className="block text-caption text-ink-2">조건: {c.summary} · 누르면 {c.products?.name || "제품 없음"}</span>
                  </span>
                  <Badge tone={c.status === "sending" ? "danger" : "neutral"}>{c.status === "sending" ? "보내다 멈춤" : "검수 중"}</Badge>
                </div>
                <Card tone="sunken" className="mt-3">
                  <p className="text-label font-bold text-ink">{c.preview.title}</p>
                  <p className="text-label text-ink whitespace-pre-line">{c.preview.body}</p>
                </Card>
                {c.hits.length > 0 && (
                  <Notice tone="caution" className="mt-3" title="확인이 필요한 표현">
                    <ul>{c.hits.map((h) => <li key={h.phrase}>&lsquo;{h.phrase}&rsquo; — {h.why}</li>)}</ul>
                  </Notice>
                )}
                {c.status === "sending" ? (
                  <p className="text-label text-ink-2 mt-3">보내는 도중 멈춘 발송이에요. 두 번 나가지 않게 자동으로 다시 보내지 않아요. 받은 기록(campaign_recipients)을 확인한 뒤 처리해 주세요</p>
                ) : (
                  <div className="flex flex-wrap items-end gap-2 mt-3">
                    <Field label="반려 사유" className="flex-1 min-w-48">
                      <Textarea rows={1} value={notes[c.id] || ""} placeholder="예: '혈당 관리'는 질병 효능으로 읽혀요. '당류 3g'처럼 바꿔 주세요"
                        onChange={(e) => setNotes((m) => ({ ...m, [c.id]: e.target.value }))} />
                    </Field>
                    <Button variant="secondary" loading={busy === `r-${c.id}`} disabled={!notes[c.id]?.trim()}
                      onClick={() => act(`r-${c.id}`, { action: "reject", id: c.id, note: notes[c.id] }, "반려했어요. 발송비를 돌려줬어요")}>반려하기</Button>
                    <Button loading={busy === `a-${c.id}`} onClick={() => act(`a-${c.id}`, { action: "approve", id: c.id }, "승인했어요")}>승인하기</Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionHeader title="충전 입금 확인" />
        {d.topups.length === 0 ? (
          <EmptyState title="확인할 충전이 없어요" description="업체가 충전을 신청하면 여기 모여요. 입금을 확인한 뒤 반영해 주세요" />
        ) : (
          <Card padding="none" className="divide-y divide-line">
            {d.topups.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="flex-1 min-w-0">
                  <span className="block text-body text-ink">{t.partners?.name} · <span className="num font-bold">{won(t.amount)}</span></span>
                  <span className="block text-caption text-ink-2">{timeAgo(t.created_at)} 신청</span>
                </span>
                <Button size="sm" variant="ghost" loading={busy === `c-${t.id}`} onClick={() => act(`c-${t.id}`, { action: "topup_cancel", id: t.id }, "충전 신청을 취소했어요")}>취소하기</Button>
                <Button size="sm" loading={busy === `t-${t.id}`} onClick={() => act(`t-${t.id}`, { action: "topup_confirm", id: t.id }, "입금을 확인해 잔액에 넣었어요")}>입금 확인하기</Button>
              </div>
            ))}
          </Card>
        )}
      </div>

      <div>
        <SectionHeader title="건당 발송비" />
        <Card>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="업체" className="flex-1 min-w-48">
              <Select value={price.partner} onChange={(e) => {
                const p = d.partners.find((x) => x.id === e.target.value);
                setPrice({ partner: e.target.value, value: p?.crm_unit_price === null || p?.crm_unit_price === undefined ? "" : String(p.crm_unit_price) });
              }}>
                <option value="">업체 고르기</option>
                {d.partners.map((p) => <option key={p.id} value={p.id}>{p.name}{p.crm_unit_price !== null ? ` · ${won(p.crm_unit_price)}` : " · 미정"}</option>)}
              </Select>
            </Field>
            <Field label="건당 (원, 비우면 미정)" className="w-40">
              <Input inputMode="numeric" className="num" value={price.value} onChange={(e) => setPrice((x) => ({ ...x, value: e.target.value.replace(/\D/g, "") }))} />
            </Field>
            <Button variant="secondary" disabled={!price.partner} loading={busy === "price"}
              onClick={() => act("price", { action: "price", partner_id: price.partner, unit_price: price.value === "" ? null : Number(price.value) }, "건당 발송비를 저장했어요")}>저장하기</Button>
          </div>
          {chosen && <p className="text-caption text-ink-2 mt-2">{chosen.name} 충전금 잔액 <span className="num">{won(chosen.balance)}</span></p>}
        </Card>
      </div>
    </section>
  );
}
