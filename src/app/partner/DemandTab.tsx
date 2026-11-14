"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge, Button, Card, Chip, ChipRow, ConfirmSheet, EmptyState, Field, HowCounted, Input, ListRow, Notice, SectionHeader, Select, Sheet,
  SkeletonList, Tabs, TextButton, Textarea, timeAgo, useToast,
} from "@/components/ui";
import type { MealRow, PriceRow } from "@/lib/partner/demand-more";
import { TOPIC_OF_SEGMENT } from "@/lib/partner/collab-topics";
import { Demand } from "./Demand";
import type { CouponRow } from "./Coupons";

type Seg = { key: string; label: string; rule: string; share: number | null; supply: number; partner_supply: number; mine: number };
type View = "demand" | "ideas" | "collabs";
const n = (v: number) => v.toLocaleString("ko-KR");

/**
 * 수요 탭 — 수요(조건별 찾는 사람·제품 수) · 만들 제품(빈틈이 큰 조건 3개) · 협업(커뮤니티에서 알릴 사람) (v3 10.5)
 * 만들 제품의 "협업할 사람 찾기"는 그 조건에 맞는 커뮤니티 주제를 골라 협업 보기로 간다.
 */
export function DemandTab({ qs, onMakeSegment }: { qs: string; onMakeSegment?: (need: string) => void }) {
  const [view, setView] = useState<View>("demand");
  const [topic, setTopic] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <Tabs<View> value={view} onChange={setView} label="수요 보기"
        items={[{ value: "demand", label: "수요" }, { value: "ideas", label: "만들 제품" }, { value: "collabs", label: "협업" }]} />
      {view === "demand" && <Demand qs={qs} onMakeSegment={onMakeSegment} />}
      {view === "ideas" && <Ideas qs={qs} onCollab={(t) => { setTopic(t); setView("collabs"); }} />}
      {view === "collabs" && <Collabs qs={qs} topic={topic} setTopic={setTopic} />}
    </div>
  );
}

