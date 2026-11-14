import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { DAY_OPTIONS, GROUP_DAYS, GROUP_MAX_PHOTOS, GROUP_STORY_MAX, GROUP_TARGET, GROUP_TARGET_MAX, GROUP_TARGET_MIN, parseOffer } from "@/lib/group-buy";
import { enrichGroupBuys, lowestUnitPrice, type GroupBuyRow } from "@/lib/group-buy-server";
import { checkClaimsWith } from "@/lib/partner/claims";
import { loadClaimTerms } from "@/lib/partner/claims-server";
import { imagePrefix } from "@/lib/community-images";
import { ownVideo } from "@/lib/community-video";
import { rateLimit } from "@/lib/rate-limit";

/**
 * GET /api/community/group-buy — 공구 목록
 *   ?status=recruiting(기본)|achieved|all   ?mine=1 내가 관심 표시·참여한 것만   ?concern=   ?product_id= 이 제품의 공구만 (제품 상세)
 *   응답: group_buys(+ 지금 최저가·대표 사진·진행자 이름·진행자 기록 횟수 — lib/group-buy-server), mine_ids(그중 내가 표시한 것), total
 *   모집 중은 마감(expires_at)이 지난 것을 뺀다.
 * POST /api/community/group-buy — 공구 만들기 (만든 사람은 자동으로 관심 표시)
 *   { product_id, story, image_urls[≤4], video?{url,poster,seconds}, offer, target_count, days } — 같은 제품 공구가 모집 중이면 409 + existing_id
 *   offer: 조건표 (구성·희망 공구가·배송·증정·1인 최대) — lib/group-buy parseOffer 로 검사. 공구가는 지금 최저 1개 값보다 낮아야 한다
 *   target_count 10~100 · days 7·14·21·30
 */

export async function GET(request: NextRequest) {
  await connection();
  const { searchParams } = request.nextUrl;
  const concern = searchParams.get("concern");
  const status = searchParams.get("status") || "recruiting";
  const mine = searchParams.get("mine") === "1";
  const page = Number(searchParams.get("page") || 1);
  const limit = 30;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const actor = await getActorId();

  let mineAll: string[] = [];
  if (actor) {
    const { data: rows, error: pErr } = await sb.from("group_buy_participants").select("group_buy_id").eq("user_id", actor);
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    mineAll = (rows || []).map((r: { group_buy_id: string }) => r.group_buy_id);
  }
  if (mine && mineAll.length === 0) return NextResponse.json({ group_buys: [], mine_ids: [], total: 0, page });

  let query = sb
    .from("group_buys")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (status === "all" || mine) {
    query = query.in("status", ["recruiting", "achieved"]);
  } else {
    query = query.eq("status", status);
  }
  if (status === "recruiting" && !mine) query = query.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
  if (mine) query = query.in("id", mineAll);
  if (concern) query = query.eq("concern", concern);
  const productId = searchParams.get("product_id");
  if (productId && /^[0-9a-f-]{36}$/i.test(productId)) query = query.eq("product_id", productId);

  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data: groupBuys, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let list;
  try { list = await enrichGroupBuys(sb, (groupBuys || []) as GroupBuyRow[]); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }

  const mineSet = new Set(mineAll);
  return NextResponse.json({
    group_buys: list.map(({ creator_id, ...g }) => ({ ...g, is_host: !!actor && creator_id === actor })),
    mine_ids: list.filter((g) => mineSet.has(g.id)).map((g) => g.id),
    total: count || 0,
    page,
  });
}

