"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BottomBar, Button, Checkbox, EmptyState, KakaoButton, LinkButton, Page, Skeleton, TextLink, useToast } from "@/components/ui";

/**
 * 가족 초대 받기 — 큰 글자(간단 모드). 보여 줄 것을 직접 고르고, 건강에 관한 정보라 따로 동의받는다.
 * 기본: 끼니 기록 여부·고른 제품·약 먹었는지는 켜 두고, 열량·영양 숫자는 꺼 둔다. 체중·건강 목표·먹은 음식 이름은 보여 주지 않는다.
 * 로그인하지 않았으면 카카오로 로그인한 뒤 이 화면으로 돌아온다.
 */
type Scopes = { meals: boolean; products: boolean; meds: boolean; numbers: boolean };
const ITEMS: { key: keyof Scopes; title: string; hint: string }[] = [
  { key: "meals", title: "끼니를 기록했는지", hint: "아침·점심·저녁 기록 여부와 시각" },
  { key: "products", title: "고른 제품", hint: "앱에서 기록한 제품과 성분 한 줄" },
  { key: "meds", title: "약 먹었는지", hint: "내가 정한 이름(예: 아침 약)과 체크 여부만 · 약 이름은 보이지 않아요" },
  { key: "numbers", title: "열량·영양 숫자", hint: "하루 열량과 단백질·나트륨 숫자" },
];
const MESSAGES: Record<string, string> = {
  missing: "초대 링크를 찾지 못했어요",
  expired: "초대 링크가 지났어요. 가족에게 새 링크를 받아 주세요",
  used: "이미 받은 초대예요. 가족에게 새 링크를 받아 주세요",
};

export default function FamilyInvite() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data: { status: string; from: string | null; logged_in: boolean } | null }>({ status: "loading", data: null });
  const [attempt, setAttempt] = useState(0);
  const [scopes, setScopes] = useState<Scopes>({ meals: true, products: true, meds: true, numbers: false });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kakaoBusy, setKakaoBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/family/invite/${code}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok && r.status !== 404) throw new Error(d.error); if (alive) setState({ status: "done", data: d }); })
      .catch(() => { if (alive) setState({ status: "error", data: null }); });
    return () => { alive = false; };
  }, [code, attempt]);

  const accept = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/family/invite/${code}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scopes, agree }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "");
      toast.show("가족과 연결했어요. 보여 줄 것은 가족 화면에서 언제든 바꿀 수 있어요");
      router.push("/family");
    } catch (e) {
      toast.show((e as Error).message || "연결하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(false); }
  };

  if (state.status === "loading") return <Page width="narrow"><div className="flex flex-col gap-4 pt-8"><Skeleton className="h-10 w-3/4" /><Skeleton className="h-64 rounded-lg" /></div></Page>;
  if (state.status === "error" || !state.data) {
    return (
      <Page width="narrow">
        <EmptyState title="초대를 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
          action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading", data: null }); setAttempt((n) => n + 1); }}>다시 불러오기</Button>} />
      </Page>
    );
  }
  const d = state.data;
  if (d.status !== "pending") {
    return (
      <Page width="narrow">
        <EmptyState title={MESSAGES[d.status] || MESSAGES.missing} description="연결된 가족은 가족 화면에서 볼 수 있어요"
          action={<LinkButton size="sm" variant="secondary" href="/family">가족 화면으로 가기</LinkButton>} />
      </Page>
    );
  }
  const from = d.from ? `${d.from} 님이` : "가족이";
  const none = !scopes.meals && !scopes.products && !scopes.meds && !scopes.numbers;

  return (
    <Page width="narrow">
      <div className="flex flex-col gap-8 pt-6 pb-40">
        <section className="flex flex-col gap-3">
          <span className="text-body text-ink-2">간단 모드 · 큰 글자</span>
          <h1 className="text-display font-bold text-ink text-balance">{from} 가족으로 초대했어요</h1>
          <p className="text-title font-regular text-ink">무엇을 보여 줄지 골라 주세요. 언제든 바꾸거나 그만둘 수 있어요.</p>
        </section>

        {!d.logged_in ? (
          <section className="flex flex-col gap-3">
            <p className="text-body text-ink">먼저 로그인해 주세요. 로그인하면 이 화면으로 돌아와요</p>
            <KakaoButton href={`/auth/kakao?next=${encodeURIComponent(`/f/${code}`)}`} label="카카오로 로그인하기" loading={kakaoBusy} onClick={() => setKakaoBusy(true)} />
            <TextLink href={`/login?returnTo=${encodeURIComponent(`/f/${code}`)}`} className="self-center text-body">이메일로 로그인하기</TextLink>
          </section>
        ) : (
          <>
            <section className="flex flex-col gap-3" aria-labelledby="share-h">
              <h2 id="share-h" className="text-title font-bold text-ink">보여 줄 것</h2>
              <div className="flex flex-col rounded-lg border border-line bg-surface divide-y divide-line">
                {ITEMS.map((it) => (
                  <Checkbox key={it.key} className="px-4 py-4 items-start" checked={scopes[it.key]} onChange={(e) => setScopes({ ...scopes, [it.key]: e.target.checked })}
                    label={<span className="flex flex-col gap-1"><span className="text-title font-medium text-ink">{it.title}</span><span className="text-body text-ink-2">{it.hint}</span></span>} />
                ))}
              </div>
              <p className="text-body text-ink-2">체중, 건강 목표, 먹은 음식 이름은 보여 주지 않아요.</p>
            </section>

            <section className="flex flex-col gap-2 rounded-md bg-sunken px-4 py-4">
              <Checkbox checked={agree} onChange={(e) => setAgree(e.target.checked)} className="items-start"
                label={<span className="text-body text-ink">고른 항목은 건강에 관한 정보로, {d.from ? `${d.from} 님` : "초대한 가족"}에게 보여 주는 데 따로 동의합니다. 동의하지 않아도 오늘끼록은 그대로 쓸 수 있으며, 가족 화면에서 언제든 바꾸거나 철회할 수 있습니다.</span>} />
              <TextLink href="/privacy" className="text-body">개인정보 처리방침 보기</TextLink>
            </section>
          </>
        )}
      </div>

      {d.logged_in && (
        <BottomBar>
          <div className="flex flex-col gap-1 w-full">
            <Button block loading={busy} disabled={!agree || none} onClick={accept}>동의하고 함께하기</Button>
            {none && <p className="text-caption text-ink-2 text-center">보여 줄 것을 하나 이상 골라 주세요</p>}
          </div>
        </BottomBar>
      )}
    </Page>
  );
}
