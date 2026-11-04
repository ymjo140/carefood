"use client";

import { Card } from "@/components/ui";
import { PostAction, PostActions, PostAuthor, PostTags } from "@/components/ui/FeedPost";

type Props = {
  post: {
    id: string;
    author_nickname: string;
    author_age_group?: string;
    author_concerns?: string[];
    content?: string;
    tags?: string[];
    like_count: number;
    comment_count: number;
    is_liked?: boolean;
    created_at: string;
    user_id: string;
  };
  onLike: () => void;
  onComment: () => void;
  onFollow?: () => void;
  onCardClick?: () => void;
};

export default function DailyCard({ post, onLike, onComment, onFollow, onCardClick }: Props) {
  return (
    <Card
      padding="none"
      interactive={!!onCardClick}
      className="overflow-hidden"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button,a")) return;
        onCardClick?.();
      }}
    >
      <div className="px-4 pt-4 pb-3 flex flex-col gap-3">
        <PostAuthor
          nickname={post.author_nickname}
          ageGroup={post.author_age_group}
          concerns={post.author_concerns}
          createdAt={post.created_at}
          onFollow={onFollow}
        />
        {post.content && <p className="text-body text-ink whitespace-pre-line">{post.content}</p>}
        <PostTags tags={post.tags} />
      </div>

      <PostActions>
        <PostAction icon="heart" label="좋아요" count={post.like_count} active={!!post.is_liked} onClick={onLike} />
        <PostAction icon="message" label="댓글" count={post.comment_count} onClick={onComment} />
      </PostActions>
    </Card>
  );
}
