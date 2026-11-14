import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { rateLimit } from "@/lib/rate-limit";
import { CODE_RE, newCode } from "@/lib/challenge-groups";
import { SHARE_BUCKET, dayTarget } from "@/lib/share-links";

/**
 * POST  /api/share { kind, id, image, code? } — 인증 카드 공유 링크 만들기(code 를 주면 그 링크의 카드 그림만 바꾼다)
 *   kind: meal(내 글) · challenge(내가 하는 챌린지 → 내 묶음 초대 링크) · group_buy(내가 연 공구) · day(내 하루 기록 → 하고 있는 챌린지 초대, 없으면 첫 화면)
 *   image: 카드 PNG (data URL, 3MB 이하) → 공개 버킷 share-cards 에 무작위 이름으로. 링크 미리보기 그림이 된다
 *   응답 { code, url(/s/<code>), card_url }
 * PATCH /api/share { code } — 실제로 공유했다고 표시 (공유 창·저장·링크 복사를 눌렀을 때). 공유 수는 이것만 센다
 * DELETE /api/share { code } — 링크 끄기 (카드 그림도 지운다)
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 3 * 1024 * 1024;

async function targetOf(sb: Sb, actor: string, kind: string, id: string): Promise<{ target_url: string; group_id: string | null } | { error: string; status: number }> {
  if (kind === "meal") {
    const { data, error } = await sb.from("community_feed").select("user_id, is_active").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data?.is_active) return { error: "글을 찾지 못했어요", status: 404 };
    if (data.user_id !== actor) return { error: "내 글만 공유 카드로 만들 수 있어요", status: 403 };
    return { target_url: `/community/${id}`, group_id: null };
  }
  if (kind === "challenge") {
    const { data, error } = await sb.from("community_challenge_members").select("group_id, challenge_groups(code)").eq("challenge_id", id).eq("user_id", actor).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data?.group_id || !data.challenge_groups?.code) return { error: "참여한 챌린지만 공유할 수 있어요", status: 403 };
    return { target_url: `/j/${data.challenge_groups.code}`, group_id: data.group_id };
  }
  if (kind === "day") {
    const { data, error } = await sb.from("meal_diary").select("id").eq("user_id", actor).eq("date", id).limit(1);
    if (error) throw new Error(error.message);
    if (!data?.length) return { error: "이날 기록이 없어요", status: 404 };
    return dayTarget(sb, actor);
  }
  if (kind === "group_buy") {
    const { data, error } = await sb.from("group_buys").select("creator_id").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { error: "공구를 찾지 못했어요", status: 404 };
    if (data.creator_id !== actor) return { error: "내가 연 공구만 공유 카드로 만들 수 있어요", status: 403 };
    return { target_url: `/group-buy/${id}`, group_id: null };
  }
  return { error: "공유할 것을 골라 주세요", status: 400 };
}

function pngFrom(dataUrl: unknown) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) return null;
  const buf = Buffer.from(dataUrl.slice(22), "base64");
  const png = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  return png && buf.length <= MAX ? buf : null;
}

function cardPath(url: string | null | undefined) {
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${SHARE_BUCKET}/`;
  return url && url.startsWith(prefix) ? url.slice(prefix.length) : null;
}

export async function POST(request: NextRequest) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const body = await request.json().catch(() => ({}));
  const kind = String(body.kind || "");
  const id = String(body.id || "");
  if (kind === "day" ? !/^\d{4}-\d{2}-\d{2}$/.test(id) : !UUID.test(id)) return NextResponse.json({ error: "공유할 것을 골라 주세요" }, { status: 400 });
  const image = pngFrom(body.image);
  if (!image) return NextResponse.json({ error: "카드 그림을 읽지 못했어요 (PNG, 3MB 이하)" }, { status: 400 });
  const sb = createServiceRoleClient() as Sb;
  const limited = await rateLimit(sb, request, actor, "share");
  if (limited) return limited;
  try {
    const t = await targetOf(sb, actor, kind, id);
    if ("error" in t) return NextResponse.json({ error: t.error }, { status: t.status });

    // 바꾸기: 내 링크·같은 대상일 때만
    let code: string | null = typeof body.code === "string" && CODE_RE.test(body.code) ? body.code : null;
    let old: string | null = null;
    if (code) {
      const { data: cur, error } = await sb.from("share_links").select("owner, kind, target_id, card_url, revoked_at").eq("code", code).maybeSingle();
      if (error) throw new Error(error.message);
      if (!cur || cur.owner !== actor || cur.kind !== kind || cur.target_id !== id || cur.revoked_at) code = null;
      else old = cur.card_url;
    }

    const isNew = !code;
    const finalCode = code || newCode();
    const path = `${actor}/${finalCode}-${crypto.randomUUID().slice(0, 8)}.png`;
    const { error: upErr } = await sb.storage.from(SHARE_BUCKET).upload(path, image, { contentType: "image/png", cacheControl: "31536000", upsert: false });
    if (upErr) throw new Error(`카드 그림을 올리지 못했어요: ${upErr.message}`);
    const card_url = sb.storage.from(SHARE_BUCKET).getPublicUrl(path).data.publicUrl as string;

    if (isNew) {
      const { error } = await sb.from("share_links").insert({ code: finalCode, owner: actor, kind, target_id: id, target_url: t.target_url, group_id: t.group_id, card_url });
      if (error) {
        await sb.storage.from(SHARE_BUCKET).remove([path]);
        throw new Error(error.message);
      }
    } else {
      // 동시에 두 번 바꿔도 마지막 그림만 남게: 지금 그림이 내가 읽은 그림일 때만 바꾼다
      const q = sb.from("share_links").update({ card_url }).eq("code", finalCode).eq("owner", actor);
      const { data: upd, error } = await (old ? q.eq("card_url", old) : q.is("card_url", null)).select("code");
      if (error) throw new Error(error.message);
      if (!upd?.length) { await sb.storage.from(SHARE_BUCKET).remove([path]); return NextResponse.json({ error: "다른 곳에서 카드를 바꿨어요. 다시 시도해 주세요" }, { status: 409 }); }
      const oldPath = cardPath(old);
      if (oldPath) {
        const { error: rmErr } = await sb.storage.from(SHARE_BUCKET).remove([oldPath]);
        if (rmErr) console.error("예전 카드 그림을 지우지 못했어요:", rmErr.message);
      }
    }
    return NextResponse.json({ code: finalCode, url: `/s/${finalCode}`, card_url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const { code } = await request.json().catch(() => ({}));
  if (typeof code !== "string" || !CODE_RE.test(code)) return NextResponse.json({ error: "공유 링크를 찾지 못했어요" }, { status: 404 });
  const sb = createServiceRoleClient() as Sb;
  const { error } = await sb.from("share_links").update({ shared_at: new Date().toISOString() }).eq("code", code).eq("owner", actor).is("shared_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const { code } = await request.json().catch(() => ({}));
  if (typeof code !== "string" || !CODE_RE.test(code)) return NextResponse.json({ error: "공유 링크를 찾지 못했어요" }, { status: 404 });
  const sb = createServiceRoleClient() as Sb;
  const { data, error } = await sb.from("share_links").update({ revoked_at: new Date().toISOString() }).eq("code", code).eq("owner", actor).is("revoked_at", null).select("card_url");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "이미 꺼진 링크예요" }, { status: 409 });
  const path = cardPath(data[0].card_url);
  if (path) {
    const { error: rmErr } = await sb.storage.from(SHARE_BUCKET).remove([path]);
    if (rmErr) return NextResponse.json({ error: `링크는 껐지만 카드 그림을 지우지 못했어요: ${rmErr.message}` }, { status: 500 });
    await sb.from("share_links").update({ card_url: null }).eq("code", code);
  }
  return NextResponse.json({ ok: true });
}
