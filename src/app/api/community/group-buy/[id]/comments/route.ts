import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { viewerFilters } from "@/lib/community-safety";
import { ensureNickname } from "@/lib/community-profile";
import { rateLimit } from "@/lib/rate-limit";
import { checkClaimsWith } from "@/lib/partner/claims";
import { loadClaimTerms } from "@/lib/partner/claims-server";

/**
 * 공구 글의 질문 · 진행자 답
 * GET    /api/community/group-buy/[id]/comments — 질문 목록(오래된 것부터, 한 단계 답), 차단한 사람 것 빼고
 * POST   /api/community/group-buy/[id]/comments { content, parent_id? } — 쓰기 (이름은 서버 이름, 횟수 제한)
 *        진행자가 쓰는 답은 업체 문구와 같은 금지 표현 사전으로 거른다 (파는 쪽 목소리라서)
 * DELETE /api/community/group-buy/[id]/comments?comment_id= — 내 것 지우기 (진행자는 자기 공구의 것도)
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 300;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function groupBuy(sb: any, id: string) {
  const { data, error } = await sb.from("group_buys").select("id, creator_id, status, expires_at").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; creator_id: string; status: string; expires_at: string | null } | null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "공구를 찾지 못했어요" }, { status: 404 });
  const viewer = await getActorId();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  try {
    const gb = await groupBuy(sb, id);
    if (!gb) return NextResponse.json({ error: "공구를 찾지 못했어요" }, { status: 404 });
    const [{ data, error }, filters] = await Promise.all([
      sb.from("group_buy_comments").select("id, parent_id, user_id, author_nickname, content, created_at")
        .eq("group_buy_id", id).eq("is_active", true).order("created_at", { ascending: true }).limit(200),
      viewerFilters(sb, viewer),
    ]);
    if (error) throw new Error(error.message);
    const rows = ((data || []) as { id: string; parent_id: string | null; user_id: string; author_nickname: string | null; content: string; created_at: string }[])
      .filter((c) => !filters.blocked.has(c.user_id));
    return NextResponse.json({
      comments: rows.map(({ user_id, ...c }) => ({
        ...c, author_nickname: c.author_nickname || "익명", is_mine: !!viewer && user_id === viewer, is_host: user_id === gb.creator_id,
      })),
      can_moderate: !!viewer && viewer === gb.creator_id,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getActorId();
  if (!user) return noActor();
  if (!UUID.test(id)) return NextResponse.json({ error: "공구를 찾지 못했어요" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) return NextResponse.json({ error: "내용을 적어 주세요" }, { status: 400 });
  if (content.length > MAX) return NextResponse.json({ error: `${MAX}자까지 쓸 수 있어요` }, { status: 400 });
  const parent_id = typeof body.parent_id === "string" && UUID.test(body.parent_id) ? body.parent_id : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  try {
    const limited = await rateLimit(sb, request, user, "comment");
    if (limited) return limited;
    const gb = await groupBuy(sb, id);
    if (!gb) return NextResponse.json({ error: "공구를 찾지 못했어요" }, { status: 404 });

    // 진행자가 나를 차단했으면 질문을 남길 수 없다
    const { data: blk, error: bErr } = await sb.from("community_blocks").select("blocker_id").eq("blocker_id", gb.creator_id).eq("blocked_id", user).maybeSingle();
    if (bErr) throw new Error(bErr.message);
    if (blk) return NextResponse.json({ error: "이 공구에는 질문을 남길 수 없어요" }, { status: 403 });

    if (user === gb.creator_id) {
      const [claim] = checkClaimsWith(await loadClaimTerms(sb), content);
      if (claim) return NextResponse.json({ error: `'${claim.phrase}' 같은 표현은 쓸 수 없어요. ${claim.why}`, claim: claim.phrase }, { status: 400 });
    }

    if (parent_id) {
      // 답은 한 단계만 — 이 공구의 맨 위 질문에만
      const { data: p, error: pErr } = await sb.from("group_buy_comments").select("id, parent_id").eq("id", parent_id).eq("group_buy_id", id).eq("is_active", true).maybeSingle();
      if (pErr) throw new Error(pErr.message);
      if (!p || p.parent_id) return NextResponse.json({ error: "답할 질문을 찾지 못했어요" }, { status: 400 });
    }

    const nickname = await ensureNickname(sb, user);
    const { data, error } = await sb.from("group_buy_comments")
      .insert({ group_buy_id: id, parent_id, user_id: user, author_nickname: nickname, content })
      .select("id, parent_id, author_nickname, content, created_at").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ comment: { ...data, is_mine: true, is_host: user === gb.creator_id } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getActorId();
  if (!user) return noActor();
  const cid = request.nextUrl.searchParams.get("comment_id") || "";
  if (!UUID.test(id) || !UUID.test(cid)) return NextResponse.json({ error: "지울 질문을 찾지 못했어요" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  try {
    const gb = await groupBuy(sb, id);
    if (!gb) return NextResponse.json({ error: "공구를 찾지 못했어요" }, { status: 404 });
    let q = sb.from("group_buy_comments").update({ is_active: false }).eq("id", cid).eq("group_buy_id", id).eq("is_active", true);
    if (user !== gb.creator_id) q = q.eq("user_id", user); // 진행자는 자기 공구의 질문을 지울 수 있다
    const { data, error } = await q.select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return NextResponse.json({ error: "지울 수 있는 질문이 아니에요" }, { status: 403 });
    // 지운 질문에 달린 답도 같이 내린다
    const { error: cErr } = await sb.from("group_buy_comments").update({ is_active: false }).eq("parent_id", cid).eq("is_active", true);
    if (cErr) throw new Error(cErr.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
