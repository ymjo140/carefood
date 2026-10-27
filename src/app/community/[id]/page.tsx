import { notFound } from "next/navigation";
import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";
import MealPlanActions from "./MealPlanActions";

// 동적 라우트 — 런타임 데이터 필요
export const instant = false;

/* ───── 타입 ───── */
type DaySlot = {
  day: string;
  slots: Record<string, string>;
};

type PlanSummary = {
  avg_daily_calories?: number;
  avg_daily_protein?: number;
  total_calories?: number;
  product_count?: number;
  total_price?: number;
  service_mix?: Record<string, number>;
  totalItems?: number;
  avgDailyCalories?: number;
  avgDailyProtein?: number;
};

const DAY_LABELS: Record<string, string> = {
  mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일",
};
const SLOT_LABELS: Record<string, string> = {
  breakfast: "🌅 아침", lunch: "☀️ 점심", dinner: "🌙 저녁", snack: "🍪 간식",
};
const SLOT_ORDER = ["breakfast", "lunch", "dinner", "snack"];
const CONCERN_LABELS: Record<string, string> = {
  gut_health: "장건강", skin: "피부건강", weight: "체중관리", energy: "활력충전",
};
const AGE_LABELS: Record<string, string> = {
  "20s": "20대", "30s": "30대", "40s": "40대", "50s": "50대", "60plus": "60대+",
};
const DIET_LABELS: Record<string, string> = {
  normal: "일반", diet: "다이어트", exercise: "운동병행", vegetarian: "채식", pregnant: "임산부",
};

