"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Button } from "./Button";

/**
 * 뒤로 — 이 탭에서 앱 안 화면을 거쳐 왔으면 앞 화면으로, 바로 들어왔으면(알림·주소·새로 고침) fallback 으로.
 * 화면 맨 위 왼쪽에 한 번만. 라벨은 "뒤로" (어디로 갈지 모를 때) — 늘 같은 곳이면 LinkButton 으로 그곳 이름을.
 * 앱 안 이동 수는 레이아웃의 BottomNav 가 useTrackNav 로 센다.
 */
const KEY = "__kkirokNavCount";
type W = Window & { [KEY]?: number };

export function useTrackNav() {
  const pathname = usePathname();
  useEffect(() => {
    const w = window as W;
    w[KEY] = (w[KEY] ?? 0) + 1;
  }, [pathname]);
}

export function BackButton({ fallback, children = "뒤로" }: { fallback: string; children?: ReactNode }) {
  const router = useRouter();
  const back = () => {
    if (((window as W)[KEY] ?? 0) > 1) router.back();
    else router.push(fallback);
  };
  return <Button variant="ghost" size="sm" icon="chevron-left" onClick={back} className="-ml-2 self-start">{children}</Button>;
}
