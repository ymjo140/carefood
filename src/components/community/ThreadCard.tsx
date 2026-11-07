"use client";

import { MealAttach, PlanAttach, PostAction, PostActions, ProductTagLinks, ThreadItem } from "@/components/ui";
import { isTopic } from "@/lib/community-topics";

type Food = { name: string; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number };
export type FeedPostData = {
  id: string;
  user_id: string;
  post_type: string;
  author_nickname: string;
  content?: string | null;
  meal_type?: string | null;
  meal_data?: {
    foods?: Food[];
    total?: { calories: number; protein_g: number; carbs_g: number; fat_g: number } | null;
    plan?: { title?: string; day_kcal?: (number | null)[]; avg_kcal?: number; avg_protein?: number } | null;
  } | null;
  tags?: string[] | null;
  products?: { id: string; name: string }[];
  like_count: number;
  comment_count: number;
  copy_count: number;
  is_liked?: boolean;
  is_mine?: boolean;
  created_at: string;
  preview_comments?: { author_nickname: string; content: string }[];
};

/**
 * 피드·상세에서 같은 모양으로 그리는 글 하나 (쓰레드형).
 * detail 이면 글로 이동하지 않고, 답글 미리보기 대신 아래 답글 목록을 쓴다.
 */
export default function ThreadCard({ post, onLike, onCopy, onReply, detail = false }: {
  post: FeedPostData;
  onLike: () => void;
  onCopy?: () => void;
  onReply?: () => void;
  detail?: boolean;
}) {
  const href = detail ? undefined : `/community/${post.id}`;
  const topic = post.tags?.find(isTopic) ?? null;
  const md = post.meal_data;
  const latest = post.preview_comments?.[0];
  const canCopy = !!(md?.plan || (md?.foods && md.foods.length > 0));

  return (
    <ThreadItem
      nickname={post.author_nickname}
      topic={topic}
      createdAt={post.created_at}
      href={href}
      reply={!detail && latest ? { nickname: latest.author_nickname, content: latest.content, more: Math.max(0, post.comment_count - 1) } : null}
      actions={
        <PostActions variant="thread">
          <PostAction icon="heart" label="좋아요" count={post.like_count} active={!!post.is_liked} onClick={onLike} />
          <PostAction icon="message" label="답글" count={post.comment_count} onClick={onReply} />
          {canCopy && onCopy && <PostAction icon="copy" label="따라하기" count={post.copy_count} onClick={onCopy} />}
        </PostActions>
      }
    >
      {post.content && <p className={detail ? "text-body text-ink whitespace-pre-line" : "text-body text-ink whitespace-pre-line line-clamp-6"}>{post.content}</p>}
      {md?.plan ? (
        <PlanAttach title={md.plan.title || "저장한 식단"} dayKcal={md.plan.day_kcal || []} avgKcal={md.plan.avg_kcal} avgProtein={md.plan.avg_protein} />
      ) : md?.foods && md.foods.length > 0 ? (
        <MealAttach mealType={post.meal_type} foods={md.foods} total={md.total} />
      ) : null}
      <ProductTagLinks products={post.products} />
    </ThreadItem>
  );
}
