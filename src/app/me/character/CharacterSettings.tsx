"use client";

import { useEffect, useRef, useState } from "react";
import { Buddy, Button, Card, LinkButton, ChoiceCard, EmptyState, ListRow, Notice, Sheet, Skeleton, Switch, TextButton, useToast } from "@/components/ui";
import type { MascotMood } from "@/components/ui";
import { GROUP_NAME, ingredientOf, josa, personalityOf, type IngredientKey, type PersonalityKey, type StageKey } from "@/lib/buddy";
import { planOf, won, type Access, type Plan } from "@/lib/plans";
import { SUBSCRIPTION_ENABLED } from "@/lib/features";

/**
 * 내 캐릭터 — 재료 30종 × 성격 8 (lib/buddy.ts). 같이 다니는 캐릭터 · 도착한 보자기 풀기 · 키우는 캐릭터 바꾸기 · 캐릭터 보이기 · 요금제.
 * 보자기는 기록으로만 받는다(가입 · 연속 30일 · 시즌 참여). 크는 건 같이 기록한 날 수로만.
 * 데이터는 /api/me/buddy 하나 — 풀기·바꾸기 뒤에 다시 불러온다(늦게 온 응답은 버린다).
 */
type BuddyView = { id: string; ingredient: IngredientKey; personality: PersonalityKey; name: string; active: boolean };
type Data = {
  on: boolean; mood: MascotMood; streak: number; line: string | null; days: number;
  stage: { key: StageKey; name: string; next: { name: string; left: number } | null };
  buddy: BuddyView | null; collection: BuddyView[]; wraps: { id: string; kind: "start" | "streak" | "season"; key: string }[];
  access: Access; plans: Plan[];
};

function wrapText(w: Data["wraps"][number]) {
  if (w.kind === "streak") return { title: "연속 30일 보자기", meta: "드문 재료(노른자·무화과)가 잘 나와요" };
  if (w.kind === "season") {
    const m = /season:(\d{4})-(\d{2})/.exec(w.key);
    return { title: m ? `${Number(m[2])}월 시즌 보자기` : "새해 시즌 보자기", meta: "그 계절 제철 재료가 나와요" };
  }
  return { title: "처음 받은 보자기", meta: "재료와 성격이 랜덤으로 정해져요" };
}

