import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { REPORT_HIDE_AT, REPORT_REASONS } from "@/lib/community-safety";

/**
 * POST /api/community/report — 글이나 답글 신고 { post_id | comment_id, reason, detail? }
 * 같은 사람이 같은 걸 두 번 신고하면 already. 신고가 REPORT_HIDE_AT 건이 되면 모두에게서 가린다 (관리자 검토 전까지)
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getActorId();
    if (!actor) return noActor();
    const body = await request.json();
    const post_id = typeof body.post_id === "string" ? body.post_id : null;
    const comment_id = typeof body.comment_id === "string" ? body.comment_id : null;
    const reason = body.reason as string;
    const detail = typeof body.detail === "string" && body.detail.trim() ? body.detail.trim().slice(0, 300) : null;
    if (!!post_id === !!comment_id) return NextResponse.json({ error: "신고할 글을 골라 주세요" }, { status: 400 });
    if (!(reason in REPORT_REASONS)) return NextResponse.json({ error: "신고 이유를 골라 주세요" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceRoleClient() as any;
    const table = post_id ? "community_feed" : "community_feed_comments";
    const id = post_id || comment_id;

    const { data: target, error: tErr } = await sb.from(table).select("id, user_id").eq("id", id).maybeSingle();
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
    if (!target) return NextResponse.json({ error: "글을 찾을 수 없어요" }, { status: 404 });
    if (target.user_id === actor) return NextResponse.json({ error: "내 글은 신고할 수 없어요" }, { status: 400 });

    const { error } = await sb.from("community_reports").insert({ reporter_id: actor, post_id, comment_id, reason, detail });
    if (error) {
      if (error.code === "23505") return NextResponse.json({ ok: true, already: true });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const col = post_id ? "post_id" : "comment_id";
    const { count, error: cErr } = await sb.from("community_reports").select("id", { count: "exact", head: true }).eq(col, id).eq("status", "pending");
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
    const hidden = (count || 0) >= REPORT_HIDE_AT;
    const { error: uErr } = await sb.from(table).update({ report_count: count || 0, ...(hidden ? { hidden_by_reports: true } : {}) }).eq("id", id);
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, hidden });
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}
