"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

/* ───── 타입 ───── */
type MealPlan = {
  id: string;
  title: string;
  description: string | null;
  days: unknown;
  summary: { totalItems?: number; avgDailyCalories?: number; avgDailyProtein?: number } | null;
  author_display_name: string;
  author_age_group: string | null;
  author_gender: string | null;
  author_concerns: string[];
  author_diet_type: string | null;
  is_verified: boolean;
  like_count: number;
  copy_count: number;
  comment_count: number;
  is_liked: boolean;
  created_at: string;
};

type GroupBuy = {
  id: string;
  title: string;
  description: string | null;
  product_name: string;
  original_price: number | null;
  target_price: number | null;
  discount_rate: number | null;
  target_count: number;
  current_count: number;
  concern: string | null;
  status: string;
  expires_at: string | null;
  created_at: string;
};

const CONCERN_LABELS: Record<string, string> = {
  gut_health: "장건강", skin: "피부건강", weight: "체중관리", energy: "활력충전",
};
const AGE_LABELS: Record<string, string> = {
  "20s": "20대", "30s": "30대", "40s": "40대", "50s": "50대", "60plus": "60대+",
};
const DIET_LABELS: Record<string, string> = {
  normal: "일반", diet: "다이어트", exercise: "운동병행", vegetarian: "채식", pregnant: "임산부",
};

function getUserId(): string | null {
  try { return localStorage.getItem("carefood_anon_id") || null; } catch { return null; }
}

/* ───── 식단 카드 ───── */
function PlanCard({ plan, onLike }: { plan: MealPlan; onLike: () => void }) {
  const profileTags = [
    plan.author_age_group ? AGE_LABELS[plan.author_age_group] : null,
    plan.author_diet_type ? DIET_LABELS[plan.author_diet_type] : null,
    ...plan.author_concerns.map(c => CONCERN_LABELS[c] || c),
  ].filter(Boolean);

  return (
    <div className="border border-border rounded-xl p-4 hover:shadow-sm transition-all">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">{plan.author_display_name}</span>
            {plan.is_verified && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium"
                style={{ minHeight: "unset", minWidth: "unset" }}>인증</span>
            )}
          </div>
          <div className="flex gap-1 flex-wrap mt-0.5">
            {profileTags.map(tag => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-muted"
                style={{ minHeight: "unset", minWidth: "unset" }}>{tag}</span>
            ))}
          </div>
        </div>
        <span className="text-[10px] text-muted shrink-0">
          {new Date(plan.created_at).toLocaleDateString("ko-KR")}
        </span>
      </div>

      {/* 내용 */}
      <h3 className="text-sm font-bold mb-1">{plan.title}</h3>
      {plan.description && <p className="text-xs text-muted mb-2 line-clamp-2">{plan.description}</p>}

      {/* 요약 */}
      {plan.summary && (
        <div className="flex gap-3 text-xs text-muted mb-3">
          {plan.summary.totalItems && <span>{plan.summary.totalItems}개 제품</span>}
          {plan.summary.avgDailyCalories && <span>일 {plan.summary.avgDailyCalories}kcal</span>}
          {plan.summary.avgDailyProtein && <span>단백질 {plan.summary.avgDailyProtein}g</span>}
        </div>
      )}

      {/* 액션 */}
      <div className="flex items-center gap-4 pt-2 border-t border-border/50">
        <button onClick={onLike}
          className={`flex items-center gap-1 text-xs ${plan.is_liked ? "text-primary font-medium" : "text-muted hover:text-foreground"}`}
          style={{ minHeight: "28px", minWidth: "unset" }}>
          {plan.is_liked ? "♥" : "♡"} {plan.like_count}
        </button>
        <span className="text-xs text-muted">💬 {plan.comment_count}</span>
        <span className="text-xs text-muted">📋 {plan.copy_count}</span>
      </div>
    </div>
  );
}

/* ───── 공구 카드 ───── */
function GroupBuyCard({ gb, onJoin }: { gb: GroupBuy; onJoin: () => void }) {
  const progress = gb.target_count > 0 ? Math.round(gb.current_count / gb.target_count * 100) : 0;
  const isAchieved = gb.status === "achieved";
  const daysLeft = gb.expires_at
    ? Math.max(0, Math.ceil((new Date(gb.expires_at).getTime() - Date.now()) / (24 * 3600 * 1000)))
    : null;

  return (
    <div className={`border rounded-xl p-4 ${isAchieved ? "border-primary/30 bg-primary/3" : "border-border"}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <h3 className="text-sm font-bold">{gb.title}</h3>
          <p className="text-xs text-muted mt-0.5">{gb.product_name}</p>
        </div>
        {gb.concern && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary shrink-0"
            style={{ minHeight: "unset", minWidth: "unset" }}>
            {CONCERN_LABELS[gb.concern] || gb.concern}
          </span>
        )}
      </div>

      {/* 가격 */}
      {gb.original_price && gb.target_price && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-muted line-through">{gb.original_price.toLocaleString()}원</span>
          <span className="text-sm font-bold text-primary">{gb.target_price.toLocaleString()}원</span>
          {gb.discount_rate && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-bold"
              style={{ minHeight: "unset", minWidth: "unset" }}>
              {Math.round(gb.discount_rate * 100)}% OFF
            </span>
          )}
        </div>
      )}

      {/* 진행 바 */}
      <div className="mb-2">
        <div className="flex justify-between text-[10px] text-muted mb-1">
          <span>{gb.current_count}/{gb.target_count}명</span>
          {daysLeft !== null && !isAchieved && <span>{daysLeft}일 남음</span>}
          {isAchieved && <span className="text-primary font-medium">달성 완료!</span>}
        </div>
        <div className="h-2 bg-surface rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${isAchieved ? "bg-primary" : "bg-primary/60"}`}
            style={{ width: `${Math.min(progress, 100)}%` }} />
        </div>
      </div>

      {/* 참여 버튼 */}
      {gb.status === "recruiting" && (
        <button onClick={onJoin}
          className="w-full py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary-dark transition-colors"
          style={{ minHeight: "36px" }}>
          참여하기
        </button>
      )}
    </div>
  );
}

