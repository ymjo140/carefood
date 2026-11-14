"use client";

import { useEffect, useRef } from "react";
import { buttonClass } from "./Button";
import { cn } from "./cn";

/**
 * 파일 고르기 — 버튼 모양 라벨 + 고른 파일 이름. 진짜 입력은 숨겨 두고 키보드 포커스는 라벨에 링으로 보인다.
 * file 을 null 로 돌리면 입력도 비운다(같은 파일을 다시 고를 수 있게)
 */
export function FilePick({ file, onChange, accept, label = "파일 고르기", empty = "고른 파일이 없어요", disabled, className }: {
  file: File | null; onChange: (f: File | null) => void; accept?: string; label?: string; empty?: string; disabled?: boolean; className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!file && ref.current) ref.current.value = ""; }, [file]);
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <label className={buttonClass({ variant: "secondary", className: cn("cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-ink", disabled && "opacity-40 pointer-events-none") })}>
        {label}
        <input ref={ref} type="file" accept={accept} disabled={disabled} className="sr-only" onChange={(e) => onChange(e.target.files?.[0] || null)} />
      </label>
      <span className="text-label text-ink-2 min-w-0 truncate">{file ? file.name : empty}</span>
    </span>
  );
}
