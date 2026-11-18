"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  BackButton, BottomBar, Button, Card, Checkbox, EmptyState, Icon, LinkButton, Page, PageHeader, SectionHeader, Skeleton, Switch, useToast,
} from "@/components/ui";
import { josa } from "@/lib/buddy";

/**
 * /family/request/[id] — 가족이 보낸 '이것도 보여 줄래요?'에 답하는 동의 화면 (확인받는 사람만)
 *   요청한 항목만 하나씩 켠다(기본 꺼짐). 하나라도 켜면 따로 동의 체크. '지금은 안 할게요'를 누르면 가족에게는 '지금은 어려워요'로만.
 *   켠 것은 마이페이지 › 내 정보 › 내 가족에서 언제든 끈다. 건강 목표·체중·검진 수치는 어떤 경우에도 보이지 않는다.
 */
type Ask = "foods" | "proxy";
type Req = {
  id: string; who: string | null; asks: Ask[]; status: "pending" | "accepted" | "declined"; granted: Ask[];
  scopes: { meals: boolean; products: boolean; meds: boolean; numbers: boolean; foods: boolean; proxy: boolean };
};
type State = { kind: "loading" } | { kind: "login" } | { kind: "missing" } | { kind: "error" } | { kind: "ready"; req: Req };

const NOW_LABEL: { key: "meals" | "meds" | "numbers" | "products"; label: string }[] = [
  { key: "meals", label: "끼니를 기록했는지 · 시각" },
  { key: "meds", label: "약 먹었는지" },
  { key: "numbers", label: "열량·영양 숫자" },
  { key: "products", label: "이번 주 고른 제품" },
];

