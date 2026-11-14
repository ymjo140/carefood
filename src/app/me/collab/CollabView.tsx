"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Chip, ChipRow, EmptyState, Field, Notice, SectionHeader, SkeletonList, Switch, Textarea, timeAgo, useToast } from "@/components/ui";

type Profile = { is_open: boolean; intro: string | null; topics: string[] };
type Collab = { id: string; partner: string; title: string; offer: string; product_name: string | null; code: string | null; status: string; reply: string | null; created_at: string; coupon: string | null };
const STATUS: Record<string, string> = { proposed: "답 기다림", accepted: "협업 중", declined: "거절함", ended: "끝남" };

/**
 * 협업 제안 받기 설정 + 받은 제안 (v3 10.5)
 * 켜면 업체에 보이는 것: 닉네임 · 자기소개 · 고른 주제 · 최근 90일 글·좋아요·답글·팔로워 수. 건강 목표·연락처는 보이지 않는다.
 */
export function CollabView() {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; profile?: Profile; topics?: string[]; nickname?: string | null; ready?: boolean; collabs?: Collab[]; error?: string }>({ status: "loading" });
  const [form, setForm] = useState<Profile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([fetch("/api/me/creator"), fetch("/api/me/collabs")]);
      const [p, c] = await Promise.all([a.json(), b.json()]);
      if (!a.ok) throw new Error(p.error);
      if (!b.ok) throw new Error(c.error);
      setState({ status: "done", profile: p.profile, topics: p.topics, nickname: p.nickname, ready: p.ready, collabs: c.collabs });
      setForm(p.profile ? { is_open: p.profile.is_open, intro: p.profile.intro, topics: p.profile.topics || [] } : null);
    } catch (e) { setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, []);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const save = async (next: Profile) => {
    setBusy("save");
    try {
      const r = await fetch("/api/me/creator", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.show(next.is_open ? "협업 제안을 받을게요" : "협업 제안을 받지 않을게요");
      load();
    } catch (e) {
      toast.show(`${(e as Error).message || "저장하지 못했어요. 다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setBusy(null); }
  };
  const answer = async (c: Collab, accept: boolean) => {
    setBusy(c.id);
    try {
      const r = await fetch(`/api/me/collabs/${c.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accept }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.show(accept ? `협업을 받았어요. 내 코드는 ${d.code}예요` : "제안을 거절했어요");
      load();
    } catch (e) {
      toast.show(`${(e as Error).message || "답하지 못했어요. 다시 시도해 주세요"}`, { tone: "danger" });
    } finally { setBusy(null); }
  };

  if (state.status === "loading") return <SkeletonList rows={3} thumb={false} />;
  if (state.status === "error") return (
    <EmptyState title="협업 제안을 불러오지 못했어요" description={state.error}
      action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(); }}>다시 불러오기</Button>} />
  );
  if (!state.ready || !form) return <EmptyState title="협업 제안을 준비하고 있어요" description="준비가 끝나면 여기에서 켤 수 있어요" />;
  const collabs = state.collabs || [];
  return (
    <div className="flex flex-col gap-8">
      <section>
        <Card>
          <Switch checked={form.is_open} disabled={busy === "save" || !state.nickname} label="협업 제안 받기"
            description={state.nickname ? `업체에 '${state.nickname}' 닉네임과 아래 소개·주제, 최근 90일 글·반응·팔로워 수가 보여요` : "커뮤니티에 글을 한 번 올려 닉네임을 정하면 켤 수 있어요"}
            onChange={(on) => save({ ...form, is_open: on })} />
          <div className="mt-3 pt-3 border-t border-line flex flex-col gap-3">
            <Field label="한 줄 소개" hint="100자까지 · 건강 상태나 질환은 적지 않아도 돼요">
              <Textarea value={form.intro || ""} maxLength={100} rows={2} onChange={(e) => setForm({ ...form, intro: e.target.value })} placeholder="예: 운동하면서 먹는 도시락을 기록해요" />
            </Field>
            <div>
              <p className="text-label font-medium text-ink mb-2">주로 쓰는 주제 (4개까지)</p>
              <ChipRow>
                {(state.topics || []).map((t) => {
                  const on = form.topics.includes(t);
                  return <Chip key={t} selected={on} onClick={() => setForm({ ...form, topics: on ? form.topics.filter((x) => x !== t) : [...form.topics, t].slice(0, 4) })}>{t}</Chip>;
                })}
              </ChipRow>
            </div>
            <div><Button size="sm" variant="secondary" loading={busy === "save"} onClick={() => save(form)}>저장하기</Button></div>
          </div>
        </Card>
        <Notice className="mt-3">
          제품·돈·할인을 받고 쓰는 글은 광고예요. 협업 중인 업체의 제품을 글에 붙이면 글 맨 앞에 &lsquo;협찬&rsquo;이 저절로 붙어요.
          제품을 붙이지 않고 쓰는 협업 글에는 첫 줄에 직접 &lsquo;협찬&rsquo;이라고 써 주세요. 효능·질병 표현은 쓰지 말아 주세요
        </Notice>
      </section>

      <section>
        <SectionHeader title="받은 제안" />
        {collabs.length === 0 ? <EmptyState title="아직 받은 제안이 없어요" description={form.is_open ? "업체가 제안하면 알림함과 여기에서 볼 수 있어요" : "협업 제안 받기를 켜면 업체가 제안할 수 있어요"} /> : (
          <div className="flex flex-col gap-3">
            {collabs.map((c) => (
              <Card key={c.id}>
                <p className="flex flex-wrap items-center gap-2 text-label text-ink-2">{c.partner} · {timeAgo(c.created_at)}<Badge tone={c.status === "proposed" || c.status === "accepted" ? "brand" : "neutral"}>{STATUS[c.status] || c.status}</Badge></p>
                <p className="text-body font-bold text-ink mt-1">{c.title}</p>
                <p className="text-label text-ink mt-1 whitespace-pre-line">{c.offer}</p>
                {(c.product_name || c.coupon) && <p className="text-caption text-ink-2 mt-1">{c.product_name}{c.product_name && c.coupon && " · "}{c.coupon && `팔로워 쿠폰: ${c.coupon}`}</p>}
                {c.status === "accepted" && c.code && (
                  <p className="text-label text-ink mt-3">내 코드 <span className="num font-bold">{c.code}</span> — 글에 이 코드를 적으면, 읽은 사람이 쿠폰함에서 넣고 쿠폰을 받아요</p>
                )}
                {c.status === "proposed" && (
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="secondary" loading={busy === c.id} onClick={() => answer(c, false)}>거절하기</Button>
                    <Button size="sm" loading={busy === c.id} onClick={() => answer(c, true)}>받기</Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
