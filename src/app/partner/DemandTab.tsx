"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge, Button, Card, Chip, ChipRow, ConfirmSheet, EmptyState, Estimate, Field, GapChart, HowCounted, Input, ListRow, Notice, SectionHeader, Select, Sheet,
  SkeletonList, Stat, Steps, Tabs, TextButton, Textarea, UnitInput, timeAgo, useToast,
} from "@/components/ui";
import { DemandDetail, type DemandData, type DemandSeg } from "./Demand";
import type { CouponRow } from "./Coupons";

type View = "flow" | "manage";
type Plan = { id: string; segment: string; segment_label: string; rule: string; name: string; note: string | null; target_price: number | null; status: string; created_at: string };
type Cand = {
  code: string; nickname: string; intro: string | null; topics: string[]; posts: number; likes: number; comments: number; followers: number;
  match: boolean; collab: string | null; topic_posts: number; posts_30: number; per_post: number; score: number; reasons: string[];
};
type Collab = { id: string; plan_id: string | null; nickname: string; title: string; offer: string; product_name: string | null; coupon: string | null; code: string | null; status: string; reply: string | null; created_at: string; redeemed: number; orders: number; sales: number };

const n = (v: number) => v.toLocaleString("ko-KR");
const PLAN_STATUS: Record<string, string> = { planning: "기획 중", making: "만드는 중", launched: "출시", dropped: "접음" };
const COLLAB_STATUS: Record<string, string> = { proposed: "답 기다림", accepted: "협업 중", declined: "거절함", canceled: "거둬들임", ended: "끝남" };
const STEP_TITLE = ["빈틈 보기", "만들 제품 정하기", "어울리는 사람 찾기"];

/**
 * 수요 탭 (v3 10.5 고도화) — 두 보기
 *  · 수요 → 기획 → 추천: ① 빈틈 그림에서 조건 고르기 → ② 만들 제품 기획 저장 → ③ 그 기획에 어울리는 사람(점수·이유)에게 제안
 *  · 협업 관리: 보낸 제안·협업 판매를 기획별로, 기획 상태(기획 중·만드는 중·출시·접음)
 */
export function DemandTab({ qs, onMakeSegment }: { qs: string; onMakeSegment?: (need: string) => void }) {
  const [view, setView] = useState<View>("flow");
  return (
    <div className="flex flex-col gap-6">
      <Tabs<View> value={view} onChange={setView} label="수요 보기"
        items={[{ value: "flow", label: "수요 → 기획 → 추천" }, { value: "manage", label: "협업 관리" }]} />
      {view === "flow" ? <Flow qs={qs} onMakeSegment={onMakeSegment} onSent={() => setView("manage")} /> : <Manage qs={qs} />}
    </div>
  );
}

