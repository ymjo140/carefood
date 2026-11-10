"use client";

import { useEffect, useState } from "react";
import { Button, Card, EmptyState, Notice, SectionHeader, Skeleton, Switch, useToast } from "@/components/ui";
import { disablePush, enableError, enablePush, pushState, type PushState } from "@/lib/push-client";

/**
 * 알림 설정 — 이 기기에서 켜기/끄기 + 알림 종류별 켜고 끄기.
 * 켜는 버튼이 이 화면의 주 행동 하나. 종류 설정은 사람 기준(기기가 여러 대여도 같음).
 */
type Prefs = { meals: boolean; weekly: boolean; community: boolean; challenge: boolean };
const KINDS: { key: keyof Prefs; label: string; description: string }[] = [
  { key: "meals", label: "끼니 기록 알림", description: "점심 1시·저녁 8시가 지나도 그 끼니 기록이 없을 때" },
  { key: "weekly", label: "주간 요약", description: "월요일 아침, 지난주 기록한 날 수와 하루 평균" },
  { key: "community", label: "커뮤니티 소식", description: "내 글 답글 · 내 답글의 답글 · 새 팔로워" },
  { key: "challenge", label: "챌린지 알림", description: "참여 중인데 저녁까지 오늘 기록이 없을 때" },
];

export function NotificationSettings() {
  const toast = useToast();
  const [device, setDevice] = useState<PushState | null>(null);
  const [server, setServer] = useState<{ status: "loading" | "error" | "done"; prefs?: Prefs; ready?: boolean }>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    pushState().then((s) => { if (alive) setDevice(s); }).catch(() => { if (alive) setDevice("unsupported"); });
    fetch("/api/push/prefs")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (alive) setServer({ status: "done", prefs: d.prefs, ready: d.ready }); })
      .catch(() => { if (alive) setServer({ status: "error" }); });
    return () => { alive = false; };
  }, [attempt]);

  const turnOn = async () => {
    setBusy(true);
    try {
      await enablePush();
      setDevice("on");
      toast.show("알림을 켰어요. 확인 알림을 보냈어요");
      fetch("/api/push/test", { method: "POST" }).catch(() => {}); // ds-allow: 확인 알림은 덤 — 못 가도 켜진 상태는 그대로
    } catch (e) {
      toast.show(enableError(e), { tone: "danger" });
      pushState().then(setDevice).catch(() => {}); // ds-allow: 상태 다시 읽기 실패는 화면을 그대로 둔다
    } finally { setBusy(false); }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await disablePush();
      setDevice("off");
      toast.show("이 기기 알림을 껐어요");
    } catch {
      toast.show("알림을 끄지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(false); }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/push/test", { method: "POST" });
      if (!r.ok) throw new Error(String(r.status));
      toast.show("확인 알림을 보냈어요");
    } catch {
      toast.show("확인 알림을 보내지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(false); }
  };

  const setPref = async (key: keyof Prefs, value: boolean) => {
    if (!server.prefs) return;
    const before = server.prefs;
    setServer((s) => ({ ...s, prefs: { ...before, [key]: value } }));
    try {
      const r = await fetch("/api/push/prefs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: value }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error);
      if (d.prefs) setServer((s) => ({ ...s, prefs: d.prefs }));
    } catch {
      setServer((s) => ({ ...s, prefs: before }));
      toast.show("알림 설정을 바꾸지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
  };

  if (server.status === "error") {
    return (
      <EmptyState title="알림 설정을 불러오지 못했어요" description="연결이 잠깐 끊겼을 수 있어요"
        action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setServer({ status: "loading" }); setAttempt((n) => n + 1); }}>다시 불러오기</Button>} />
    );
  }
  if (server.status === "loading" || device === null) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  const on = device === "on";
  return (
    <div className="flex flex-col gap-8">
      <Card className="flex flex-col gap-3">
        <h2 className="text-body font-bold text-ink">이 기기</h2>
        {!server.ready ? (
          <Notice icon="info">알림을 준비하고 있어요. 준비가 끝나면 여기서 켤 수 있어요</Notice>
        ) : device === "unsupported" ? (
          <Notice icon="info">이 브라우저는 알림을 지원하지 않아요. 크롬·엣지·사파리(홈 화면 앱)에서 켤 수 있어요</Notice>
        ) : device === "ios-install" ? (
          <Notice icon="info" title="아이폰은 홈 화면 앱에서 켤 수 있어요">사파리 아래 공유 버튼 → ‘홈 화면에 추가’를 누르고, 홈 화면의 케어푸드를 열어 여기서 켜 주세요</Notice>
        ) : device === "denied" ? (
          <Notice tone="caution" title="브라우저에서 알림을 막아 두었어요">주소창 왼쪽 자물쇠(사이트 설정)에서 알림을 ‘허용’으로 바꾼 뒤 이 화면을 다시 열어 주세요</Notice>
        ) : on ? (
          <>
            <p className="text-label text-ink">이 기기에서 알림을 받고 있어요</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon="bell" loading={busy} onClick={sendTest}>확인 알림 보내기</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={turnOff}>이 기기 끄기</Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-label text-ink-2">켜면 아래에서 고른 알림만 보내요. 언제든 끌 수 있어요</p>
            <Button block icon="bell" loading={busy} onClick={turnOn}>이 기기에서 알림 켜기</Button>
          </>
        )}
      </Card>

      <section>
        <SectionHeader title="받을 알림" />
        <div className="flex flex-col divide-y divide-line">
          {KINDS.map((k) => (
            <Switch key={k.key} label={k.label} description={k.description} checked={!!server.prefs?.[k.key]}
              onChange={(v) => setPref(k.key, v)} />
          ))}
        </div>
        {!on && <p className="text-caption text-ink-2 mt-2">이 기기 알림을 켜야 실제로 받아요. 고른 종류는 다른 기기에도 똑같이 적용돼요</p>}
      </section>
    </div>
  );
}
