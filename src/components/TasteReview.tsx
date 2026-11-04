"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button, Card, Notice, ProgressBar, SectionHeader, Steps, Textarea, TextLink, useToast } from "@/components/ui";
import { RatingInput, RatingStars } from "@/components/ui/Rating";
import { ChoiceList, type ChoiceTone } from "@/components/ui/ChoiceList";

type ReviewStats = {
  count: number;
  avgStarRating: number;
  avgConsumptionPct: number;
  avgEaseRating: number;
};

type Review = {
  id: string;
  star_rating: number;
  consumption_pct: number;
  ease_rating: number | null;
  comment: string | null;
  is_proxy_review: boolean;
  persona: string | null;
  created_at: string;
};

const PERSONA_LABELS: Record<string, string> = {
  elderly: "어르신",
  patient: "환자",
  pregnant: "산모",
  general: "일반",
};

const CONSUMPTION_OPTIONS: { value: number; label: string; tone: ChoiceTone }[] = [
  { value: 100, label: "다 먹었어요", tone: "positive" },
  { value: 75, label: "조금 남겼어요", tone: "positive" },
  { value: 50, label: "반 정도 먹었어요", tone: "caution" },
  { value: 25, label: "조금만 먹었어요", tone: "caution" },
  { value: 0, label: "거의 못 먹었어요", tone: "caution" },
];

const EASE_OPTIONS: { value: number; label: string }[] = [
  { value: 5, label: "아주 편했어요" },
  { value: 4, label: "편했어요" },
  { value: 3, label: "보통이에요" },
  { value: 2, label: "불편했어요" },
  { value: 1, label: "매우 불편했어요" },
];

