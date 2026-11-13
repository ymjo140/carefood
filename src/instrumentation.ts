/**
 * 서버 오류 기록 — 페이지·API·서버 액션에서 던져진 오류를 app_errors 에 남긴다 (관리자 › 지표 › 최근 오류).
 * 외부 감시 서비스 대신 우리 DB 에 둔다. 기록하다 실패해도 요청에는 영향을 주지 않는다.
 * 남기는 것: 경로·메서드·종류·메시지·digest·스택 앞부분 — 요청 본문·쿠키·헤더는 남기지 않는다.
 */
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  const e = err as { message?: unknown; digest?: unknown; stack?: unknown };
  const row = {
    source: "server",
    path: String(request.path || "").split("?")[0].slice(0, 300),
    method: String(request.method || "").slice(0, 10),
    kind: `${context.routeType}`.slice(0, 40),
    message: String(e?.message ?? err).slice(0, 500),
    digest: e?.digest ? String(e.digest).slice(0, 100) : null,
    stack: typeof e?.stack === "string" ? e.stack.slice(0, 2000) : null,
  };
  try {
    await fetch(`${url.replace(/\/$/, "")}/rest/v1/app_errors`, {
      method: "POST",
      // 예전 키(JWT)는 Authorization 에도 넣어야 서버 권한이 된다. 새 secret 키(sb_secret_…)는 apikey 헤더만
      headers: { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}), "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(row),
    });
  } catch {
    console.error("오류를 기록하지 못했어요", row.path, row.message); // ds-allow: 기록 실패는 서버 로그로만
  }
};
