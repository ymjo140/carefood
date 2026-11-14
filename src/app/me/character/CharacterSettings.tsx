"use client";

import { useEffect, useState } from "react";
import { BottomBar, Button, Card, ChoiceCard, EmptyState, Icon, ListRow, Mascot, MASCOTS, MOOD_NAMES, Notice, Sheet, Skeleton, TextButton, useToast } from "@/components/ui";
import type { MascotKind, MascotMood } from "@/components/ui";
import { lineOf, type MascotPrefs } from "@/lib/mascot";
import { cheapestPlanFor, planOf, won, type Access, type Plan, type PlanCode } from "@/lib/plans";
import { SUBSCRIPTION_ENABLED } from "@/lib/features";

/**
 * 캐릭터 고르기 — 끼록이·람이·끼냥이·캐릭터 없이. 캐릭터를 고르면 표정·삐지기가 함께 켜지고, 끄려면 '캐릭터 없이'.
 * 위 미리 보기는 지금 내 기록으로 정해진 표정 (/api/me/mascot). 저장하기를 눌러야 바뀐다.
 * 구독(lib/plans.ts): 기본 무료(캐릭터 없이) · 끼록이 플랜 · 모든 캐릭터 플랜. 구독에 없는 캐릭터를 누르면 표정 8가지 미리 보기 + 요금제 시트.
 * 구독을 열기 전(체험 기간)에는 모든 캐릭터를 쓸 수 있고, 시트의 구독하기는 '준비 중'.
 */
