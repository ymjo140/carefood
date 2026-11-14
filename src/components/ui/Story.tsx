"use client";

import Link from "next/link";
import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { Avatar } from "./Misc";
import { Spinner } from "./Layout";

/**
 * 스토리 보기 — 인스타 스토리처럼 화면을 꽉 채운 한 장씩 넘기기.
 * 위: 진행 막대 · 올린 사람 · 게시물로(↗) · 닫기 / 가운데: 사진·영상 + 스티커 하나 / 아래: 답글 칸 · 좋아요 · 보내기
 * 화면 왼쪽 1/3 을 누르면 이전, 나머지는 다음. 꾹 누르면 멈춤. 바탕은 두 테마에 같은 media 색.
 * 떠 있는 동안 <html data-bottom-bar> 를 달아 하단 탭 바를 숨긴다. 머리 줄(z-50)보다 뒤에 그려져 그 위를 덮고, 시트는 다시 그 위.
 */
export function StoryFrame({ label, top, children, sticker, footer, onPrev, onNext, onHold }: {
  label: string;
  /** 진행 막대 + 머리 줄 */
  top: ReactNode;
  /** 사진·영상 (StoryMedia) */
  children: ReactNode;
  /** 사진 아래쪽 스티커 (StorySticker) */
  sticker?: ReactNode;
  /** 답글 칸·행동 줄 */
  footer?: ReactNode;
  onPrev: () => void;
  onNext: () => void;
  /** 꾹 누르는 동안 true */
  onHold: (held: boolean) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute("data-bottom-bar", "");
    return () => el.removeAttribute("data-bottom-bar");
  }, []);

  const down = () => {
    held.current = false;
    timer.current = setTimeout(() => { held.current = true; onHold(true); }, 220);
  };
  const up = (go: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    if (held.current) { held.current = false; onHold(false); return; } // 꾹 눌렀다 뗀 것은 넘기지 않는다
    go();
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    if (held.current) { held.current = false; onHold(false); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-50 bg-media flex justify-center animate-fade-in">
      <div className="relative w-full max-w-md h-dvh flex flex-col">
        <div className="relative z-10 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] flex flex-col gap-2">{top}</div>
        <div className="relative flex-1 min-h-0">
          {children}
          {/* 넘기기 — 버튼 두 개 (키보드는 화살표) */}
          <button type="button" aria-label="이전 스토리" className="absolute inset-y-0 left-0 w-1/3 select-none"
            onPointerDown={down} onPointerUp={() => up(onPrev)} onPointerLeave={cancel} onKeyDown={(e) => { if (e.key === "Enter") onPrev(); }} onClick={(e) => e.preventDefault()} />
          <button type="button" aria-label="다음 스토리" className="absolute inset-y-0 right-0 w-2/3 select-none"
            onPointerDown={down} onPointerUp={() => up(onNext)} onPointerLeave={cancel} onKeyDown={(e) => { if (e.key === "Enter") onNext(); }} onClick={(e) => e.preventDefault()} />
          {sticker && <div className="absolute inset-x-0 bottom-4 z-10 flex justify-center px-6 pointer-events-none">{sticker}</div>}
        </div>
        {footer && <div className="relative z-10 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

/** 진행 막대 — 지난 것은 꽉, 지금 것은 value(0~1)만큼, 남은 것은 빈 칸 */
export function StoryProgress({ count, index, value }: { count: number; index: number; value: number }) {
  return (
    <div className="flex gap-1" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="h-0.5 flex-1 rounded-full bg-media-scrim overflow-hidden">
          <span className="block h-full w-full bg-on-media origin-left"
            style={{ transform: `scaleX(${i < index ? 1 : i > index ? 0 : Math.min(1, Math.max(0, value))})` }} />
        </span>
      ))}
    </div>
  );
}

/** 머리 줄 — 올린 사람 · 시간 · (게시물로 ↗) · 닫기 */
export function StoryHeader({ author, meta, postHref, postLabel = "게시물 보기", paused, onClose }: {
  author: string; meta?: ReactNode; postHref?: string; postLabel?: string; paused?: boolean; onClose: () => void;
}) {
  return (
    <div className="flex items-center gap-2 text-on-media">
      <Avatar name={author} size="sm" />
      <p className="flex-1 min-w-0 text-label truncate">
        <span className="font-bold">{author}</span>
        {meta && <span className="font-regular"> · {meta}</span>}
        {paused && <span className="sr-only"> · 멈춤</span>}
      </p>
      {paused && <Icon name="pause" size={18} aria-hidden="true" />}
      {postHref && (
        <Link href={postHref} aria-label={postLabel} title={postLabel}
          className="press h-9 pl-3 pr-2.5 rounded-full border border-on-media text-caption font-bold flex items-center gap-1 shrink-0">
          게시물 <Icon name="external" size={14} />
        </Link>
      )}
      <button type="button" onClick={onClose} aria-label="닫기" className="press size-11 -mr-2 flex items-center justify-center shrink-0">
        <Icon name="close" size={22} />
      </button>
    </div>
  );
}