/* ───── 메인 페이지 ───── */
export default function CommunityPage() {
  const [tab, setTab] = useState<"feed" | "group_buy">("feed");
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [groupBuys, setGroupBuys] = useState<GroupBuy[]>([]);
  const [loading, setLoading] = useState(true);
  const [concernFilter, setConcernFilter] = useState("");

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      const userId = getUserId();
      const params = new URLSearchParams();
      if (concernFilter) params.set("concern", concernFilter);
      if (userId) params.set("user_id", userId);
      const res = await fetch(`/api/community/feed?${params}`);
      const data = await res.json();
      setPlans(data.plans || []);
    } catch { /* */ }
    finally { setLoading(false); }
  }, [concernFilter]);

  const fetchGroupBuys = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (concernFilter) params.set("concern", concernFilter);
      const res = await fetch(`/api/community/group-buy?${params}`);
      const data = await res.json();
      setGroupBuys(data.group_buys || []);
    } catch { /* */ }
    finally { setLoading(false); }
  }, [concernFilter]);

  useEffect(() => {
    if (tab === "feed") fetchFeed();
    else fetchGroupBuys();
  }, [tab, fetchFeed, fetchGroupBuys]);

  const handleLike = async (planId: string) => {
    const userId = getUserId();
    if (!userId) return;
    await fetch("/api/community/like", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, plan_id: planId }),
    });
    fetchFeed();
  };

  const handleJoinGroupBuy = async (gbId: string) => {
    const userId = getUserId();
    if (!userId) return;
    const res = await fetch("/api/community/group-buy/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, group_buy_id: gbId }),
    });
    const data = await res.json();
    if (data.ok) fetchGroupBuys();
    else alert(data.error || "참여에 실패했습니다");
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-xl font-extrabold mb-5">커뮤니티</h1>

      {/* 탭 */}
      <div className="flex gap-1 mb-4 border-b border-border">
        {[
          { key: "feed" as const, label: "🍱 식단 피드" },
          { key: "group_buy" as const, label: "🛒 공구" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
            style={{ minHeight: "40px", minWidth: "unset" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 관심사 필터 */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar">
        <button onClick={() => setConcernFilter("")}
          className={`text-xs px-3 py-1 rounded-full shrink-0 ${
            !concernFilter ? "bg-foreground text-card" : "bg-surface text-foreground/70 hover:bg-border"
          }`} style={{ minHeight: "28px", minWidth: "unset" }}>
          전체
        </button>
        {Object.entries(CONCERN_LABELS).map(([key, label]) => (
          <button key={key} onClick={() => setConcernFilter(concernFilter === key ? "" : key)}
            className={`text-xs px-3 py-1 rounded-full shrink-0 ${
              concernFilter === key ? "bg-foreground text-card" : "bg-surface text-foreground/70 hover:bg-border"
            }`} style={{ minHeight: "28px", minWidth: "unset" }}>
            {label}
          </button>
        ))}
      </div>

      {/* 콘텐츠 */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-3" />
          <p className="text-sm text-muted">로딩 중...</p>
        </div>
      ) : tab === "feed" ? (
        <>
          {plans.length > 0 ? (
            <div className="space-y-3">
              {plans.map(plan => (
                <PlanCard key={plan.id} plan={plan} onLike={() => handleLike(plan.id)} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted">
              <p className="text-base mb-2">아직 공유된 식단이 없습니다</p>
              <p className="text-sm mb-4">주간 박스에서 내 식단을 공유해보세요!</p>
              <Link href="/weekly-box"
                className="inline-block bg-primary text-white px-5 py-2 rounded-lg text-sm font-bold">
                주간 박스 만들기
              </Link>
            </div>
          )}
        </>
      ) : (
        <>
          {groupBuys.length > 0 ? (
            <div className="space-y-3">
              {groupBuys.map(gb => (
                <GroupBuyCard key={gb.id} gb={gb} onJoin={() => handleJoinGroupBuy(gb.id)} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted">
              <p className="text-base mb-2">진행 중인 공구가 없습니다</p>
              <p className="text-sm">관심사별 공구가 시작되면 여기에 표시됩니다.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