export function CharacterSettings() {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data: Data | null }>({ status: "loading", data: null });
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ buddy: BuddyView; rare: boolean } | null>(null);
  const [plansOpen, setPlansOpen] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const n = ++seq.current;
    fetch("/api/me/buddy")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (n === seq.current) setState({ status: "done", data: d }); })
      .catch(() => { if (n === seq.current) setState({ status: "error", data: null }); });
  }, [reload]);

  if (state.status === "loading") return <div className="flex flex-col gap-4"><Skeleton className="h-40 rounded-lg" /><Skeleton className="h-48 rounded-lg" /></div>;
  if (state.status === "error" || !state.data) {
    return (
      <EmptyState title="캐릭터를 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
        action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading", data: null }); setReload((x) => x + 1); }}>다시 불러오기</Button>} />
    );
  }
  const d = state.data;
  const a = d.access;

  const post = async (body: object, key: string) => {
    setBusy(key);
    try {
      const r = await fetch("/api/me/buddy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "");
      return j;
    } catch (e) {
      toast.show((e as Error).message || "하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
      return null;
    } finally { setBusy(null); }
  };
  const open = async (wrapId: string) => {
    const j = await post({ action: "open", wrap_id: wrapId }, wrapId);
    if (!j) return;
    setRevealed({ buddy: j.buddy, rare: j.buddy.rare });
    setReload((x) => x + 1);
  };
  const activate = async (b: BuddyView) => {
    if (b.active) return;
    const j = await post({ action: "activate", buddy_id: b.id }, b.id);
    if (!j) return;
    toast.show(`이제 ${b.name}${josa(b.name, "과", "와")} 같이 다녀요`);
    setReload((x) => x + 1);
  };
  const setOn = async (on: boolean) => {
    setBusy("on");
    try {
      const r = await fetch("/api/me/mascot", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: on ? "kkirok" : "none" }) });
      if (!r.ok) throw new Error();
      setState({ status: "done", data: { ...d, on } });
      toast.show(on ? "캐릭터를 다시 보이게 했어요" : "캐릭터 없이 글자로만 보이게 했어요");
    } catch {
      toast.show("바꾸지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(null); }
  };

  const b = d.buddy;
  const plan = planOf(a.plan);
  const md = (iso: string) => { const k = new Date(new Date(iso).getTime() + 9 * 3600e3); return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일`; };

  return (
    <div className="flex flex-col gap-8">
      {b ? (
        <Card className="flex flex-col items-center gap-3 bg-sunken border-transparent text-center">
          <Buddy ingredient={b.ingredient} personality={b.personality} mood={d.mood} stage={d.stage.key} size={140} />
          <div className="flex flex-col gap-1">
            <h2 className="text-title font-bold text-ink">{b.name}</h2>
            <span className="text-label text-ink-2 num">
              {d.stage.name} · 같이 기록한 날 {d.days}일{d.stage.next ? ` · ${d.stage.next.name}까지 ${d.stage.next.left}일` : ""}
            </span>
          </div>
          {d.line && <p className="w-full rounded-md bg-surface px-4 py-3 text-body text-ink">{d.line}</p>}
          <LinkButton href="/buddy" icon="message" className="self-stretch">{b.name}에게 말 걸기</LinkButton>
          <span className="text-caption text-ink-2">{personalityOf(b.personality)?.how} · {GROUP_NAME[ingredientOf(b.ingredient)?.group ?? "carb"]} 재료 · 내 화면에만 나와요</span>
        </Card>
      ) : (
        <EmptyState title="아직 같이 다니는 캐릭터가 없어요" description="보자기를 풀면 같이 먹을 재료 캐릭터가 나와요. 크는 건 같이 기록한 날 수로만이에요" />
      )}

      {d.wraps.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="wrap-h">
          <h2 id="wrap-h" className="text-body font-bold text-ink">도착한 보자기 {d.wraps.length}개</h2>
          <Card className="flex flex-col p-0">
            {d.wraps.map((w) => {
              const t = wrapText(w);
              return <ListRow key={w.id} className="px-4" title={t.title} meta={t.meta}
                trailing={<Button size="sm" variant={b ? "secondary" : "primary"} loading={busy === w.id} onClick={() => open(w.id)}>풀기</Button>} />;
            })}
          </Card>
        </section>
      )}

      {d.collection.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="mine-h">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="mine-h" className="text-body font-bold text-ink">내 캐릭터 {d.collection.length}마리</h2>
            <span className="text-caption text-ink-2">{a.mode === "beta" ? "체험 기간이라 칸 제한 없음" : `키울 수 있는 칸 ${a.slots}`}</span>
          </div>
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-labelledby="mine-h">
            {d.collection.map((c) => (
              <ChoiceCard key={c.id} align="center" selected={c.active} onClick={() => activate(c)}
                title={<span className="flex flex-col items-center gap-1"><Buddy ingredient={c.ingredient} personality={c.personality} size={64} decorative />{c.name}</span>}
                description={c.active ? "같이 다니는 중" : busy === c.id ? "바꾸는 중…" : "눌러서 같이 다니기"} />
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2" aria-labelledby="show-h">
        <h2 id="show-h" className="text-body font-bold text-ink">보이기</h2>
        <Switch checked={d.on} disabled={busy === "on"} onChange={setOn} label="캐릭터 보이기"
          description="끄면 기록·챌린지 화면과 알림에 캐릭터 없이 글자로만 나와요" />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="plan-h">
        <h2 id="plan-h" className="text-body font-bold text-ink">요금제</h2>
        {a.mode === "beta" ? (
          <Notice icon="info" title="지금은 체험 기간이라 모든 기능을 쓸 수 있어요">
            <p>캐릭터 1마리와 같이 먹기·칭찬·자라기는 앞으로도 무료예요. 구독이 시작되면 숫자 체크·매 끼니 추천·주간 리포트는 기본 구독, 여러 마리 키우기·성격 바꾸기·꾸미기는 플러스 구독에서 써요. 저절로 결제되지는 않아요.</p>
            <div><TextButton onClick={() => setPlansOpen(true)}>요금제 보기</TextButton></div>
          </Notice>
        ) : (
          <Card className="p-0">
            <ListRow className="px-4" title={plan.name}
              meta={plan.code === "basic" ? "기록 · 챌린지 · 가족 · 캐릭터 1마리"
                : a.retrying ? `결제가 되지 않아 다시 시도하고 있어요 · ${md(a.until!)}부터 3일 동안은 그대로 써요`
                : a.renews ? `월 ${won(plan.price)} · 다음 결제 ${md(a.until!)}`
                : `${md(a.until!)}까지 써요 · 다음 결제는 없어요`}
              trailing={<TextButton onClick={() => setPlansOpen(true)}>{plan.code === "basic" ? "구독하기" : "요금제 보기"}</TextButton>} />
          </Card>
        )}
      </section>

      <Sheet open={!!revealed} onClose={() => setRevealed(null)} title="보자기에서 나왔어요"
        description={revealed?.rare ? "드문 재료예요!" : undefined}
        footer={<Button block onClick={() => setRevealed(null)}>같이 먹기 시작하기</Button>}>
        {revealed && (
          <div className="flex flex-col items-center gap-3 text-center py-2">
            <Buddy ingredient={revealed.buddy.ingredient} personality={revealed.buddy.personality} mood="done" stage="sprout" size={160} />
            <span className="text-title font-bold text-ink">{revealed.buddy.name}</span>
            <span className="text-label text-ink-2">{personalityOf(revealed.buddy.personality)?.how}</span>
            {!revealed.buddy.active && <span className="text-caption text-ink-2">내 캐릭터에서 눌러 같이 다닐 수 있어요</span>}
          </div>
        )}
      </Sheet>

      <PlanSheet open={plansOpen} access={a} plans={d.plans} onClose={() => setPlansOpen(false)} />
    </div>
  );
}

/** 요금제 보기 — 결제(토스 자동결제)는 구독을 열 때 붙인다 */
function PlanSheet({ open, access, plans, onClose }: { open: boolean; access: Access; plans: Plan[]; onClose: () => void }) {
  const paid = plans.filter((p) => p.price > 0);
  const [code, setCode] = useState(paid[0]?.code ?? "kkirok");
  const chosen = planOf(code);
  const current = access.mode === "store" && access.plan === code;
  return (
    <Sheet open={open} onClose={onClose} title="요금제" description="캐릭터 1마리와 같이 먹기·칭찬은 무료예요 · 언제든 해지할 수 있고, 해지해도 남은 기간까지 써요"
      footer={
        <Button block disabled={!SUBSCRIPTION_ENABLED || current}>
          {!SUBSCRIPTION_ENABLED ? "구독은 준비 중이에요" : current ? "지금 쓰고 있어요" : `월 ${won(chosen.price)}로 구독하기`}
        </Button>
      }>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="요금제">
          {paid.map((p) => (
            <ChoiceCard key={p.code} selected={code === p.code} onClick={() => setCode(p.code)}
              title={<span className="flex items-baseline justify-between gap-3"><span>{p.name}</span><span className="num whitespace-nowrap">월 {won(p.price)}</span></span>}
              description={p.about} />
          ))}
        </div>
        <ul className="flex flex-col gap-1 text-caption text-ink-2 list-disc pl-4">
          <li>가격은 부가세 포함이에요. 올리면 남은 날만큼 차액을 바로 내고, 내리면 다음 결제일부터 바뀌어요</li>
          <li>결제 후 7일 안에 해지하고 그동안 구독 기능을 한 번도 쓰지 않았으면 전액 돌려 드려요</li>
          <li>가격이 오르면 30일 전에 알려 드리고, 동의하지 않으면 오른 값으로 결제하지 않아요</li>
          <li>돈을 내고 캐릭터를 랜덤으로 뽑는 건 없어요. 보자기는 기록으로만 받아요</li>
          <li>구독은 로그인한 계정에만 돼요</li>
        </ul>
      </div>
    </Sheet>
  );
}
