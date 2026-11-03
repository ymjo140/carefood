"use client";

const MEAL_EMOJI: Record<string, string> = {
  breakfast: "🌅", lunch: "☀️", dinner: "🌙", snack: "🍪",
};
const MEAL_LABEL: Record<string, string> = {
  breakfast: "아침", lunch: "점심", dinner: "저녁", snack: "간식",
};
const CONCERN_LABELS: Record<string, string> = {
  gut_health: "장건강", skin: "피부", weight: "다이어트", energy: "활력",
  muscle: "근력", blood_pressure: "혈압", diabetes: "혈당", kidney: "신장",
};

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
  };
  onLike: () => void;
  onCopy: () => void;
  onComment: () => void;
  onAuthorClick?: () => void;
};

export default function MealCard({ post, onLike, onCopy, onComment, onAuthorClick }: Props) {
  const meal = post.meal_data;
  const total = meal?.total;
  const emoji = post.meal_type ? MEAL_EMOJI[post.meal_type] || "🍽️" : "🍽️";
  const mealLabel = post.meal_type ? MEAL_LABEL[post.meal_type] || post.meal_type : "";

  const timeAgo = (() => {
    const diff = Date.now() - new Date(post.created_at).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    return `${days}일 전`;
  })();

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "#161C24" }}>
      {/* Author header */}
      <div className="px-4 pt-3 pb-2 flex items-start justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0"
            style={{ background: "#252C35", color: "#C4870A" }}>
            {post.author_nickname[0]}
          </div>
          <div className="min-w-0">
            <button onClick={onAuthorClick} className="text-[13px] font-bold hover:underline" style={{ color: "#ECEBE6" }}>
              {post.author_nickname}
            </button>
            <div className="flex items-center gap-1 flex-wrap mt-0.5">
              {post.author_age_group && (
                <span className="text-[9px] px-1.5 py-px rounded-full" style={{ background: "#252C35", color: "#8A919A" }}>
                  {post.author_age_group}
                </span>
              )}
              {post.author_concerns?.slice(0, 2).map(c => (
                <span key={c} className="text-[9px] px-1.5 py-px rounded-full" style={{ background: "rgba(196,135,10,0.1)", color: "#C4870A" }}>
                  {CONCERN_LABELS[c] || c}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {mealLabel && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "#252C35", color: "#ECEBE6" }}>
              {emoji} {mealLabel}
            </span>
          )}
          <span className="text-[10px]" style={{ color: "#8A919A" }}>{timeAgo}</span>
        </div>
      </div>

      {/* Content */}
      {post.content && (
        <p className="px-4 pb-2 text-[13px] leading-relaxed" style={{ color: "#ECEBE6" }}>
          {post.content}
        </p>
      )}

      {/* Meal foods */}
      {meal?.foods && meal.foods.length > 0 && (
        <div className="mx-4 mb-2 rounded-lg p-3" style={{ background: "#0C1117" }}>
          {meal.foods.map((food, i) => (
            <div key={i} className="flex justify-between items-center py-1">
              <span className="text-[12px]" style={{ color: "#ECEBE6" }}>{food.name}</span>
              <span className="text-[11px] font-medium" style={{ color: "#8A919A" }}>
                {food.calories}kcal
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Nutrition summary */}
      {total && (
        <div className="mx-4 mb-2 flex gap-2">
          <NutriBadge label="칼로리" value={`${total.calories}`} unit="kcal" color="#C4870A" />
          <NutriBadge label="단백질" value={`${total.protein_g}`} unit="g" color="#4A8FD4" />
          <NutriBadge label="탄수" value={`${total.carbs_g}`} unit="g" color="#D4960A" />
          <NutriBadge label="지방" value={`${total.fat_g}`} unit="g" color="#D46A3A" />
        </div>
      )}

      {/* Tags */}
      {post.tags && post.tags.length > 0 && (
        <div className="px-4 pb-2 flex gap-1 flex-wrap">
          {post.tags.map(tag => (
            <span key={tag} className="text-[10px] px-1.5 py-px rounded" style={{ background: "#252C35", color: "#8A919A" }}>
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center border-t px-4 py-2" style={{ borderColor: "#252C35" }}>
        <button onClick={onLike} className="flex items-center gap-1 text-[12px] mr-4 transition-colors"
          style={{ color: post.is_liked ? "#E06030" : "#8A919A", minHeight: "28px" }}>
          {post.is_liked ? "❤️" : "🤍"} {post.like_count || ""}
        </button>
        <button onClick={onComment} className="flex items-center gap-1 text-[12px] mr-4"
          style={{ color: "#8A919A", minHeight: "28px" }}>
          💬 {post.comment_count || ""}
        </button>
        {meal && (
          <button onClick={onCopy} className="flex items-center gap-1 text-[12px] mr-4 transition-colors hover:text-[#C4870A]"
            style={{ color: "#8A919A", minHeight: "28px" }}>
            📋 따라하기 {post.copy_count ? `(${post.copy_count})` : ""}
          </button>
        )}
      </div>
    </div>
  );
}

function NutriBadge({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <div className="flex-1 rounded-lg px-2 py-1.5 text-center" style={{ background: "#252C35" }}>
      <div className="text-[10px]" style={{ color: "#8A919A" }}>{label}</div>
      <div className="text-[13px] font-bold" style={{ color }}>
        {value}<span className="text-[10px] font-normal" style={{ color: "#8A919A" }}>{unit}</span>
      </div>
    </div>
  );
}
