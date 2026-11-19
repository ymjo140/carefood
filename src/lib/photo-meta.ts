/**
 * 사진 정보 — 서버에서만 쓴다 (upload 라우트·챌린지 인증).
 *  - takenAt: 파일 안 촬영 시각(EXIF DateTimeOriginal). 시간대가 없으면 한국 시간으로 본다. 없으면 null
 *  - dhash: 64비트 차이 해시(16진수 16자). 같은 사진을 조금 자르거나 다시 저장해도 거리가 작다
 *  - hamming: 두 해시의 다른 비트 수
 */
import exifr from "exifr";
import type { Sharp } from "sharp";

const EXIF_RE = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;

export async function takenAt(input: Uint8Array): Promise<string | null> {
  let tags: Record<string, unknown> | undefined;
  try {
    tags = await exifr.parse(input, { pick: ["DateTimeOriginal", "CreateDate", "OffsetTimeOriginal", "OffsetTime"], reviveValues: false });
  } catch (e) {
    // 깨진 EXIF — 촬영 시각 없이 받는다('앨범에서 고름' 표시)
    console.warn("[photo-meta] exif", e instanceof Error ? e.message : e);
    return null;
  }
  const raw = String(tags?.DateTimeOriginal || tags?.CreateDate || "");
  const m = EXIF_RE.exec(raw);
  if (!m) return null;
  const off = String(tags?.OffsetTimeOriginal || tags?.OffsetTime || "+09:00");
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${/^[+-]\d{2}:\d{2}$/.test(off) ? off : "+09:00"}`;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  // 미래(하루 넘게)나 2000년 전 값은 기기 시계가 틀린 것 — 없는 것으로 본다
  if (t.getTime() > Date.now() + 86_400_000 || t.getUTCFullYear() < 2000) return null;
  return t.toISOString();
}

/** 방향·자르기를 마친 sharp 파이프라인을 받아 dHash 를 만든다 (원본 파이프라인은 건드리지 않게 clone 해서 넘긴다) */
export async function dhash(img: Sharp): Promise<string> {
  const { data } = await img.greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  let hex = "";
  for (let row = 0; row < 8; row++) {
    let byte = 0;
    for (let col = 0; col < 8; col++) {
      const l = data[row * 9 + col], r = data[row * 9 + col + 1];
      byte = (byte << 1) | (l > r ? 1 : 0);
    }
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

export function hamming(a: string, b: string): number {
  if (!/^[0-9a-f]{16}$/.test(a) || !/^[0-9a-f]{16}$/.test(b)) return 64;
  let d = 0;
  for (let i = 0; i < 16; i += 2) {
    let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

/** 같은 사진으로 보는 거리 */
export const SAME_PHOTO = 6;

/** 자르기 사각형(0~1, 방향 맞춘 뒤 기준) → 픽셀. 이상한 값이면 null (자르지 않는다) */
export function cropBox(rect: { x: number; y: number; w: number; h: number } | null, W: number, H: number) {
  if (!rect) return null;
  const { x, y, w, h } = rect;
  if (![x, y, w, h].every((v) => Number.isFinite(v))) return null;
  if (w <= 0.05 || h <= 0.05 || x < 0 || y < 0 || x + w > 1.001 || y + h > 1.001) return null;
  const left = Math.max(0, Math.round(x * W)), top = Math.max(0, Math.round(y * H));
  const width = Math.min(W - left, Math.round(w * W)), height = Math.min(H - top, Math.round(h * H));
  if (width < 32 || height < 32) return null;
  return { left, top, width, height };
}