/** 만들 제품 — 찾는 사람 비율 ÷ 맞는 제품 수가 큰 조건, 내 제품이 1개 이하인 것 3개 */
function Ideas({ qs, onCollab }: { qs: string; onCollab: (topic: string | null) => void }) {
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; segs?: Seg[]; people?: number | null; meals?: MealRow[]; prices?: PriceRow[]; error?: string }>({ status: "loading" });
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/partner/demand?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setState({ status: "done", segs: d.segments, people: d.people, meals: d.more?.meals || [], prices: d.more?.prices || [] });
    } catch (e) { setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  if (state.status === "loading") return <SkeletonList rows={3} thumb={false} />;
  if (state.status === "error" || !state.segs) return (
    <EmptyState title="수요를 불러오지 못했어요" description={state.error}
      action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(); }}>다시 불러오기</Button>} />
  );
  const ideas = state.segs.filter((s) => s.share !== null && s.mine <= 1)
    .map((s) => ({ ...s, gap: (s.share || 0) / (s.supply + 1) })).sort((a, b) => b.gap - a.gap).slice(0, 3);
  if (ideas.length === 0) return <EmptyState title="아직 추천할 빈틈이 없어요" description={state.people === null ? "목표·입맛을 고른 사람이 더 모이면 조건별로 찾는 사람 비율이 나와요" : "찾는 사람이 많은 조건에 이미 내 제품이 있어요"} />;
  // 끼니 — 세트·도시락에서 가장 많이 먹는 끼니 (모인 칸만)
  const meal = (state.meals || []).flatMap((m) => m.meals.filter((x) => x.share !== null).map((x) => ({ ...x, cat: m.label }))).sort((a, b) => (b.share || 0) - (a.share || 0))[0];
  const price = (state.prices || [])[0];
  return (
    <section>
      <SectionHeader title="만들어 볼 제품" description="찾는 사람은 많은데 지금 살 수 있는 제품이 적은 조건이에요. 성분 조건만 맞추면 돼요" />
      <div className="flex flex-col gap-3">
        {ideas.map((s, i) => (
          <Card key={s.key}>
            <p className="text-caption text-ink-2">추천 {i + 1}</p>
            <p className="text-body font-bold text-ink mt-0.5">{s.label}</p>
            <p className="text-label text-ink mt-1">{s.rule}</p>
            <p className="text-label text-ink-2 mt-2">
              찾는 사람 <span className="num text-ink font-medium">{s.share}%</span> · 지금 살 수 있는 제품 <span className="num text-ink font-medium">{n(s.supply)}</span>개 · 내 제품 <span className="num">{s.mine}</span>개
            </p>
            {(meal || price) && (
              <p className="text-caption text-ink-2 mt-1">
                {meal && <>{meal.cat}는 {meal.label}에 가장 많이 먹어요({meal.share}%)</>}
                {meal && price && " · "}
                {price && <>{price.label} 가격 가운데값 <span className="num">{n(price.mid)}</span>원</>}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => onCollab(TOPIC_OF_SEGMENT[s.key] || null)}>
                {TOPIC_OF_SEGMENT[s.key] ? `'${TOPIC_OF_SEGMENT[s.key]}' 글을 쓰는 사람 찾기` : "협업할 사람 찾기"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <HowCounted className="mt-3">
        찾는 사람 비율은 가입할 때 고른 목표·입맛으로 짐작해요(질환 관련 값은 쓰지 않아요). 찾는 사람 비율을 맞는 제품 수로 나눠 큰 순서로, 내 제품이 1개 이하인 조건만 골라요.
        제안은 성분 조건이에요 — 효능을 말하는 이름·문구는 쓸 수 없어요
      </HowCounted>
    </section>
  );
}

type Cand = { code: string; nickname: string; intro: string | null; topics: string[]; posts: number; likes: number; comments: number; followers: number; match: boolean; collab: string | null };
type Collab = { id: string; nickname: string; title: string; offer: string; product_name: string | null; coupon: string | null; code: string | null; status: string; reply: string | null; created_at: string; redeemed: number; orders: number; sales: number };
const STATUS: Record<string, string> = { proposed: "답 기다림", accepted: "협업 중", declined: "거절함", canceled: "거둬들임", ended: "끝남" };

/** 협업 — 협업 제안을 받기로 한 커뮤니티 사람(주제가 맞는 사람 먼저)과 보낸 제안·협업 판매 */
function Collabs({ qs, topic, setTopic }: { qs: string; topic: string | null; setTopic: (t: string | null) => void }) {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; topics?: string[]; cands?: Cand[]; collabs?: Collab[]; readOnly?: boolean; ready?: boolean; error?: string }>({ status: "loading" });
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [form, setForm] = useState<{ cand: Cand; title: string; offer: string; product_name: string; coupon_id: string } | null>(null);
  const [close, setClose] = useState<{ c: Collab; action: "cancel" | "end" } | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async (t: string | null) => {
    const my = ++seq.current; // 주제를 빨리 바꾸면 마지막 응답만
    try {
      const r = await fetch(`/api/partner/collabs?${qs}${t ? `&topic=${encodeURIComponent(t)}` : ""}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (my === seq.current) setState({ status: "done", topics: d.topics, cands: d.candidates, collabs: d.collabs, readOnly: d.read_only, ready: d.ready });
    } catch (e) { if (my === seq.current) setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);
  useEffect(() => { load(topic); }, [load, topic]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다
  useEffect(() => {
    fetch(`/api/partner/coupons?${qs}`).then((r) => r.json()).then((d) => setCoupons((d.coupons || []).filter((c: CouponRow) => c.status === "active")))
      .catch((e) => console.error("쿠폰을 불러오지 못했어요:", e)); // ds-allow: 제안 시트의 쿠폰 고르기는 덤 — 없으면 쿠폰 없이 보낸다
  }, [qs]);

  const send = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/partner/collabs?${qs}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: form.cand.code, title: form.title, offer: form.offer, product_name: form.product_name || null, coupon_id: form.coupon_id || null }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.show(`${form.cand.nickname} 님에게 제안을 보냈어요. 앱에서 받거나 거절하면 여기서 볼 수 있어요`);
      setForm(null);
      load(topic);
    } catch (e) {
      toast.show(`${(e as Error).message || "제안을 보내지 못했어요. 다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setBusy(false); }
  };
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
    } finally { setBusy(false); load(topic); }
  };

  if (state.status === "loading") return <SkeletonList rows={4} />;
  if (state.status === "error") return (
    <EmptyState title="협업 후보를 불러오지 못했어요" description={state.error}
      action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(topic); }}>다시 불러오기</Button>} />
  );
  if (!state.ready) return <EmptyState title="협업을 준비하고 있어요" description="준비가 끝나면 여기에서 협업할 사람을 찾을 수 있어요" />;
  const cands = state.cands || [], collabs = state.collabs || [];
  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionHeader title="협업할 사람" description="커뮤니티에서 '협업 제안 받기'를 켠 사람만 보여요. 연락처·건강 정보는 보이지 않고, 제안은 앱 알림으로 가요" />
        <ChipRow className="mb-3">
          <Chip selected={!topic} onClick={() => setTopic(null)}>모든 주제</Chip>
          {(state.topics || []).map((t) => <Chip key={t} selected={topic === t} onClick={() => setTopic(t)}>{t}</Chip>)}
        </ChipRow>
        {cands.length === 0 ? <EmptyState title="아직 협업 제안을 받는 사람이 없어요" description="커뮤니티 사용자가 마이 > 협업 제안에서 켜면 여기에 나와요" /> : (
          <Card padding="none">
            <ul className="divide-y divide-line">
              {cands.map((c) => (
                <li key={c.code}>
                  <ListRow
                    title={<span className="flex flex-wrap items-center gap-2">{c.nickname}{c.match && <Badge tone="brand">주제 맞음</Badge>}{c.collab && <Badge tone="neutral">{STATUS[c.collab]}</Badge>}</span>}
                    meta={<>{c.intro ? `${c.intro} · ` : ""}{c.topics.join(", ") || "주제 없음"} · 90일 글 <span className="num">{c.posts}</span> · 좋아요 <span className="num">{n(c.likes)}</span> · 답글 <span className="num">{n(c.comments)}</span> · 팔로워 <span className="num">{n(c.followers)}</span></>}
                    trailing={!state.readOnly && !c.collab ? <Button size="sm" variant="secondary" onClick={() => setForm({ cand: c, title: "", offer: "", product_name: "", coupon_id: "" })}>제안하기</Button> : undefined} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section>
        <SectionHeader title="보낸 제안" description="받으면 전용 코드가 생겨요. 그 코드로 쿠폰을 받은 사람과 그 쿠폰으로 산 금액을 셉니다" />
        {collabs.length === 0 ? <EmptyState title="아직 보낸 제안이 없어요" description="위에서 주제가 맞는 사람에게 제안해 보세요" /> : (
          <Card padding="none">
            <ul className="divide-y divide-line">
              {collabs.map((c) => (
                <li key={c.id}>
                  <ListRow
                    title={<span className="flex flex-wrap items-center gap-2">{c.nickname} · {c.title}<Badge tone={c.status === "accepted" ? "brand" : "neutral"}>{STATUS[c.status] || c.status}</Badge></span>}
                    meta={<>{timeAgo(c.created_at)} · {c.offer.slice(0, 40)}{c.code && <> · 코드 <span className="num">{c.code}</span></>}
                      {(c.status === "accepted" || c.status === "ended") && <> · 코드로 받은 사람 <span className="num">{c.redeemed}</span> · 주문 <span className="num">{c.orders}</span> · <span className="num">{n(c.sales)}</span>원</>}
                      {c.reply && <> · 답: {c.reply}</>}</>}
                    trailing={!state.readOnly && (c.status === "proposed" || c.status === "accepted") ? (
                      <TextButton onClick={() => setClose({ c, action: c.status === "proposed" ? "cancel" : "end" })}>{c.status === "proposed" ? "거둬들이기" : "끝내기"}</TextButton>
                    ) : undefined} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <Sheet open={!!form} onClose={() => setForm(null)} title={form ? `${form.cand.nickname} 님에게 제안하기` : ""}
        footer={<><Button variant="secondary" block onClick={() => setForm(null)}>취소</Button><Button block loading={busy} onClick={send}>제안 보내기</Button></>}>
        {form && (
          <div className="flex flex-col gap-4">
            <Field label="제목" hint="2~30자"><Input value={form.title} maxLength={30} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="예: 고단백 도시락 써 보실래요?" /></Field>
            <Field label="제안 내용" hint="보내는 제품·조건·대가를 적어요 (5~300자)">
              <Textarea value={form.offer} maxLength={300} rows={4} onChange={(e) => setForm({ ...form, offer: e.target.value })} placeholder="예: 신제품 5식을 보내 드려요. 드셔 보고 솔직한 후기를 커뮤니티에 남겨 주세요" />
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

      <ConfirmSheet open={!!close} onClose={() => setClose(null)} onConfirm={doClose} loading={busy}
        title={close?.action === "cancel" ? "제안을 거둬들일까요?" : "협업을 끝낼까요?"}
        description={close?.action === "cancel" ? "답하기 전이면 그 사람 화면에서 사라져요" : "전용 코드를 더 쓸 수 없게 돼요. 이미 받은 쿠폰은 기간까지 쓸 수 있어요"}
        confirmLabel={close?.action === "cancel" ? "거둬들이기" : "끝내기"} />
    </div>
  );
}
