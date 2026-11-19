"use client";

import { useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { cn } from "./cn";
import { Icon } from "./Icon";
import { IconButton } from "./Button";
import { RangeInput } from "./Field";
import { Spinner } from "./Layout";

/* ───────────────────────── 사진 고르기 ───────────────────────── */

export type PickedPhoto = {
  key: string;
  /** 미리 보기 주소 (blob: 또는 올린 사진) */
  src: string;
  status: "ready" | "uploading" | "done" | "failed";
  /** 찍은 시각을 모르는 사진 — '앨범에서 고름' */
  album?: boolean;
};

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";

/**
 * 글에 붙일 사진 고르기 — 찍기(카메라) · 앨범, 최대 max 장. 사진을 누르면 고른 사진이 되고(자르기·순서),
 * 오른쪽 위 ×로 뺀다. 첫 장이 대표 사진. 올리는 중·실패는 사진 위에 표시한다.
 * 진짜 파일 입력은 숨기고 라벨이 버튼 모양 — 키보드 포커스는 라벨에 링으로 보인다.
 */
export function PhotoPicker({ photos, max = 6, selected, onAdd, onSelect, onRemove, disabled, className }: {
  photos: PickedPhoto[]; max?: number; selected?: string | null;
  onAdd: (files: File[], from: "camera" | "album") => void;
  onSelect?: (key: string) => void;
  onRemove: (key: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const room = max - photos.length;
  const add = (from: "camera" | "album") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length) onAdd(files, from);
  };
  const tile = "relative aspect-square rounded-md overflow-hidden border";
  const addTile = cn(tile, "press border-dashed border-line-strong bg-surface flex flex-col items-center justify-center gap-1 text-label text-ink-2 cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-ink",
    (disabled || room <= 0) && "opacity-40 pointer-events-none");
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <ol className="grid grid-cols-3 gap-2" aria-label={`고른 사진 ${photos.length}장`}>
        {photos.map((p, i) => (
          <li key={p.key} className={cn(tile, p.key === selected ? "border-brand-ink border-2" : "border-line")}>
            <button type="button" className="press block size-full" aria-pressed={p.key === selected} aria-label={`사진 ${i + 1}${i === 0 ? " 대표" : ""} 고르기`}
              onClick={() => onSelect?.(p.key)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.src} alt="" className={cn("size-full object-cover transition-opacity duration-150", p.status === "uploading" && "opacity-50")} />
            </button>
            <span className="absolute left-1.5 top-1.5 min-w-6 h-6 px-1.5 rounded-full bg-media-scrim text-on-media text-caption num flex items-center justify-center pointer-events-none">
              {i === 0 ? "대표" : i + 1}
            </span>
            {p.status === "uploading" && <span className="absolute inset-0 flex items-center justify-center pointer-events-none"><Spinner size={20} /></span>}
            {p.status === "failed" && (
              <span className="absolute inset-x-0 bottom-0 bg-media-scrim text-on-media text-caption px-1.5 py-1 flex items-center gap-1 pointer-events-none">
                <Icon name="alert" size={14} />못 올렸어요
              </span>
            )}
            {p.album && p.status !== "failed" && (
              <span className="absolute inset-x-0 bottom-0 bg-media-scrim text-on-media text-caption px-1.5 py-1 pointer-events-none">앨범에서 고름</span>
            )}
            <IconButton icon="close" size="sm" tone="secondary" label={`사진 ${i + 1} 빼기`} className="absolute right-1 top-1" disabled={disabled || p.status === "uploading"} onClick={() => onRemove(p.key)} />
          </li>
        ))}
        {room > 0 && (
          <>
            <li>
              <label className={addTile}>
                <Icon name="camera" size={22} />찍기
                <input type="file" accept={ACCEPT} capture="environment" className="sr-only" disabled={disabled} onChange={add("camera")} name="photo_camera" />
              </label>
            </li>
            <li>
              <label className={addTile}>
                <Icon name="grid" size={22} />앨범
                <input type="file" accept={ACCEPT} multiple className="sr-only" disabled={disabled} onChange={add("album")} name="photo_album" />
              </label>
            </li>
          </>
        )}
      </ol>
      <p className="text-caption text-ink-2"><span className="num">{photos.length}</span> / {max}장 · 위치 같은 촬영 정보는 지우고 올려요</p>
    </div>
  );
}

