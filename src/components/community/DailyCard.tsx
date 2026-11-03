"use client";

const CONCERN_LABELS: Record<string, string> = {
  gut_health: "장건강", skin: "피부", weight: "다이어트", energy: "활력",
  muscle: "근력", blood_pressure: "혈압", diabetes: "혈당", kidney: "신장",
};

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
  const timeAgo = (() => {
    const diff = Date.now() - new Date(post.created_at).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    return `${Math.floor(hours / 24)}일 전`;
  })();

  return (
    <div className="rounded-xl overflow-hidden cursor-pointer" style={{ background: "#161C24" }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        onCardClick?.();
      }}>
      <div className="p-4">
        {/* Author */}
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0"
            style={{ background: "#252C35", color: "#C4870A" }}>
            {post.author_nickname[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold" style={{ color: "#ECEBE6" }}>{post.author_nickname}</span>
              {onFollow && (
                <button onClick={onFollow}
                  className="text-[10px] px-2.5 py-0.5 rounded-full font-medium transition-colors"
                  style={{ background: "#C4870A", color: "#0C1117" }}>
                  팔로우
                </button>
              )}
              <span className="text-[10px]" style={{ color: "#8A919A" }}>{timeAgo}</span>
            </div>
            <div className="flex gap-1 mt-0.5">
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

        {/* Content */}
        <p className="text-[13px] leading-relaxed whitespace-pre-line" style={{ color: "#ECEBE6" }}>
          {post.content}
        </p>

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-2">
            {post.tags.map(tag => (
              <span key={tag} className="text-[10px] px-1.5 py-px rounded" style={{ background: "#252C35", color: "#8A919A" }}>
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center border-t px-4 py-2" style={{ borderColor: "#252C35" }}>
        <button onClick={onLike} className="flex items-center gap-1 text-[12px] mr-4 transition-colors"
          style={{ color: post.is_liked ? "#E06030" : "#8A919A", minHeight: "28px" }}>
          {post.is_liked ? "❤️" : "🤍"} {post.like_count || ""}
        </button>
        <button onClick={onComment} className="flex items-center gap-1 text-[12px]"
          style={{ color: "#8A919A", minHeight: "28px" }}>
          💬 {post.comment_count || ""}
        </button>
      </div>
    </div>
  );
}
