"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, Estimate, Kcal, Skeleton, Thumb } from "@/components/ui";

export type NextCandidate = {
  id: string; name: string; manufacturer: string | null; image_url: string | null;
  calories: number; protein_g: number; sodium_mg: number; serving_size_g: number | null;
};

const MEAL_LABEL: Record<string, string> = { breakfast: "아침", lunch: "점심", dinner: "저녁", snack: "간식" };

/** 지금 시각과 비어 있는 끼니로 다음 끼니를 고른다 */
export function pickNextMeal(filled: Record<string, boolean>, hour: number) {
  const order = hour < 10 ? ["breakfast", "lunch", "dinner"] : hour < 15 ? ["lunch", "dinner"] : hour < 21 ? ["dinner"] : [];
  const main = order.find((m) => !filled[m]);
  return { meal: main || "snack", mainLeft: Math.max(1, order.filter((m) => !filled[m]).length) };
}

/**
 * 기록 직후 '다음 끼니' — 오늘 남은 칼로리·단백질 한 줄 + 후보 3개.
 * 남은 값은 화면이 가진 오늘 합계·목표로 계산하고, 후보는 /api/diary/next 가 고른다.
 */
export function NextMeal({ remainKcal, remainProtein, remainSodium, meal, mainLeft, exclude, onLog, version }: {
  remainKcal: number; remainProtein: number; remainSodium: number;
  meal: string; mainLeft: number; exclude: string[];
  onLog: (c: NextCandidate, meal: string) => Promise<void>;
  version: number; // 기록이 바뀌면 다시 불러온다
}) {
  const perMealKcal = Math.round(meal === "snack" ? Math.min(remainKcal, 300) : remainKcal / mainLeft);
  const perMealProtein = Math.round(Math.max(0, remainProtein) / mainLeft);
  const perMealSodium = Math.round(Math.max(0, remainSodium) / mainLeft);
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; items: NextCandidate[] }>({ status: "loading", items: [] });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const excludeKey = exclude.join(",");

  useEffect(() => {
    if (perMealKcal < 120) return;
    let alive = true;
    setState((s) => ({ status: "loading", items: s.items })); // eslint-disable-line react-hooks/set-state-in-effect -- 조건이 바뀔 때마다 다시 고른다
    const q = new URLSearchParams({ meal, kcal: String(perMealKcal), protein: String(perMealProtein), sodium: String(perMealSodium), exclude: excludeKey });
    fetch(`/api/diary/next?${q}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (alive) setState({ status: "done", items: d.items || [] });
      })
      .catch(() => { if (alive) setState({ status: "error", items: [] }); });
    return () => { alive = false; };
  }, [meal, perMealKcal, perMealProtein, perMealSodium, excludeKey, version, attempt]);

  if (perMealKcal < 120) return null;

  return (
    <section aria-label="다음 끼니" className="mb-6">
      <p className="text-body text-ink mb-1">
        오늘 <Kcal value={Math.max(0, Math.round(remainKcal))} className="text-body" />
        {remainProtein > 0 && <> · 단백질 <span className="num font-bold">{Math.round(remainProtein)}</span>g</>} 남았어요
      </p>
      <p className="text-label text-ink-2 mb-3">{MEAL_LABEL[meal]}으로 <span className="num">{perMealKcal}</span>kcal 안쪽에서 골랐어요</p>

      {state.status === "loading" && (
        <Card padding="none" className="divide-y divide-line">
          {[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-3 p-3"><Skeleton className="size-11 shrink-0" /><Skeleton className="h-4 flex-1" /></div>)}
        </Card>
      )}

      {state.status === "error" && (
        <Card className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-label text-ink-2">다음 끼니 후보를 불러오지 못했어요</p>
          <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>다시 불러오기</Button>
        </Card>
      )}

      {state.status === "done" && state.items.length === 0 && (
        <p className="text-label text-ink-2">남은 양에 맞는 제품을 찾지 못했어요. 끼니 칸에서 직접 검색해 보세요</p>
      )}

      {state.status === "done" && state.items.length > 0 && (
        <Card padding="none" className="divide-y divide-line">
          {state.items.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-3">
              <Thumb src={c.image_url} size={44} />
              <div className="flex-1 min-w-0">
                <Link href={`/products/${c.id}`} className="block text-label font-medium text-ink line-clamp-1 hover:underline">{c.name}</Link>
                <p className="text-caption text-ink-2"><span className="num">{c.calories}</span>kcal · 단백질 <span className="num">{c.protein_g}</span>g · 나트륨 <span className="num">{c.sodium_mg}</span>mg</p>
              </div>
              <Button size="sm" variant="secondary" loading={busy === c.id} disabled={!!busy}
                onClick={async () => { setBusy(c.id); try { await onLog(c, meal); } finally { setBusy(null); } }}>
                {MEAL_LABEL[meal]}에 기록하기
              </Button>
            </div>
          ))}
        </Card>
      )}
      <Estimate className="mt-2">1회 제공량 기준 · 성분 정보로 고른 후보예요</Estimate>
    </section>
  );
}
