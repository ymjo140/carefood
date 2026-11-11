import { NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { adminOnly } from "@/lib/actor-server";

/**
 * GET /api/admin/errors — 최근 오류 (app_errors: 서버 instrumentation.ts · 브라우저 ErrorReporter)
 *   { last24h: { server, client }, groups: 최근 7일 같은 메시지끼리 묶은 상위 20개 }
 * 30일 지난 기록은 여기서 지운다.
 */
export async function GET() {
  await connection();
  const denied = await adminOnly();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const now = Date.now();
  const del = await sb.from("app_errors").delete().lt("created_at", new Date(now - 30 * 864e5).toISOString());
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 500 });
  const { data, error } = await sb.from("app_errors").select("source, path, kind, message, created_at")
    .gte("created_at", new Date(now - 7 * 864e5).toISOString()).order("created_at", { ascending: false }).limit(2000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data || []) as { source: string; path: string | null; kind: string | null; message: string; created_at: string }[];
  const dayAgo = now - 864e5;
  const last24h = { server: 0, client: 0 };
  const groups = new Map<string, { source: string; path: string | null; message: string; count: number; last: string }>();
  for (const r of rows) {
    if (Date.parse(r.created_at) >= dayAgo) last24h[r.source === "server" ? "server" : "client"]++;
    const k = `${r.source}|${r.path}|${r.message.slice(0, 120)}`;
    const g = groups.get(k);
    if (g) g.count++;
    else groups.set(k, { source: r.source, path: r.path, message: r.message, count: 1, last: r.created_at });
  }
  return NextResponse.json({ last24h, groups: [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 20) });
}