function usePlans(qs: string) {
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; plans: Plan[]; readOnly: boolean; ready: boolean; error?: string }>({ status: "loading", plans: [], readOnly: true, ready: true });
  const seq = useRef(0);
  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const r = await fetch(`/api/partner/plans?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (my === seq.current) setState({ status: "done", plans: d.plans, readOnly: d.read_only, ready: d.ready });
    } catch (e) { if (my === seq.current) setState((s) => ({ ...s, status: "error", error: (e as Error).message || "기획을 불러오지 못했어요" })); }
  }, [qs]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

/** 수요 → 기획 → 추천 — 세 단계를 한 줄로 */
function Flow({ qs, onMakeSegment, onSent }: { qs: string; onMakeSegment?: (need: string) => void; onSent: () => void }) {
  const [demand, setDemand] = useState<{ status: "loading" | "error" | "done"; data?: DemandData; error?: string }>({ status: "loading" });
  const [step, setStep] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const plans = usePlans(qs);
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/partner/demand?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDemand({ status: "done", data: d });
    } catch (e) { setDemand({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다
  const reload = () => { setDemand({ status: "loading" }); load(); };

  if (demand.status === "loading") return <SkeletonList rows={4} thumb={false} />;
  if (demand.status === "error" || !demand.data) return (
    <EmptyState title="수요를 불러오지 못했어요" description={demand.error}
      action={<Button size="sm" variant="secondary" icon="refresh" onClick={reload}>다시 불러오기</Button>} />
  );
  const d = demand.data;
  const known = d.segments.filter((s) => s.share !== null);
  // 처음엔 빈틈이 가장 큰 조건 (서버가 빈틈 순으로 준다)
  const seg = d.segments.find((s) => s.key === (sel ?? known[0]?.key)) || null;
  const goStep = (i: number) => { setStep(i); window.scrollTo({ top: 0 }); };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Steps total={3} current={step} />
        <p className="text-caption text-ink-2 mt-2"><span className="num">{step + 1}</span>/3 · {STEP_TITLE[step]}</p>
      </div>

      {step === 0 && (
        <>
          <section>
            <SectionHeader title="빈틈 보기" description="점 하나가 성분 조건 하나예요. 오른쪽 아래일수록 찾는 사람은 많은데 살 수 있는 제품이 적어요. 점을 눌러 골라요" />
            {known.length === 0 ? (
              <EmptyState title="아직 빈틈을 그릴 만큼 모이지 않았어요"
                description={d.people === null ? "목표·입맛을 고른 사람이 10명 넘게 모이면 조건별로 찾는 사람 비율이 나와요" : "조건마다 10명 넘게 모이면 그림에 점이 생겨요. 아래 표에서 제품 수를 먼저 볼 수 있어요"} />
            ) : (
              <Card>
                <GapChart points={known.map((s) => ({ key: s.key, label: s.label, x: s.share || 0, y: s.supply }))} selected={seg?.key} onSelect={setSel}
                  xLabel="찾는 사람" yLabel="살 수 있는 제품" xFormat={(v) => `${v}%`} yFormat={(v) => `${n(v)}개`} />
                <ChipRow className="mt-4">
                  {known.map((s) => <Chip key={s.key} size="sm" selected={seg?.key === s.key} onClick={() => setSel(s.key)}>{s.label}</Chip>)}
                </ChipRow>
              </Card>
            )}
            {seg && seg.share !== null && (
              <Card className="mt-3">
                <p className="text-caption text-ink-2">고른 조건</p>
                <p className="text-body font-bold text-ink mt-0.5">{seg.label}</p>
                <p className="text-label text-ink-2">{seg.rule}</p>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <Stat label="찾는 사람" value={seg.share} unit="%" />
                  <Stat label="살 수 있는 제품" value={n(seg.supply)} unit="개" />
                  <Stat label="내 제품" value={n(seg.mine)} unit="개" />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button onClick={() => { setPlan(null); goStep(1); }}>이 조건으로 기획하기</Button>
                  {onMakeSegment && <TextButton onClick={() => onMakeSegment(seg.key)}>이 조건을 찾는 사람으로 고객층 만들기</TextButton>}
                </div>
              </Card>
            )}
          </section>

          <OpenPlans plans={plans} onPick={(p) => { setPlan(p); setSel(p.segment); goStep(2); }} />

          <section>
            <h3 className="text-label font-bold text-ink mb-2">자세히</h3>
            <DemandDetail d={d} onMakeSegment={onMakeSegment} onReload={reload} />
          </section>
        </>
      )}

      {step === 1 && seg && (
        <PlanStep qs={qs} seg={seg} d={d} readOnly={plans.readOnly} ready={plans.ready} onBack={() => goStep(0)}
          onSaved={(p) => { setPlan(p); plans.reload(); goStep(2); }} onSkip={() => { setPlan(null); goStep(2); }} />
      )}

      {step === 2 && seg && <PeopleStep qs={qs} seg={seg} plan={plan} onBack={() => goStep(plan ? 0 : 1)} onSent={onSent} />}
    </div>
  );
}

/** 진행 중인 기획 — 이어서 어울리는 사람을 찾는다 */
function OpenPlans({ plans, onPick }: { plans: ReturnType<typeof usePlans>; onPick: (p: Plan) => void }) {
  if (plans.status === "loading") return <SkeletonList rows={2} thumb={false} />;
  if (plans.status === "error") return (
    <Notice tone="danger" title="저장한 기획을 불러오지 못했어요">
      {plans.error}
      <Button size="sm" variant="secondary" icon="refresh" className="mt-3" onClick={plans.reload}>다시 불러오기</Button>
    </Notice>
  );
  const open = plans.plans.filter((p) => p.status === "planning" || p.status === "making");
  if (open.length === 0) return null; // 저장한 기획이 없으면 이 구역은 없다 — 위의 "이 조건으로 기획하기"가 시작점
  return (
    <section>
      <SectionHeader title="진행 중인 기획" description="이어서 어울리는 사람을 찾을 수 있어요. 상태는 협업 관리에서 바꿔요" />
      <Card padding="none">
        <ul className="divide-y divide-line">
          {open.map((p) => (
            <li key={p.id}>
              <ListRow title={p.name} meta={<>{p.segment_label} · {PLAN_STATUS[p.status]} · {timeAgo(p.created_at)}</>}
                trailing={<TextButton onClick={() => onPick(p)}>어울리는 사람 찾기</TextButton>} />
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

/** ② 만들 제품 정하기 — 조건의 숫자를 보고 기획을 저장한다 */
function PlanStep({ qs, seg, d, readOnly, ready, onBack, onSaved, onSkip }: {
  qs: string; seg: DemandSeg; d: DemandData; readOnly: boolean; ready: boolean; onBack: () => void; onSaved: (p: Plan) => void; onSkip: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({ name: seg.label, price: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const meal = (d.more?.meals || []).flatMap((m) => m.meals.filter((x) => x.share !== null).map((x) => ({ ...x, cat: m.label }))).sort((a, b) => (b.share || 0) - (a.share || 0))[0];
  const price = (d.more?.prices || [])[0];

  const save = async () => {
    setErr(null);
    setBusy(true);
    try {
      const target = form.price.trim() === "" ? null : Number(form.price.replace(/[^0-9]/g, ""));
      const r = await fetch(`/api/partner/plans?${qs}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment: seg.key, name: form.name, note: form.note || null, target_price: target }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      toast.show("기획을 저장했어요. 이제 어울리는 사람을 골라요");
      onSaved({ id: j.id, segment: seg.key, segment_label: seg.label, rule: seg.rule, name: form.name.trim(), note: form.note || null, target_price: target, status: "planning", created_at: new Date().toISOString() });
    } catch (e) {
      const m = (e as Error).message || "기획을 저장하지 못했어요. 다시 시도해 주세요";
      setErr(m);
      toast.show(m, { tone: "danger" });
    } finally { setBusy(false); }
  };

  return (
    <section className="flex flex-col gap-4">
      <div><TextButton onClick={onBack}>빈틈 다시 고르기</TextButton></div>
      <SectionHeader title="만들 제품 정하기" description="성분 조건만 맞추면 돼요. 이름·메모에 효능 표현은 쓸 수 없어요" />
      <Card>
        <p className="text-body font-bold text-ink">{seg.label}</p>
        <p className="text-label text-ink mt-1">{seg.rule}</p>
        <ul className="mt-3 flex flex-col gap-1.5 text-label text-ink-2">
          <li>찾는 사람 <span className="num text-ink font-medium">{seg.share ?? "—"}{seg.share !== null && "%"}</span>{d.people !== null && <> (약 <span className="num">{n(d.people)}</span>명 중)</>}</li>
          <li>지금 살 수 있는 제품 <span className="num text-ink font-medium">{n(seg.supply)}</span>개 · 그중 입점 업체 제품 <span className="num">{n(seg.partner_supply)}</span>개</li>
          <li>이 조건에 맞는 내 제품 <span className="num text-ink font-medium">{n(seg.mine)}</span>개</li>
          {meal && <li>{meal.cat}는 {meal.label}에 가장 많이 먹어요 (<span className="num">{meal.share}</span>%)</li>}
          {price && <li>{price.label} 가격 가운데값 <span className="num">{n(price.mid)}</span>원 (비슷한 제품 <span className="num">{n(price.low)}</span>~<span className="num">{n(price.high)}</span>원)</li>}
        </ul>
        <Estimate className="mt-3">찾는 사람은 가입할 때 고른 목표·입맛으로 짐작한 값이에요. 끼니·가격은 내 제품 카테고리 기준이에요</Estimate>
      </Card>

      {!ready ? <Notice title="기획 저장을 준비하고 있어요">준비가 끝나면 기획을 저장할 수 있어요. 지금은 어울리는 사람만 볼 수 있어요</Notice>
        : readOnly ? <Notice title="관리자 보기에서는 저장할 수 없어요">업체 계정으로 들어오면 기획을 저장할 수 있어요</Notice> : (
        <Card>
          <div className="flex flex-col gap-4">
            <Field label="기획 이름" hint="2~40자. 성분·끼니·형태로 지어요 (예: 고단백 저염 도시락)">
              <Input value={form.name} maxLength={40} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="목표 가격 (선택)">
              <UnitInput unit="원" inputMode="numeric" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^0-9]/g, "") })} placeholder={price ? String(price.mid) : ""} />
            </Field>
            <Field label="메모 (선택)" hint="300자까지">
              <Textarea value={form.note} rows={3} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="예: 닭가슴살 대신 두부로, 1식 450kcal 아래" />
            </Field>
            {err && <p className="text-label text-danger" role="alert">{err}</p>}
          </div>
        </Card>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {ready && !readOnly && <Button loading={busy} onClick={save}>이 기획 저장하기</Button>}
        <TextButton onClick={onSkip}>저장하지 않고 어울리는 사람 보기</TextButton>
      </div>
    </section>
  );
}

