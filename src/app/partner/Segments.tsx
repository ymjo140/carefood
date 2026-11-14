"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Badge, Button, Card, Chip, ConfirmSheet, EmptyState, Estimate, Field, Input, Notice, SectionHeader, Select, SkeletonList, Steps, Textarea,
  cn, timeAgo, useToast, type BadgeTone,
} from "@/components/ui";
import { checkClaimsWith, type ClaimTerm } from "@/lib/partner/claims";
import { fitsWeekly } from "@/lib/partner/quota";

type Behavior = "viewed" | "saved" | "clicked" | "never_seen";
type Conditions = { behavior: { action: Behavior; days: number } | null; goals: string[]; needs: string[] };
type Option = { key: string; label: string };
type Result = {
  sent: number | null; opened: number | null; clicked: number | null; click_rate: number | null; holdout_click_rate: number | null;
  purchases: number | null; purchase_amount: number | null; final: boolean;
};
type Campaign = {
  id: string; title: string; body: string; status: "review" | "rejected" | "scheduled" | "sending" | "sent" | "canceled"; reject_note: string | null;
  send_at: string; night: boolean; unit_price: number; estimate_count: number; held_amount: number; sent_count: number | null; holdout_count: number | null;
  charged_amount: number | null; created_at: string; summary: string; result: Result | null;
};
type Segment = { id: string; name: string; conditions: Conditions; summary: string };
type Data = {
  ready: boolean; unit_price: number | null; balance: number; pending_topup: number; booked: string[]; weekly_limit: number;
  claim_terms?: ClaimTerm[];
  segments: Segment[]; campaigns: Campaign[]; products: { id: string; name: string }[]; partner_name: string; read_only: boolean;
  options: { goals: Option[]; needs: Option[]; behaviors: Option[]; days: number[]; templates: Record<string, { label: string; title: string; body: string }> };
};
type Preview = {
  ready: boolean; night: boolean; summary: string; matched: number | null; capped: number; night_excluded: number | null;
  eligible: number | null; send: number | null; holdout: number | null; cost: number | null; enough: boolean;
};

const won = (v: number) => `${v.toLocaleString("ko-KR")}원`;
const n = (v: number) => v.toLocaleString("ko-KR");
const few = (v: number | null) => (v === null ? "10명 미만" : `${n(v)}명`);
const EMPTY: Conditions = { behavior: null, goals: [], needs: [] };
const STATUS: Record<Campaign["status"], { label: string; tone: BadgeTone }> = {
  review: { label: "검수 중", tone: "neutral" }, scheduled: { label: "예약됨", tone: "brand" }, sending: { label: "보내는 중", tone: "neutral" },
  sent: { label: "보냄", tone: "positive" }, rejected: { label: "반려", tone: "danger" }, canceled: { label: "취소", tone: "neutral" },
};

