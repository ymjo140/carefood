"use client";

import { useEffect, useState } from "react";
import { Button, Card, IconButton } from "@/components/ui";
import ShareCardSheet from "./ShareCardSheet";

/**
 * 기록 화면의 '오늘 인증하기' 한 줄 — 오늘 기록이 있을 때만, 하루 한 번.
 * 닫으면 그날은 다시 안 뜨고, 이틀 연달아 닫으면 7일 쉰다 (이 기기에만 저장).
 * 누르면 하루 기록 인증 카드(9:16)를 만든다. 링크는 하고 있는 챌린지 초대, 없으면 첫 화면.
 * 연속 기록이 3·7·14·21·30·50·100일(이후 50일마다)이 되는 날은 '연속 기록' 카드를 대신 권한다.
 */
const MILESTONES = [3, 7, 14, 21, 30, 50, 100];
const isMilestone = (n: number) => MILESTONES.includes(n) || (n > 100 && n % 50 === 0);
const KEY = "carefood_daycard";
type Saved = { closed?: string; streak?: number; snooze?: string };

function read(): Saved {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") as Saved; } catch { return {}; } // ds-allow: 저장소를 못 읽으면 처음처럼 보여 준다
}
function write(v: Saved) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ds-allow: 못 남기면 다음에 다시 보일 뿐 */ }
}

export default function DayCardPrompt({ date, meals, className }: { date: string; meals: number; className?: string }) {
  const [hidden, setHidden] = useState(true);
  const [open, setOpen] = useState(false);
  const [streak, setStreak] = useState<number | null>(null);

  // 오늘이 연속 기록 기념일인지 (못 불러오면 하루 카드만 권한다)
  useEffect(() => {
    if (hidden) return;
    let alive = true;
    fetch(`/api/community/share-card?kind=streak&id=${date}`)
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (alive && r.ok && typeof d.card?.streak === "number") setStreak(d.card.streak); })
      .catch((e) => console.warn("연속 기록을 확인하지 못했어요", e)); // ds-allow: 기념일 확인은 보조 — 하루 카드는 그대로 권한다
    return () => { alive = false; };
  }, [hidden, date]);
  const milestone = streak != null && isMilestone(streak);

  useEffect(() => {
    const s = read();
    setHidden(s.closed === date || (!!s.snooze && s.snooze >= date)); // eslint-disable-line react-hooks/set-state-in-effect -- 이 기기 저장소는 그린 뒤에 읽는다
  }, [date]);

  const close = () => {
    const s = read();
    const yesterdayClosed = !!s.closed && s.closed < date;
    const streak = yesterdayClosed ? (s.streak || 0) + 1 : 1;
    const snooze = streak >= 2 ? new Date(Date.parse(`${date}T00:00:00+09:00`) + 7 * 86400e3).toISOString().slice(0, 10) : undefined;
    write({ closed: date, streak: snooze ? 0 : streak, snooze });
    setHidden(true);
  };

  if (hidden) return null;
  return (
    <>
      <Card className={className}>
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-body font-medium text-ink">
              {milestone ? <>기록 <span className="num font-bold text-brand-ink">{streak}</span>일째예요</> : meals >= 3 ? "세 끼 다 기록했어요" : "오늘 기록을 인증해 보세요"}
            </p>
            <p className="text-label text-ink-2">인스타 스토리에 올릴 카드를 만들어요. 몸무게·목표는 들어가지 않아요</p>
          </div>
          <IconButton icon="close" size="sm" label="오늘은 그만 보기" onClick={close} />
        </div>
        <Button size="sm" variant="secondary" icon="share" className="mt-3" onClick={() => setOpen(true)}>인증 카드 만들기</Button>
      </Card>
      <ShareCardSheet target={open ? { kind: milestone ? "streak" : "day", id: date } : null} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