export default async function MealPlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;

  // 식단 가져오기
  const { data: plan, error } = await sb
    .from("shared_meal_plans")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .single();

  if (error || !plan) notFound();

  // 댓글 가져오기
  const { data: comments } = await sb
    .from("meal_plan_comments")
    .select("*")
    .eq("plan_id", id)
    .order("created_at", { ascending: true });

  // 관련 공구
  let relatedGroupBuys: { id: string; title: string; product_name: string; target_price: number | null; original_price: number | null; discount_rate: number | null; target_count: number; current_count: number; concern: string | null }[] = [];
  if (plan.author_concerns?.length > 0) {
    const { data: gbs } = await sb
      .from("group_buys")
      .select("id, title, product_name, target_price, original_price, discount_rate, target_count, current_count, concern")
      .eq("status", "recruiting")
      .in("concern", plan.author_concerns)
      .limit(3);
    relatedGroupBuys = gbs || [];
  }

  const profileTags = [
    plan.author_age_group ? AGE_LABELS[plan.author_age_group] : null,
    plan.author_diet_type ? DIET_LABELS[plan.author_diet_type] : null,
    ...(plan.author_concerns || []).map((c: string) => CONCERN_LABELS[c] || c),
  ].filter(Boolean);

  const days: DaySlot[] = plan.days || [];
  const summary: PlanSummary | null = plan.summary;
  const avgCal = summary?.avg_daily_calories || summary?.avgDailyCalories;
  const avgProt = summary?.avg_daily_protein || summary?.avgDailyProtein;
  const productCount = summary?.product_count || summary?.totalItems;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
      {/* 뒤로가기 */}
      <Link href="/community" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground mb-4">
        ← 커뮤니티
      </Link>

      {/* ── 헤더: 작성자 정보 ── */}
      <div className="border border-border rounded-xl p-5 mb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base font-bold">{plan.author_display_name}</span>
              {plan.is_verified && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary font-medium"
                  style={{ minHeight: "unset", minWidth: "unset" }}>인증</span>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {profileTags.map((tag: string) => (
                <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-surface text-muted"
                  style={{ minHeight: "unset", minWidth: "unset" }}>{tag}</span>
              ))}
            </div>
          </div>
          <span className="text-xs text-muted shrink-0">
            {new Date(plan.created_at).toLocaleDateString("ko-KR")}
          </span>
        </div>

        <h1 className="text-lg font-extrabold mb-2">{plan.title}</h1>
        {plan.description && <p className="text-sm text-muted leading-relaxed">{plan.description}</p>}
      </div>

      {/* ── 영양 요약 ── */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {avgCal && (
            <div className="bg-surface rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-primary">{avgCal}</p>
              <p className="text-[10px] text-muted mt-0.5">일 평균 kcal</p>
            </div>
          )}
          {avgProt && (
            <div className="bg-surface rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-primary">{avgProt}g</p>
              <p className="text-[10px] text-muted mt-0.5">일 평균 단백질</p>
            </div>
          )}
          {productCount && (
            <div className="bg-surface rounded-lg p-3 text-center">
              <p className="text-lg font-bold">{productCount}</p>
              <p className="text-[10px] text-muted mt-0.5">사용 제품</p>
            </div>
          )}
          {summary.total_price && (
            <div className="bg-surface rounded-lg p-3 text-center">
              <p className="text-lg font-bold">{Math.round(summary.total_price / 10000 * 10) / 10}만원</p>
              <p className="text-[10px] text-muted mt-0.5">주간 예상 비용</p>
            </div>
          )}
        </div>
      )}

      {/* ── 식단표 (핵심!) ── */}
      <div className="border border-border rounded-xl overflow-hidden mb-4">
        <div className="bg-surface/50 px-4 py-2.5 border-b border-border">
          <h2 className="text-sm font-bold">📋 식단 구성</h2>
        </div>
        <div className="divide-y divide-border/50">
          {days.map((dayData, idx) => (
            <div key={idx} className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0"
                  style={{ minHeight: "unset", minWidth: "unset" }}>
                  {DAY_LABELS[dayData.day] || `${idx + 1}`}
                </span>
                <span className="text-sm font-medium">
                  {DAY_LABELS[dayData.day] ? `${DAY_LABELS[dayData.day]}요일` : `Day ${idx + 1}`}
                </span>
              </div>
              <div className="space-y-2 ml-9">
                {SLOT_ORDER.map(slot => {
                  const meal = dayData.slots[slot];
                  if (!meal) return null;
                  return (
                    <div key={slot} className="flex gap-3 items-start">
                      <span className="text-xs text-muted w-16 shrink-0 pt-0.5">{SLOT_LABELS[slot] || slot}</span>
                      <span className="text-sm flex-1">{meal}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 서비스 믹스 ── */}
      {summary?.service_mix && Object.keys(summary.service_mix).length > 0 && (
        <div className="border border-border rounded-xl p-4 mb-4">
          <h2 className="text-sm font-bold mb-3">🏷️ 서비스 구성</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.service_mix)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([service, count]) => (
                <div key={service} className="flex items-center gap-2 bg-surface rounded-lg px-3 py-2">
                  <span className="text-sm font-medium">{service}</span>
                  <span className="text-xs text-primary font-bold">{count as number}끼</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── 액션 + 댓글 (Client Component) ── */}
      <MealPlanActions
        planId={id}
        initialLikeCount={plan.like_count || 0}
        initialCopyCount={plan.copy_count || 0}
        initialComments={comments || []}
        planDays={plan.days}
        authorName={plan.author_display_name}
      />

      {/* ── 관련 공구 ── */}
      {relatedGroupBuys.length > 0 && (
        <div className="border border-border rounded-xl p-4 mt-4">
          <h2 className="text-sm font-bold mb-3">🛒 관련 공구</h2>
          <div className="space-y-2">
            {relatedGroupBuys.map(gb => (
              <Link href="/community" key={gb.id}
                className="flex items-center justify-between bg-surface rounded-lg px-3 py-2.5 hover:bg-border/50 transition-colors">
                <div>
                  <p className="text-sm font-medium">{gb.product_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {gb.target_price && <span className="text-xs font-bold text-primary">{gb.target_price.toLocaleString()}원</span>}
                    {gb.discount_rate && <span className="text-[10px] text-accent font-bold">{Math.round(gb.discount_rate * 100)}% OFF</span>}
                  </div>
                </div>
                <span className="text-xs text-muted">{gb.current_count}/{gb.target_count}명</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
