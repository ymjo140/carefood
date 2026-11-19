"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cropRect, ASPECT_RATIO, CROP_CENTER, type CropAspect, type CropValue, type PickedPhoto } from "@/components/ui";

/**
 * 글쓰기 사진 묶음 — 고르기 · 자르기 · 순서 · 올리기.
 *  - 고를 때: 촬영 시각(EXIF)을 먼저 읽고(줄이면 지워진다), 4MB 넘으면 브라우저에서 줄인다.
 *  - 올릴 때(uploadAll): 자르기 값을 같이 보내 서버가 원본에서 자른다. 이미 올린 사진은 다시 올리지 않는다.
 *  - 올린 뒤 자르기·비율을 바꾸면 그 사진만 다시 올린다(예전 것은 지운다).
 */
export type Photo = {
  key: string;
  blob: Blob | null;
  preview: string;
  natural: { w: number; h: number } | null;
  crop: CropValue;
  takenAt: string | null;
  status: PickedPhoto["status"];
  upload: { id: string; url: string; takenAt: string | null } | null;
};

export const MAX_PHOTOS = 6;

async function readTaken(f: File): Promise<string | null> {
  try {
    const exifr = (await import("exifr")).default;
    const t = await exifr.parse(f, { pick: ["DateTimeOriginal", "CreateDate"] });
    const d = (t?.DateTimeOriginal || t?.CreateDate) as Date | undefined;
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
  } catch (e) {
    console.warn("[composer] 촬영 시각을 읽지 못했어요", e); // ds-allow: 없으면 '앨범에서 고름'으로 올린다
    return null;
  }
}

async function shrink(f: File): Promise<Blob | null> {
  if (f.size <= 3.5 * 1024 * 1024) return f;
  try {
    const bmp = await createImageBitmap(f, { imageOrientation: "from-image" });
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const out = await new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("줄이지 못했어요"))), "image/jpeg", 0.88));
    return out.size > 4 * 1024 * 1024 ? null : out;
  } catch (e) {
    console.warn("[composer] 사진 줄이기", e);
    return null;
  }
}

function naturalOf(src: string) {
  return new Promise<{ w: number; h: number } | null>((ok) => {
    const img = new Image();
    img.onload = () => ok({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => ok(null);
    img.src = src;
  });
}

const discard = (url: string) => {
  fetch("/api/community/upload", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) })
    .catch((e) => console.warn("[composer] 안 쓴 사진 지우기", e)); // ds-allow: 정리는 보조 — 남아도 글에는 안 나온다
};

