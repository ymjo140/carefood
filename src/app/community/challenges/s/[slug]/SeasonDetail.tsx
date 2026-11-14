"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button, Card, ChoiceCard, ChoiceList, EmptyState, Notice, RangeInput, Sheet, Skeleton, SkeletonList, TextLink, useToast } from "@/components/ui";
import { ruleOf } from "@/lib/challenge-rules";
import { kcalRange } from "@/lib/challenges";
import { getOrCreateNickname } from "@/lib/nickname";
import { md, type SeasonView } from "../../ChallengeHome";

/**
 * 시즌 상세 — 시즌 이름 · 기간 · 남은 날 · 하는 사람 수 → 시즌 안 챌린지.
 * 열량 구간은 6구간 중 '나에게 맞아요'(기록 목표에 가장 가까운 구간)를 먼저, 구간 숫자는 나만 본다. 구간별 사람 수는 10명 이상일 때만.
 * '숫자 바꿔서 하기'는 같은 규칙에 목표값만 바꾼 내 버전 — 기간은 시즌과 같고 시즌 인원에 같이 센다.
 */
type Data = { current: SeasonView | null; next: SeasonView | null; my_tier: number; goal_kcal: number | null };
const won = (v: number) => v.toLocaleString("ko-KR");

export function SeasonDetail() {
  const { slug } = useParams<{ slug: string }>();
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data: Data | null }>({ status: "loading", data: null });
  const [attempt, setAttempt] = useState(0);
  const [tier, setTier] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [version, setVersion] = useState<SeasonView["challenges"][number] | null>(null);
  const [vTarget, setVTarget] = useState(0);
  const [vPublic, setVPublic] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/community/seasons")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (alive) setState({ status: "done", data: d }); })
      .catch(() => { if (alive) setState({ status: "error", data: null }); });
    return () => { alive = false; };
  }, [attempt]);

  const post = async (body: object, done: string, key: string) => {
    setBusy(key);
    try {
      const r = await fetch("/api/community/seasons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, nickname: getOrCreateNickname() }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "");
      toast.show(done);
      setAttempt((n) => n + 1);
      return true;
    } catch (e) {
      toast.show((e as Error).message || "시작하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
      return false;
    } finally { setBusy(null); }
  };

  if (state.status === "loading") return <div className="flex flex-col gap-4"><Skeleton className="h-24 rounded-lg" /><SkeletonList rows={4} thumb={false} /></div>;
  if (state.status === "error" || !state.data) {
    return <EmptyState title="시즌을 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
      action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading", data: null }); setAttempt((n) => n + 1); }}>다시 불러오기</Button>} />;
  }
  const d = state.data;
  const s = [d.current, d.next].find((x) => x?.slug === slug) ?? null;
  if (!s) return <EmptyState title="지금 열린 시즌이 아니에요" description="지난 시즌은 내 챌린지에서 볼 수 있어요" action={<TextLink href="/community/challenges">챌린지로 돌아가기</TextLink>} />;
  const pickTier = tier ?? d.my_tier;
  const head = s.title.split(" · ");

  return (
    <div className="flex flex-col gap-8 pb-8">
      <section className="flex flex-col gap-2">
        <span className="text-label text-ink-2">{head[0]}</span>
        <h1 className="text-display font-bold text-ink text-balance">{head.slice(1).join(" · ") || s.title}</h1>
        <p className="text-label text-ink-2 num">
          {md(s.start_on)} ~ {md(s.ends_on)} · {s.days / 7}주
          {s.days_left != null ? <> · <span className="font-bold text-ink">{s.days_left}일 남았어요</span></> : <> · {s.starts_in}일 뒤 시작</>}
          {s.people != null && <> · {won(s.people)}명</>}
        </p>
        {s.intro && <p className="text-body text-ink">{s.intro}</p>}
        {s.closed ? <Notice>남은 날이 7일보다 적어 지금은 들어갈 수 없어요. 다음 시즌에 같이 해요</Notice>
          : s.late ? <Notice>지금 들어오면 남은 {s.late.remaining}일 중 {s.late.goal}일을 해내면 완주예요</Notice>
          : s.starts_in != null ? <Notice>지금 고르면 {md(s.start_on)} 월요일에 다 같이 시작해요</Notice> : null}
      </section>

      {s.challenges.map((c) => {
        const spec = ruleOf(c.metric);
        return (
          <Card key={c.id} className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-body font-bold text-ink">{c.title}</h2>
              <p className="text-label text-ink-2">{c.rule}</p>
              {c.macro && <p className="text-caption text-ink-2 num">탄 <span className="text-carbs font-bold">{c.macro.c[0]}~{c.macro.c[1]}%</span> · 단 <span className="text-protein font-bold">{c.macro.p[0]}~{c.macro.p[1]}%</span> · 지 <span className="text-fat font-bold">{c.macro.f[0]}~{c.macro.f[1]}%</span></p>}
              {c.people != null && <p className="text-caption text-ink-2 num">{won(c.people)}명이 하고 있어요</p>}
            </div>

            {c.metric === "kcal_band" && c.tiers && !c.mine && (
              <div className="flex flex-col gap-2">
                <span className="text-label font-medium text-ink">내 구간 고르기 <span className="font-regular text-ink-2">· 숫자는 나만 봐요</span></span>
                <ChoiceList label="열량 구간" value={pickTier} onChange={setTier}
                  options={c.tiers.map((t) => ({
                    value: t.kcal,
                    label: <span className="flex flex-col">
                      <span className="text-body text-ink num">{won(t.kcal)}kcal{t.kcal === d.my_tier ? <span className="text-caption font-bold text-brand-ink"> · 나에게 맞아요</span> : null}</span>
                      <span className="text-caption text-ink-2 num">해낸 날 {won(kcalRange(t.kcal)[0])}~{won(kcalRange(t.kcal)[1])}kcal{t.people != null ? ` · ${won(t.people)}명` : ""}</span>
                    </span>,
                  }))} />
                <p className="text-caption text-ink-2">{d.goal_kcal ? `기록 목표 ${won(d.goal_kcal)}kcal에 가장 가까운 구간을 골라 뒀어요` : "기록 목표가 없어 2,000kcal 기준으로 골라 뒀어요"} · 구간 아래로 떨어진 날도 못 한 날이에요</p>
              </div>
            )}

            {c.mine ? (
              <p className="text-label text-positive font-medium">
                {c.mine.version ? "내 버전으로 하고 있어요" : "하고 있어요"}
                {c.mine.target ? <span className="text-ink-2 font-regular num"> · 내 구간 {won(c.mine.target)}kcal</span> : null}
                {" "}<TextLink href="/community/challenges" className="text-label">내 챌린지에서 보기</TextLink>
              </p>
            ) : !s.closed && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon="plus" loading={busy === c.id}
                  onClick={() => post({ action: "join", challenge_id: c.id, ...(c.metric === "kcal_band" ? { target: pickTier } : {}) }, "시즌 챌린지를 시작했어요. 식단을 기록하면 하루씩 채워져요", c.id)}>
                  {c.metric === "kcal_band" ? `${won(pickTier)}kcal 구간으로 시작하기` : "시작하기"}
                </Button>
                {c.editable && spec?.target && (
                  <Button size="sm" variant="ghost" onClick={() => { setVTarget(c.target ?? spec.target!.default); setVPublic(false); setVersion(c); }}>숫자 바꿔서 하기</Button>
                )}
              </div>
            )}
          </Card>
        );
      })}

      <Sheet open={!!version} onClose={() => setVersion(null)} title="숫자 바꿔서 하기" size="sm"
        description="같은 규칙에 목표만 바꾼 내 버전이에요. 기간은 시즌과 같고, 시즌 인원에 같이 세요"
        footer={<Button block loading={busy === "version"} onClick={async () => { if (version && await post({ action: "version", parent_id: version.id, target: vTarget, public: vPublic }, "내 버전으로 시작했어요", "version")) setVersion(null); }}>내 버전으로 시작하기</Button>}>
        {version && (() => {
          const t = ruleOf(version.metric)!.target!;
          return (
            <div className="flex flex-col gap-4">
              <span className="flex items-baseline justify-between text-label font-medium text-ink">목표 <span className="text-body"><span className="num font-bold">{won(vTarget)}</span>{t.unit}</span></span>
              <RangeInput min={t.min} max={t.max} step={t.step} value={vTarget} name="version_target" aria-label="목표" onChange={(e) => setVTarget(Number(e.target.value))} />
              <p className="text-label text-ink-2">{ruleOf(version.metric)!.rule(vTarget)}</p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="공개 범위">
                <ChoiceCard size="sm" selected={!vPublic} onClick={() => setVPublic(false)} title="링크로만" description="초대한 친구만" />
                <ChoiceCard size="sm" selected={vPublic} onClick={() => setVPublic(true)} title="공개" description="순위·추천에 나와요" />
              </div>
            </div>
          );
        })()}
      </Sheet>
    </div>
  );
}