/* ───────────────────────── 자르기 ───────────────────────── */

export type CropAspect = "square" | "portrait";
export const ASPECT_RATIO: Record<CropAspect, number> = { square: 1, portrait: 4 / 5 };
/** 자르기 상태 — 틀 가운데가 사진의 어디인지(0~1)와 확대 배율(1~3) */
export type CropValue = { cx: number; cy: number; zoom: number };
export const CROP_CENTER: CropValue = { cx: 0.5, cy: 0.5, zoom: 1 };

/** 자르기 상태 → 사진 기준 사각형(0~1). 서버(/api/community/upload crop)가 같은 값으로 자른다 */
export function cropRect(v: CropValue, imgW: number, imgH: number, aspect: number) {
  if (!imgW || !imgH) return { x: 0, y: 0, w: 1, h: 1 };
  const r = imgW / imgH;
  let w = r > aspect ? aspect / r : 1;
  let h = r > aspect ? 1 : r / aspect;
  w /= v.zoom; h /= v.zoom;
  const clamp = (c: number, size: number) => Math.min(1 - size, Math.max(0, c - size / 2));
  return { x: clamp(v.cx, w), y: clamp(v.cy, h), w, h };
}

/**
 * 사진 자르기 틀 — 끌어서 옮기고 슬라이더로 확대. 틀 밖은 보이지 않는다.
 * 움직임은 transform 으로만 그린다. 키보드: 틀에 포커스 → 화살표로 옮기기, +/- 로 확대.
 */
export function CropFrame({ src, natural, aspect, value, onChange, className }: {
  src: string; natural: { w: number; h: number } | null; aspect: CropAspect;
  value: CropValue; onChange: (v: CropValue) => void; className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; v: CropValue } | null>(null);
  const a = ASPECT_RATIO[aspect];
  const rect = natural ? cropRect(value, natural.w, natural.h, a) : { x: 0, y: 0, w: 1, h: 1 };
  // 틀 폭 = 사진 폭의 rect.w → 사진은 틀의 1/rect.w 배. 왼쪽 위를 -x 만큼 옮긴다
  const imgStyle = { width: `${100 / rect.w}%`, height: `${100 / rect.h}%`, transform: `translate(${-rect.x * 100}%, ${-rect.y * 100}%)` };

  const move = (dxN: number, dyN: number, base = value) => {
    const r = natural ? cropRect(base, natural.w, natural.h, a) : rect;
    const cx = Math.min(1 - r.w / 2, Math.max(r.w / 2, base.cx + dxN));
    const cy = Math.min(1 - r.h / 2, Math.max(r.h / 2, base.cy + dyN));
    onChange({ ...base, cx, cy });
  };
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    // 끌기 시작할 때 가운데를 지금 보이는 곳으로 맞춘다 (가장자리에서 걸린 값이 남지 않게)
    drag.current = { x: e.clientX, y: e.clientY, v: { ...value, cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2 } };
  };
  const moveP = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current, el = box.current;
    if (!d || !el) return;
    const fw = el.clientWidth, fh = el.clientHeight;
    move(-(e.clientX - d.x) / fw * rect.w, -(e.clientY - d.y) / fh * rect.h, d.v);
  };
  const up = () => { drag.current = null; };
  const key = (e: React.KeyboardEvent) => {
    const step = 0.03;
    if (e.key === "ArrowLeft") move(-step, 0); else if (e.key === "ArrowRight") move(step, 0);
    else if (e.key === "ArrowUp") move(0, -step); else if (e.key === "ArrowDown") move(0, step);
    else if (e.key === "+" || e.key === "=") onChange({ ...value, zoom: Math.min(3, value.zoom + 0.1) });
    else if (e.key === "-") onChange({ ...value, zoom: Math.max(1, value.zoom - 0.1) });
    else return;
    e.preventDefault();
  };
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div ref={box} tabIndex={0} role="group" aria-label="사진 자르기 — 끌거나 화살표로 옮기고, +와 -로 확대해요" onKeyDown={key}
        onPointerDown={down} onPointerMove={moveP} onPointerUp={up} onPointerCancel={up}
        className={cn("relative w-full overflow-hidden rounded-md border border-line bg-sunken touch-none select-none cursor-grab active:cursor-grabbing",
          aspect === "square" ? "aspect-square" : "aspect-4/5")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="자를 사진" draggable={false} className="absolute left-0 top-0 max-w-none origin-top-left pointer-events-none" style={imgStyle} />
        {/* 삼등분 안내선 */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }, (_, i) => <span key={i} className="border border-on-media opacity-20" />)}
        </span>
      </div>
      <label className="flex items-center gap-3 text-label text-ink-2">
        <Icon name="search" size={18} />
        <span className="shrink-0">확대</span>
        <RangeInput min={1} max={3} step={0.05} value={value.zoom} aria-label="확대" name="crop_zoom" className="flex-1"
          onChange={(e) => onChange({ ...value, zoom: Number(e.target.value) })} />
      </label>
    </div>
  );
}

