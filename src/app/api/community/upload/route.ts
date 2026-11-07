import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { IMAGE_BUCKET, imagePaths, removeImages } from "@/lib/community-images";

/**
 * POST /api/community/upload — 글에 붙일 사진 한 장 (multipart: file)
 * - jpeg·png·webp·heic 만, 10MB 이하
 * - 서버가 방향을 맞추고 긴 변 1600px 로 줄여 webp 로 다시 만든다 → 위치(GPS) 같은 메타데이터가 지워진다
 * - 공개 버킷 community 의 <actor>/<연월>/<무작위>.webp 에 올리고 주소를 돌려준다
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
  try {
    const form = await request.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {
    return NextResponse.json({ error: "사진을 읽지 못했어요" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "사진을 골라 주세요" }, { status: 400 });
  if (file.size > MAX_IN) return NextResponse.json({ error: "10MB 이하 사진만 올릴 수 있어요" }, { status: 413 });

  const input = new Uint8Array(await file.arrayBuffer());
  if (!looksLikeImage(input)) return NextResponse.json({ error: "jpg·png·webp·heic 사진만 올릴 수 있어요" }, { status: 415 });

  let out: Buffer;
  let width = 0, height = 0;
  try {
    const img = sharp(input, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true });
    const { data, info } = await img.webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
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
  return NextResponse.json({ url: pub.publicUrl, width, height });
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
  const { data: used } = await sb.from("community_feed").select("id").contains("image_urls", [url]).eq("is_active", true).limit(1);
  if (used?.length) return NextResponse.json({ error: "글에 쓰고 있는 사진이에요" }, { status: 409 });
  const err = await removeImages(sb, [url]);
  if (err) return NextResponse.json({ error: err }, { status: 500 });
  return NextResponse.json({ ok: true });
}
