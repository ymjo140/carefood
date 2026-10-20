"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

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

/* ── 별점 입력 ── */
function StarInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`text-2xl transition-transform hover:scale-110 ${
            n <= value ? "text-yellow-400" : "text-border"
          }`}
          aria-label={`${n}점`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

/* ── 별점 표시 (읽기전용) ── */
function Stars({ rating, size = "text-sm" }: { rating: number; size?: string }) {
  return (
    <span className={`${size} tracking-tight`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= Math.round(rating) ? "text-yellow-400" : "text-border"}>
          ★
        </span>
      ))}
    </span>
  );
}

/* ── 섭취 완료율 선택 ── */
function ConsumptionSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const options = [
    { pct: 100, label: "다 먹었어요", emoji: "😋" },
    { pct: 75, label: "조금 남겼어요", emoji: "🙂" },
    { pct: 50, label: "반 정도 먹었어요", emoji: "😐" },
    { pct: 25, label: "조금만 먹었어요", emoji: "😕" },
    { pct: 0, label: "거의 못 먹었어요", emoji: "😞" },
  ];

  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <button
          key={opt.pct}
          type="button"
          onClick={() => onChange(opt.pct)}
          className={`w-full text-left p-3 rounded-xl border-2 transition-all flex items-center gap-3 ${
            value === opt.pct
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/30"
          }`}
        >
          <span className="text-xl">{opt.emoji}</span>
          <span className="text-sm font-medium">{opt.label}</span>
          {value === opt.pct && (
            <span className="ml-auto text-primary text-xs font-bold">✓</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ── 편의성 선택 ── */
function EaseSelector({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  const options = [
    { val: 5, label: "아주 편했어요" },
    { val: 4, label: "편했어요" },
    { val: 3, label: "보통이에요" },
    { val: 2, label: "불편했어요" },
    { val: 1, label: "매우 불편했어요" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.val}
          type="button"
          onClick={() => onChange(opt.val)}
          className={`px-3 py-2 rounded-full border-2 text-sm transition-all ${
            value === opt.val
              ? "border-primary bg-primary/10 text-primary font-medium"
              : "border-border hover:border-primary/30"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ── 리뷰 통계 카드 ── */
function ReviewStatsCard({ stats }: { stats: ReviewStats }) {
  if (stats.count === 0) return null;

  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="text-center">
          <div className="text-2xl font-bold text-primary">
            {stats.avgStarRating}
          </div>
          <Stars rating={stats.avgStarRating} />
          <div className="text-[10px] text-muted mt-0.5">
            {stats.count}명 평가
          </div>
        </div>

        <div className="flex-1 space-y-2">
          {/* 섭취 완료율 바 */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted w-16 shrink-0">섭취율</span>
            <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${stats.avgConsumptionPct}%` }}
              />
            </div>
            <span className="font-bold w-10 text-right">
              {stats.avgConsumptionPct}%
            </span>
          </div>

          {/* 편의성 */}
          {stats.avgEaseRating > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted w-16 shrink-0">편의성</span>
              <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${(stats.avgEaseRating / 5) * 100}%` }}
                />
              </div>
              <span className="font-bold w-10 text-right">
                {stats.avgEaseRating}/5
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── 리뷰 아이템 ── */
function ReviewItem({ review }: { review: Review }) {
  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-2 mb-1">
        <Stars rating={review.star_rating} size="text-xs" />
        {review.persona && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
            {PERSONA_LABELS[review.persona] || review.persona}
          </span>
        )}
        {review.is_proxy_review && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
            보호자 작성
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted mb-1">
        <span>섭취율 {review.consumption_pct}%</span>
        {review.ease_rating && <span>편의성 {review.ease_rating}/5</span>}
      </div>
      {review.comment && (
        <p className="text-sm mt-1">{review.comment}</p>
      )}
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
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  const formSteps = ["consumption", "ease", "rating", "comment"];
  const currentFormStep = formSteps[formStep];

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold">맛평가</h2>
        {isLoggedIn && !showForm && (
          <button
            onClick={() => {
              setShowForm(true);
              setFormStep(0);
              setSubmitted(false);
            }}
            className="text-xs text-primary font-medium hover:underline"
          >
            {myReview ? "리뷰 수정" : "평가하기"}
          </button>
        )}
      </div>

      {/* 성공 메시지 */}
      {submitted && (
        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3 mb-3 text-sm text-green-700 dark:text-green-300">
          맛평가가 저장되었습니다. 소중한 의견 감사합니다!
        </div>
      )}

      {/* 통계 카드 */}
      {stats && <ReviewStatsCard stats={stats} />}

      {/* 리뷰 작성 폼 (토스식: 한 번에 하나씩) */}
      {showForm && (
        <div className="bg-card rounded-xl border-2 border-primary/20 p-5 mt-3">
          {/* 진행 바 */}
          <div className="flex gap-1 mb-5">
            {formSteps.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= formStep ? "bg-primary" : "bg-border"
                }`}
              />
            ))}
          </div>

          {/* 스텝 1: 섭취 완료율 */}
          {currentFormStep === "consumption" && (
            <div>
              <h3 className="text-lg font-bold mb-1">다 드셨나요?</h3>
              <p className="text-xs text-muted mb-4">
                실제로 얼마나 드셨는지 알려주세요
              </p>
              <ConsumptionSelector
                value={consumptionPct}
                onChange={setConsumptionPct}
              />
            </div>
          )}

          {/* 스텝 2: 편의성 */}
          {currentFormStep === "ease" && (
            <div>
              <h3 className="text-lg font-bold mb-1">드시기 편했나요?</h3>
              <p className="text-xs text-muted mb-4">
                조리·섭취 편의성을 평가해주세요
              </p>
              <EaseSelector value={easeRating} onChange={setEaseRating} />
            </div>
          )}

          {/* 스텝 3: 별점 */}
          {currentFormStep === "rating" && (
            <div>
              <h3 className="text-lg font-bold mb-1">전체적으로 어떠셨나요?</h3>
              <p className="text-xs text-muted mb-4">
                맛과 만족도를 별점으로 알려주세요
              </p>
              <div className="flex justify-center py-4">
                <StarInput value={starRating} onChange={setStarRating} />
              </div>
            </div>
          )}

          {/* 스텝 4: 코멘트 */}
          {currentFormStep === "comment" && (
            <div>
              <h3 className="text-lg font-bold mb-1">한마디 남겨주세요</h3>
              <p className="text-xs text-muted mb-4">
                다른 분들에게 도움이 됩니다 (선택)
              </p>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="맛, 식감, 양 등에 대한 소감..."
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
              {/* 보호자 대리 작성 체크 */}
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isProxy}
                  onChange={(e) => setIsProxy(e.target.checked)}
                  className="w-4 h-4 rounded border-border accent-primary"
                />
                <span className="text-xs text-muted">
                  보호자가 대신 작성합니다 (어르신/환자 반응 기록)
                </span>
              </label>
            </div>
          )}

          {/* 네비게이션 */}
          <div className="flex gap-2 mt-5">
            {formStep > 0 && (
              <button
                onClick={() => setFormStep((s) => s - 1)}
                className="flex-1 border border-border py-2.5 rounded-xl text-sm font-medium hover:bg-background transition-colors"
              >
                이전
              </button>
            )}
            {formStep < formSteps.length - 1 ? (
              <button
                onClick={() => setFormStep((s) => s + 1)}
                disabled={formStep === 2 && starRating === 0}
                className="flex-1 bg-primary text-white py-2.5 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40"
              >
                다음
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting || starRating === 0}
                className="flex-1 bg-primary text-white py-2.5 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40"
              >
                {submitting ? "저장 중..." : "평가 완료"}
              </button>
            )}
          </div>

          <button
            onClick={() => setShowForm(false)}
            className="w-full mt-2 text-xs text-muted hover:text-foreground transition-colors"
          >
            취소
          </button>
        </div>
      )}

      {/* 비로그인 안내 */}
      {!isLoggedIn && (
        <p className="text-xs text-muted mt-3">
          <a href="/login" className="text-primary hover:underline">
            로그인
          </a>
          하시면 맛평가를 남길 수 있습니다.
        </p>
      )}

      {/* 리뷰 목록 */}
      {reviews.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-bold text-muted mb-2">
            평가 {reviews.length}개
          </h3>
          <div className="bg-card rounded-xl border border-border px-4">
            {reviews.map((r) => (
              <ReviewItem key={r.id} review={r} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
