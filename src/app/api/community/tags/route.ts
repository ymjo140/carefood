import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { ensureNickname } from "@/lib/community-profile";
import { isTagAllow, isTagReview } from "@/lib/community-tags";
import { regramAllowed } from "@/lib/community-regram";
import { addDays, todayKst } from "@/lib/day";
import { viewerFilters } from "@/lib/community-safety";

/**
 * 나를 태그한 글 — 태그된 사람만 본다 (/community/tags)
 * GET   → { settings: { tag_allow, tag_review, allow_regram }, items: [{ id, post_id, who, status, at, excerpt, has_meal, can_record, recorded, can_regram }], mutes: [{ id, nickname }] }
 *         can_record: 음식이 붙은 끼니 글(7일 안) — '내 식단에도 기록하기' · can_regram: 사진·영상이 있고 글쓴이가 허락 — '내 스토리에 올리기' 
 *         items: 최근 60개 · 보이는 것(shown)·승인 기다림(pending). 지운 글·신고로 가려진 글·차단한 사람 글은 뺀다
 * PATCH { tag_allow?: all|following|none, tag_review?: auto|manual, allow_regram?: boolean } — 내 태그·스토리 설정 (커뮤니티 이름이 없으면 만들고 바꾼다)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

export async function GET() {
  await connection();
  const me = await getActorId();
  if (!me) return noActor();
  const sb = createServiceRoleClient() as Sb;
  try {
    const [{ data: prof, error: pErr }, { data: tags, error: tErr }, { data: mutes, error: mErr }, filters] = await Promise.all([
      sb.from("community_profiles").select("tag_allow, tag_review, allow_regram").eq("actor_id", me).maybeSingle(),
      sb.from("community_post_people").select("id, post_id, tagger_id, status, created_at, recorded_at").eq("tagged_id", me).in("status", ["shown", "pending"])
        .order("created_at", { ascending: false }).limit(60),
      sb.from("community_tag_mutes").select("muted_id, created_at").eq("actor_id", me).order("created_at", { ascending: false }).limit(100),
      viewerFilters(sb, me),
    ]);
    for (const e of [pErr, tErr, mErr]) if (e) throw new Error(e.message);
    const rows = (tags || []) as { id: string; post_id: string; tagger_id: string; status: "shown" | "pending"; created_at: string; recorded_at: string | null }[];
    const postIds = [...new Set(rows.map((r) => r.post_id))];
    const muteIds = ((mutes || []) as { muted_id: string }[]).map((m) => m.muted_id);
    const [{ data: posts, error: fErr }, { data: names, error: nErr }] = await Promise.all([
      postIds.length ? sb.from("community_feed").select("id, user_id, author_nickname, content, meal_type, meal_data, image_urls, video_poster, created_at, is_active, hidden_by_reports").in("id", postIds) : { data: [], error: null },
      muteIds.length ? sb.from("community_profiles").select("actor_id, nickname").in("actor_id", muteIds) : { data: [], error: null },
    ]);
    if (fErr) throw new Error(fErr.message);
    if (nErr) throw new Error(nErr.message);
    type Post = {
      id: string; user_id: string; author_nickname: string | null; content: string | null; meal_type: string | null; meal_data: { foods?: unknown[]; plan?: unknown } | null;
      image_urls: string[] | null; video_poster: string | null; created_at: string; is_active: boolean; hidden_by_reports: boolean;
    };
    const post = new Map(((posts || []) as Post[]).map((p) => [p.id, p]));
    const allow = await regramAllowed(sb, [...new Set(((posts || []) as Post[]).map((p) => p.user_id))]);
    const weekAgo = addDays(todayKst(), -6);
    const kstDay = (iso: string) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 10);
    const nick = new Map(((names || []) as { actor_id: string; nickname: string }[]).map((n) => [n.actor_id, n.nickname]));
    const items = rows.flatMap((r) => {
      const p = post.get(r.post_id);
      if (!p || !p.is_active || p.hidden_by_reports || filters.blocked.has(p.user_id)) return [];
      return [{
        id: r.id, post_id: r.post_id, who: p.author_nickname || "누군가", who_id: r.tagger_id, status: r.status, at: r.created_at,
        excerpt: (p.content || "식단 공유").slice(0, 60), has_meal: !!(p.meal_data?.plan || (p.meal_data?.foods && p.meal_data.foods.length)),
        can_record: !!(p.meal_data?.foods && p.meal_data.foods.length) && ["breakfast", "lunch", "dinner", "snack"].includes(p.meal_type || "") && kstDay(p.created_at) >= weekAgo,
        recorded: !!r.recorded_at,
        can_regram: ((p.image_urls || []).length > 0 || !!p.video_poster) && allow.get(p.user_id) !== false,
      }];
    });
    return NextResponse.json({
      settings: { tag_allow: isTagAllow(prof?.tag_allow) ? prof.tag_allow : "all", tag_review: isTagReview(prof?.tag_review) ? prof.tag_review : "auto", allow_regram: prof?.allow_regram !== false },
      items,
      mutes: muteIds.map((id) => ({ id, nickname: nick.get(id) || "알 수 없는 사람" })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const me = await getActorId();
  if (!me) return noActor();
  const body = await request.json().catch(() => ({}));
  const patch: Record<string, string | boolean> = {};
  if (body.allow_regram !== undefined) {
    if (typeof body.allow_regram !== "boolean") return NextResponse.json({ error: "스토리 허락을 골라 주세요" }, { status: 400 });
    patch.allow_regram = body.allow_regram;
  }
  if (body.tag_allow !== undefined) {
    if (!isTagAllow(body.tag_allow)) return NextResponse.json({ error: "누가 태그할 수 있는지 골라 주세요" }, { status: 400 });
    patch.tag_allow = body.tag_allow;
  }
  if (body.tag_review !== undefined) {
    if (!isTagReview(body.tag_review)) return NextResponse.json({ error: "태그된 글을 어떻게 보일지 골라 주세요" }, { status: 400 });
    patch.tag_review = body.tag_review;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "바꿀 것이 없어요" }, { status: 400 });
  const sb = createServiceRoleClient() as Sb;
  try {
    await ensureNickname(sb, me);
    const { data, error } = await sb.from("community_profiles").update({ ...patch, updated_at: new Date().toISOString() }).eq("actor_id", me).select("tag_allow, tag_review, allow_regram");
    if (error) throw new Error(error.message);
    if (!data?.length) return NextResponse.json({ error: "설정을 바꾸지 못했어요. 다시 시도해 주세요" }, { status: 409 });
    return NextResponse.json({ settings: data[0] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
