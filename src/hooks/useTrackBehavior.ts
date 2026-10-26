"use client";

import { useCallback, useRef, useEffect } from "react";

/**
 * 사용자 행동 자동 추적 훅
 * - 필터 사용, 검색어, 가격 클릭 등을 서버에 기록
 * - 일정 횟수 이상 쌓이면 자동 프로파일 분석 트리거
 */

const ANALYZE_THRESHOLD = 10; // 10회 행동 후 분석 트리거

function getUserId(): string | null {
  try {
    return localStorage.getItem("carefood_anon_id") || null;
  } catch {
    return null;
  }
}

function getInteractionCount(): number {
  try {
    return Number(localStorage.getItem("carefood_interaction_count") || "0");
  } catch {
    return 0;
  }
}

function incrementInteractionCount(): number {
  try {
    const count = getInteractionCount() + 1;
    localStorage.setItem("carefood_interaction_count", String(count));
    return count;
  } catch {
    return 0;
  }
}

export function useTrackBehavior() {
  const lastAnalyzeRef = useRef(0);

  // 분석 트리거 (throttled)
  const maybeAnalyze = useCallback(async () => {
    const count = getInteractionCount();
    if (count < ANALYZE_THRESHOLD) return;
    if (Date.now() - lastAnalyzeRef.current < 5 * 60 * 1000) return; // 5분 쿨다운

    const userId = getUserId();
    if (!userId) return;

    lastAnalyzeRef.current = Date.now();
    try {
      localStorage.setItem("carefood_interaction_count", "0");
      await fetch("/api/profile/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
    } catch { /* silent */ }
  }, []);

  // 필터 사용 기록
  const trackFilterUse = useCallback(async (filters: Record<string, unknown>) => {
    const userId = getUserId();
    if (!userId) return;

    try {
      await fetch("/api/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          action: "filter_use",
          metadata: { filters },
        }),
      });
      incrementInteractionCount();
      maybeAnalyze();
    } catch { /* silent */ }
  }, [maybeAnalyze]);

  // 검색 기록
  const trackSearch = useCallback(async (query: string) => {
    const userId = getUserId();
    if (!userId || !query.trim()) return;

    try {
      await fetch("/api/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          action: "search",
          metadata: { query },
        }),
      });
      incrementInteractionCount();
      maybeAnalyze();
    } catch { /* silent */ }
  }, [maybeAnalyze]);

  // 가격 클릭 기록
  const trackPriceClick = useCallback(async (productId: string, platform: string, price: number) => {
    const userId = getUserId();
    if (!userId) return;

    try {
      await fetch("/api/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          product_id: productId,
          action: "click_price",
          metadata: { platform, price },
        }),
      });
      incrementInteractionCount();
      maybeAnalyze();
    } catch { /* silent */ }
  }, [maybeAnalyze]);

  // 페이지 진입 시 분석 체크
  useEffect(() => {
    maybeAnalyze();
  }, [maybeAnalyze]);

  return { trackFilterUse, trackSearch, trackPriceClick };
}