/**
 * 사진·영상 — 칸 안에 맞춰(잘리지 않게) 가운데. 영상은 소리 없이 한 번 재생, 끝나면 onEnded.
 * paused 면 멈춘다. 영상 길이·진행은 onTime(현재, 전체)로 알려 준다.
 */
export function StoryMedia({ image, video, alt, paused, muted, onTime, onEnded, onReady }: {
  image: string | null; video?: string | null; alt: string; paused: boolean; muted: boolean;
  onTime?: (t: number, d: number) => void; onEnded?: () => void; onReady?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (paused) v.pause();
    else v.play().catch(() => {}); // ds-allow: 자동 재생이 막히면 표지가 남고, 막대는 멈춘 채 — 누르면 다음으로
  }, [paused, video]);
  if (video) {
    return (
      <video key={video} ref={ref} src={video} poster={image || undefined} muted={muted} playsInline autoPlay={!paused} preload="auto" aria-label={alt}
        onLoadedData={onReady} onTimeUpdate={(e) => onTime?.(e.currentTarget.currentTime, e.currentTarget.duration || 0)} onEnded={onEnded}
        className="absolute inset-0 w-full h-full object-contain" />
    );
  }
  if (!image) {
    return <span className="absolute inset-0 flex items-center justify-center text-on-media"><Icon name="bowl" size={56} /></span>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img key={image} src={image} alt={alt} onLoad={onReady} className="absolute inset-0 w-full h-full object-contain" />;
}

/** 스티커 — 사진 위 흰 표 한 장. 누르면 게시물로 (인스타의 링크 스티커 자리) */
export function StorySticker({ href, children, label }: { href: string; children: ReactNode; label: string }) {
  return (
    <Link href={href} aria-label={label}
      className="press pointer-events-auto max-w-full min-h-11 px-4 py-2 rounded-md bg-surface text-ink text-label flex items-center gap-2">
      <span className="min-w-0 truncate">{children}</span>
      <Icon name="chevron-right" size={16} className="shrink-0 text-ink-2" />
    </Link>
  );
}

/** 사진 아래 한두 줄 설명 (협찬 표시 포함) */
export function StoryCaption({ children }: { children: ReactNode }) {
  return <p className="text-label text-on-media line-clamp-2 px-1">{children}</p>;
}

/** 아래 줄 아이콘 버튼 — 어두운 바탕용 */
export function StoryAction({ icon, label, active, onClick }: { icon: IconName; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={active} title={label}
      className="press size-11 shrink-0 flex items-center justify-center text-on-media">
      <Icon key={active ? "on" : "off"} name={icon} size={24} filled={active && icon === "heart"} className={active && icon === "heart" ? "animate-pop" : undefined} />
    </button>
  );
}

/** 답글 칸 — 보내면 그 게시물의 답글(공구는 질문)이 된다 */
export function StoryReply({ value, onChange, onSubmit, placeholder, sending, onFocusChange }: {
  value: string; onChange: (v: string) => void; onSubmit: () => void; placeholder: string; sending?: boolean;
  onFocusChange?: (focused: boolean) => void;
}) {
  const submit = (e: FormEvent) => { e.preventDefault(); if (value.trim() && !sending) onSubmit(); };
  return (
    <form onSubmit={submit} className="flex-1 min-w-0 flex items-center h-11 rounded-full border border-on-media pl-4 pr-1 text-on-media">
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} name="story_reply" maxLength={500}
        onFocus={() => onFocusChange?.(true)} onBlur={() => onFocusChange?.(false)}
        className="flex-1 min-w-0 bg-transparent text-body text-on-media placeholder:text-on-media placeholder:opacity-70 outline-none" />
      {value.trim() && (
        <button type="submit" disabled={sending} aria-label="답글 보내기" className="press size-9 shrink-0 rounded-full bg-brand text-on-brand flex items-center justify-center">
          {sending ? <Spinner size={16} /> : <Icon name="send" size={18} />}
        </button>
      )}
    </form>
  );
}
