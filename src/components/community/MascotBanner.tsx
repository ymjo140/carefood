"use client";

import { useEffect, useState } from "react";
import { Mascot, Skeleton, TextLink } from "@/components/ui";
import type { MascotKind, MascotMood } from "@/components/ui";

/**
 * 챌린지 화면 맨 위 — 내 캐릭터의 오늘 표정과 한 줄 (/api/me/mascot). 내 화면에만 나온다.
 * 캐릭터 없이(또는 간단 모드)를 골랐으면 그리지 않는다. 불러오지 못하면 덤이라 자리를 비운다(기록만 남김).
 * reloadKey 가 바뀌면 다시 불러온다 (챌린지 참여·구간 바꾸기 뒤).
 */
type Data = { prefs: { kind: MascotKind | "none" }; mood: MascotMood; streak: number; line: string | null };

export function MascotBanner({ reloadKey = 0 }: { reloadKey?: number }) {
  const [data, setData] = useState<Data | null | "loading">("loading");
  useEffect(() => {
    let alive = true;
    fetch("/api/me/mascot")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (alive) setData(d); })
      .catch((e) => { console.error("캐릭터를 불러오지 못했어요:", (e as Error).message); if (alive) setData(null); }); // ds-allow: 캐릭터는 덤 — 챌린지 목록은 그대로 보인다
    return () => { alive = false; };
  }, [reloadKey]);

  if (data === "loading") return <Skeleton className="h-24 rounded-lg mb-4" />;
  if (!data || data.prefs.kind === "none" || !data.line) return null;
  return (
    <section aria-label="오늘의 캐릭터" className="flex items-center gap-3 rounded-lg bg-sunken px-4 py-3 mb-4">
      <Mascot kind={data.prefs.kind} mood={data.mood} size={72} streak={data.streak} />
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <p className="text-body text-ink">{data.line}</p>
        <TextLink href="/me/character" className="text-caption self-start">캐릭터 바꾸기</TextLink>
      </div>
    </section>
  );
}
