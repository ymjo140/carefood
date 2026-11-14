import type { ReactNode } from "react";
import { cn } from "./cn";
import { Avatar } from "./Misc";
import { TextButton } from "./Button";
import { timeAgo } from "./FeedPost";

/**
 * 댓글 한 줄 — 왼쪽 아바타(이어지는 답이 있으면 세로선), 오른쪽 이름 · 표시(진행자 등) · 시간 → 내용 → 답하기·지우기.
 * 한 단계 답은 nested. 공구 질문처럼 별도 메뉴 없이 쓰는 곳에서 쓴다.
 */
export function CommentItem({
  nickname, badge, createdAt, timeLabel, content, nested = false, line = false, onReply, replyLabel = "답하기", onDelete, deleteLabel = "지우기", className,
}: {
  nickname: string;
  /** 이름 옆 표시 — "진행자" */
  badge?: ReactNode;
  createdAt?: string;
  /** 시간 글자를 직접 줄 때 (기준 페이지처럼 미리 그리는 곳 — 지금 시각을 쓰지 않게) */
  timeLabel?: string;
  content: string;
  nested?: boolean;
  /** 아래로 이어지는 세로선 (답이 이어질 때) */
  line?: boolean;
  onReply?: () => void; replyLabel?: string;
  onDelete?: () => void; deleteLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-3", nested && "pl-11", className)}>
      <div className="flex flex-col items-center gap-1 shrink-0">
        <Avatar name={nickname} size={nested ? "xs" : "sm"} />
        {line && <span aria-hidden="true" className="flex-1 w-0.5 rounded-full bg-line" />}
      </div>
      <div className="flex-1 min-w-0 pb-2">
        <p className="flex items-center gap-1.5 min-h-8 min-w-0">
          <span className="text-label font-bold text-ink truncate">{nickname}</span>
          {badge && <span className="text-caption text-brand-ink shrink-0">{badge}</span>}
          {(timeLabel || createdAt) && <span className="text-caption text-ink-3 shrink-0">· {timeLabel ?? timeAgo(createdAt!)}</span>}
        </p>
        <p className="text-body text-ink whitespace-pre-line">{content}</p>
        {(onReply || onDelete) && (
          <div className="flex gap-4">
            {onReply && <TextButton onClick={onReply}>{replyLabel}</TextButton>}
            {onDelete && <TextButton onClick={onDelete}>{deleteLabel}</TextButton>}
          </div>
        )}
      </div>
    </div>
  );
}
