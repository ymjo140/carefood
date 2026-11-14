import { NextRequest, NextResponse } from "next/server";
import { syncCount } from "@/lib/community-counts";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { adminOnly } from "@/lib/actor-server";
import { removeImages } from "@/lib/community-images";
import { removeVideos } from "@/lib/community-video";

/**
 * GET  /api/admin/reports — 검토할 신고 (글·답글마다 묶음)
 * POST /api/admin/reports { kind: "post"|"comment", id, action: "keep"|"remove" }
 *   keep: 신고를 닫고 다시 보이게 / remove: 글·답글을 내리고 신고를 닫는다
 */
type Report = { id: string; post_id: string | null; comment_id: string | null; reason: string; detail: string | null; created_at: string };

export async function GET() {
  await connection();
  const denied = await adminOnly();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { data, error } = await sb.from("community_reports").select("id, post_id, comment_id, reason, detail, created_at")
    .eq("status", "pending").order("created_at", { ascending: false }).limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const groups = new Map<string, { kind: "post" | "comment"; id: string; reasons: Record<string, number>; details: string[]; last_at: string }>();
  for (const r of (data || []) as Report[]) {
    const kind = r.post_id ? "post" : "comment";
    const id = (r.post_id || r.comment_id)!;
    const key = `${kind}:${id}`;
    const g = groups.get(key) || { kind, id, reasons: {}, details: [], last_at: r.created_at };
    g.reasons[r.reason] = (g.reasons[r.reason] || 0) + 1;
    if (r.detail && g.details.length < 3) g.details.push(r.detail);
    groups.set(key, g);
  }
  const postIds = [...groups.values()].filter((g) => g.kind === "post").map((g) => g.id);
  const commentIds = [...groups.values()].filter((g) => g.kind === "comment").map((g) => g.id);
  const [p, c] = await Promise.all([
    postIds.length ? sb.from("community_feed").select("id, author_nickname, content, image_url, image_urls, hidden_by_reports, is_active, created_at").in("id", postIds) : { data: [] },
    commentIds.length ? sb.from("community_feed_comments").select("id, post_id, author_nickname, content, hidden_by_reports, is_active, created_at").in("id", commentIds) : { data: [] },
  ]);
  if (p.error || c.error) return NextResponse.json({ error: (p.error || c.error).message }, { status: 500 });
  const byId = new Map<string, Record<string, unknown>>([...(p.data || []), ...(c.data || [])].map((x: { id: string }) => [x.id, x]));

  return NextResponse.json({
    items: [...groups.values()]
      .map((g) => ({ ...g, count: Object.values(g.reasons).reduce((a, b) => a + b, 0), target: byId.get(g.id) || null }))
      .sort((a, b) => b.count - a.count || Date.parse(b.last_at) - Date.parse(a.last_at)),
  });
}

export async function POST(request: NextRequest) {
  const denied = await adminOnly();
  if (denied) return denied;
  const { kind, id, action } = await request.json().catch(() => ({}));
  if (!["post", "comment"].includes(kind) || typeof id !== "string" || !["keep", "remove"].includes(action)) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const table = kind === "post" ? "community_feed" : "community_feed_comments";
  const col = kind === "post" ? "post_id" : "comment_id";

  // 글을 내리면 사진 파일도 지운다
  if (action === "remove" && kind === "post") {
    const { data: p } = await sb.from("community_feed").select("user_id, image_url, image_urls, video_url, video_poster").eq("id", id).maybeSingle();
    const [imgErr, vidErr] = await Promise.all([removeImages(sb, [p?.image_url, ...(p?.image_urls || []), p?.video_poster], p?.user_id ?? null), removeVideos(sb, [p?.video_url])]);
    if (imgErr) console.error("사진 파일을 지우지 못했어요:", imgErr);
    if (vidErr) console.error("영상 파일을 지우지 못했어요:", vidErr);
  }
  const update = action === "keep" ? { hidden_by_reports: false, report_count: 0 }
    : kind === "post" ? { is_active: false, hidden_by_reports: true, image_url: null, image_urls: [], video_url: null, video_poster: null } : { is_active: false, hidden_by_reports: true };
  const { data: target, error: tErr } = await sb.from(table).update(update).eq("id", id).select(kind === "post" ? "id" : "id, post_id, is_active").single();
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (action === "remove" && kind === "comment" && target?.post_id) {
    try { await syncCount(sb, target.post_id, "comment_count"); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  }
  const { error } = await sb.from("community_reports").update({ status: action === "keep" ? "kept" : "removed", reviewed_at: new Date().toISOString() })
    .eq(col, id).eq("status", "pending");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
