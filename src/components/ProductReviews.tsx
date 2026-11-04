"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge, Button, Card, Chip, EmptyState, Field, SectionHeader, Spinner, Textarea, useToast } from "@/components/ui";
import { RatingInput, RatingStars, ScaleInput } from "@/components/ui/Rating";

type Review = {
  id: string;
  rating: number;
  would_rebuy: boolean | null;
  taste_salty_feel: number | null;
  taste_sweet_feel: number | null;
  taste_spicy_feel: number | null;
  comment: string | null;
  reviewer_age_group: string | null;
  reviewer_gender: string | null;
  reviewer_concerns: string[];
  created_at: string;
};

type ReviewStats = {
  count: number;
  avgRating: number;
  rebuyRate: number;
  avgTaste: { salty: number | null; sweet: number | null; spicy: number | null };
};

const CONCERN_LABELS: Record<string, string> = {
  gut_health: "장건강", skin: "피부건강", weight: "체중관리", energy: "활력충전",
};

const AGE_LABELS: Record<string, string> = {
  "20s": "20대", "30s": "30대", "40s": "40대", "50s": "50대", "60plus": "60대+",
};

const GENDER_LABELS: Record<string, string> = {
  male: "남성", female: "여성",
};

export default function ProductReviews({ productId }: { productId: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    rating: 0, would_rebuy: null as boolean | null,
    taste_salty_feel: 0, taste_sweet_feel: 0, taste_spicy_feel: 0, taste_fatty_feel: 0,
    consumed_as: "" as string,
    comment: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const fetchReviews = useCallback(async () => {
    try {
      const res = await fetch(`/api/reviews?product_id=${productId}`);
      const data = await res.json();
      setReviews(data.reviews || []);
      setStats(data.stats || null);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [productId]);

  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  const handleSubmit = async () => {
    if (formData.rating === 0) return;
    setSubmitting(true);

    let userId: string | null = null;
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id || null;
    } catch { /* */ }
    if (!userId) {
      try { userId = localStorage.getItem("carefood_anon_id"); } catch { /* */ }
    }
    if (!userId) { setSubmitting(false); return; }

    try {
      await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId, product_id: productId,
          ...formData,
          taste_salty_feel: formData.taste_salty_feel || null,
          taste_sweet_feel: formData.taste_sweet_feel || null,
          taste_spicy_feel: formData.taste_spicy_feel || null,
          taste_fatty_feel: formData.taste_fatty_feel || null,
          consumed_as: formData.consumed_as || null,
        }),
      });
      setShowForm(false);
      setFormData({ rating: 0, would_rebuy: null, taste_salty_feel: 0, taste_sweet_feel: 0, taste_spicy_feel: 0, taste_fatty_feel: 0, consumed_as: "", comment: "" });
      fetchReviews();
      toast.show("리뷰를 남겼어요");
    } catch {
      toast.show("리뷰를 남기지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    }
    finally { setSubmitting(false); }
  };

  return (
    <section className="mb-8">
      <SectionHeader
        title="리뷰"
        action={
          <Button size="sm" variant={showForm ? "ghost" : "secondary"} icon={showForm ? "close" : "edit"} onClick={() => setShowForm(!showForm)}>
            {showForm ? "닫기" : "리뷰 쓰기"}
          </Button>
        }
      />

      {/* 통계 */}
      {stats && stats.count > 0 && (
        <Card className="mb-3">
          <div className="flex items-center gap-x-6 gap-y-3 flex-wrap">
            <div className="flex flex-col gap-1">
              <span className="num text-title font-bold text-ink leading-none">
                {stats.avgRating}<span className="text-label font-medium text-ink-2 ml-0.5">/ 5</span>
              </span>
              <RatingStars value={stats.avgRating} />
            </div>
            <div className="flex flex-col gap-0.5 text-caption text-ink-2">
              <span>리뷰 <span className="num font-bold text-ink">{stats.count}</span>개</span>
              <span>재구매 의향 <span className="num font-bold text-ink">{stats.rebuyRate}</span>%</span>
            </div>
            {(stats.avgTaste.salty || stats.avgTaste.sweet || stats.avgTaste.spicy) && (
              <div className="flex flex-col gap-0.5 text-caption text-ink-2 sm:ml-auto">
                {stats.avgTaste.salty && <span>짠맛 체감 <span className="num text-ink">{stats.avgTaste.salty}</span>/5</span>}
                {stats.avgTaste.sweet && <span>단맛 체감 <span className="num text-ink">{stats.avgTaste.sweet}</span>/5</span>}
                {stats.avgTaste.spicy && <span>매운맛 체감 <span className="num text-ink">{stats.avgTaste.spicy}</span>/5</span>}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* 리뷰 작성 폼 */}
      {showForm && (
        <Card tone="default" className="mb-3 border-brand">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-label font-medium text-ink">별점</span>
              <RatingInput value={formData.rating} onChange={(n) => setFormData(f => ({ ...f, rating: n }))} />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-label font-medium text-ink">다시 구매할 의향이 있나요?</span>
              <div className="flex gap-2">
                {[{ val: true, label: "네" }, { val: false, label: "아니요" }].map(opt => (
                  <Chip key={String(opt.val)} selected={formData.would_rebuy === opt.val}
                    onClick={() => setFormData(f => ({ ...f, would_rebuy: opt.val }))}>
                    {opt.label}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: "taste_salty_feel" as const, label: "짠맛" },
                { key: "taste_sweet_feel" as const, label: "단맛" },
                { key: "taste_spicy_feel" as const, label: "매운맛" },
                { key: "taste_fatty_feel" as const, label: "고소함" },
              ].map(t => (
                <div key={t.key} className="flex flex-col gap-1.5">
                  <span className="text-caption text-ink-2">{t.label} 체감</span>
                  <ScaleInput label={`${t.label} 체감`} value={formData[t.key]} onChange={(n) => setFormData(f => ({ ...f, [t.key]: n }))} />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-label font-medium text-ink">어떤 상황에서 드셨나요?</span>
              <div className="flex gap-2 flex-wrap">
                {[
                  { val: "meal", label: "식사 대용" },
                  { val: "snack", label: "간식" },
                  { val: "post_workout", label: "운동 후" },
                  { val: "late_night", label: "야식" },
                ].map(opt => (
                  <Chip key={opt.val} size="sm" selected={formData.consumed_as === opt.val}
                    onClick={() => setFormData(f => ({ ...f, consumed_as: f.consumed_as === opt.val ? "" : opt.val }))}>
                    {opt.label}
                  </Chip>
                ))}
              </div>
            </div>

            <Field label="한마디 (선택)">
              <Textarea
                value={formData.comment}
                onChange={e => setFormData(f => ({ ...f, comment: e.target.value }))}
                placeholder="이 제품에 대한 의견을 남겨주세요"
              />
            </Field>

            <Button block onClick={handleSubmit} disabled={formData.rating === 0} loading={submitting}>
              {submitting ? "남기는 중" : "리뷰 남기기"}
            </Button>
          </div>
        </Card>
      )}

      {/* 리뷰 목록 */}
      {loading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : reviews.length > 0 ? (
        <div className="flex flex-col gap-2">
          {reviews.map(r => (
            <Card key={r.id} padding="sm">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <RatingStars value={r.rating} size={14} />
                  {r.would_rebuy !== null && (
                    <Badge tone={r.would_rebuy ? "positive" : "neutral"}>{r.would_rebuy ? "재구매 의향" : "재구매 안 함"}</Badge>
                  )}
                </div>
                <span className="text-caption text-ink-3 num">
                  {new Date(r.created_at).toLocaleDateString("ko-KR")}
                </span>
              </div>

              {(r.reviewer_age_group || (r.reviewer_gender && r.reviewer_gender !== "other") || r.reviewer_concerns?.length > 0) && (
                <div className="flex gap-1 flex-wrap mb-1.5">
                  {r.reviewer_age_group && <Badge>{AGE_LABELS[r.reviewer_age_group] || r.reviewer_age_group}</Badge>}
                  {r.reviewer_gender && r.reviewer_gender !== "other" && <Badge>{GENDER_LABELS[r.reviewer_gender] || r.reviewer_gender}</Badge>}
                  {r.reviewer_concerns?.slice(0, 2).map(c => (
                    <Badge key={c} tone="brand">{CONCERN_LABELS[c] || c}</Badge>
                  ))}
                </div>
              )}

              {r.comment && <p className="text-body text-ink">{r.comment}</p>}

              {(r.taste_salty_feel || r.taste_sweet_feel || r.taste_spicy_feel) && (
                <div className="flex gap-3 mt-1.5 text-caption text-ink-2">
                  {r.taste_salty_feel && <span>짠맛 <span className="num">{r.taste_salty_feel}</span>/5</span>}
                  {r.taste_sweet_feel && <span>단맛 <span className="num">{r.taste_sweet_feel}</span>/5</span>}
                  {r.taste_spicy_feel && <span>매운맛 <span className="num">{r.taste_spicy_feel}</span>/5</span>}
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="아직 리뷰가 없어요" description="이 제품을 드셔 봤다면 첫 리뷰를 남겨 주세요" />
      )}
    </section>
  );
}