/* ── 리뷰 통계 카드 ── */
function ReviewStatsCard({ stats }: { stats: ReviewStats }) {
  if (stats.count === 0) return null;

  return (
    <Card>
      <div className="flex items-center gap-x-6 gap-y-3 flex-wrap">
        <div className="flex flex-col items-start gap-1">
          <span className="num text-title font-bold text-ink leading-none">{stats.avgStarRating}</span>
          <RatingStars value={stats.avgStarRating} />
          <span className="text-caption text-ink-2"><span className="num">{stats.count}</span>명 평가</span>
        </div>

        <div className="flex-1 min-w-48 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-caption">
            <span className="text-ink-2 w-14 shrink-0">섭취율</span>
            <ProgressBar value={stats.avgConsumptionPct} tone="positive" label="평균 섭취율" className="flex-1" />
            <span className="num font-bold text-ink w-10 text-right">{stats.avgConsumptionPct}%</span>
          </div>
          {stats.avgEaseRating > 0 && (
            <div className="flex items-center gap-2 text-caption">
              <span className="text-ink-2 w-14 shrink-0">편의성</span>
              <ProgressBar value={stats.avgEaseRating} max={5} tone="brand" label="평균 편의성" className="flex-1" />
              <span className="num font-bold text-ink w-10 text-right">{stats.avgEaseRating}/5</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ── 리뷰 아이템 ── */
function ReviewItem({ review }: { review: Review }) {
  return (
    <div className="py-3 border-b border-line last:border-0">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <RatingStars value={review.star_rating} size={14} />
        {review.persona && <Badge tone="brand">{PERSONA_LABELS[review.persona] || review.persona}</Badge>}
        {review.is_proxy_review && <Badge tone="caution">보호자 작성</Badge>}
      </div>
      <div className="flex items-center gap-3 text-caption text-ink-2 mb-1">
        <span>섭취율 <span className="num">{review.consumption_pct}</span>%</span>
        {review.ease_rating && <span>편의성 <span className="num">{review.ease_rating}</span>/5</span>}
      </div>
      {review.comment && <p className="text-body text-ink mt-1">{review.comment}</p>}
    </div>
  );
}

/* ── 메인 맛평가 컴포넌트 ── */
export default function TasteReview({ productId }: { productId: string }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // 폼 스텝 (토스식: 한 화면 한 과업)
  const [formStep, setFormStep] = useState(0);
  const [consumptionPct, setConsumptionPct] = useState(100);
  const [easeRating, setEaseRating] = useState<number | null>(null);
  const [starRating, setStarRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isProxy, setIsProxy] = useState(false);
  const toast = useToast();

  // 데이터 로드
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsLoggedIn(!!user);
    });

    fetch(`/api/reviews?productId=${productId}`)
      .then((r) => r.json())
      .then((data) => {
        setStats(data.stats);
        setReviews(data.reviews || []);
        if (data.myReview) {
          setMyReview(data.myReview);
          // 기존 리뷰로 폼 초기화
          setConsumptionPct(data.myReview.consumption_pct);
          setEaseRating(data.myReview.ease_rating);
          setStarRating(data.myReview.star_rating);
          setComment(data.myReview.comment || "");
          setIsProxy(data.myReview.is_proxy_review);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [productId]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          consumptionPct,
          easeRating,
          starRating,
          comment: comment.trim() || null,
          isProxyReview: isProxy,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
        setShowForm(false);
        // 리프레시
        const refreshRes = await fetch(`/api/reviews?productId=${productId}`);
        const data = await refreshRes.json();
        setStats(data.stats);
        setReviews(data.reviews || []);
        setMyReview(data.myReview);
      }
    } catch (err) {
      console.error("Review submit error:", err);
      toast.show("맛평가를 저장하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  const formSteps = ["consumption", "ease", "rating", "comment"];
  const currentFormStep = formSteps[formStep];

  return (
    <section className="mb-8">
      <SectionHeader
        title="맛평가"
        action={isLoggedIn && !showForm ? (
          <Button size="sm" variant="secondary" icon="edit" onClick={() => { setShowForm(true); setFormStep(0); setSubmitted(false); }}>
            {myReview ? "리뷰 고치기" : "평가하기"}
          </Button>
        ) : undefined}
      />

      {submitted && (
        <Notice tone="brand" className="mb-3">맛평가를 저장했어요. 소중한 의견 고마워요</Notice>
      )}

      {stats && <ReviewStatsCard stats={stats} />}

      {/* 리뷰 작성 폼 (한 화면 한 질문) */}
      {showForm && (
        <Card className="mt-3">
          <Steps total={formSteps.length} current={formStep} className="mb-5" />

          {currentFormStep === "consumption" && (
            <div>
              <h3 className="text-title font-bold text-ink">다 드셨나요?</h3>
              <p className="text-label text-ink-2 mb-4">실제로 얼마나 드셨는지 알려주세요</p>
              <ChoiceList label="섭취량" options={CONSUMPTION_OPTIONS} value={consumptionPct} onChange={setConsumptionPct} />
            </div>
          )}

          {currentFormStep === "ease" && (
            <div>
              <h3 className="text-title font-bold text-ink">드시기 편했나요?</h3>
              <p className="text-label text-ink-2 mb-4">조리·섭취 편의성을 평가해 주세요</p>
              <ChoiceList label="편의성" options={EASE_OPTIONS} value={easeRating} onChange={setEaseRating} />
            </div>
          )}

          {currentFormStep === "rating" && (
            <div>
              <h3 className="text-title font-bold text-ink">전체적으로 어떠셨나요?</h3>
              <p className="text-label text-ink-2 mb-4">맛과 만족도를 별점으로 알려주세요</p>
              <div className="flex justify-center py-4">
                <RatingInput value={starRating} onChange={setStarRating} />
              </div>
            </div>
          )}

          {currentFormStep === "comment" && (
            <div>
              <h3 className="text-title font-bold text-ink">한마디 남겨 주세요</h3>
              <p className="text-label text-ink-2 mb-4">다른 분들에게 도움이 돼요 (선택)</p>
              <Textarea
                aria-label="소감"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="맛, 식감, 양 등에 대한 소감"
              />
              <label className="flex items-center gap-2 mt-3 min-h-11 cursor-pointer">
                <input type="checkbox" className="ds-check" checked={isProxy} onChange={(e) => setIsProxy(e.target.checked)} />
                <span className="text-label text-ink-2">보호자가 대신 작성합니다 (어르신/환자 반응 기록)</span>
              </label>
            </div>
          )}

          <div className="flex gap-2 mt-5">
            {formStep > 0 && (
              <Button variant="secondary" block onClick={() => setFormStep((s) => s - 1)}>이전</Button>
            )}
            {formStep < formSteps.length - 1 ? (
              <Button block onClick={() => setFormStep((s) => s + 1)} disabled={formStep === 2 && starRating === 0}>다음</Button>
            ) : (
              <Button block onClick={handleSubmit} disabled={starRating === 0} loading={submitting}>
                {submitting ? "저장하는 중" : "평가 저장하기"}
              </Button>
            )}
          </div>

          <Button variant="ghost" block className="mt-2" onClick={() => setShowForm(false)}>취소</Button>
        </Card>
      )}

      {!isLoggedIn && (
        <p className="text-label text-ink-2 mt-3">
          <TextLink href="/login">로그인</TextLink>하시면 맛평가를 남길 수 있어요.
        </p>
      )}

      {reviews.length > 0 && (
        <div className="mt-4">
          <p className="text-label font-bold text-ink-2 mb-2">평가 <span className="num">{reviews.length}</span>개</p>
          <Card padding="none" className="px-4">
            {reviews.map((r) => (
              <ReviewItem key={r.id} review={r} />
            ))}
          </Card>
        </div>
      )}
    </section>
  );
}