/* ───────────────────────── 글 사진 넘기기 ───────────────────────── */

/**
 * 글 사진 1~6장 — 옆으로 넘기고(스냅), 오른쪽 위에 "2/6", 아래에 점. 비율은 첫 장 기준 1:1 또는 4:5.
 * onOpen 이 있으면 사진을 눌러 크게 본다. 없으면 글을 누른 것으로 넘어간다.
 */
export function PhotoCarousel({ urls, alt, ratio, onOpen, className }: {
  urls: string[]; alt: string;
  /** 첫 장의 가로/세로 — 0.9 미만이면 4:5 */
  ratio?: number | null;
  onOpen?: (i: number) => void;
  className?: string;
}) {
  const [at, setAt] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  if (!urls.length) return null;
  const tall = ratio != null && ratio < 0.9;
  const onScroll = () => {
    const el = box.current;
    if (el) setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };
  const n = urls.length;
  return (
    <div className={cn("relative overflow-hidden rounded-md border border-line bg-sunken", className)}>
      <div ref={box} onScroll={onScroll} className="flex overflow-x-auto snap-x snap-mandatory scroll-row" aria-label={`${alt} 사진 ${n}장`}>
        {urls.map((u, i) => {
          // eslint-disable-next-line @next/next/no-img-element
          const img = <img src={u} alt={n > 1 ? `${alt} ${i + 1}/${n}` : alt} loading={i === 0 ? "eager" : "lazy"} className="size-full object-cover" />;
          const cell = cn("snap-start shrink-0 w-full", tall ? "aspect-4/5" : "aspect-square");
          return onOpen
            ? <button key={`${u}-${i}`} type="button" className={cn(cell, "block")} aria-label={`사진 ${i + 1} 크게 보기`} onClick={() => onOpen(i)}>{img}</button>
            : <div key={`${u}-${i}`} className={cell}>{img}</div>;
        })}
      </div>
      {n > 1 && (
        <>
          <span className="absolute right-2 top-2 h-6 px-2 rounded-full bg-media-scrim text-on-media text-caption num flex items-center pointer-events-none" aria-hidden="true">{at + 1}/{n}</span>
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5 pointer-events-none" aria-hidden="true">
            {urls.map((_, i) => <span key={i} className={cn("size-1.5 rounded-full bg-on-media transition-opacity duration-150", i === at ? "opacity-100" : "opacity-50")} />)}
          </div>
        </>
      )}
    </div>
  );
}
