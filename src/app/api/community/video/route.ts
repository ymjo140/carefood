import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { rateLimit } from "@/lib/rate-limit";
import { IMAGE_BUCKET, imagePaths, removeImages } from "@/lib/community-images";
import { VIDEO_BUCKET, VIDEO_MAX_BYTES, VIDEO_MAX_SECONDS, VIDEO_RAW_BUCKET, VIDEO_TYPES, ownVideo, removeVideos } from "@/lib/community-video";

/**
 * POST /api/community/video — 짧은 영상 올리기 (식단 글·공구 글에 한 개)
 *   { action: "start", type, size } → { path, token } : 비공개 버킷에 바로 올릴 서명 주소 (우리 서버를 거치지 않아 용량 제한이 없다)
 *   { action: "finish", path }      → { url, poster, seconds } : 서버가 새 파일로 다시 만든다
 * DELETE /api/community/video { url, poster } — 글에 안 쓴 내 영상 지우기
 *
 * 다시 만들기 (인스타그램·틱톡처럼 원본을 그대로 공개하지 않는다):
 *   - 영상 하나·소리 하나만 남기고 위치·기기·촬영 시각 태그, 데이터 트랙(아이폰 위치 트랙 등), 챕터를 뺀다
 *   - H.264 로 다시 인코딩 — 영상 안쪽(SEI)에 들어간 정보도 남지 않고, 아이폰 HEVC 도 어느 브라우저에서나 재생된다
 *   - 긴 변 1280px, 30초까지. 표지 사진 한 장(webp)
 *   - 원본은 성공·실패와 상관없이 바로 지운다
 */
export const maxDuration = 120;

const SAFE_PATH = /^[A-Za-z0-9_-]{1,64}\/[0-9a-f-]{36}\.(mp4|mov|webm)$/;

function run(args: string[], timeoutMs: number): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) { reject(new Error("영상 도구를 찾지 못했어요")); return; }
    const p = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (d) => { stderr = (stderr + d.toString()).slice(-20000); });
    const t = setTimeout(() => { p.kill("SIGKILL"); reject(new Error("영상 처리가 너무 오래 걸렸어요")); }, timeoutMs);
    p.on("error", (e) => { clearTimeout(t); reject(e); });
    p.on("close", (code) => { clearTimeout(t); resolve({ code: code ?? 1, stderr }); });
  });
}