/** 한국 시간 날짜·시각 → ISO */
const kstIso = (day: string, time: string) => new Date(`${day}T${time}:00+09:00`).toISOString();
const kstDay = (ms: number) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
const isNightTime = (t: string) => { const h = Number(t.slice(0, 2)); return h >= 21 || h < 8; };
const fmtWhen = (iso: string) => new Date(iso).toLocaleString("ko-KR", { month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" });

/**
 * 고객층 — 조건 고르기 → 메시지 → 확인·예약. 업체는 조건·인원·합계만 본다. 사람을 고르고 보내는 일은 케어푸드가 한다.
 * 발송비는 검수 요청 때 충전금에서 잡아 두고, 보낸 수만큼 확정한다. (v3 7.5·8장)
 */
export function Segments({ qs, onTopup, prefill }: { qs: string; onTopup: () => void; prefill?: { need?: string; goal?: string } | null }) {
  const toast = useToast();
  const [now] = useState(() => Date.now());
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data?: Data; error?: string }>({ status: "loading" });
  const [compose, setCompose] = useState<{ conditions: Conditions; segmentId: string | null } | null>(null);
  const [cancel, setCancel] = useState<Campaign | null>(null);
  const [removing, setRemoving] = useState<Segment | null>(null);
  const used = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/partner/crm?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setState({ status: "done", data: d });
    } catch (e) { setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  // 다른 탭에서 "이 조건으로 고객층 만들기"로 왔으면 그 조건으로 연다 (한 번만)
  useEffect(() => {
    if (used.current || !prefill || state.status !== "done" || !state.data?.ready) return;
    used.current = true;
    setCompose({ conditions: { ...EMPTY, needs: prefill.need ? [prefill.need] : [], goals: prefill.goal ? [prefill.goal] : [] }, segmentId: null });
  }, [prefill, state.status, state.data?.ready]);

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch(`/api/partner/crm?${qs}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || "요청하지 못했어요"), { need: d.need as number | undefined });
    return d;
  };

  if (state.status === "loading") return <SkeletonList rows={4} thumb={false} />;
  if (state.status === "error" || !state.data) {
    return (
      <EmptyState title="고객층을 불러오지 못했어요" description={state.error}
        action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(); }}>다시 불러오기</Button>} />
    );
  }
  const d = state.data;
  if (!d.ready) {
    return (
      <EmptyState title="고객층은 준비 중이에요" description="사용자가 업체 소식 받기에 동의하는 화면이 열리면, 여기서 조건을 골라 다시 부를 수 있어요" />
    );
  }

  const ro = d.read_only;
  const upcoming = d.booked.filter((t) => Date.parse(t) > now).length;
  return (
    <section className="flex flex-col gap-8">
      <div>
        <SectionHeader title="고객층"
          action={!compose && !ro ? <Button size="sm" icon="plus" onClick={() => setCompose({ conditions: EMPTY, segmentId: null })}>새로 보내기</Button> : undefined} />
        <p className="text-label text-ink-2">
          조건을 고르면 그 조건에 맞고 업체 소식 받기에 동의한 사람 수만 보여 드려요. 보내는 일은 케어푸드가 하고, 업체에는 누가 받았는지 주지 않아요.
        </p>
        <Card tone="sunken" className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="text-label text-ink-2">충전금 <span className="num font-bold text-ink">{won(d.balance)}</span>
            {d.pending_topup > 0 && <> · 확인 중 <span className="num">{won(d.pending_topup)}</span></>}</span>
          <span className="text-label text-ink-2">건당 발송비 {d.unit_price === null ? <span className="text-ink">정해지지 않았어요</span> : <span className="num font-bold text-ink">{won(d.unit_price)}</span>}</span>
          <span className="text-label text-ink-2">발송 7일에 {d.weekly_limit}번까지 · 예약 <span className="num text-ink">{upcoming}</span>건</span>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onTopup}>충전하기</Button>
        </Card>
      </div>

      {compose && (
        <Composer qs={qs} data={d} initial={compose.conditions} segmentId={compose.segmentId} post={post}
          onClose={() => setCompose(null)}
          onDone={(msg) => { toast.show(msg); setCompose(null); setState({ status: "loading" }); load(); }} />
      )}

      <section>
        <SectionHeader title="저장한 고객층" />
        {d.segments.length === 0 ? (
          <EmptyState title="저장한 고객층이 없어요" description="조건을 고른 뒤 이름을 붙여 저장하면 다음에 바로 보낼 수 있어요" />
        ) : (
          <Card padding="none" className="divide-y divide-line">
            {d.segments.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex-1 min-w-0">
                  <span className="block text-body text-ink truncate">{s.name}</span>
                  <span className="block text-caption text-ink-2">{s.summary}</span>
                </span>
                {!ro && <Button size="sm" variant="secondary" onClick={() => setCompose({ conditions: { ...EMPTY, ...s.conditions }, segmentId: s.id })}>보내기</Button>}
                {!ro && <Button size="sm" variant="ghost" onClick={() => setRemoving(s)}>지우기</Button>}
              </div>
            ))}
          </Card>
        )}
      </section>

      <section>
        <SectionHeader title="보낸 것" />
        {d.campaigns.length === 0 ? (
          <EmptyState title="아직 보낸 게 없어요" description="첫 발송은 검수를 거쳐 고른 시각에 나가요" />
        ) : (
          <div className="flex flex-col gap-3">
            {d.campaigns.map((c) => <CampaignCard key={c.id} c={c} readOnly={ro} onCancel={() => setCancel(c)} />)}
          </div>
        )}
        <Estimate className="mt-3">
          받은 사람과 같은 조건의 10%에게는 보내지 않고 두어, 보낸 뒤 7일 동안 두 묶음의 구매 링크 클릭을 견줘요. 10명 미만인 묶음은 숫자를 가려요.
        </Estimate>
      </section>

      <ConfirmSheet open={!!cancel} onClose={() => setCancel(null)} title="이 발송을 취소할까요?"
        description={cancel ? `잡아 둔 발송비 ${won(cancel.held_amount)}을 충전금으로 돌려드려요` : undefined} confirmLabel="취소하기"
        onConfirm={async () => {
          if (!cancel) return;
          try { await post({ action: "cancel", id: cancel.id }); toast.show("발송을 취소했어요. 발송비를 돌려드렸어요"); setCancel(null); setState({ status: "loading" }); load(); }
          catch (e) { toast.show(`취소하지 못했어요. ${(e as Error).message}`, { tone: "danger" }); }
        }} />
      <ConfirmSheet open={!!removing} onClose={() => setRemoving(null)} title="이 고객층을 지울까요?"
        description="보낸 기록은 그대로 남아요" confirmLabel="지우기" tone="danger"
        onConfirm={async () => {
          if (!removing) return;
          try { await post({ action: "delete", id: removing.id }); toast.show("고객층을 지웠어요"); setRemoving(null); load(); }
          catch (e) { toast.show(`지우지 못했어요. ${(e as Error).message}`, { tone: "danger" }); }
        }} />
    </section>
  );
}

function CampaignCard({ c, readOnly, onCancel }: { c: Campaign; readOnly: boolean; onCancel: () => void }) {
  const st = STATUS[c.status];
  const r = c.result;
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="flex-1 min-w-0">
          <span className="block text-body font-bold text-ink">{c.title}</span>
          <span className="block text-label text-ink-2">{c.body}</span>
        </span>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <p className="text-caption text-ink-2 mt-2">{c.summary} · {fmtWhen(c.send_at)}{c.night ? " · 밤 시간(야간 동의자만)" : ""}</p>
      {c.status === "rejected" && c.reject_note && <p className="text-label text-danger mt-2">반려 이유: {c.reject_note}</p>}
      {c.status === "canceled" && c.reject_note && <p className="text-label text-ink-2 mt-2">{c.reject_note}</p>}
      {(c.status === "review" || c.status === "scheduled") && (
        <p className="text-label text-ink mt-2">보낼 사람 약 <span className="num">{n(c.estimate_count)}</span>명 · 잡아 둔 발송비 <span className="num">{won(c.held_amount)}</span></p>
      )}
      {c.status === "sent" && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-line pt-3">
          <Metric label="보낸 사람" value={few(r?.sent ?? c.sent_count ?? null)} />
          <Metric label="연 사람" value={r?.opened !== null && r?.opened !== undefined ? `${n(r.opened)}명` : "—"} />
          <Metric label="구매 링크 클릭률" value={r?.click_rate !== null && r?.click_rate !== undefined ? `${r.click_rate}%` : "—"}
            sub={r?.holdout_click_rate !== null && r?.holdout_click_rate !== undefined ? `안 받은 사람 ${r.holdout_click_rate}%` : "비교 묶음이 10명 미만"} />
          <Metric label="링크 판매(보고)" value={r?.purchases !== null && r?.purchases !== undefined ? `${n(r.purchases)}건` : "—"}
            sub={r?.purchase_amount ? won(r.purchase_amount) : undefined} />
          <p className="col-span-2 sm:col-span-4 text-caption text-ink-2">
            발송비 <span className="num">{won(c.charged_amount || 0)}</span> ({n(c.sent_count || 0)}명 × {won(c.unit_price)}) · {r?.final ? "7일 셈이 끝났어요" : "보낸 뒤 7일까지 숫자가 늘어요"}
          </p>
        </div>
      )}
      {!readOnly && (c.status === "review" || c.status === "scheduled") && (
        <div className="mt-3"><Button size="sm" variant="ghost" onClick={onCancel}>취소하기</Button></div>
      )}
      <p className="text-caption text-ink-3 mt-2">{timeAgo(c.created_at)} 요청</p>
    </Card>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-caption text-ink-2">{label}</span>
      <span className="block num text-body font-bold text-ink">{value}</span>
      {sub && <span className="block text-caption text-ink-2">{sub}</span>}
    </div>
  );
}

/** 새 발송 — ① 조건 → ② 메시지 → ③ 확인·예약 */
function Composer({ qs, data, initial, segmentId, post, onClose, onDone }: {
  qs: string; data: Data; initial: Conditions; segmentId: string | null;
  post: (b: Record<string, unknown>) => Promise<Record<string, unknown>>; onClose: () => void; onDone: (msg: string) => void;
}) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [cond, setCond] = useState<Conditions>(initial);
  const [minDay] = useState(() => kstDay(Date.now()));
  const [day, setDay] = useState(() => kstDay(Date.now() + 86400e3));
  const [time, setTime] = useState("12:00");
  const [preview, setPreview] = useState<{ status: "loading" | "error" | "done"; data?: Preview; error?: string }>({ status: "loading" });
  const [template, setTemplate] = useState<string>("new");
  const [productId, setProductId] = useState(data.products[0]?.id || "");
  const [title, setTitle] = useState(data.options.templates.new.title);
  const [body, setBody] = useState("");
  const [saveName, setSaveName] = useState("");
  const [busy, setBusy] = useState<"save" | "send" | null>(null);
  const [short, setShort] = useState<number | null>(null);

  const productName = data.products.find((p) => p.id === productId)?.name || "제품";
  const fill = useCallback((tpl: string, pName: string) => {
    const t = data.options.templates[tpl];
    setTitle(t.title);
    setBody(t.body.replace("{제품}", pName).slice(0, 120));
  }, [data.options.templates]);
  useEffect(() => { fill("new", data.products[0]?.name || "제품"); }, [fill, data.products]); // eslint-disable-line react-hooks/set-state-in-effect -- 처음 한 번 문구 초안을 채운다

  // 조건·시각이 바뀌면 인원을 다시 센다 (잠깐 기다렸다가)
  const sendIso = useMemo(() => kstIso(day, time), [day, time]);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/partner/crm?${qs}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", conditions: cond, send_at: sendIso }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        if (alive) setPreview({ status: "done", data: j });
      } catch (e) { if (alive) setPreview({ status: "error", error: (e as Error).message || "세지 못했어요" }); }
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [cond, sendIso, qs]);

  const toggle = <K extends "goals" | "needs">(k: K, v: string) => {
    setPreview({ status: "loading" });
    setCond((c) => ({ ...c, [k]: c[k].includes(v) ? c[k].filter((x) => x !== v) : [...c[k], v] }));
  };
  const setBehavior = (b: Conditions["behavior"]) => { setPreview({ status: "loading" }); setCond((c) => ({ ...c, behavior: b })); };

  const p = preview.data;
  const hits = checkClaimsWith(data.claim_terms, title, body);
  const cost = p?.cost ?? null;
  const lacking = cost !== null && cost > data.balance;
  const full = !fitsWeekly(data.booked.map((t) => Date.parse(t)), Date.parse(sendIso), data.weekly_limit);

  const saveSegment = async () => {
    if (!saveName.trim()) { toast.show("고객층 이름을 적어 주세요", { tone: "danger" }); return; }
    setBusy("save");
    try { await post({ action: "save", name: saveName.trim(), conditions: cond }); toast.show(`'${saveName.trim()}' 고객층을 저장했어요`); setSaveName(""); }
    catch (e) { toast.show(`저장하지 못했어요. ${(e as Error).message}`, { tone: "danger" }); }
    finally { setBusy(null); }
  };

  const request = async () => {
    setBusy("send"); setShort(null);
    try {
      await post({ action: "request", conditions: cond, segment_id: segmentId, template, title, body, product_id: productId, send_at: sendIso });
      onDone("검수를 요청했어요. 승인되면 고른 시각에 나가요");
    } catch (e) {
      const need = (e as { need?: number }).need;
      if (need) setShort(need);
      toast.show(`요청하지 못했어요. ${(e as Error).message}`, { tone: "danger" });
    } finally { setBusy(null); }
  };

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-body font-bold text-ink">{["① 조건 고르기", "② 메시지 쓰기", "③ 확인하고 예약하기"][step]}</h3>
        <Button size="sm" variant="ghost" onClick={onClose}>닫기</Button>
      </div>
      <Steps total={3} current={step} className="mb-5" />

      {step === 0 && (
        <div className="flex flex-col gap-5">
          <fieldset>
            <legend className="text-label font-medium text-ink mb-2">최근 행동</legend>
            <div className="flex flex-wrap gap-2">
              <Chip selected={!cond.behavior} onClick={() => setBehavior(null)}>상관없음</Chip>
              {data.options.behaviors.map((b) => (
                <Chip key={b.key} selected={cond.behavior?.action === b.key}
                  onClick={() => setBehavior({ action: b.key as Behavior, days: cond.behavior?.days || 30 })}>{b.label}</Chip>
              ))}
            </div>
            {cond.behavior && cond.behavior.action !== "never_seen" && (
              <div className="flex flex-wrap gap-2 mt-2">
                {data.options.days.map((dd) => (
                  <Chip key={dd} size="sm" selected={cond.behavior?.days === dd} onClick={() => setBehavior({ ...cond.behavior!, days: dd })}>{dd}일 안에</Chip>
                ))}
              </div>
            )}
          </fieldset>
          <fieldset>
            <legend className="text-label font-medium text-ink mb-2">목표 <span className="font-regular text-ink-2">· 하나라도 맞으면</span></legend>
            <div className="flex flex-wrap gap-2">
              {data.options.goals.map((g) => <Chip key={g.key} selected={cond.goals.includes(g.key)} onClick={() => toggle("goals", g.key)}>{g.label}</Chip>)}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-label font-medium text-ink mb-2">찾는 조건 <span className="font-regular text-ink-2">· 하나라도 맞으면</span></legend>
            <div className="flex flex-wrap gap-2">
              {data.options.needs.map((x) => <Chip key={x.key} selected={cond.needs.includes(x.key)} onClick={() => toggle("needs", x.key)}>{x.label}</Chip>)}
            </div>
          </fieldset>
          {(cond.goals.length > 0 || cond.needs.length > 0) && (
            <Estimate>목표·찾는 조건을 쓰면 &lsquo;고른 목표에 맞는 소식만 받기&rsquo;에 동의한 사람만 세요. 질환 관심은 조건에 없어요</Estimate>
          )}

          <AudienceBox preview={preview} />

          <div className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
            <Field label="이 조건을 저장해 두기" className="flex-1 min-w-48">
              <Input value={saveName} maxLength={40} placeholder="예: 단백질 찾는 신규" onChange={(e) => setSaveName(e.target.value)} />
            </Field>
            <Button variant="secondary" loading={busy === "save"} onClick={saveSegment}>저장하기</Button>
          </div>
          <div className="flex justify-end">
            <Button disabled={!p?.enough} onClick={() => setStep(1)}>다음</Button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-5">
          {data.products.length === 0 ? (
            <Notice tone="caution" title="반영된 제품이 없어요">메시지를 누르면 열릴 제품이 있어야 보낼 수 있어요. 제품 탭에서 검수 상태를 확인해 주세요</Notice>
          ) : (
            <>
              <fieldset>
                <legend className="text-label font-medium text-ink mb-2">종류</legend>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(data.options.templates).map(([k, t]) => (
                    <Chip key={k} selected={template === k} onClick={() => { setTemplate(k); fill(k, productName); }}>{t.label}</Chip>
                  ))}
                </div>
              </fieldset>
              <Field label="누르면 열릴 제품">
                <Select value={productId} onChange={(e) => { setProductId(e.target.value); fill(template, data.products.find((x) => x.id === e.target.value)?.name || "제품"); }}>
                  {data.products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
              </Field>
              <Field label="제목" hint={<span className="num">{title.length}/30</span>}>
                <Input value={title} maxLength={30} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field label="본문" hint={<span className="num">{body.length}/120</span>}>
                <Textarea value={body} maxLength={120} rows={3} onChange={(e) => setBody(e.target.value)} />
              </Field>
              {hits.length > 0 && (
                <Notice tone="caution" title="확인이 필요한 표현이 있어요">
                  <ul className="flex flex-col gap-1">
                    {hits.map((h) => <li key={h.phrase}>&lsquo;{h.phrase}&rsquo; — {h.why}{h.suggest ? ` · 바꿀 말: ${h.suggest}` : ""}</li>)}
                  </ul>
                  <p className="mt-1">그대로 요청하면 검수에서 반려될 수 있어요</p>
                </Notice>
              )}
              <div>
                <p className="text-label font-medium text-ink mb-2">이렇게 나가요</p>
                <Card tone="sunken">
                  <p className="text-label font-bold text-ink">(광고) {data.partner_name} · {title || "제목"}</p>
                  <p className="text-label text-ink whitespace-pre-line">{body || "본문"}</p>
                  <p className="text-caption text-ink-2 mt-1">받지 않으려면 마이 &gt; 알림 설정에서 끌 수 있어요</p>
                </Card>
                <p className="text-caption text-ink-2 mt-2">(광고) 표시·보낸 곳·받지 않는 방법은 케어푸드가 붙여요. 알림함과, 알림을 켠 기기에 같이 가요</p>
              </div>
            </>
          )}
          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep(0)}>이전</Button>
            <Button disabled={!productId || !title.trim() || !body.trim()} onClick={() => setStep(2)}>다음</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="보낼 날">
              <Input type="date" value={day} min={minDay} onChange={(e) => setDay(e.target.value)} />
            </Field>
            <Field label="시각">
              <Select value={time} onChange={(e) => setTime(e.target.value)}>
                {TIMES.map((t) => <option key={t} value={t}>{t}{isNightTime(t) ? " (밤)" : ""}</option>)}
              </Select>
            </Field>
          </div>
          {isNightTime(time) && <Notice icon="info">밤 9시~아침 8시에는 밤에도 받기로 한 사람에게만 가요. 인원이 줄어들 수 있어요</Notice>}
          <AudienceBox preview={preview} />
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-label">
            <dt className="text-ink-2">조건</dt><dd className="text-ink">{p?.summary || "—"}</dd>
            <dt className="text-ink-2">발송비</dt>
            <dd className="text-ink">{data.unit_price === null ? "건당 발송비가 정해지지 않았어요" : cost !== null
              ? <><span className="num font-bold">{won(cost)}</span> <span className="text-ink-2">({n(p!.send!)}명 × {won(data.unit_price)}, 비교용 {n(p!.holdout || 0)}명은 비용 없음)</span></> : "—"}</dd>
            <dt className="text-ink-2">충전금</dt>
            <dd className="text-ink"><span className="num">{won(data.balance)}</span>{cost !== null && !lacking && <> → 보낸 뒤 <span className="num">{won(data.balance - cost)}</span></>}</dd>
            <dt className="text-ink-2">셈하는 법</dt>
            <dd className="text-ink-2">발송비는 검수를 요청할 때 잡아 두고, 실제로 보낸 사람 수만큼만 빠져요. 반려·취소되면 돌려드려요. 보낸 뒤 7일 안의 구매 링크 클릭과 구매확정을 이 발송의 결과로 보여 드려요</dd>
          </dl>
          {data.unit_price === null && <Notice tone="caution">건당 발송비가 정해지면 예약할 수 있어요. 케어푸드에 문의해 주세요</Notice>}
          {(lacking || short) && (
            <Notice tone="caution" title="충전금이 모자라요">
              <span className="num">{won(short ?? (cost! - data.balance))}</span> 더 있어야 해요. 아래 광고 충전금에서 충전을 신청하면 입금을 확인한 뒤 반영해요
            </Notice>
          )}
          {full && <Notice tone="caution">고른 날 앞뒤 7일 안에 이미 {data.weekly_limit}번 보내요. 발송은 7일에 {data.weekly_limit}번까지라 다른 날을 골라 주세요</Notice>}
          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep(1)}>이전</Button>
            <Button loading={busy === "send"} disabled={!p?.enough || data.unit_price === null || lacking || full}
              onClick={request}>검수 요청하기</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/** 인원 미리보기 — 조건에 맞는 사람 → 이번 주 받을 수 있는 사람 → 보낼 사람 + 비교용 */
function AudienceBox({ preview }: { preview: { status: "loading" | "error" | "done"; data?: Preview; error?: string } }) {
  if (preview.status === "error") return <Notice tone="danger">인원을 세지 못했어요. {preview.error}</Notice>;
  const p = preview.data;
  const loading = preview.status === "loading";
  return (
    <Card tone="sunken" aria-busy={loading} className={cn("transition-opacity duration-150", loading && "opacity-60")}>
      <ol className="grid grid-cols-3 gap-3">
        <li className="min-w-0"><span className="block text-caption text-ink-2">조건에 맞고 동의한 사람</span><span className="block num text-body font-bold text-ink">{p ? few(p.matched) : "…"}</span></li>
        <li className="min-w-0"><span className="block text-caption text-ink-2">이번 주 받을 수 있는 사람</span><span className="block num text-body font-bold text-ink">{p ? few(p.eligible) : "…"}</span></li>
        <li className="min-w-0"><span className="block text-caption text-ink-2">보낼 사람</span><span className="block num text-title font-bold text-ink"><span className={cn(p?.enough && "highlight")}>{p?.send !== null && p?.send !== undefined ? `${n(p.send)}명` : "—"}</span></span></li>
      </ol>
      {p && (p.capped !== 0 || (p.night_excluded ?? 0) > 0) && (
        <p className="text-caption text-ink-2 mt-2">
          {p.capped !== 0 && <>이번 주에 이미 알림을 받은 {p.capped === -1 ? "10명 미만" : `${n(p.capped)}명`}은 빼요. </>}
          {(p.night_excluded ?? 0) > 0 && <>밤 시간이라 {n(p.night_excluded!)}명은 빼요.</>}
        </p>
      )}
      {p && !p.enough && <p className="text-label text-ink mt-2">받을 수 있는 사람이 10명 미만이에요. 조건을 넓혀 주세요</p>}
    </Card>
  );
}
