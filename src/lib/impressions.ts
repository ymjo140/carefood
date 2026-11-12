"use client";

/**
 * 노출 수 세기 — 제품 카드가 화면에 절반 넘게 보이면 한 번 센다 (한 화면에서 같은 제품은 한 번).
 * 누가 봤는지는 보내지 않는다. 제품 id 와 자리(placement)만 모아 1.5초마다, 화면을 떠날 때 한 번 더 보낸다.
 */
import { useCallback, useEffect, useRef } from "react";

export type Placement = "home_reco" | "home_cold" | "onboarding_preview" | "product_list" | "weekly_fill";

export function sendImpressions(placement: Placement, ids: string[]) {
  const list = [...new Set(ids.filter(Boolean))].slice(0, 60);
  if (list.length === 0) return;
  try {
    fetch("/api/track/impressions", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ placement, ids: list }), keepalive: true,
    }).catch(() => { /* 세기 실패는 알리지 않는다 */ }); // ds-allow: 노출 수는 보조 통계
  } catch { /* */ } // ds-allow: 노출 수는 보조 통계
}

/** const seen = useImpressions("product_list");  <div ref={seen(product.id)}> */
export function useImpressions(placement: Placement) {
  const counted = useRef(new Set<string>());
  const queue = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observer = useRef<IntersectionObserver | null>(null);
  const waiting = useRef<Element[]>([]);

  useEffect(() => {
    const flush = () => {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      const ids = queue.current.splice(0);
      if (ids.length) sendImpressions(placement, ids);
    };
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const id = (e.target as HTMLElement).dataset.impId;
        io.unobserve(e.target);
        if (!id || counted.current.has(id)) continue;
        counted.current.add(id);
        queue.current.push(id);
      }
      if (queue.current.length && !timer.current) timer.current = setTimeout(flush, 1500);
    }, { threshold: 0.5 });
    observer.current = io;
    for (const el of waiting.current.splice(0)) io.observe(el);
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); io.disconnect(); observer.current = null; };
  }, [placement]);

  return useCallback((id: string) => (el: HTMLElement | null) => {
    if (!el || counted.current.has(id)) return;
    el.dataset.impId = id;
    if (observer.current) observer.current.observe(el);
    else waiting.current.push(el);
  }, []);
}
