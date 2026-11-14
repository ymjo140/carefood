"use client";

import { useRef, useState } from "react";
import { useToast } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { VIDEO_MAX_BYTES, VIDEO_MAX_SECONDS, VIDEO_RAW_BUCKET, VIDEO_TYPES } from "@/lib/community-video";

/**
 * 짧은 영상 한 개 올리기 — 고르면: 길이·크기 확인 → 비공개 저장소에 바로 올림 → 서버가 위치·기기 정보 없이 새로 만듦.
 * 글에 쓰지 않고 빼거나 취소하면 저장소에서도 지운다.
 */
export type Video = { url: string; poster: string; seconds: number };
type Status = "idle" | "uploading" | "processing" | "done";

/** 브라우저가 읽은 길이(초) — 못 읽으면 null (서버가 다시 확인한다) */
function readSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    const done = (s: number | null) => { URL.revokeObjectURL(url); resolve(s); };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => done(null);
    v.src = url;
  });
}

export function useVideoUpload() {
  const toast = useToast();
  const [status, setStatus] = useState<Status>("idle");
  const [video, setVideo] = useState<Video | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const discard = (v: Video | null) => {
    if (!v) return;
    fetch("/api/community/video", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: v.url, poster: v.poster }) })
      .catch(() => {}); // ds-allow: 정리는 보조 — 남아도 글에는 안 나온다
  };

  const pick = async (list: FileList | null) => {
    const file = list?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    if (!VIDEO_TYPES[file.type]) { toast.show("mp4·mov 영상만 올릴 수 있어요", { tone: "danger" }); return; }
    if (file.size > VIDEO_MAX_BYTES) { toast.show("50MB 이하 영상만 올릴 수 있어요. 30초 안으로 짧게 찍어 주세요", { tone: "danger" }); return; }
    const sec = await readSeconds(file);
    if (sec != null && sec > VIDEO_MAX_SECONDS + 0.9) { toast.show(`${VIDEO_MAX_SECONDS}초 이하 영상만 올릴 수 있어요`, { tone: "danger" }); return; }

    const before = video;
    setStatus("uploading");
    try {
      const s = await fetch("/api/community/video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", type: file.type, size: file.size }) });
      const sd = await s.json().catch(() => ({}));
      if (!s.ok) throw new Error(sd.error);
      const { error } = await createClient().storage.from(VIDEO_RAW_BUCKET).uploadToSignedUrl(sd.path, sd.token, file, { contentType: file.type });
      if (error) throw new Error("영상을 올리지 못했어요. 연결을 확인하고 다시 시도해 주세요");
      setStatus("processing");
      const f = await fetch("/api/community/video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "finish", path: sd.path }) });
      const fd = await f.json().catch(() => ({}));
      if (!f.ok) throw new Error(fd.error);
      setVideo({ url: fd.url, poster: fd.poster, seconds: fd.seconds });
      setStatus("done");
      discard(before); // 바꿔 올렸으면 앞 영상은 지운다
    } catch (e) {
      setStatus(before ? "done" : "idle");
      toast.show(e instanceof Error && e.message ? e.message : "영상을 올리지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
  };

  /** 글에 쓰지 않고 빼기 */
  const drop = () => { discard(video); setVideo(null); setStatus("idle"); };
  /** 글을 올렸으면 keep=true (저장소 영상은 남긴다), 취소면 false */
  const clear = (keep: boolean) => { if (!keep) discard(video); setVideo(null); setStatus("idle"); };

  return { video, status, busy: status === "uploading" || status === "processing", fileRef, pick, drop, clear };
}
