"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ShareButton from "@/components/ShareButton";
import { Avatar, Button, Icon, Input, SectionHeader, buttonClass, useToast } from "@/components/ui";
import { AGE_GROUP_LABELS } from "@/components/ui/FeedPost";
import { getClientActorId } from "@/lib/actor-client";

type Comment = {
  id: string;
  user_id: string;
  content: string;
  author_display_name: string;
  author_age_group: string | null;
  author_concerns: string[];
  created_at: string;
};

function getUserId(): string {
  // 서버가 발급한 쿠키의 id — API 는 이 값을 받지 않고 쿠키로 직접 확인한다
  return getClientActorId() || "";
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
  const toast = useToast();

  /* ── 좋아요 ── */
  const handleLike = async () => {
    const userId = getUserId();
    const wasLiked = isLiked;
    setIsLiked(!wasLiked);
    setLikeCount(prev => wasLiked ? Math.max(prev - 1, 0) : prev + 1);
    try {
      const res = await fetch("/api/community/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, plan_id: planId }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setIsLiked(wasLiked);
      setLikeCount(prev => wasLiked ? prev + 1 : Math.max(prev - 1, 0));
      toast.show("좋아요를 반영하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
  };

  /* ── 식단 복사 ── */
  const handleCopy = async () => {
    try {
      localStorage.setItem("carefood_weekly_box", JSON.stringify({ days: planDays, source: authorName }));
    } catch { /* */ } // ds-allow: 로컬 저장
    try {
      const res = await fetch("/api/community/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      toast.show("식단 리스트에 담지 못했어요. 다시 시도해 주세요", { tone: "danger" });
      return;
    }
    setCopyCount(prev => prev + 1);
    setCopied(true);
    toast.show("식단 리스트에 담았어요. 아래 식단 탭에서 볼 수 있어요");
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
      if (!res.ok || !data.comment) throw new Error(String(res.status));
      setComments(prev => [...prev, data.comment]);
      setNewComment("");
    } catch {
      toast.show("댓글을 남기지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
    finally { setSubmitting(false); }
  };

  return (
    <>
      {/* ── 동작 줄 ── */}
      <div className="flex gap-2 mb-3">
        <Button variant={isLiked ? "primary" : "secondary"} block icon="heart" onClick={handleLike} aria-pressed={isLiked}>
          좋아요 <span className="num">{likeCount}</span>
        </Button>
        {copied ? (
          <Button block iconRight="arrow-right" onClick={() => router.push("/weekly-box")}>식단 리스트에서 보기</Button>
        ) : (
          <Button variant="secondary" block icon="copy" onClick={handleCopy}>
            식단 리스트에 담기{copyCount > 0 && <span className="num text-ink-2">{copyCount}</span>}
          </Button>
        )}
      </div>

      {/* ── 공유 ── */}
      <ShareButton
        title={`${authorName}의 식단`}
        text="오늘끼록에서 건강식단을 확인해보세요!"
        className={buttonClass({ variant: "ghost", block: true, className: "mb-4" })}
      >
        <Icon name="share" size={18} /> 이 식단 공유하기
      </ShareButton>

      {/* ── 댓글 ── */}
      <section className="rounded-lg border border-line bg-surface">
        <SectionHeader
          className="px-4 pt-4 mb-1"
          title={<>댓글 {comments.length > 0 && <span className="num text-ink-2">{comments.length}</span>}</>}
        />

        {comments.length > 0 ? (
          <ul className="divide-y divide-line">
            {comments.map(c => (
              <li key={c.id} className="flex gap-3 px-4 py-3">
                <Avatar name={c.author_display_name} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-label font-bold text-ink">{c.author_display_name}</span>
                    {c.author_age_group && <span className="text-caption text-ink-2">{AGE_GROUP_LABELS[c.author_age_group] || c.author_age_group}</span>}
                    <span className="text-caption text-ink-3">{new Date(c.created_at).toLocaleDateString("ko-KR")}</span>
                  </div>
                  <p className="text-body text-ink mt-0.5">{c.content}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-4 py-8 text-center">
            <p className="text-label text-ink-2">아직 댓글이 없어요. 첫 댓글을 남겨 보세요</p>
          </div>
        )}

        {/* 댓글 입력 */}
        <form className="flex gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); handleSubmitComment(); }}>
          <Input
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder="댓글을 입력하세요"
            aria-label="댓글"
            disabled={submitting}
          />
          <Button type="submit" disabled={!newComment.trim()} loading={submitting} className="shrink-0">남기기</Button>
        </form>
      </section>
    </>
  );
}
