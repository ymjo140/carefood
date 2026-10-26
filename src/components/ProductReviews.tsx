"use client";

import { useState, useEffect, useCallback } from "react";

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

function Stars({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) {
  const sizeClass = size === "lg" ? "text-lg" : "text-sm";
  return (
    <span className={`${sizeClass} tracking-wider`} aria-label={`${rating}점`}>
      {"★".repeat(rating)}{"☆".repeat(5 - rating)}
    </span>
  );
}

export default function ProductReviews({ productId }: { productId: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    rating: 0, would_rebuy: null as boolean | null,
    taste_salty_feel: 0, taste_sweet_feel: 0, taste_spicy_feel: 0,
    comment: "",
  });
  const [submitting, setSubmitting] = useState(false);

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
        }),
      });
      setShowForm(false);
      setFormData({ rating: 0, would_rebuy: null, taste_salty_feel: 0, taste_sweet_feel: 0, taste_spicy_feel: 0, comment: "" });
      fetchReviews();
    } catch { /* */ }
    finally { setSubmitting(false); }
  };

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-extrabold">리뷰</h2>
        <button onClick={() => setShowForm(!showForm)}
          className="text-xs text-primary hover:underline"
          style={{ minHeight: "unset", minWidth: "unset" }}>
          {showForm ? "닫기" : "리뷰 쓰기"}
        </button>
      </div>

      {/* 통계 */}
      {stats && stats.count > 0 && (
        <div className="border border-border rounded-xl p-4 mb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <span className="text-2xl font-extrabold text-primary">{stats.avgRating}</span>
              <span className="text-sm text-muted ml-1">/ 5</span>
            </div>
            <div className="text-xs text-muted space-y-0.5">
              <p>리뷰 {stats.count}개</p>
              <p>재구매 의향 {stats.rebuyRate}%</p>
            </div>
            {(stats.avgTaste.salty || stats.avgTaste.sweet || stats.avgTaste.spicy) && (
              <div className="text-xs text-muted ml-auto space-y-0.5">
                {stats.avgTaste.salty && <p>짠맛 체감 {stats.avgTaste.salty}/5</p>}
                {stats.avgTaste.sweet && <p>단맛 체감 {stats.avgTaste.sweet}/5</p>}
                {stats.avgTaste.spicy && <p>매운맛 체감 {stats.avgTaste.spicy}/5</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 리뷰 작성 폼 */}
      {showForm && (
        <div className="border border-primary/30 rounded-xl p-4 mb-3 space-y-3">
          {/* 별점 */}
          <div>
            <label className="text-xs font-medium mb-1 block">별점</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setFormData(f => ({ ...f, rating: n }))}
                  className={`text-xl ${n <= formData.rating ? "text-primary" : "text-border"}`}
                  style={{ minHeight: "32px", minWidth: "32px" }}>
                  ★
                </button>
              ))}
            </div>
          </div>

          {/* 재구매 */}
          <div>
            <label className="text-xs font-medium mb-1 block">다시 구매할 의향이 있나요?</label>
            <div className="flex gap-2">
              {[{ val: true, label: "네" }, { val: false, label: "아니요" }].map(opt => (
                <button key={String(opt.val)} onClick={() => setFormData(f => ({ ...f, would_rebuy: opt.val }))}
                  className={`text-xs px-3 py-1.5 rounded-full ${
                    formData.would_rebuy === opt.val ? "bg-foreground text-card" : "bg-surface text-foreground/70"
                  }`} style={{ minHeight: "28px", minWidth: "unset" }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 맛 체감 */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: "taste_salty_feel" as const, label: "짠맛" },
              { key: "taste_sweet_feel" as const, label: "단맛" },
              { key: "taste_spicy_feel" as const, label: "매운맛" },
            ].map(t => (
              <div key={t.key}>
                <label className="text-[11px] text-muted block mb-1">{t.label} 체감</label>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setFormData(f => ({ ...f, [t.key]: n }))}
                      className={`w-6 h-6 text-[10px] rounded ${
                        n <= formData[t.key] ? "bg-primary text-white" : "bg-surface text-muted"
                      }`} style={{ minHeight: "24px", minWidth: "24px" }}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* 코멘트 */}
          <textarea
            value={formData.comment}
            onChange={e => setFormData(f => ({ ...f, comment: e.target.value }))}
            placeholder="이 제품에 대한 의견을 남겨주세요 (선택)"
            className="w-full px-3 py-2 rounded-lg border border-border text-sm resize-none focus:outline-none focus:border-primary"
            rows={3}
          />

          <button onClick={handleSubmit} disabled={formData.rating === 0 || submitting}
            className="w-full bg-primary text-white py-2 rounded-lg text-sm font-bold disabled:opacity-40">
            {submitting ? "저장 중..." : "리뷰 등록"}
          </button>
        </div>
      )}

      {/* 리뷰 목록 */}
      {loading ? (
        <p className="text-sm text-muted">로딩 중...</p>
      ) : reviews.length > 0 ? (
        <div className="space-y-2">
          {reviews.map(r => (
            <div key={r.id} className="border border-border rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Stars rating={r.rating} />
                  {r.would_rebuy !== null && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.would_rebuy ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}
                      style={{ minHeight: "unset", minWidth: "unset" }}>
                      {r.would_rebuy ? "재구매 의향" : "재구매 ✕"}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-muted">
                  {new Date(r.created_at).toLocaleDateString("ko-KR")}
                </span>
              </div>

              {/* 프로필 태그 */}
              <div className="flex gap-1 flex-wrap mb-1">
                {r.reviewer_age_group && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-muted"
                    style={{ minHeight: "unset", minWidth: "unset" }}>
                    {AGE_LABELS[r.reviewer_age_group] || r.reviewer_age_group}
                  </span>
                )}
                {r.reviewer_gender && r.reviewer_gender !== "other" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-muted"
                    style={{ minHeight: "unset", minWidth: "unset" }}>
                    {GENDER_LABELS[r.reviewer_gender] || r.reviewer_gender}
                  </span>
                )}
                {r.reviewer_concerns?.slice(0, 2).map(c => (
                  <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/8 text-primary/70"
                    style={{ minHeight: "unset", minWidth: "unset" }}>
                    {CONCERN_LABELS[c] || c}
                  </span>
                ))}
              </div>

              {r.comment && <p className="text-sm text-foreground/80 mt-1">{r.comment}</p>}

              {/* 맛 체감 */}
              {(r.taste_salty_feel || r.taste_sweet_feel || r.taste_spicy_feel) && (
                <div className="flex gap-3 mt-1.5 text-[10px] text-muted">
                  {r.taste_salty_feel && <span>짠맛 {r.taste_salty_feel}/5</span>}
                  {r.taste_sweet_feel && <span>단맛 {r.taste_sweet_feel}/5</span>}
                  {r.taste_spicy_feel && <span>매운맛 {r.taste_spicy_feel}/5</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted py-4 text-center">아직 리뷰가 없습니다. 첫 리뷰를 남겨보세요!</p>
      )}
    </section>
  );
}
