"use client";

import { useEffect, useRef, useState } from "react";
import { Buddy, Skeleton, TextLink } from "@/components/ui";
import type { MascotMood } from "@/components/ui";
import type { IngredientKey, PersonalityKey, StageKey } from "@/lib/buddy";

/**
 * 식단 기록(오늘)·챌린지 화면 맨 위 — 같이 다니는 재료 캐릭터의 오늘 표정과 한 줄 (/api/me/buddy). 내 화면에만 나온다.
 * 아직 보자기를 안 풀었으면 '보자기가 도착했어요'. 캐릭터 없이를 골랐으면 그리지 않는다.
 * 불러오지 못하면 덤이라 자리를 비운다(기록만 남김). reloadKey 가 바뀌면(기록·챌린지 참여 뒤) 다시 불러온다 — 늦게 온 응답은 버린다.
 */
type Data = {
  on: boolean; mood: MascotMood; line: string | null; wraps: { id: string }[];
  buddy: { ingredient: IngredientKey; personality: PersonalityKey; name: string } | null;
  stage: { key: StageKey; name: string };
};

export function MascotBanner({ reloadKey = 0 }: { reloadKey?: number }) {
  const [data, setData] = useState<Data | null | "loading">("loading");
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    fetch("/api/me/buddy")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (n === seq.current) setData(d); })
      .catch((e) => { console.error("캐릭터를 불러오지 못했어요:", (e as Error).message); if (n === seq.current) setData(null); }); // ds-allow: 캐릭터는 덤 — 기록·챌린지는 그대로 보인다
  }, [reloadKey]);

  if (data === "loading") return <Skeleton className="h-24 rounded-lg mb-4" />;
  if (!data || !data.on) return null;
  if (!data.buddy) {
    if (!data.wraps.length) return null;
    return (
      <section aria-label="도착한 보자기" className="flex items-center justify-between gap-3 rounded-lg bg-sunken px-4 py-3 mb-4">
        <p className="text-body text-ink">보자기가 도착했어요. 같이 먹을 캐릭터가 들어 있어요</p>
        <TextLink href="/me/character" className="shrink-0">풀어 보기</TextLink>
      </section>
    );
  }
  const b = data.buddy;
  return (
    <section aria-label="오늘의 캐릭터" className="flex items-center gap-3 rounded-lg bg-sunken px-4 py-3 mb-4">
      <Buddy ingredient={b.ingredient} personality={b.personality} mood={data.mood} stage={data.stage.key} size={72} />
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <span className="text-caption font-medium text-brand-ink">{b.name} · {data.stage.name}</span>
        {data.line && <p className="text-body text-ink">{data.line}</p>}
        <TextLink href="/me/character" className="text-caption self-start">캐릭터 보기{data.wraps.length ? ` · 보자기 ${data.wraps.length}개` : ""}</TextLink>
      </div>
    </section>
  );
}
