"use client";

import { useEffect, useState } from "react";
import { todayKst } from "@/lib/day";
import { Button, Skeleton, TextLink } from "@/components/ui";

/**
 * 홈 '오늘' 한 줄 — 남은 칼로리 + 기록하기.
 * 추천이 첫 화면에 보이게 카드 세 장 대신 한 줄로 줄였다.
 * ds-wiring-drop: /api/community/group-buy?status=recruiting — 공구는 탭 바의 공구 탭이 맡는다
 * ds-wiring-drop: /api/diary/report — 주간 점수는 기록 탭의 리포트에서 본다
 * ds-wiring-drop: /diary/report — 같은 이유
 */
type Today = { entries: number; calories: number; goal: number | null };

export default function HomeTodayWidget() {
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; today?: Today }>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    // 식단 기록 화면과 같은 날짜 기준
    const date = todayKst();
    fetch(`/api/diary?date=${date}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (alive) setState({ status: "done", today: { entries: d.entries?.length || 0, calories: d.totals?.calories || 0, goal: d.goals?.daily_calories || null } });
      })
      .catch(() => { if (alive) setState({ status: "error" }); });
    return () => { alive = false; };
  }, [attempt]);

  if (state.status === "loading") return <Skeleton className="h-16 rounded-lg mt-6" />;

  return (
    <section aria-label="오늘" className="mt-6 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 min-h-16">
      {state.status === "error" ? (
        <>
          <p className="text-label text-ink-2">오늘 기록을 불러오지 못했어요</p>
          <Button size="sm" variant="ghost" icon="refresh" onClick={() => { setState({ status: "loading" }); setAttempt((n) => n + 1); }}>다시 불러오기</Button>
        </>
      ) : (
        <>
          <TodayText today={state.today!} />
          <TextLink href="/diary" className="shrink-0">기록하기</TextLink>
        </>
      )}
    </section>
  );
}

function TodayText({ today }: { today: Today }) {
  if (today.entries === 0) return <p className="text-body text-ink">오늘 기록이 아직 없어요</p>;
  if (!today.goal) return <p className="text-body text-ink">오늘 <span className="num text-title font-bold">{today.calories.toLocaleString("ko-KR")}</span>kcal 먹었어요</p>;
  const left = today.goal - today.calories;
  return left >= 0 ? (
    <p className="text-body text-ink">오늘 <span className="num text-title font-bold highlight">{left.toLocaleString("ko-KR")}</span>kcal 남았어요</p>
  ) : (
    <p className="text-body text-ink">오늘 목표보다 <span className="num text-title font-bold">{(-left).toLocaleString("ko-KR")}</span>kcal 더 먹었어요</p>
  );
}