type Followers = "all" | "s" | "m" | "l";
const FOLLOWERS: { value: Followers; label: string; test: (f: number) => boolean }[] = [
  { value: "all", label: "팔로워 전체", test: () => true },
  { value: "s", label: "100명 미만", test: (f) => f < 100 },
  { value: "m", label: "100~1,000명", test: (f) => f >= 100 && f < 1000 },
  { value: "l", label: "1,000명 이상", test: (f) => f >= 1000 },
];

/** ③ 어울리는 사람 — 그 조건의 커뮤니티 주제로 점수를 내고 이유를 보여 준다. 제안하면 기획에 묶인다 */
function PeopleStep({ qs, seg, plan, onBack, onSent }: { qs: string; seg: DemandSeg; plan: Plan | null; onBack: () => void; onSent: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; cands?: Cand[]; topic?: string | null; readOnly?: boolean; ready?: boolean; error?: string }>({ status: "loading" });
  const [fol, setFol] = useState<Followers>("all");
  const [active, setActive] = useState(false);
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [form, setForm] = useState<{ cand: Cand; title: string; offer: string; product_name: string; coupon_id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const r = await fetch(`/api/partner/collabs?${qs}&segment=${encodeURIComponent(seg.key)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (my === seq.current) setState({ status: "done", cands: d.candidates, topic: d.topic, readOnly: d.read_only, ready: d.ready });
    } catch (e) { if (my === seq.current) setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs, seg.key]);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다
  useEffect(() => {
    fetch(`/api/partner/coupons?${qs}`).then((r) => r.json()).then((d) => setCoupons((d.coupons || []).filter((c: CouponRow) => c.status === "active")))
      .catch((e) => console.error("쿠폰을 불러오지 못했어요:", e)); // ds-allow: 제안 시트의 쿠폰 고르기는 덤 — 없으면 쿠폰 없이 보낸다
  }, [qs]);

  const open = (c: Cand) => setForm({
    cand: c, title: plan ? `${plan.name} 써 보실래요?`.slice(0, 30) : "", offer: "", product_name: plan?.name || "", coupon_id: "",
  });
  const send = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/partner/collabs?${qs}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: form.cand.code, title: form.title, offer: form.offer, product_name: form.product_name || null, coupon_id: form.coupon_id || null, plan_id: plan?.id || null }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.show(`${form.cand.nickname} 님에게 제안을 보냈어요. 답은 협업 관리에서 볼 수 있어요`);
      setForm(null);
      load();
    } catch (e) {
      toast.show(`${(e as Error).message || "제안을 보내지 못했어요. 다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setBusy(false); }
  };

  const test = FOLLOWERS.find((f) => f.value === fol)!.test;
  const cands = (state.cands || []).filter((c) => test(c.followers) && (!active || c.posts_30 > 0));
  return (
    <section className="flex flex-col gap-4">
      <div><TextButton onClick={onBack}>{plan ? "빈틈으로 돌아가기" : "기획으로 돌아가기"}</TextButton></div>
      <SectionHeader title="어울리는 사람 찾기"
        description={<>{plan ? <>기획 <span className="text-ink font-medium">{plan.name}</span></> : seg.label}
          {state.topic ? <> · &lsquo;{state.topic}&rsquo; 글을 쓰는 사람이 먼저 와요</> : " · 맞는 커뮤니티 주제가 없어 반응·활동으로만 골라요"}</>} />
      <ChipRow>
        {FOLLOWERS.map((f) => <Chip key={f.value} selected={fol === f.value} onClick={() => setFol(f.value)}>{f.label}</Chip>)}
        <Chip selected={active} onClick={() => setActive(!active)} aria-pressed={active}>최근 30일에 글 쓴 사람</Chip>
      </ChipRow>
      {state.status === "loading" ? <SkeletonList rows={4} />
        : state.status === "error" ? (
          <EmptyState title="어울리는 사람을 불러오지 못했어요" description={state.error}
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(); }}>다시 불러오기</Button>} />
        ) : !state.ready ? <EmptyState title="협업을 준비하고 있어요" description="준비가 끝나면 여기에서 협업할 사람을 찾을 수 있어요" />
        : (state.cands || []).length === 0 ? <EmptyState title="아직 협업 제안을 받는 사람이 없어요" description="커뮤니티 사용자가 마이 > 협업 제안에서 켜면 여기에 나와요" />
        : cands.length === 0 ? <EmptyState title="조건에 맞는 사람이 없어요" description="팔로워·활동 조건을 넓혀 보세요"
            action={<Button size="sm" variant="secondary" onClick={() => { setFol("all"); setActive(false); }}>조건 풀기</Button>} />
        : (
          <Card padding="none">
            <ul className="divide-y divide-line">
              {cands.map((c) => (
                <li key={c.code}>
                  <ListRow
                    title={<span className="flex flex-wrap items-center gap-2">{c.nickname}<span className="text-caption text-ink-2">어울림 <span className="num text-ink font-bold">{c.score}</span>점</span>{c.collab && <Badge tone="neutral">{COLLAB_STATUS[c.collab]}</Badge>}</span>}
                    meta={<>{c.intro ? <span className="block">{c.intro}</span> : null}{c.reasons.join(" · ")}</>}
                    trailing={!state.readOnly && !c.collab ? <Button size="sm" variant="secondary" onClick={() => open(c)}>제안하기</Button> : undefined} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      <HowCounted>
        &lsquo;협업 제안 받기&rsquo;를 스스로 켠 사람만 나와요. 어울림 점수는 100점 만점 — 그 주제를 골랐는지 15 · 최근 90일 그 주제 글(5개면 만점) 35 ·
        글당 좋아요+답글(20이면 만점) 20 · 팔로워(1,000명이면 만점) 15 · 최근 30일 글 15. 건강 목표·연락처는 쓰지도 보여 주지도 않아요
      </HowCounted>
      {state.status === "done" && !state.readOnly && <div><TextButton onClick={onSent}>보낸 제안 보기</TextButton></div>}

      <Sheet open={!!form} onClose={() => setForm(null)} title={form ? `${form.cand.nickname} 님에게 제안하기` : ""}
        footer={<><Button variant="secondary" block onClick={() => setForm(null)}>취소</Button><Button block loading={busy} onClick={send}>제안 보내기</Button></>}>
        {form && (
          <div className="flex flex-col gap-4">
            {plan && <p className="text-label text-ink-2">기획 <span className="text-ink font-medium">{plan.name}</span>으로 보내요. 협업 관리에서 기획별로 모아 봐요</p>}
            <Field label="제목" hint="2~30자"><Input value={form.title} maxLength={30} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="예: 고단백 도시락 써 보실래요?" /></Field>
            <Field label="제안 내용" hint="보내는 제품·조건·대가를 적어요 (5~300자)">
              <Textarea value={form.offer} maxLength={300} rows={4} onChange={(e) => setForm({ ...form, offer: e.target.value })} placeholder="예: 시제품 5식을 보내 드려요. 드셔 보고 솔직한 후기를 커뮤니티에 남겨 주세요" />
            </Field>
            <Field label="제품 이름 (선택)"><Input value={form.product_name} maxLength={60} onChange={(e) => setForm({ ...form, product_name: e.target.value })} /></Field>
            <Field label="팔로워에게 줄 쿠폰 (선택)" hint="받으면 전용 코드가 생기고, 그 코드를 넣은 사람이 이 쿠폰을 받아요">
              <Select value={form.coupon_id} onChange={(e) => setForm({ ...form, coupon_id: e.target.value })}>
                <option value="">쿠폰 없이</option>
                {coupons.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.text}</option>)}
              </Select>
            </Field>
            <Notice>제품·돈·할인을 주면 그 사람이 쓰는 글은 광고예요. 협업 중에 우리 제품을 붙여 쓴 글에는 맨 앞에 &lsquo;협찬&rsquo;이 저절로 붙어요. 효능·질병 표현은 쓸 수 없어요</Notice>
          </div>
        )}
      </Sheet>
    </section>
  );
}

/** 협업 관리 — 보낸 제안·협업 판매를 기획별로. 기획 상태 바꾸기 · 제안 거둬들이기 · 협업 끝내기 */
function Manage({ qs }: { qs: string }) {
  const toast = useToast();
  const plans = usePlans(qs);
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; collabs?: Collab[]; readOnly?: boolean; ready?: boolean; error?: string }>({ status: "loading" });
  const [close, setClose] = useState<{ c: Collab; action: "cancel" | "end" } | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const r = await fetch(`/api/partner/collabs?${qs}&candidates=0`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (my === seq.current) setState({ status: "done", collabs: d.collabs, readOnly: d.read_only, ready: d.ready });
    } catch (e) { if (my === seq.current) setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const doClose = async () => {
    if (!close) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/partner/collabs/${close.c.id}?${qs}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: close.action }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.show(close.action === "cancel" ? "제안을 거둬들였어요" : "협업을 끝냈어요. 코드는 더 쓸 수 없어요");
      setClose(null);
    } catch (e) {
      toast.show(`${(e as Error).message || "처리하지 못했어요. 다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setBusy(false); load(); }
  };
  const setStatus = async (p: Plan, status: string) => {
    try {
      const r = await fetch(`/api/partner/plans/${p.id}?${qs}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.show(`'${p.name}' 상태를 바꿨어요 — ${PLAN_STATUS[status]}`);
    } catch (e) {
      toast.show(`${(e as Error).message || "상태를 바꾸지 못했어요. 다시 시도해 주세요"}`, { tone: "danger" });
    } finally { plans.reload(); }
  };

  if (state.status === "loading" || plans.status === "loading") return <SkeletonList rows={4} />;
  if (state.status === "error" || plans.status === "error") return (
    <EmptyState title="협업을 불러오지 못했어요" description={state.error || plans.error}
      action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(); plans.reload(); }}>다시 불러오기</Button>} />
  );
  if (!state.ready) return <EmptyState title="협업을 준비하고 있어요" description="준비가 끝나면 여기에서 보낸 제안과 협업 판매를 볼 수 있어요" />;
  const collabs = state.collabs || [];
  const live = collabs.filter((c) => c.status === "accepted" || c.status === "ended");
  const total = {
    sent: collabs.length, waiting: collabs.filter((c) => c.status === "proposed").length, on: collabs.filter((c) => c.status === "accepted").length,
    redeemed: live.reduce((s, c) => s + c.redeemed, 0), sales: live.reduce((s, c) => s + c.sales, 0),
  };
  if (collabs.length === 0 && plans.plans.length === 0) return (
    <EmptyState title="아직 기획도 보낸 제안도 없어요" description="수요 → 기획 → 추천에서 빈틈을 골라 기획을 저장하고 어울리는 사람에게 제안해 보세요" />
  );
  // 기획별로 묶고, 기획 없이 보낸 제안은 맨 뒤 한 묶음
  const groups: { plan: Plan | null; items: Collab[] }[] = [
    ...plans.plans.map((p) => ({ plan: p, items: collabs.filter((c) => c.plan_id === p.id) })),
    { plan: null, items: collabs.filter((c) => !c.plan_id || !plans.plans.some((p) => p.id === c.plan_id)) },
  ].filter((g) => g.plan || g.items.length);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card className="col-span-2 sm:col-span-1"><Stat label="협업 판매" value={n(total.sales)} unit="원" emphasis /></Card>
          <Card><Stat label="코드로 받은 사람" value={n(total.redeemed)} unit="명" /></Card>
          <Card><Stat label="협업 중" value={n(total.on)} unit="명" /></Card>
          <Card><Stat label="답 기다림" value={n(total.waiting)} unit="건" /></Card>
          <Card><Stat label="보낸 제안" value={n(total.sent)} unit="건" /></Card>
        </div>
        <HowCounted className="mt-3">협업 판매는 협업 코드로 받은 쿠폰을 쓴 주문의 상품 금액이에요(취소 뺌). 받기 전·거절한 제안은 세지 않아요</HowCounted>
      </section>

      {groups.map((g) => {
        const sales = g.items.reduce((s, c) => s + c.sales, 0);
        return (
          <section key={g.plan?.id || "none"}>
            <SectionHeader title={g.plan ? g.plan.name : "기획 없이 보낸 제안"}
              description={g.plan ? <>{g.plan.segment_label} · {g.plan.rule}{g.plan.target_price !== null && <> · 목표 <span className="num">{n(g.plan.target_price)}</span>원</>} · 제안 <span className="num">{g.items.length}</span>건 · 협업 판매 <span className="num">{n(sales)}</span>원</> : undefined}
              action={g.plan ? (plans.readOnly ? <Badge tone="neutral">{PLAN_STATUS[g.plan.status]}</Badge> : (
                <Select aria-label={`${g.plan.name} 상태`} value={g.plan.status} onChange={(e) => setStatus(g.plan!, e.target.value)} className="w-32">
                  {Object.entries(PLAN_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              )) : undefined} />
            {g.plan?.note && <p className="text-label text-ink-2 mb-2">{g.plan.note}</p>}
            {g.items.length === 0 ? <p className="text-label text-ink-2">아직 이 기획으로 보낸 제안이 없어요. 수요 → 기획 → 추천의 진행 중인 기획에서 이어서 찾을 수 있어요</p> : (
              <Card padding="none">
                <ul className="divide-y divide-line">
                  {g.items.map((c) => (
                    <li key={c.id}>
                      <ListRow
                        title={<span className="flex flex-wrap items-center gap-2">{c.nickname} · {c.title}<Badge tone={c.status === "accepted" ? "brand" : "neutral"}>{COLLAB_STATUS[c.status] || c.status}</Badge></span>}
                        meta={<>{timeAgo(c.created_at)}{c.code && <> · 코드 <span className="num">{c.code}</span></>}
                          {(c.status === "accepted" || c.status === "ended") && <> · 코드로 받은 사람 <span className="num">{c.redeemed}</span> · 주문 <span className="num">{c.orders}</span> · <span className="num">{n(c.sales)}</span>원</>}
                          {c.coupon && <> · {c.coupon}</>}{c.reply && <> · 답: {c.reply}</>}</>}
                        trailing={!state.readOnly && (c.status === "proposed" || c.status === "accepted") ? (
                          <TextButton onClick={() => setClose({ c, action: c.status === "proposed" ? "cancel" : "end" })}>{c.status === "proposed" ? "거둬들이기" : "끝내기"}</TextButton>
                        ) : undefined} />
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        );
      })}

      <ConfirmSheet open={!!close} onClose={() => setClose(null)} onConfirm={doClose} loading={busy}
        title={close?.action === "cancel" ? "제안을 거둬들일까요?" : "협업을 끝낼까요?"}
        description={close?.action === "cancel" ? "답하기 전이면 그 사람 화면에서 사라져요" : "전용 코드를 더 쓸 수 없게 돼요. 이미 받은 쿠폰은 기간까지 쓸 수 있어요"}
        confirmLabel={close?.action === "cancel" ? "거둬들이기" : "끝내기"} />
    </div>
  );
}
