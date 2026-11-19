import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { rateLimit } from "@/lib/rate-limit";
import { IMAGE_BUCKET, imagePaths, removeImages } from "@/lib/community-images";
import { cropBox, dhash, takenAt } from "@/lib/photo-meta";

/**
 * POST /api/community/upload — 글에 붙일 사진 한 장 (multipart: file)
 * - jpeg·png·webp·heic 만, 10MB 이하
 * - 서버가 방향을 맞추고 긴 변 1600px 로 줄여 webp 로 다시 만든다 → 위치(GPS) 같은 메타데이터가 지워진다
 * - 공개 버킷 community 의 <actor>/<연월>/<무작위>.webp 에 올리고 주소를 돌려준다
 * - crop(선택): JSON {x,y,w,h} 0~1, 방향을 맞춘 사진 기준 — 서버가 자른다(원본 EXIF 를 읽은 뒤)
 * - taken_at(선택): 기기가 사진을 줄이기 전에 읽은 촬영 시각. 파일 안 EXIF 가 있으면 그것을 쓴다
 * - 찍은 시각(EXIF)·지문(dHash)을 community_uploads 에 남기고 upload_id 를 돌려준다. 글·챌린지 인증은 이 id 로 붙인다
 */

const MAX_IN = 10 * 1024 * 1024;

function looksLikeImage(b: Uint8Array) {
  const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const webp = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  const heic = b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70; // ftyp (heic/heif/avif)
  return jpg || png || webp || heic;
}

export async function POST(request: NextRequest) {
  const actor = await getActorId();
  if (!actor) return noActor();

  let file: File | null = null;
  let crop: { x: number; y: number; w: number; h: number } | null = null;
  let claimed: string | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
    const c = form.get("crop");
    if (typeof c === "string" && c) {
      const j = JSON.parse(c);
      crop = { x: Number(j.x), y: Number(j.y), w: Number(j.w), h: Number(j.h) };
    }
    // 기기가 줄이기 전에 읽은 촬영 시각 — 파일에 EXIF 가 남아 있지 않을 때만 쓴다
    const t = form.get("taken_at");
    if (typeof t === "string" && t) {
      const ms = Date.parse(t);
      if (Number.isFinite(ms) && ms <= Date.now() + 60_000 && ms >= Date.now() - 2 * 365 * 86400e3) claimed = new Date(ms).toISOString();
    }
  } catch {
    return NextResponse.json({ error: "사진을 읽지 못했어요" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "사진을 골라 주세요" }, { status: 400 });
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const limited = await rateLimit(createServiceRoleClient() as any, request, actor, "upload");
    if (limited) return limited;
  }
  if (file.size > MAX_IN) return NextResponse.json({ error: "10MB 이하 사진만 올릴 수 있어요" }, { status: 413 });

  const input = new Uint8Array(await file.arrayBuffer());
  if (!looksLikeImage(input)) return NextResponse.json({ error: "jpg·png·webp·heic 사진만 올릴 수 있어요" }, { status: 415 });

  // 다시 만들기 전에 원본에서 찍은 시각을 읽는다 (다시 만든 webp 에는 남지 않는다)
  const exif = await takenAt(input);
  const taken = exif ?? claimed;

  let out: Buffer;
  let width = 0, height = 0, hash = "";
  try {
    const meta = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
    const swap = (meta.orientation || 1) >= 5;
    const W = (swap ? meta.height : meta.width) || 0, H = (swap ? meta.width : meta.height) || 0;
    const box = cropBox(crop, W, H);
    let base = sharp(input, { limitInputPixels: 40_000_000 }).rotate();
    if (box) base = base.extract(box);
    hash = await dhash(base.clone());
    const { data, info } = await base.resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
    out = data; width = info.width; height = info.height;
  } catch {
    return NextResponse.json({ error: "사진을 열지 못했어요. 다른 사진으로 해 주세요" }, { status: 415 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const now = new Date();
  const path = `${actor}/${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.webp`;
  const { error } = await sb.storage.from(IMAGE_BUCKET).upload(path, out, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  if (error) return NextResponse.json({ error: `사진을 올리지 못했어요: ${error.message}` }, { status: 500 });
  const { data: pub } = sb.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  const row = await sb.from("community_uploads").insert({
    user_id: actor, url: pub.publicUrl, path, width, height,
    taken_at: taken, taken_source: exif ? "exif" : claimed ? "client" : "none", phash: hash || null,
  }).select("id, created_at").single();
  if (row.error) {
    const err = await removeImages(sb, [pub.publicUrl]);
    if (err) console.error("[upload] 기록 실패 뒤 사진 지우기", err);
    return NextResponse.json({ error: `사진을 올리지 못했어요: ${row.error.message}` }, { status: 500 });
  }
  return NextResponse.json({ url: pub.publicUrl, width, height, upload_id: row.data.id, taken_at: taken, uploaded_at: row.data.created_at });
}

/** DELETE /api/community/upload { url } — 올렸다가 글에 안 쓴 내 사진 지우기 (내 폴더 것만) */
export async function DELETE(request: NextRequest) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const { url } = await request.json().catch(() => ({}));
  const [path] = imagePaths([url]);
  if (!path || !path.startsWith(`${actor}/`)) return NextResponse.json({ error: "내 사진만 지울 수 있어요" }, { status: 403 });
  // 이미 글에 쓴 사진이면 지우지 않는다
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const [post, gb] = await Promise.all([
    sb.from("community_feed").select("id").contains("image_urls", [url]).eq("is_active", true).limit(1),
    sb.from("group_buys").select("id").contains("image_urls", [url]).limit(1),
  ]);
  if (post.error || gb.error) return NextResponse.json({ error: (post.error || gb.error).message }, { status: 500 });
  // 영상 표지 사진으로 쓰고 있는지도
  const [pp, gp] = await Promise.all([
    sb.from("community_feed").select("id").eq("video_poster", url).eq("is_active", true).limit(1),
    sb.from("group_buys").select("id").eq("video_poster", url).limit(1),
  ]);
  if (pp.error || gp.error) return NextResponse.json({ error: (pp.error || gp.error).message }, { status: 500 });
  if (post.data?.length || gb.data?.length || pp.data?.length || gp.data?.length) return NextResponse.json({ error: "글에 쓰고 있는 사진이에요" }, { status: 409 });
  const used = await sb.from("community_uploads").select("id").eq("url", url).not("used_post_id", "is", null).limit(1);
  if (used.error) return NextResponse.json({ error: used.error.message }, { status: 500 });
  if (used.data?.length) return NextResponse.json({ error: "글에 쓰고 있는 사진이에요" }, { status: 409 });
  const err = await removeImages(sb, [url]);
  if (err) return NextResponse.json({ error: err }, { status: 500 });
  const del = await sb.from("community_uploads").delete().eq("url", url).eq("user_id", actor).is("used_post_id", null);
  if (del.error) console.error("[upload] 기록 지우기", del.error.message);
  return NextResponse.json({ ok: true });
}
