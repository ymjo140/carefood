"use client";

import { useEffect, useState } from "react";
import { Button, ConfirmSheet, EmptyState, IconButton, LinkButton, ListRow, SkeletonList, Stat, Thumb, timeAgo, useToast } from "@/components/ui";

/**
 * 내 공유 — 공유한 인증 카드 링크 목록. 링크마다 본 사람 · 같이 시작한 사람(사람 수만), 링크 끄기.
 * 맨 위 숫자 하나: 내 공유로 같이 시작한 사람.
 */
type Item = { code: string; kind: string; target_url: string; card_url: string | null; shared_at: string; visitors: number; joins: number };
const KIND: Record<string, string> = { meal: "식단 인증", day: "하루 기록", streak: "연속 기록", challenge: "챌린지 초대", group_buy: "공구", month: "한 달 기록" };

export function ShareList() {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; items: Item[]; total: { visitors: number; joins: number } }>({ status: "loading", items: [], total: { visitors: 0, joins: 0 } });
  const [attempt, setAttempt] = useState(0);
  const [off, setOff] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/share/mine")
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || ""); if (alive) setState({ status: "done", items: d.items || [], total: d.total }); })
      .catch(() => { if (alive) setState((s) => ({ ...s, status: "error" })); });
    return () => { alive = false; };
  }, [attempt]);

  const revoke = async () => {
    if (!off) return;
    setBusy(true);
    try {
      const r = await fetch("/api/share", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: off.code }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "");
      setState((s) => ({ ...s, items: s.items.filter((i) => i.code !== off.code) }));
      setOff(null);
      toast.show("링크를 껐어요. 이제 이 링크로는 들어올 수 없어요");
    } catch (e) {
      toast.show((e as Error).message || "링크를 끄지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(false); }
  };

  if (state.status === "loading") return <SkeletonList rows={4} />;
  if (state.status === "error") {
    return (
      <EmptyState title="내 공유를 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
        action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState((s) => ({ ...s, status: "loading" })); setAttempt((n) => n + 1); }}>다시 불러오기</Button>} />
    );
  }
  if (state.items.length === 0) {
    return (
      <EmptyState title="아직 공유한 카드가 없어요" description="식단을 기록하거나 챌린지를 하면 인증 카드를 만들어 인스타에 올릴 수 있어요"
        action={<LinkButton href="/community/challenges" size="sm" variant="secondary">챌린지 보기</LinkButton>} />
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <Stat label="같이 시작한 사람" value={state.total.joins} unit="명" emphasis />
        <Stat label="링크를 본 사람" value={state.total.visitors} unit="명" />
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {state.items.map((i) => (
          <li key={i.code}>
            <ListRow leading={<Thumb src={i.card_url} size={48} />}
              title={KIND[i.kind] || "인증 카드"}
              meta={<>{timeAgo(i.shared_at)} · 본 사람 <span className="num">{i.visitors}</span> · 같이 시작 <span className="num">{i.joins}</span></>}
              trailing={<IconButton icon="close" size="sm" label={`${KIND[i.kind] || "인증 카드"} 링크 끄기`} onClick={() => setOff(i)} />} />
          </li>
        ))}
      </ul>
      <ConfirmSheet open={!!off} onClose={() => setOff(null)} loading={busy}
        title="이 링크를 끌까요?" description="링크를 누른 사람은 들어올 수 없게 되고, 카드 그림도 지워요. 이미 같이 하는 사람은 그대로예요"
        confirmLabel="링크 끄기" onConfirm={revoke} />
    </>
  );
}
