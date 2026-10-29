"use client";

import { useState } from "react";

type Props = {
  productId: string;
  productName: string;
  userId: string;
  onSubmitted?: () => void;
};

const TASTE_AXES = [
  { key: "spicy", label: "매운맛", emoji: "🌶️", low: "순한", high: "매운" },
  { key: "sweet", label: "단맛", emoji: "🍯", low: "안 단", high: "달달한" },
  { key: "salty", label: "짠맛", emoji: "🧂", low: "싱거운", high: "짭짤한" },
  { key: "umami", label: "감칠맛", emoji: "🍖", low: "담백한", high: "깊은" },
  { key: "sour", label: "신맛", emoji: "🍋", low: "안 신", high: "새콤한" },
];

export default function TasteReviewForm({ productId, productName, userId, onSubmitted }: Props) {
  const [scores, setScores] = useState<Record<string, number>>({
    spicy: 3, sweet: 3, salty: 3, umami: 3, sour: 3,
  });
  const [overall, setOverall] = useState(4);
  const [wouldRebuy, setWouldRebuy] = useState(true);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await fetch("/api/taste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review",
          user_id: userId,
          product_id: productId,
          ...scores,
          overall_rating: overall,
          comment,
          would_rebuy: wouldRebuy,
        }),
      });
      setDone(true);
      onSubmitted?.();
    } catch { /* */ }
    finally { setSubmitting(false); }
  };

  if (done) {
    return (
      <div className="border border-primary/30 rounded-xl p-4 text-center">
        <p className="text-sm font-bold text-primary">맛 리뷰 완료!</p>
        <p className="text-xs text-muted mt-1">입맛 매칭에 반영됩니다</p>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-xl p-4">
      <h3 className="text-sm font-bold mb-3">🍽️ 맛 프로필 평가</h3>
      <p className="text-[10px] text-muted mb-3">{productName}</p>

      <div className="space-y-3 mb-4">
        {TASTE_AXES.map((axis) => (
          <div key={axis.key}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium">
                {axis.emoji} {axis.label}
              </span>
              <span className="text-[10px] text-muted">
                {scores[axis.key] <= 2 ? axis.low : scores[axis.key] >= 4 ? axis.high : "보통"}
              </span>
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  onClick={() => setScores((p) => ({ ...p, [axis.key]: v }))}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    minHeight: "28px",
                    minWidth: "unset",
                    background: scores[axis.key] === v ? "var(--color-primary)" : "var(--color-surface)",
                    color: scores[axis.key] === v ? "white" : "var(--color-foreground)",
                    opacity: scores[axis.key] === v ? 1 : 0.6,
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 전체 만족도 */}
      <div className="mb-3">
        <p className="text-xs font-medium mb-1">⭐ 전체 만족도</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              onClick={() => setOverall(v)}
              className="text-lg transition-opacity"
              style={{ minHeight: "28px", minWidth: "unset", opacity: v <= overall ? 1 : 0.2 }}
            >
              ⭐
            </button>
          ))}
        </div>
      </div>

      {/* 재구매 */}
      <div className="flex items-center gap-3 mb-3">
        <p className="text-xs font-medium">재구매 의향</p>
        <div className="flex gap-1">
          <button
            onClick={() => setWouldRebuy(true)}
            className="text-xs px-3 py-1 rounded-full transition-colors"
            style={{
              minHeight: "24px", minWidth: "unset",
              background: wouldRebuy ? "var(--color-primary)" : "var(--color-surface)",
              color: wouldRebuy ? "white" : "var(--color-foreground)",
            }}
          >
            있어요
          </button>
          <button
            onClick={() => setWouldRebuy(false)}
            className="text-xs px-3 py-1 rounded-full transition-colors"
            style={{
              minHeight: "24px", minWidth: "unset",
              background: !wouldRebuy ? "var(--color-foreground)" : "var(--color-surface)",
              color: !wouldRebuy ? "var(--color-card)" : "var(--color-foreground)",
            }}
          >
            없어요
          </button>
        </div>
      </div>

      {/* 코멘트 */}
      <textarea
        placeholder="맛에 대한 한 줄 평 (선택)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs outline-none focus:border-primary resize-none mb-3"
        rows={2}
      />

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full bg-primary text-white py-2.5 rounded-xl text-xs font-bold disabled:opacity-50"
        style={{ minHeight: "36px" }}
      >
        {submitting ? "제출 중..." : "맛 리뷰 등록"}
      </button>
    </div>
  );
}
