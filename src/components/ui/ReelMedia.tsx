"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";
import { Icon } from "./Icon";
import { ProductImage } from "./ProductImage";
import { IconButton } from "./Button";
import { Spinner } from "./Layout";
import { clock } from "./Reel";

/**
 * 숏폼 보기 위쪽 — 사진을 옆으로 넘기고(스냅), 위 띠에 몇 번째 사진인지 · 올린 사람 · 닫기.
 * 사진이 없으면 제품 사진 한 장(fallback). 화면 폭을 꽉 채우도록 부모의 좌우 여백만큼 바깥으로 나간다(-mx-4).
 */
export function ReelMedia({ urls, video, fallback, alt, header, closeHref, className }: {
  urls: string[]; fallback?: string | null; alt: string;
  /** 영상 — 첫 장으로, 소리 없이 반복 재생 (동작 줄이기면 멈춘 채) */
  video?: { url: string; poster: string } | null;
  /** 위 띠의 올린 사람 줄 */
  header: ReactNode;
  closeHref: string;
  className?: string;
}) {
  const list = urls.length || video ? urls : [fallback ?? null];
  const total = list.length + (video ? 1 : 0);
  const [at, setAt] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const onScroll = () => {
    const el = box.current;
    if (el) setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };
  return (
    <div className={cn("relative -mx-4 -mt-5 bg-sunken", className)}>
      <div ref={box} onScroll={onScroll} className="flex overflow-x-auto snap-x snap-mandatory scroll-row" aria-label={`${alt} ${video ? "영상과 " : ""}사진 ${list.length}장`}>
        {video && (
          <div className="snap-start shrink-0 w-full aspect-square">
            <VideoClip url={video.url} poster={video.poster} label={`${alt} 영상`} autoplay bare />
          </div>
        )}
        {list.map((u, i) => (
          <div key={`${u}-${i}`} className="snap-start shrink-0 w-full aspect-square">
            <ProductImage src={u} alt={list.length > 1 ? `${alt} ${i + 1}/${list.length}` : alt} iconSize={56} />
          </div>
        ))}
      </div>
      <div className="absolute inset-x-0 top-0 px-4 pt-3 pb-3 bg-media-scrim text-on-media flex flex-col gap-3">
        {total > 1 && (
          <div className="flex gap-1" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => <span key={i} className={cn("h-1 flex-1 rounded-full bg-on-media transition-opacity duration-150", i === at ? "opacity-100" : "opacity-40")} />)}
          </div>
        )}
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">{header}</div>
          <Link href={closeHref} aria-label="닫기" className="press size-11 -mr-2.5 flex items-center justify-center text-on-media">
            <Icon name="close" size={22} />
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * 짧은 영상 — 소리 없이 시작, 소리 켜기 버튼. autoplay 면 화면에 보일 때 반복 재생(동작 줄이기면 멈춘 채 표지만).
 * 브라우저 기본 조작 막대는 쓰지 않고 누르면 멈춤/재생.
 */
export function VideoClip({ url, poster, label, autoplay = false, bare = false, className }: {
  url: string; poster: string; label: string; autoplay?: boolean;
  /** 테두리·둥글기 없이 부모를 꽉 채움 (보기 화면 위쪽) */
  bare?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);

  // 화면에 보일 때만 재생 (동작 줄이기면 자동 재생하지 않음)
  useEffect(() => {
    const v = ref.current;
    if (!v || !autoplay) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) v.play().catch(() => {}); // ds-allow: 브라우저가 자동 재생을 막으면 표지와 재생 버튼이 남는다
      else v.pause();
    }, { threshold: 0.6 });
    io.observe(v);
    return () => io.disconnect();
  }, [autoplay]);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {}); // ds-allow: 재생이 막히면 그대로 둔다 (버튼이 '재생'으로 남음)
    else v.pause();
  };

  return (
    <div className={cn("relative w-full overflow-hidden bg-sunken", bare ? "h-full" : "aspect-square max-h-96 rounded-md border border-line", className)}>
      <video ref={ref} src={url} poster={poster} muted={muted} loop playsInline preload="metadata" aria-label={label}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        className="block w-full h-full object-cover" />
      <button type="button" onClick={toggle} aria-label={playing ? "멈추기" : "재생하기"}
        className="absolute inset-0 flex items-center justify-center">
        {!playing && (
          <span className="size-14 rounded-full bg-media-scrim text-on-media flex items-center justify-center">
            <Icon name="play" size={26} filled />
          </span>
        )}
      </button>
      <button type="button" onClick={() => setMuted((m) => !m)} aria-label={muted ? "소리 켜기" : "소리 끄기"} aria-pressed={!muted}
        className="press absolute right-2 bottom-2 size-11 rounded-full bg-media-scrim text-on-media flex items-center justify-center">
        <Icon name={muted ? "volume-off" : "volume-on"} size={20} />
      </button>
    </div>
  );
}

/** 글쓰기에 붙인 영상 — 올리는 중 · 다듬는 중(위치 정보 빼기) · 붙음(미리 보기 + 빼기) */
export function VideoAttach({ status, video, onRemove }: {
  status: "idle" | "uploading" | "processing" | "done";
  video: { url: string; poster: string; seconds: number } | null;
  onRemove: () => void;
}) {
  if (status === "uploading" || status === "processing") {
    return (
      <div role="status" className="flex items-center gap-3 rounded-md bg-sunken px-3 py-3 text-label text-ink-2">
        <Spinner size={18} />
        {status === "uploading" ? "영상을 올리고 있어요" : "위치 같은 촬영 정보를 빼고 다듬고 있어요 (영상 길이에 따라 10~30초)"}
      </div>
    );
  }
  if (!video) return null;
  return (
    <div className="relative w-40">
      <VideoClip url={video.url} poster={video.poster} label="붙인 영상" />
      <span className="absolute left-2 top-2 h-6 px-1.5 rounded-sm bg-media-scrim text-on-media text-caption flex items-center num">{clock(video.seconds)}</span>
      <IconButton icon="close" size="sm" tone="secondary" label="영상 빼기" className="absolute -top-2 -right-2" onClick={onRemove} />
    </div>
  );
}