export async function POST(request: NextRequest) {
  const creator_id = await getActorId();
  if (!creator_id) return noActor();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "잘못된 요청이에요" }, { status: 400 }); }

  const product_id = typeof body.product_id === "string" && /^[0-9a-f-]{36}$/i.test(body.product_id) ? body.product_id : null;
  if (!product_id) return NextResponse.json({ error: "공구할 제품을 골라 주세요" }, { status: 400 });

  const story = typeof body.story === "string" ? body.story.trim() : "";
  if (story.length > GROUP_STORY_MAX) return NextResponse.json({ error: `이야기는 ${GROUP_STORY_MAX}자까지 쓸 수 있어요` }, { status: 400 });

  // 사진은 이 사람이 우리 저장소에 올린 것만
  const prefix = `${imagePrefix()}${creator_id}/`;
  const rawImages: unknown[] = Array.isArray(body.image_urls) ? body.image_urls : [];
  const image_urls = [...new Set(rawImages.filter((u): u is string => typeof u === "string" && u.startsWith(prefix) && !u.includes("..")))].slice(0, GROUP_MAX_PHOTOS);

  const okPoster = typeof body.video?.poster === "string" && body.video.poster.startsWith(prefix) && !body.video.poster.includes("..");
  const video = ownVideo(body.video?.url, creator_id) && okPoster
    ? { video_url: body.video.url as string, video_poster: body.video.poster as string, video_seconds: Math.min(30, Math.max(0, Number(body.video.seconds) || 0)) }
    : {};

  const target = Math.round(Number(body.target_count ?? GROUP_TARGET));
  if (!(target >= GROUP_TARGET_MIN && target <= GROUP_TARGET_MAX)) return NextResponse.json({ error: `목표 인원은 ${GROUP_TARGET_MIN}~${GROUP_TARGET_MAX}명으로 정해 주세요` }, { status: 400 });
  const days = Number(body.days ?? GROUP_DAYS);
  if (!(DAY_OPTIONS as readonly number[]).includes(days)) return NextResponse.json({ error: "모으는 기간은 7·14·21·30일 중에서 골라 주세요" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  // 효능 표현 — 업체 문구와 같은 금지 표현 사전 (관리자가 관리, lib/partner/claims)
  const [claim] = checkClaimsWith(await loadClaimTerms(sb), story);
  if (claim) return NextResponse.json({ error: `'${claim.phrase}' 같은 표현은 올릴 수 없어요. ${claim.why}. 먹는 방법이나 맛으로 써 주세요`, claim: claim.phrase }, { status: 400 });

  const limited = await rateLimit(sb, request, creator_id, "post");
  if (limited) return limited;

  const { data: product, error: pErr } = await sb.from("products").select("id, name").eq("id", product_id).maybeSingle();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!product) return NextResponse.json({ error: "제품을 찾지 못했어요" }, { status: 404 });

  // 같은 제품 공구가 모집 중이면 관심을 나누지 않게 그쪽으로 보낸다
  const { data: open, error: oErr } = await sb.from("group_buys").select("id, current_count")
    .eq("product_id", product_id).eq("status", "recruiting").gt("expires_at", new Date().toISOString()).limit(1).maybeSingle();
  if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });
  if (open) return NextResponse.json({ error: "이 제품은 이미 관심을 모으고 있어요", existing_id: open.id, current_count: open.current_count }, { status: 409 });

  // 조건표 — 지금 최저 1개 값과 비교해 말이 안 되는 숫자는 막는다
  let low;
  try { low = await lowestUnitPrice(sb, product_id); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  const { offer, error: offerErr } = parseOffer(body.offer, low?.unit ?? null);
  if (!offer) return NextResponse.json({ error: offerErr }, { status: 400 });
  if (offer.gift.type === "first") {
    const [g] = checkClaimsWith(await loadClaimTerms(sb), offer.gift.item);
    if (g) return NextResponse.json({ error: `증정품에 '${g.phrase}' 같은 표현은 쓸 수 없어요` }, { status: 400 });
  }

  const { data: groupBuy, error } = await sb
    .from("group_buys")
    .insert({
      creator_id,
      title: `${product.name} 공구`,
      description: story || null,
      product_id,
      product_name: product.name,
      image_urls,
      ...video,
      offer,
      days,
      pack_size: offer.options[0].packs,
      target_count: target,
      current_count: 1, // 만든 사람은 자동으로 관심 표시
      concern: typeof body.concern === "string" ? body.concern.slice(0, 40) : null,
      status: "recruiting",
      expires_at: new Date(Date.now() + days * 24 * 3600 * 1000).toISOString(),
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: jErr } = await sb.from("group_buy_participants").insert({ group_buy_id: groupBuy.id, user_id: creator_id, option: 0, qty: 1 });
  if (jErr) return NextResponse.json({ error: jErr.message }, { status: 500 });

  return NextResponse.json({ group_buy: { id: groupBuy.id } });
}