export function usePhotoSet(onError: (msg: string) => void) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [aspect, setAspectState] = useState<CropAspect>("square");
  // 비동기 올리기 중에 지금 목록을 읽는다 (그리는 동안에는 쓰지 않는다)
  const ref = useRef<Photo[]>([]);
  useEffect(() => { ref.current = photos; }, [photos]);

  const add = useCallback(async (files: File[]) => {
    const room = MAX_PHOTOS - ref.current.length;
    if (files.length > room) onError(`사진은 ${MAX_PHOTOS}장까지예요. 앞의 ${Math.max(0, room)}장만 붙였어요`);
    for (const f of files.slice(0, Math.max(0, room))) {
      const takenAt = await readTaken(f);
      const blob = await shrink(f);
      if (!blob) { onError("사진이 너무 커요. 더 작은 사진으로 해 주세요"); continue; }
      const preview = URL.createObjectURL(blob);
      const natural = await naturalOf(preview);
      const p: Photo = { key: crypto.randomUUID(), blob, preview, natural, crop: CROP_CENTER, takenAt, status: "ready", upload: null };
      setPhotos((cur) => (cur.length >= MAX_PHOTOS ? cur : [...cur, p]));
    }
  }, [onError]);

  const remove = useCallback((key: string) => {
    const p = ref.current.find((x) => x.key === key);
    if (!p) return;
    if (p.blob) URL.revokeObjectURL(p.preview);
    if (p.upload) discard(p.upload.url);
    setPhotos((cur) => cur.filter((x) => x.key !== key));
  }, []);

  const move = useCallback((key: string, dir: -1 | 1) => {
    setPhotos((cur) => {
      const i = cur.findIndex((x) => x.key === key), j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  /** 올린 뒤 모양을 바꾸면 다시 올린다 (원본이 이 기기에 있을 때만 — 이어 쓰기로 불러온 사진은 자르기를 바꿀 수 없다) */
  const reshape = (p: Photo): Photo => {
    if (!p.upload || !p.blob) return p;
    discard(p.upload.url);
    return { ...p, upload: null, status: "ready" };
  };
  const setCrop = useCallback((key: string, crop: CropValue) => {
    setPhotos((cur) => cur.map((p) => (p.key === key && p.blob ? { ...reshape(p), crop } : p)));
  }, []);
  const setAspect = useCallback((a: CropAspect) => {
    setAspectState(a);
    setPhotos((cur) => cur.map(reshape));
  }, []);

  /** 아직 안 올린 사진을 차례로 올린다 → 모두 올렸으면 upload id 목록(순서대로), 하나라도 못 올렸으면 null */
  const uploadAll = useCallback(async (): Promise<{ ids: string[]; first: Blob | null } | null> => {
    let ok = true;
    for (const p of ref.current) {
      if (p.upload || !p.blob) continue;
      setPhotos((cur) => cur.map((x) => (x.key === p.key ? { ...x, status: "uploading" } : x)));
      try {
        const fd = new FormData();
        fd.append("file", p.blob, "photo");
        if (p.natural) fd.append("crop", JSON.stringify(cropRect(p.crop, p.natural.w, p.natural.h, ASPECT_RATIO[aspect])));
        if (p.takenAt) fd.append("taken_at", p.takenAt);
        const r = await fetch("/api/community/upload", { method: "POST", body: fd });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.upload_id) throw new Error(d.error || "사진을 올리지 못했어요");
        setPhotos((cur) => cur.map((x) => (x.key === p.key ? { ...x, status: "done", upload: { id: d.upload_id, url: d.url, takenAt: d.taken_at ?? null } } : x)));
        ref.current = ref.current.map((x) => (x.key === p.key ? { ...x, status: "done", upload: { id: d.upload_id, url: d.url, takenAt: d.taken_at ?? null } } : x));
      } catch (e) {
        ok = false;
        setPhotos((cur) => cur.map((x) => (x.key === p.key ? { ...x, status: "failed" } : x)));
        onError(e instanceof Error && e.message ? `${e.message}. 다시 시도해 주세요` : "사진을 올리지 못했어요. 다시 시도해 주세요");
      }
    }
    if (!ok) return null;
    return { ids: ref.current.map((p) => p.upload!.id), first: ref.current[0]?.blob ?? null };
  }, [aspect, onError]);

  /** 이어 쓰기 — 이미 올린 사진만 되살린다 */
  const restore = useCallback((list: { upload_id: string; url: string; taken_at: string | null }[]) => {
    setPhotos(list.slice(0, MAX_PHOTOS).map((u) => ({
      key: u.upload_id, blob: null, preview: u.url, natural: null, crop: CROP_CENTER, takenAt: u.taken_at, status: "done",
      upload: { id: u.upload_id, url: u.url, takenAt: u.taken_at },
    })));
  }, []);

  /** 비우기 — posted 면 올린 사진은 글에 쓰였으니 지우지 않는다 */
  const clear = useCallback((posted: boolean) => {
    for (const p of ref.current) {
      if (p.blob) URL.revokeObjectURL(p.preview);
      if (!posted && p.upload) discard(p.upload.url);
    }
    setPhotos([]);
    setAspectState("square");
  }, []);

  const picked: PickedPhoto[] = photos.map((p) => ({
    key: p.key, src: p.preview, status: p.status, album: p.upload ? !p.upload.takenAt : !p.takenAt,
  }));
  return { photos, picked, aspect, setAspect, add, remove, move, setCrop, uploadAll, restore, clear };
}
