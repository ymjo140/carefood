"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Comment = {
  id: string;
  user_id: string;
  content: string;
  author_display_name: string;
  author_age_group: string | null;
  author_concerns: string[];
  created_at: string;
};

const AGE_LABELS: Record<string, string> = {
  "20s": "20대", "30s": "30대", "40s": "40대", "50s": "50대", "60plus": "60대+",
};

function getUserId(): string {
  try {
    let id = localStorage.getItem("carefood_anon_id");
    if (!id) {
      id = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem("carefood_anon_id", id);
    }
    return id;
  } catch {
    return `anon_${Date.now()}`;
  }
}

export default function MealPlanActions({
  planId,
  initialLikeCount,
  initialCopyCount,
  initialComments,
  planDays,
  authorName,
}: {
  planId: string;
  initialLikeCount: number;
  initialCopyCount: number;
  initialComments: Comment[];
  planDays: unknown;
  authorName: string;
}) {
  const router = useRouter();
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [isLiked, setIsLiked] = useState(false);
  const [copyCount, setCopyCount] = useState(initialCopyCount);
  const [copied, setCopied] = useState(false);
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /* ── 좋아요 ── */
  const handleLike = async () => {
    const userId = getUserId();
    setIsLiked(prev => !prev);
    setLikeCount(prev => isLiked ? Math.max(prev - 1, 0) : prev + 1);
    try {
      await fetch("/api/community/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, plan_id: planId }),
      });
    } catch { /* */ }
  };

  /* ── 식단 복사 ── */
  const handleCopy = async () => {
    try {
      localStorage.setItem("carefood_weekly_box", JSON.stringify({ days: planDays, source: authorName }));
    } catch { /* */ }
    try {
      await fetch("/api/community/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId }),
      });
    } catch { /* */ }
    setCopyCount(prev => prev + 1);
    setCopied(true);
  };

  /* ── 댓글 작성 ── */
  const handleSubmitComment = async () => {
    if (!newComment.trim() || submitting) return;
    const userId = getUserId();
    setSubmitting(true);
    try {
      const res = await fetch("/api/community/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          plan_id: planId,
          content: newComment.trim(),
          display_name: "익명 사용자",
        }),
      });
      const data = await res.json();
      if (data.comment) {
        setComments(prev => [...prev, data.comment]);
        setNewComment("");
      }
    } catch { /* */ }
    finally { setSubmitting(false); }
  };

  return (
    <>
      {/* ── 액션 바 ── */}
      <div className="flex gap-3 mb-4">
        <button onClick={handleLike}
          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-colors border ${
            isLiked
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-surface text-foreground hover:border-primary/50"
          }`}
          style={{ minHeight: "44px" }}>
          {isLiked ? "♥" : "♡"} 좋아요 {likeCount}
        </button>
        {copied ? (
          <button onClick={() => router.push("/weekly-box")}
            className="flex-1 py-3 rounded-xl text-sm font-bold bg-primary text-white"
            style={{ minHeight: "44px" }}>
            📦 주간 박스에서 보기 →
          </button>
        ) : (
          <button onClick={handleCopy}
            className="flex-1 py-3 rounded-xl text-sm font-bold border border-border bg-surface text-foreground hover:border-primary/50 transition-colors"
            style={{ minHeight: "44px" }}>
            📋 내 식단에 담기
          </button>
        )}
      </div>

      {/* ── 댓글 섹션 ── */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="bg-surface/50 px-4 py-2.5 border-b border-border">
          <h2 className="text-sm font-bold">💬 댓글 {comments.length > 0 && `(${comments.length})`}</h2>
        </div>

        {/* 댓글 목록 */}
        {comments.length > 0 ? (
          <div className="divide-y divide-border/30">
            {comments.map(c => (
              <div key={c.id} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold">{c.author_display_name}</span>
                  {c.author_age_group && (
                    <span className="text-[10px] text-muted">{AGE_LABELS[c.author_age_group]}</span>
                  )}
                  <span className="text-[10px] text-muted">
                    {new Date(c.created_at).toLocaleDateString("ko-KR")}
                  </span>
                </div>
                <p className="text-sm leading-relaxed">{c.content}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-muted">
            <p className="text-sm">아직 댓글이 없습니다</p>
            <p className="text-xs mt-1">첫 댓글을 남겨보세요!</p>
          </div>
        )}

        {/* 댓글 입력 */}
        <div className="border-t border-border p-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmitComment(); } }}
              placeholder="댓글을 입력하세요..."
              className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
              style={{ minHeight: "36px" }}
              disabled={submitting}
            />
            <button onClick={handleSubmitComment} disabled={!newComment.trim() || submitting}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold disabled:opacity-40 transition-opacity shrink-0"
              style={{ minHeight: "36px", minWidth: "unset" }}>
              {submitting ? "..." : "전송"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