type Data = {
  prefs: MascotPrefs; chosen: MascotPrefs["kind"]; access: Access; plans: Plan[];
  mood: MascotMood; welcome_back: boolean; streak: number; meals: number;
};
const MOODS = Object.keys(MOOD_NAMES) as MascotMood[];
const NAME: Record<MascotKind, string> = { kkirok: "끼록이", rami: "람이", kkinyang: "끼냥이" };
const md = (iso: string) => { const k = new Date(new Date(iso).getTime() + 9 * 3600e3); return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일`; };

export function CharacterSettings() {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data: Data | null }>({ status: "loading", data: null });
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<MascotPrefs | null>(null);
  const [saving, setSaving] = useState(false);
  /** 요금제 시트 — 어느 캐릭터를 보고 열었나 */
  const [sheet, setSheetState] = useState<{ kind: MascotKind; n: number; open: boolean }>({ kind: "kkirok", n: 0, open: false });
  const setSheet = (k: MascotKind | null) => setSheetState((s) => (k ? { kind: k, n: s.n + 1, open: true } : { ...s, open: false }));

  useEffect(() => {
    let alive = true;
    fetch("/api/me/mascot")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (alive) { setState({ status: "done", data: d }); setDraft(d.prefs); } })
      .catch(() => { if (alive) setState({ status: "error", data: null }); });
    return () => { alive = false; };
  }, [attempt]);

  if (state.status === "loading") return <div className="flex flex-col gap-4"><Skeleton className="h-32 rounded-lg" /><Skeleton className="h-64 rounded-lg" /></div>;
  if (state.status === "error" || !state.data || !draft) {
    return (
      <EmptyState title="캐릭터 설정을 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
        action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading", data: null }); setAttempt((n) => n + 1); }}>다시 불러오기</Button>} />
    );
  }
  const d = state.data;
  const a = d.access;
  const changed = JSON.stringify(draft) !== JSON.stringify(d.prefs);
  const kind = draft.kind === "none" ? null : draft.kind;
  const can = (k: MascotKind) => a.characters.includes(k);
  const plan = planOf(a.plan);
  const ended = d.chosen !== "none" && d.prefs.kind === "none" && a.mode === "store";

  const pick = (k: MascotKind) => (can(k) ? setDraft({ ...draft, kind: k }) : setSheet(k));
  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/me/mascot", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "");
      setState({ status: "done", data: { ...d, prefs: j.prefs, chosen: j.prefs.kind, access: j.access ?? a } });
      setDraft(j.prefs);
      toast.show("캐릭터 설정을 저장했어요");
    } catch (e) {
      toast.show((e as Error).message || "저장하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col gap-8 pb-24">
      <Card className="flex items-center gap-4 bg-sunken border-transparent">
        {kind ? <Mascot kind={kind} mood={d.mood} size={96} streak={d.streak} /> : (
          <span aria-hidden="true" className="size-20 shrink-0 rounded-lg bg-surface flex items-center justify-center text-title font-bold text-ink-2">가</span>
        )}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <p className="text-body text-ink">{kind ? lineOf(kind, { mood: d.mood, welcomeBack: d.welcome_back }, { streak: d.streak, meals: d.meals }) : "캐릭터 없이 글자로만 알려 드려요"}</p>
          <p className="text-caption text-ink-2">지금 내 기록으로 정해진 표정이에요 · 내 화면에만 나와요</p>
        </div>
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby="plan-h">
        <h2 id="plan-h" className="text-body font-bold text-ink">내 요금제</h2>
        {a.mode === "beta" ? (
          <Notice icon="info" title="지금은 체험 기간이라 모든 캐릭터를 쓸 수 있어요">
            구독이 시작되면 끼록이는 끼록이 플랜, 람이·끼냥이는 모든 캐릭터 플랜에서 쓸 수 있어요. 구독하지 않으면 &lsquo;캐릭터 없이&rsquo;로 바뀌고, 저절로 결제되지는 않아요.
            <TextButton className="block" onClick={() => setSheet(kind ?? "kkirok")}>요금제 보기</TextButton>
          </Notice>
        ) : (
          <Card className="p-0">
            <ListRow className="px-4" title={plan.name}
              meta={plan.code === "basic" ? "무료 · 캐릭터 없이 글자로만"
                : a.retrying ? `결제가 되지 않아 다시 시도하고 있어요 · ${md(a.until!)}부터 3일 동안은 그대로 써요`
                : a.renews ? `월 ${won(plan.price)} · 다음 결제 ${md(a.until!)}`
                : `${md(a.until!)}까지 써요 · 다음 결제는 없어요`}
              trailing={<TextButton onClick={() => setSheet(kind ?? "rami")}>{plan.code === "basic" ? "구독하기" : "요금제 보기"}</TextButton>} />
          </Card>
        )}
        {ended && <p className="text-caption text-ink-2">구독이 끝나 {NAME[d.chosen as MascotKind]} 대신 글자로 보여요. 다시 구독하면 그대로 돌아와요</p>}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="pick-h">
        <h2 id="pick-h" className="text-body font-bold text-ink">같이 할 캐릭터</h2>
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-labelledby="pick-h">
          {MASCOTS.map((m) => {
            const p = cheapestPlanFor(m.kind);
            const locked = !can(m.kind);
            return (
              <ChoiceCard key={m.kind} align="center" selected={draft.kind === m.kind} onClick={() => pick(m.kind)}
                title={<span className="flex flex-col items-center gap-1"><Mascot kind={m.kind} mood="wait" size={56} />
                  <span className="inline-flex items-center gap-1">{locked && <Icon name="lock" size={16} className="text-ink-2" />}{m.name}</span></span>}
                description={<span className="flex flex-col"><span>{m.about}</span><span className="text-ink-2">{a.mode === "beta" ? `체험 중 · ${p.name}` : locked ? `${p.name} · 월 ${won(p.price)}` : plan.name}</span></span>} />
            );
          })}
          <ChoiceCard align="center" selected={draft.kind === "none"} onClick={() => setDraft({ ...draft, kind: "none" })}
            title={<span className="flex flex-col items-center gap-1"><span aria-hidden="true" className="size-14 rounded-md bg-sunken flex items-center justify-center text-title font-bold text-ink-2">가</span>캐릭터 없이</span>}
            description={<span className="flex flex-col"><span>글자로만 담백하게</span><span className="text-ink-2">기본 · 무료</span></span>} />
        </div>
        <TextButton className="self-start" onClick={() => setSheet(kind ?? "kkirok")}>표정 8가지 미리 보기</TextButton>
      </section>

      {/* ds-wiring-drop: talk-h — '말 거는 방식' 구역을 지움 (캐릭터를 고르면 늘 켜지고, 끄려면 '캐릭터 없이') */}
      <BottomBar>
        <Button block loading={saving} disabled={!changed} onClick={save}>저장하기</Button>
      </BottomBar>

      <PlanSheet key={sheet.n} open={sheet.open} focus={sheet.kind} access={a} plans={d.plans} onClose={() => setSheet(null)} />
    </div>
  );
}

/** 표정 8가지 미리 보기(청약철회 제한 전 체험) + 요금제 고르기 — 결제(토스 자동결제)는 구독을 열 때 붙인다 */
function PlanSheet({ open, focus, access, plans, onClose }: { open: boolean; focus: MascotKind; access: Access; plans: Plan[]; onClose: () => void }) {
  // 열 때마다 key 가 바뀌어 처음 값을 다시 정한다 — 보고 연 캐릭터 · 그 캐릭터가 든 지금 요금제(없으면 가장 싼 것)
  const [kind, setKind] = useState<MascotKind>(focus);
  const [code, setCode] = useState<PlanCode>(() => (access.plan !== "basic" && planOf(access.plan).characters.includes(focus) ? access.plan : cheapestPlanFor(focus).code));
  const paid = plans.filter((p) => p.price > 0);
  const chosen = planOf(code);
  const current = access.mode === "store" && access.plan === code;

  return (
    <Sheet open={open} onClose={onClose} title="캐릭터 요금제" description="매달 같은 날 결제돼요 · 언제든 해지할 수 있고, 해지해도 남은 기간까지 써요"
      footer={
        <Button block disabled={!SUBSCRIPTION_ENABLED || current}>
          {!SUBSCRIPTION_ENABLED ? "구독은 준비 중이에요" : current ? "지금 쓰고 있어요" : `월 ${won(chosen.price)}로 구독하기`}
        </Button>
      }>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="미리 볼 캐릭터">
            {MASCOTS.map((m) => (
              <ChoiceCard key={m.kind} size="sm" align="center" selected={kind === m.kind} onClick={() => setKind(m.kind)} title={m.name} />
            ))}
          </div>
          <ul className="grid grid-cols-4 gap-x-2 gap-y-3" aria-label={`${NAME[kind]} 표정 8가지`}>
            {MOODS.map((mo) => (
              <li key={mo} className="flex flex-col items-center gap-1">
                <Mascot kind={kind} mood={mo} size={56} />
                <span className="text-caption text-ink-2 text-center">{MOOD_NAMES[mo]}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-2" role="radiogroup" aria-label="요금제">
          {paid.map((p) => (
            <ChoiceCard key={p.code} selected={code === p.code} onClick={() => setCode(p.code)}
              title={<span className="flex items-baseline justify-between gap-3"><span>{p.name}</span><span className="num whitespace-nowrap">월 {won(p.price)}</span></span>}
              description={`${p.characters.map((k) => NAME[k]).join("·")} · ${p.about}${p.characters.includes(kind) ? "" : ` · ${NAME[kind]}는 들어 있지 않아요`}`} />
          ))}
          <p className="text-caption text-ink-2">기본(무료)은 캐릭터 없이 글자로만 알려 드려요. 기록·챌린지·가족 기능은 요금제와 상관없이 그대로예요</p>
        </div>

        <ul className="flex flex-col gap-1 text-caption text-ink-2 list-disc pl-4">
          <li>가격은 부가세 포함이에요. 올리면 남은 날만큼 차액을 바로 내고, 내리면 다음 결제일부터 바뀌어요</li>
          <li>결제 후 7일 안에 해지하고 그동안 유료 캐릭터를 한 번도 쓰지 않았으면 전액 돌려 드려요. 쓰기 시작했으면 남은 기간까지 쓰고 다음 결제부터 멈춰요</li>
          <li>가격이 오르면 30일 전에 알려 드리고, 동의하지 않으면 오른 값으로 결제하지 않아요</li>
          <li>구독은 로그인한 계정에만 돼요</li>
        </ul>
      </div>
    </Sheet>
  );
}