function seconds(stderr: string): number | null {
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

export async function POST(request: NextRequest) {
  const actor = await getActorId();
  if (!actor) return noActor();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(actor)) return NextResponse.json({ error: "영상을 올릴 수 없는 계정이에요" }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  /* ── 1. 올릴 주소 ── */
  if (body.action === "start") {
    const ext = VIDEO_TYPES[String(body.type || "")];
    if (!ext) return NextResponse.json({ error: "mp4·mov 영상만 올릴 수 있어요" }, { status: 415 });
    if (Number(body.size) > VIDEO_MAX_BYTES) return NextResponse.json({ error: "50MB 이하 영상만 올릴 수 있어요. 30초 안으로 짧게 찍어 주세요" }, { status: 413 });
    const limited = await rateLimit(sb, request, actor, "upload");
    if (limited) return limited;
    const path = `${actor}/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await sb.storage.from(VIDEO_RAW_BUCKET).createSignedUploadUrl(path);
    if (error) return NextResponse.json({ error: `올릴 준비를 하지 못했어요: ${error.message}` }, { status: 500 });
    return NextResponse.json({ path, token: data.token });
  }

  /* ── 2. 다시 만들기 ── */
  if (body.action !== "finish") return NextResponse.json({ error: "잘못된 요청이에요" }, { status: 400 });
  const path = String(body.path || "");
  if (!SAFE_PATH.test(path) || !path.startsWith(`${actor}/`)) return NextResponse.json({ error: "내가 올린 영상만 처리할 수 있어요" }, { status: 403 });

  const dir = await mkdtemp(join(tmpdir(), "cf-video-"));
  const dropRaw = async () => {
    const { error } = await sb.storage.from(VIDEO_RAW_BUCKET).remove([path]);
    if (error) console.error("원본 영상을 지우지 못했어요:", path, error.message);
  };
  try {
    const { data: blob, error: dErr } = await sb.storage.from(VIDEO_RAW_BUCKET).download(path);
    if (dErr || !blob) return NextResponse.json({ error: "올린 영상을 찾지 못했어요. 다시 올려 주세요" }, { status: 404 });
    const input = join(dir, `in.${path.split(".").pop()}`);
    await writeFile(input, Buffer.from(await blob.arrayBuffer()));

    // 길이·영상 트랙 확인 (ffmpeg -i 는 출력 없이 끝나며 정보를 stderr 에 쓴다)
    const probe = await run(["-hide_banner", "-i", input], 20_000);
    const dur = seconds(probe.stderr);
    if (dur == null || !/Stream #\d+:\d+.*Video:/.test(probe.stderr)) return NextResponse.json({ error: "영상을 열지 못했어요. 다른 영상으로 해 주세요" }, { status: 415 });
    if (dur > VIDEO_MAX_SECONDS + 0.9) return NextResponse.json({ error: `${VIDEO_MAX_SECONDS}초 이하 영상만 올릴 수 있어요` }, { status: 400 });

    const output = join(dir, "out.mp4");
    const enc = await run([
      "-hide_banner", "-loglevel", "error", "-y", "-i", input,
      "-map", "0:v:0", "-map", "0:a:0?",
      "-map_metadata", "-1", "-map_metadata:s:v", "-1", "-map_metadata:s:a", "-1", "-map_chapters", "-1", "-dn", "-sn",
      "-t", String(VIDEO_MAX_SECONDS),
      "-vf", "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))',format=yuv420p",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-profile:v", "high",
      "-c:a", "aac", "-b:a", "96k", "-ac", "2",
      "-movflags", "+faststart", "-metadata:s:v:0", "handler_name=", "-metadata:s:a:0", "handler_name=",
      output,
    ], 100_000);
    if (enc.code !== 0) {
      console.error("영상 다시 만들기 실패:", enc.stderr.slice(-2000));
      return NextResponse.json({ error: "영상을 처리하지 못했어요. 다른 영상으로 해 주세요" }, { status: 422 });
    }

    const posterJpg = join(dir, "poster.jpg");
    const pos = await run(["-hide_banner", "-loglevel", "error", "-y", "-ss", String(Math.min(0.5, dur / 2)), "-i", output, "-frames:v", "1", "-q:v", "3", posterJpg], 20_000);
    if (pos.code !== 0) throw new Error("표지 사진을 만들지 못했어요");

    const [video, poster] = await Promise.all([
      readFile(output),
      sharp(await readFile(posterJpg)).resize({ width: 1080, height: 1080, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
    ]);
    const now = new Date();
    const base = `${actor}/${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}`;
    const [v, p] = await Promise.all([
      sb.storage.from(VIDEO_BUCKET).upload(`${base}.mp4`, video, { contentType: "video/mp4", cacheControl: "31536000", upsert: false }),
      sb.storage.from(IMAGE_BUCKET).upload(`${base}.webp`, poster, { contentType: "image/webp", cacheControl: "31536000", upsert: false }),
    ]);
    if (v.error || p.error) throw new Error((v.error || p.error).message);
    return NextResponse.json({
      url: sb.storage.from(VIDEO_BUCKET).getPublicUrl(`${base}.mp4`).data.publicUrl,
      poster: sb.storage.from(IMAGE_BUCKET).getPublicUrl(`${base}.webp`).data.publicUrl,
      seconds: Math.round(Math.min(dur, VIDEO_MAX_SECONDS) * 10) / 10,
    });
  } catch (e) {
    console.error("영상 처리 오류:", e);
    return NextResponse.json({ error: "영상을 처리하지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  } finally {
    await dropRaw();
    await rm(dir, { recursive: true, force: true });
  }
}

/** DELETE /api/community/video { url, poster } — 올렸다가 글에 안 쓴 내 영상 지우기 (내 폴더 것만, 글에 쓰고 있으면 안 지움) */
export async function DELETE(request: NextRequest) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const { url, poster } = await request.json().catch(() => ({}));
  if (!ownVideo(url, actor)) return NextResponse.json({ error: "내 영상만 지울 수 있어요" }, { status: 403 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const [a, b] = await Promise.all([
    sb.from("community_feed").select("id").eq("video_url", url).eq("is_active", true).limit(1),
    sb.from("group_buys").select("id").eq("video_url", url).limit(1),
  ]);
  if (a.error || b.error) return NextResponse.json({ error: (a.error || b.error).message }, { status: 500 });
  if (a.data?.length || b.data?.length) return NextResponse.json({ error: "글에 쓰고 있는 영상이에요" }, { status: 409 });
  const posterOk = typeof poster === "string" && imagePaths([poster])[0]?.startsWith(`${actor}/`);
  const [vErr, pErr] = await Promise.all([removeVideos(sb, [url]), posterOk ? removeImages(sb, [poster]) : null]);
  if (vErr || pErr) return NextResponse.json({ error: vErr || pErr }, { status: 500 });
  return NextResponse.json({ ok: true });
}
