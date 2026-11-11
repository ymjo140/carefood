import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId } from "@/lib/actor-server";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/track/error — 브라우저에서 난 오류 한 건 { message, path, stack? }
 * components/ErrorReporter 가 보낸다. 같은 사람·연결은 10분에 20건까지. 기록 주인 id 는 남기지 않는다.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.slice(0, 500) : "";
  if (!message) return NextResponse.json({ ok: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const actor = (await getActorId()) || "anon";
  const limited = await rateLimit(sb, request, actor, "error");
  if (limited) return limited;
  const { error } = await sb.from("app_errors").insert({
    source: "client",
    path: typeof body.path === "string" ? body.path.split("?")[0].slice(0, 300) : null,
    kind: typeof body.kind === "string" ? body.kind.slice(0, 40) : "error",
    message,
    stack: typeof body.stack === "string" ? body.stack.slice(0, 2000) : null,
    user_agent: (request.headers.get("user-agent") || "").slice(0, 200),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
