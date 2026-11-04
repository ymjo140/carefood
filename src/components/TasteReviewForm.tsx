"use client";

import { useState } from "react";
import { Button, Card, Chip, Textarea, useToast } from "@/components/ui";
import { RatingInput, ScaleInput } from "@/components/ui/Rating";

type Props = {
  productId: string;
  productName: string;
  userId: string;
  onSubmitted?: () => void;
};

const TASTE_AXES = [
  { key: "spicy", label: "매운맛", low: "순한", high: "매운" },
  { key: "sweet", label: "단맛", low: "안 단", high: "달달한" },
  { key: "salty", label: "짠맛", low: "싱거운", high: "짭짤한" },
  { key: "umami", label: "감칠맛", low: "담백한", high: "깊은" },
  { key: "sour", label: "신맛", low: "안 신", high: "새콤한" },
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
  const toast = useToast();

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
      toast.show("맛 리뷰를 남겼어요");
      onSubmitted?.();
    } catch {
      toast.show("맛 리뷰를 남기지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
    finally { setSubmitting(false); }
  };

  if (done) {
    return (
      <Card tone="brand" className="text-center">
        <p className="text-body font-bold text-brand-ink">맛 리뷰를 남겼어요</p>
        <p className="text-caption text-ink-2 mt-1">입맛 매칭에 반영돼요</p>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="text-body font-bold text-ink">맛 프로필 평가</h3>
      <p className="text-caption text-ink-2 mb-4">{productName}</p>

      <div className="flex flex-col gap-4 mb-5">
        {TASTE_AXES.map((axis) => (
          <div key={axis.key} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-label font-medium text-ink">{axis.label}</span>
              <span className="text-caption text-ink-2">
                {scores[axis.key] <= 2 ? axis.low : scores[axis.key] >= 4 ? axis.high : "보통"}
              </span>
            </div>
            <ScaleInput label={axis.label} value={scores[axis.key]} onChange={(v) => setScores((p) => ({ ...p, [axis.key]: v }))} />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1 mb-4">
        <span className="text-label font-medium text-ink">전체 만족도</span>
        <RatingInput label="전체 만족도" value={overall} onChange={setOverall} />
      </div>

      <div className="flex items-center gap-3 mb-4">
        <span className="text-label font-medium text-ink">재구매 의향</span>
        <div className="flex gap-2">
          <Chip size="sm" selected={wouldRebuy} onClick={() => setWouldRebuy(true)}>있어요</Chip>
          <Chip size="sm" selected={!wouldRebuy} onClick={() => setWouldRebuy(false)}>없어요</Chip>
        </div>
      </div>

      <Textarea
        aria-label="맛 한 줄 평"
        placeholder="맛에 대한 한 줄 평 (선택)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        className="mb-3"
      />

      <Button block onClick={handleSubmit} loading={submitting}>
        {submitting ? "남기는 중" : "맛 리뷰 남기기"}
      </Button>
    </Card>
  );
}
