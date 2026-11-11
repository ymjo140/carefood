/**
 * 커뮤니티 횟수 제한 — 서버에서만 쓴다.
 * 기록 주인 id 는 쿠키라 지우면 새 사람이 된다 → 같은 사람(id)과 같은 연결(IP) 둘 다로 센다.
 * IP 는 그대로 두지 않고 비밀값을 섞은 해시로만 남기고, 이틀 지난 기록은 지운다.
 */
import { NextResponse, type NextRequest } from "next/server";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
export type RateAction = "post" | "comment" | "like" | "report" | "upload" | "copy";

/** [기간(초), 같은 사람, 같은 연결] — 같은 연결은 집·회사 와이파이처럼 여럿이 함께 쓸 수 있어 넉넉히 */
const LIMITS: Record<RateAction, [number, number, number][]> = {
  post: [[600, 5, 15], [86_400, 30, 100]],
  comment: [[600, 20, 60], [86_400, 200, 600]],
  like: [[600, 120, 400]],
  report: [[86_400, 10, 30]],
  upload: [[600, 20, 60]],
  copy: [[600, 20, 60]],
};

async function ipHash(request: NextRequest): Promise<string> {
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  const secret = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`carefood-rate:${secret}:${ip}`));
  return Array.from(new Uint8Array(buf).slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 넘었으면 429 응답, 아니면 기록하고 null */
export async function rateLimit(sb: Sb, request: NextRequest, actor: string, action: RateAction): Promise<NextResponse | null> {
  const ip = await ipHash(request);
  const now = Date.now();
  for (const [sec, perActor, perIp] of LIMITS[action]) {
    const since = new Date(now - sec * 1000).toISOString();
    const [a, b] = await Promise.all([
      sb.from("community_rate").select("id", { count: "exact", head: true }).eq("action", action).eq("actor_id", actor).gte("created_at", since),
      sb.from("community_rate").select("id", { count: "exact", head: true }).eq("action", action).eq("ip_hash", ip).gte("created_at", since),
    ]);
    if (a.error) throw new Error(a.error.message);
    if (b.error) throw new Error(b.error.message);
    if ((a.count || 0) >= perActor || (b.count || 0) >= perIp) {
      const when = sec >= 86_400 ? "내일" : "10분 뒤에";
      return NextResponse.json({ error: `짧은 시간에 너무 많이 했어요. ${when} 다시 시도해 주세요`, reason: "rate" }, { status: 429 });
    }
  }
  const { error } = await sb.from("community_rate").insert({ action, actor_id: actor, ip_hash: ip });
  if (error) throw new Error(error.message);
  // 오래된 기록 정리 — 50번에 한 번
  if (Math.random() < 0.02) {
    const { error: dErr } = await sb.from("community_rate").delete().lt("created_at", new Date(now - 2 * 86_400_000).toISOString());
    if (dErr) console.error("횟수 기록을 정리하지 못했어요:", dErr.message);
  }
  return null;
}
