"use client";

import { useEffect } from "react";

/** 브라우저 오류 보내기 — 화면을 그리다 난 오류·놓친 Promise 오류를 /api/track/error 로 (한 화면에 5건까지) */
export function reportClientError(message: string, stack?: string, kind = "error") {
  try {
    const w = window as unknown as { __cfErrors?: number };
    w.__cfErrors = (w.__cfErrors || 0) + 1;
    if (w.__cfErrors > 5) return;
    fetch("/api/track/error", {
      method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
      body: JSON.stringify({ message: message.slice(0, 500), stack: stack?.slice(0, 2000), path: location.pathname, kind }),
    }).catch(() => {}); // ds-allow: 오류 보내기가 실패해도 사용자에게는 알리지 않는다
  } catch { /* 보내기 자체가 안 되면 그만둔다 */ } // ds-allow: 보조 기능
}

export default function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      if (!e.message || /ResizeObserver loop/.test(e.message)) return; // 브라우저가 내는 무해한 경고
      reportClientError(e.message, e.error?.stack, "error");
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string; stack?: string } | string | undefined;
      reportClientError(typeof r === "string" ? r : r?.message || "알 수 없는 오류", typeof r === "object" ? r?.stack : undefined, "unhandledrejection");
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, []);
  return null;
}
