"use client";

import { Card, Kcal, MacroInline, MealTag } from "@/components/ui";
import { PostAction, PostActions, PostAuthor, PostTags } from "@/components/ui/FeedPost";

type MealFood = { name: string; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number };
type MealData = { foods: MealFood[]; total: { calories: number; protein_g: number; carbs_g: number; fat_g: number } };

type Props = {
  post: {
    id: string;
    author_nickname: string;
    author_age_group?: string;
    author_concerns?: string[];
    meal_type?: string;
    meal_data?: MealData;
    content?: string;
    tags?: string[];
    like_count: number;
    comment_count: number;
    copy_count: number;
    is_liked?: boolean;
    created_at: string;
    user_id: string;
    product_ids?: string[];
  };
  onLike: () => void;
  onCopy: () => void;
  onComment: () => void;
  onAuthorClick?: () => void;
  onFollow?: () => void;
  onCardClick?: () => void;
};

export default function MealCard({ post, onLike, onCopy, onComment, onAuthorClick, onFollow, onCardClick }: Props) {
  const meal = post.meal_data;
  const total = meal?.total;

  return (
    <Card
      padding="none"
      interactive={!!onCardClick}
      className="overflow-hidden"
      onClick={(e) => {
        // 버튼·링크를 누른 경우에는 카드 이동 안 함
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
          onAuthorClick={onAuthorClick}
          onFollow={onFollow}
        />

        {post.content && <p className="text-body text-ink whitespace-pre-line">{post.content}</p>}

        {meal?.foods && meal.foods.length > 0 && (
          <div className="rounded-md bg-sunken px-3 py-2.5">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              {post.meal_type ? <MealTag meal={post.meal_type} /> : <span className="text-label font-bold text-ink">식단</span>}
              {total && <Kcal value={total.calories} className="text-label" />}
            </div>
            <ul className="flex flex-col">
              {meal.foods.map((food, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-1">
                  <span className="text-label text-ink min-w-0">{food.name}</span>
                  <Kcal value={food.calories} className="text-caption shrink-0" />
                </li>
              ))}
            </ul>
            {total && (
              <MacroInline
                values={{ protein: total.protein_g, carbs: total.carbs_g, fat: total.fat_g }}
                className="mt-2 pt-2 border-t border-line"
              />
            )}
          </div>
        )}

        <PostTags tags={post.tags} />
      </div>

      <PostActions>
        <PostAction icon="heart" label="좋아요" count={post.like_count} active={!!post.is_liked} onClick={onLike} />
        <PostAction icon="message" label="댓글" count={post.comment_count} onClick={onComment} />
        {meal && <PostAction icon="copy" label="따라하기" count={post.copy_count} onClick={onCopy} />}
      </PostActions>
    </Card>
  );
}
