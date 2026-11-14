"use client";

import { useRef, useState } from "react";
import { useToast } from "@/components/ui";

/**
 * 사진 올리기 — 고르면 바로 /api/community/upload 로 올린다 (서버가 위치 같은 촬영 정보를 지우고 줄인다).
 * 글에 쓰지 않고 빼거나 취소하면 저장소에서도 지운다.
 */
export type Photo = { key: string; status: "uploading" | "done"; url?: string; preview: string };

// 서버로 보낼 수 있는 크기(약 4MB)를 넘으면 브라우저에서 먼저 줄인다
async function shrink(picked: File): Promise<Blob | null> {
  if (picked.size <= 3.5 * 1024 * 1024) return picked;
  try {
    const bmp = await createImageBitmap(picked, { imageOrientation: "from-image" });
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const out = await new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("줄이지 못했어요"))), "image/jpeg", 0.85));
    return out.size > 4 * 1024 * 1024 ? null : out;
  } catch {
    return null;
  }
}

export function usePhotoUploads(max: number) {
  const toast = useToast();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = async (list: FileList | null) => {
    const files = Array.from(list || []);
    if (fileRef.current) fileRef.current.value = "";
    if (!files.length) return;
    const room = max - photos.length;
    if (files.length > room) toast.show(`사진은 ${max}장까지 붙일 수 있어요. 앞의 ${Math.max(0, room)}장만 붙였어요`);
    for (const f of files.slice(0, Math.max(0, room))) {
      const blob = await shrink(f);
      if (!blob) { toast.show("사진이 너무 커요. 더 작은 사진으로 해 주세요", { tone: "danger" }); continue; }
      const key = crypto.randomUUID();
      const preview = URL.createObjectURL(blob);
      setPhotos((cur) => [...cur, { key, status: "uploading", preview }]);
      try {
        const fd = new FormData();
        fd.append("file", blob, "photo");
        const r = await fetch("/api/community/upload", { method: "POST", body: fd });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error);
        setPhotos((cur) => cur.map((p) => (p.key === key ? { ...p, status: "done", url: d.url } : p)));
      } catch (e) {
        URL.revokeObjectURL(preview);
        setPhotos((cur) => cur.filter((p) => p.key !== key));
        toast.show(e instanceof Error && e.message ? e.message : "사진을 올리지 못했어요. 다시 시도해 주세요", { tone: "danger" });
      }
    }
  };

  const discard = (url?: string) => {
    if (!url) return;
    fetch("/api/community/upload", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) })
      .catch(() => {}); // ds-allow: 정리는 보조 — 남아도 글에는 안 나온다
  };

  const drop = (key: string) => {
    const p = photos.find((x) => x.key === key);
    if (!p) return;
    URL.revokeObjectURL(p.preview);
    discard(p.url);
    setPhotos((cur) => cur.filter((x) => x.key !== key));
  };

  /** 글을 올렸으면 keep=true (저장소 사진은 남긴다), 취소면 false */
  const clear = (keep: boolean) => {
    for (const p of photos) { URL.revokeObjectURL(p.preview); if (!keep) discard(p.url); }
    setPhotos([]);
  };

  return {
    photos, fileRef, pick, drop, clear,
    uploading: photos.some((p) => p.status === "uploading"),
    urls: photos.filter((p) => p.status === "done" && p.url).map((p) => p.url!) as string[],
  };
}
