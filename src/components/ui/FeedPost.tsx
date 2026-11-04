"use client";

import type { MouseEvent, ReactNode } from "react";
import { cn } from "./cn";
import { Avatar } from "./Misc";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";

/**
 * 커뮤니티 글 — 작성자 줄 · 동작 줄 · 시간 표기.
 * 식단 카드·일상 카드·상세 화면이 같은 모양을 쓰도록 여기에 둡니다.
 */

export const AGE_GROUP_LABELS: Record<string, string> = {
  "10s": "10대", "20s": "20대", "30s": "30대", "40s": "40대", "50s": "50대", "60s": "60대", "60plus": "60대+",
};

export const CONCERN_LABELS: Record<string, string> = {
  gut_health: "장건강", skin: "피부", weight: "다이어트", energy: "활력",
  muscle: "근력", blood_pressure: "혈압", diabetes: "혈당", kidney: "신장",
  balanced: "균형식단", weight_loss: "체중관리",
};

export function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

/** 작성자 줄 — 아바타 · 이름 · 나이대·관심사 · 시간 · (팔로우) */
export function PostAuthor({
  nickname, ageGroup, concerns, createdAt, onAuthorClick, onFollow, following = false, right, size = "md",
}: {
  nickname: string;
  ageGroup?: string | null;
  concerns?: string[] | null;
  createdAt?: string;
  onAuthorClick?: () => void;
  onFollow?: () => void;
  following?: boolean;
  right?: ReactNode;
  size?: "sm" | "md";
}) {
  const meta = [ageGroup ? AGE_GROUP_LABELS[ageGroup] || ageGroup : null, ...(concerns || []).slice(0, 2).map((c) => CONCERN_LABELS[c] || c)]
    .filter(Boolean).join(" · ");
  return (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar name={nickname} size={size} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {onAuthorClick ? (
            <button type="button" onClick={onAuthorClick} className="text-label font-bold text-ink hover:underline underline-offset-4 truncate">{nickname}</button>
          ) : (
            <span className="text-label font-bold text-ink truncate">{nickname}</span>
          )}
          {createdAt && <span className="text-caption text-ink-3 shrink-0">{timeAgo(createdAt)}</span>}
        </div>
        {meta && <p className="text-caption text-ink-2 truncate">{meta}</p>}
      </div>
      {right}
      {onFollow && (
        <Button size="sm" variant={following ? "secondary" : "primary"} onClick={onFollow} className="shrink-0">
          {following ? "팔로잉" : "팔로우"}
        </Button>
      )}
    </div>
  );
}

/** 동작 버튼 하나 — 아이콘 + 글자/숫자 */
export function PostAction({
  icon, label, count, active = false, onClick,
}: {
  icon: IconName; label: string; count?: number; active?: boolean; onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={count ? `${label} ${count}` : label}
      className={cn(
        "inline-flex items-center gap-1.5 h-10 px-2.5 rounded-md text-label transition-colors",
        active ? "text-brand-ink font-bold" : "text-ink-2 font-medium hover:text-ink hover:bg-sunken",
      )}
    >
      <Icon name={icon} size={18} filled={active && icon === "heart"} />
      <span>{label}</span>
      {!!count && <span className="num">{count}</span>}
    </button>
  );
}

/** 동작 줄 — 카드 아래 */
export function PostActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex items-center gap-1 border-t border-line px-2 py-1", className)}>{children}</div>;
}

/** #태그 줄 */
export function PostTags({ tags, className }: { tags?: string[] | null; className?: string }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {tags.map((t) => <Badge key={t}>#{t}</Badge>)}
    </div>
  );
}