export default function FamilyRequestPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [on, setOn] = useState<Record<Ask, boolean>>({ foods: false, proxy: false });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const my = ++seq.current;
    fetch(`/api/family/requests/${id}`)
      .then(async (r) => {
        if (r.status === 401) return { kind: "login" } as State;
        if (r.status === 404) return { kind: "missing" } as State;
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || String(r.status));
        return { kind: "ready", req: d as Req } as State;
      })
      .then((s) => { if (my === seq.current) setState(s); })
      .catch((e) => { console.error(e); if (my === seq.current) setState({ kind: "error" }); });
  }, [id, attempt]);

  const answer = async (yes: boolean) => {
    if (state.kind !== "ready") return;
    const grant = yes ? state.req.asks.filter((a) => on[a]) : [];
    setBusy(yes ? "yes" : "no");
    try {
      const r = await fetch(`/api/family/requests/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grant, agree: yes && agree }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.show(d.error || "답하지 못했어요. 다시 시도해 주세요", { tone: "danger" }); return; }
      toast.show(grant.length ? "보여 줄 것을 바꿨어요" : "지금은 안 하기로 했어요");
      router.push("/family");
    } catch {
      toast.show("답하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally {
      setBusy(null);
    }
  };

  if (state.kind === "loading") {
    return <Page width="narrow"><BackButton fallback="/family" /><div className="flex flex-col gap-4 pt-4"><Skeleton className="h-8 w-3/4" /><Skeleton className="h-40 rounded-lg" /><Skeleton className="h-24 rounded-lg" /></div></Page>;
  }
  if (state.kind === "login") {
    return (
      <Page width="narrow"><BackButton fallback="/family" />
        <EmptyState title="로그인하고 답해 주세요" description="가족 연결은 로그인한 계정에서만 볼 수 있어요"
          action={<LinkButton href={`/login?returnTo=${encodeURIComponent(`/family/request/${id}`)}`}>로그인하기</LinkButton>} />
      </Page>
    );
  }
  if (state.kind === "missing" || state.kind === "error") {
    return (
      <Page width="narrow"><BackButton fallback="/family" />
        {state.kind === "missing"
          ? <EmptyState title="요청을 찾지 못했어요" description="연결이 끝났거나 다른 계정의 요청이에요" action={<LinkButton variant="secondary" href="/family">가족 화면으로</LinkButton>} />
          : <EmptyState title="요청을 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
              action={<Button variant="secondary" icon="refresh" onClick={() => { setState({ kind: "loading" }); setAttempt((n) => n + 1); }}>다시 불러오기</Button>} />}
      </Page>
    );
  }

  const req = state.req;
  const who = req.who || "가족";
  const ga = `${who}${josa(who, "이", "가")}`;
  if (req.status !== "pending") {
    return (
      <Page width="narrow"><BackButton fallback="/family" />
        <EmptyState title="이미 답한 요청이에요" description={req.status === "accepted" ? "켠 항목은 가족 화면에서 바꾸거나 끌 수 있어요" : "다시 보여 주고 싶으면 가족 화면에서 켤 수 있어요"}
          action={<LinkButton variant="secondary" href="/family">가족 화면으로</LinkButton>} />
      </Page>
    );
  }
  const any = req.asks.some((a) => on[a]);
  const ASK = {
    foods: { title: "먹은 음식", hint: `끼니마다 음식 이름과 양이 ${who}에게 보여요` },
    proxy: { title: "대신 기록하기", hint: `${ga} 담아 둔 끼니와 약 체크를 대신 기록할 수 있어요. 그 기록에는 '${ga} 기록'이 붙어요` },
  } as const;

  return (
    <Page width="narrow">
      <BackButton fallback="/family" />
      <PageHeader title={`${who}에게 더 보여 줄까요?`} description="켠 것만 보여요. 언제든 마이페이지 › 내 정보 › 내 가족에서 끌 수 있어요" className="mt-2" />

      <div className="flex flex-col gap-6 pb-40">
        <Card className="flex flex-col gap-1">
          <h2 className="text-label font-bold text-ink">{ga} 요청한 것</h2>
          {req.asks.map((a) => (
            <Switch key={a} checked={on[a]} onChange={(v) => setOn((s) => ({ ...s, [a]: v }))} label={ASK[a].title} description={ASK[a].hint} />
          ))}
        </Card>

        <section aria-labelledby="now-h">
          <SectionHeader title={<span id="now-h">지금 보여 주는 것</span>} />
          <ul className="flex flex-col gap-1.5">
            {NOW_LABEL.map((n) => (
              <li key={n.key} className={req.scopes[n.key] ? "flex items-center gap-2 text-label text-ink" : "flex items-center gap-2 text-label text-ink-2"}>
                <Icon name={req.scopes[n.key] ? "check" : "close"} size={18} className={req.scopes[n.key] ? "text-positive shrink-0" : "text-ink-3 shrink-0"} />
                {n.label}{!req.scopes[n.key] && " — 보여 주지 않음"}
              </li>
            ))}
          </ul>
          <p className="text-caption text-ink-2 mt-2">건강 목표·체중·검진 수치는 어떤 경우에도 보이지 않아요</p>
        </section>

        {any && (
          <Checkbox checked={agree} onChange={(e) => setAgree(e.target.checked)}
            label={<span className="text-label">켠 항목을 {who}에게 보여 주는 데 동의해요 <span className="text-ink-2">(먹은 음식은 건강과 관련된 정보예요)</span></span>} />
        )}
      </div>

      <BottomBar>
        <div className="flex flex-col gap-2 w-full">
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" loading={busy === "no"} disabled={!!busy} onClick={() => answer(false)}>지금은 안 할게요</Button>
            <Button className="flex-1" loading={busy === "yes"} disabled={!!busy || !any || !agree} onClick={() => answer(true)}>보여 주기</Button>
          </div>
          <p className="text-caption text-ink-2 text-center">안 해도 {who}에게는 &lsquo;지금은 어려워요&rsquo;로만 알려요</p>
        </div>
      </BottomBar>
    </Page>
  );
}
