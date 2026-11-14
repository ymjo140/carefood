"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, ListRow, Notice, SectionHeader, SkeletonList, Switch, timeAgo, useToast } from "@/components/ui";
import type { PartnerSettings } from "@/lib/partner/settings";

type Data = PartnerSettings & { role: "owner" | "editor" | "admin"; can_edit: boolean; read_only: boolean };
type Form = { business_number: string; contact_email: string; contact_phone: string; website_url: string; tax_email: string; bank_name: string; bank_holder: string; bank_account: string };
const ROLE: Record<"owner" | "editor", string> = { owner: "대표", editor: "담당자" };

/** 설정 불러오기 — 업체 정보·담당자 두 보기가 같이 쓴다. 다시 불러오기가 겹치면 마지막 응답만 */
function useSettings(qs: string) {
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data?: Data; error?: string }>({ status: "loading" });
  const seq = useRef(0);
  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const r = await fetch(`/api/partner/settings?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (my === seq.current) setState({ status: "done", data: d });
    } catch (e) { if (my === seq.current) setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다
  return { state, setState, load };
}

function Failed({ error, retry }: { error?: string; retry: () => void }) {
  return <EmptyState title="설정을 불러오지 못했어요" description={error}
    action={<Button size="sm" variant="secondary" icon="refresh" onClick={retry}>다시 불러오기</Button>} />;
}

const toForm = (d: Data): Form => ({
  business_number: d.business_number || "", contact_email: d.contact_email || "", contact_phone: d.contact_phone || "", website_url: d.website_url || "",
  tax_email: d.tax_email || "", bank_name: d.bank.name || "", bank_holder: d.bank.holder || "", bank_account: "",
});

/**
 * 설정 > 업체 정보 — 사업자 번호·담당 연락처·세금계산서 메일·정산 계좌. 대표 담당자만 고친다.
 * 계좌 번호는 끝 4자리만 보이고, 바꿀 때만 새로 적는다(비워 두면 그대로)
 */
export function PartnerInfo({ qs }: { qs: string }) {
  const toast = useToast();
  const { state, setState, load } = useSettings(qs);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const d = state.data;
  const f = form || (d ? toForm(d) : null);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => f && setForm({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f || !d) return;
    setBusy(true);
    try {
      const { bank_account, ...rest } = f;
      const r = await fetch(`/api/partner/settings?${qs}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bank_account.trim() ? { ...rest, bank_account } : rest) });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(out.error);
      setState({ status: "done", data: out });
      setForm(null);
      toast.show("업체 정보를 저장했어요");
    } catch (e) {
      toast.show(`저장하지 못했어요. ${(e as Error).message || "다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setBusy(false); }
  };

  if (state.status === "loading") return <SkeletonList rows={4} thumb={false} />;
  if (state.status === "error" || !d || !f) return <Failed error={state.error} retry={() => { setState({ status: "loading" }); load(); }} />;
  const ro = !d.can_edit;
  const missing = [!d.business_number && "사업자 등록 번호", !d.tax_email && "세금계산서 받을 메일", !d.bank.account_last4 && "정산 계좌"].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-8">
      {missing.length > 0 && (
        <Notice tone="caution" title="정산에 필요한 정보가 비어 있어요">
          {missing.join(" · ")} — 매달 10일 정산 대금을 보내고 세금계산서를 발행하려면 필요해요
        </Notice>
      )}
      <section>
        <SectionHeader title="업체 정보" description={d.updated_at ? `${timeAgo(d.updated_at)} 고쳤어요` : undefined} />
        <Card>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-label mb-4">
            <dt className="text-ink-2">이름</dt><dd className="text-ink">{d.name}</dd>
            <dt className="text-ink-2">주소 이름</dt><dd className="text-ink num">{d.slug}</dd>
          </dl>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="사업자 등록 번호"><Input inputMode="numeric" value={f.business_number} onChange={set("business_number")} disabled={ro} placeholder="123-45-67890" /></Field>
            <Field label="세금계산서 받을 메일"><Input type="email" value={f.tax_email} onChange={set("tax_email")} disabled={ro} /></Field>
            <Field label="담당 메일"><Input type="email" value={f.contact_email} onChange={set("contact_email")} disabled={ro} /></Field>
            <Field label="담당 연락처"><Input inputMode="tel" value={f.contact_phone} onChange={set("contact_phone")} disabled={ro} /></Field>
            <Field label="누리집" className="sm:col-span-2"><Input type="url" value={f.website_url} onChange={set("website_url")} disabled={ro} placeholder="https://" /></Field>
          </div>
          <p className="text-caption text-ink-2 mt-3">이름·업체 유형·수수료율은 케어푸드가 정해요. 바꾸려면 케어푸드에 문의해 주세요</p>
        </Card>
      </section>

      <section>
        <SectionHeader title="정산 계좌" description="앱 주문 대금을 매달 10일에 이 계좌로 보내요" />
        <Card>
          <p className="text-label text-ink mb-4">
            {d.bank.account_last4
              ? <>지금 계좌 · {d.bank.name || "은행 미입력"} · {d.bank.holder || "예금주 미입력"} · 끝자리 <span className="num font-bold">{d.bank.account_last4}</span></>
              : <span className="text-ink-2">아직 계좌가 없어요</span>}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="은행"><Input value={f.bank_name} onChange={set("bank_name")} disabled={ro} placeholder="예: 국민은행" /></Field>
            <Field label="예금주"><Input value={f.bank_holder} onChange={set("bank_holder")} disabled={ro} /></Field>
            <Field label="계좌 번호" hint={d.bank.account_last4 ? "바꿀 때만 새로 적어요" : "숫자만 적어도 돼요"}>
              <Input inputMode="numeric" autoComplete="off" value={f.bank_account} onChange={set("bank_account")} disabled={ro} />
            </Field>
          </div>
        </Card>
      </section>

      {ro ? (
        <p className="text-label text-ink-2">{d.read_only ? "관리자 보기에서는 고칠 수 없어요" : "업체 정보는 대표 담당자만 고칠 수 있어요"}</p>
      ) : (
        <div className="flex gap-2">
          {form && <Button variant="ghost" onClick={() => setForm(null)}>되돌리기</Button>}
          <Button loading={busy} disabled={!form} onClick={save}>저장하기</Button>
        </div>
      )}
    </div>
  );
}

/** 설정 > 담당자·알림 — 내 새 주문 알림 켜기·끄기, 이 업체의 담당자 목록 */
export function PartnerTeam({ qs }: { qs: string }) {
  const toast = useToast();
  const { state, setState, load } = useSettings(qs);
  const [busy, setBusy] = useState(false);
  const d = state.data;

  const toggle = async (on: boolean) => {
    if (!d) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/partner/settings?${qs}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notify_orders: on }) });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(out.error);
      toast.show(on ? "새 주문 알림을 켰어요" : "새 주문 알림을 껐어요");
      await load();
    } catch (e) {
      toast.show(`알림 설정을 바꾸지 못했어요. ${(e as Error).message || "다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setBusy(false); }
  };

  if (state.status === "loading") return <SkeletonList rows={3} thumb={false} />;
  if (state.status === "error" || !d) return <Failed error={state.error} retry={() => { setState({ status: "loading" }); load(); }} />;

  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionHeader title="내 알림" />
        <Card>
          {d.me ? (
            <Switch checked={d.me.notify_orders} disabled={busy} onChange={toggle} label="새 주문·취소 요청 알림"
              description="이 계정으로 알림을 켠 기기에 30분마다 모아서 알려요. 꺼 둔 동안 들어온 주문은 다시 켜도 따로 알리지 않아요" />
          ) : (
            <p className="text-label text-ink-2">관리자 보기에서는 업체 담당자의 알림을 바꿀 수 없어요</p>
          )}
        </Card>
      </section>

      <section>
        <SectionHeader title="담당자" description="담당자를 더하거나 빼려면 케어푸드에 문의해 주세요" />
        {d.members.length === 0 ? (
          <EmptyState title="연결된 담당자가 없어요" description="케어푸드가 담당자 계정을 연결하면 여기 보여요" />
        ) : (
          <Card className="py-1">
            {d.members.map((m, i) => (
              <ListRow key={i} title={<span className="flex flex-wrap items-center gap-2">{m.email || "메일 없음"}{m.me && <Badge tone="brand">나</Badge>}</span>}
                meta={`${ROLE[m.role] || m.role} · 새 주문 알림 ${m.notify_orders ? "켬" : "끔"}`} />
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
