"use client";

import { useEffect, useState } from "react";
import { Button, Icon, IconButton, cn, useToast } from "@/components/ui";
import { enableError, enablePush, pushState } from "@/lib/push-client";

/**
 * 첫 기록 뒤에 한 번 묻는 알림 켜기 줄 — 처음 화면에서 바로 권한을 묻지 않는다.
 * 이미 켰거나·막았거나·지원 안 하거나·닫았으면 보이지 않는다.
 */
const KEY = "cf-push-prompt-dismissed";

export default function PushPrompt({ className }: { className?: string }) {
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    let dismissed = false;
    try { dismissed = localStorage.getItem(KEY) === "1"; } catch { dismissed = false; } // ds-allow: 저장소를 못 읽으면 묻는다
    if (dismissed) return;
    Promise.all([pushState(), fetch("/api/push/key").then((r) => r.json())])
      .then(([s, k]) => { if (alive) setShow(s === "off" && !!k.key); })
      .catch(() => {}); // ds-allow: 보조 안내 — 확인 못 하면 띄우지 않는다
    return () => { alive = false; };
  }, []);

  const close = () => {
    setShow(false);
    try { localStorage.setItem(KEY, "1"); } catch { return; } // ds-allow: 못 적으면 다음에 다시 묻는다
  };

  const turnOn = async () => {
    setBusy(true);
    try {
      await enablePush();
      close();
      toast.show("알림을 켰어요. 마이페이지 > 알림 설정에서 종류를 고를 수 있어요");
    } catch (e) {
      toast.show(enableError(e), { tone: "danger" });
    } finally { setBusy(false); }
  };

  if (!show) return null;
  return (
    <div className={cn("flex items-center gap-3 rounded-md bg-sunken px-4 py-3", className)}>
      <Icon name="bell" size={20} className="text-brand-ink shrink-0" />
      <p className="flex-1 min-w-0 text-label text-ink">점심·저녁 기록을 잊지 않게 알려 드릴까요?</p>
      <Button size="sm" variant="secondary" loading={busy} onClick={turnOn}>알림 켜기</Button>
      <IconButton icon="close" size="sm" label="알림 안내 닫기" onClick={close} />
    </div>
  );
}
