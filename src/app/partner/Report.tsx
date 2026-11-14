"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, EmptyState, ProgressBar, SectionHeader, SkeletonList, Stat, Tabs, TextLink } from "@/components/ui";

type Product = { product_id: string; name: string; sku: string; impressions: number; views: number; clicks: number; diary: number; favorites: number; plans: number; rating: number | null; rating_n: number };
type Data = {
  days: number; products: Product[];
  totals: { impressions: number; views: number; clicks: number; diary: number; favorites: number; plans: number } | null;
  audience: { people: number | null; goals?: { label: string; share: number }[]; hidden?: number } | null;
  /** 업체가 보고한 구매확정 수 — 보고가 한 번도 없으면 null */
  purchases?: number | null;
};
type Days = "7" | "28" | "90";
const n = (v: number) => v.toLocaleString("ko-KR");
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
/** 목표 이름 → 고객층 조건 키 (lib/partner/report.ts GOAL_LABELS 와 lib/partner/crm.ts CRM_GOALS) */
const GOAL_KEY: Record<string, string> = { "체중 관리": "weight_loss", "근력": "muscle", "균형 식단": "balanced", "활력": "energy", "장 건강": "gut_health", "피부": "skin" };

/** 성과 — 내 제품을 본·누른·기록한 수와, 그 사람들의 목표 분포(통계만) */
export function Report({ qs, onMakeSegment }: { qs: string; onMakeSegment?: (goal: string) => void }) {
  const [days, setDays] = useState<Days>("28");
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data?: Data; error?: string }>({ status: "loading" });

  const load = useCallback(async (d: Days) => {
    try {
      const r = await fetch(`/api/partner/report?days=${d}&${qs}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setState({ status: "done", data: j });
    } catch (e) { setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);
  useEffect(() => { load(days); }, [load, days]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const d = state.data;
  return (
    <section>
      <SectionHeader title="성과" />
      <Tabs value={days} onChange={(v) => { setDays(v); setState({ status: "loading" }); }} label="기간" className="mb-4"
        items={[{ value: "7", label: "7일" }, { value: "28", label: "28일" }, { value: "90", label: "90일" }]} />
      {state.status === "loading" ? <SkeletonList rows={4} thumb={false} />
        : state.status === "error" || !d ? (
          <EmptyState title="성과를 불러오지 못했어요" description={state.error}
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(days); }}>다시 불러오기</Button>} />
        ) : !d.totals ? (
          <EmptyState title="아직 반영된 제품이 없어요" description="제품이 반영되고 업체가 운영 중이 되면 여기 성과가 모여요" />
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Card><Stat label="노출" value={n(d.totals.impressions)} /></Card>
              <Card><Stat label="상세 조회" value={n(d.totals.views)} /></Card>
              <Card><Stat label="구매 링크 클릭" value={n(d.totals.clicks)} emphasis /></Card>
              <Card><Stat label="식단 기록" value={n(d.totals.diary)} /></Card>
              <Card><Stat label="식단 리스트 담기" value={n(d.totals.plans)} /></Card>
              <Card><Stat label="즐겨찾기" value={n(d.totals.favorites)} /></Card>
            </div>
            <h3 className="text-label font-bold text-ink mt-8 mb-2">어디서 빠지나</h3>
            <Card>
              <ol className="grid grid-cols-5 gap-2">
                {[
                  { label: "노출", v: d.totals.impressions, prev: null },
                  { label: "조회", v: d.totals.views, prev: d.totals.impressions },
                  { label: "담기", v: d.totals.diary + d.totals.plans + d.totals.favorites, prev: d.totals.views },
                  { label: "클릭", v: d.totals.clicks, prev: d.totals.views },
                  { label: "확정 구매", v: d.purchases ?? null, prev: d.totals.clicks },
                ].map((s) => (
                  <li key={s.label} className="min-w-0">
                    <span className="block text-caption text-ink-2">{s.label}</span>
                    <span className="block num text-body font-bold text-ink truncate">{s.v === null ? "보고 대기" : n(s.v)}</span>
                    <span className="block num text-caption text-ink-3">{s.prev !== null && s.v !== null ? pct(s.v, s.prev) : " "}</span>
                  </li>
                ))}
              </ol>
              <p className="text-caption text-ink-2 mt-3">
                비율은 바로 앞 단계 대비(클릭은 조회 대비)예요. 노출은 추천·목록·식단 채우기에 보인 횟수로, 11월 12일부터 세요.
                {d.purchases === null ? " 확정 구매는 업체가 주문을 보고해야 보여요" : " 확정 구매는 업체가 보고한 구매확정이에요"}
              </p>
            </Card>

            <h3 className="text-label font-bold text-ink mt-8 mb-2">제품별</h3>
            <Card padding="none" className="overflow-x-auto">
              <table className="w-full text-label">
                <thead>
                  <tr className="text-ink-2 border-b border-line">
                    <th className="text-left font-medium px-4 py-2.5">제품</th>
                    <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">노출</th>
                    <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">조회</th>
                    <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">클릭</th>
                    <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">기록</th>
                    <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">담기</th>
                    <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">즐겨찾기</th>
                    <th className="text-right font-medium px-4 py-2.5 whitespace-nowrap">맛 평가</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {d.products.map((p) => (
                    <tr key={p.product_id}>
                      <td className="px-4 py-2.5 min-w-48"><TextLink href={`/products/${p.product_id}`}>{p.name}</TextLink></td>
                      <td className="px-3 py-2.5 num text-right text-ink">{n(p.impressions)}</td>
                      <td className="px-3 py-2.5 num text-right text-ink">{n(p.views)}</td>
                      <td className="px-3 py-2.5 num text-right text-ink">{n(p.clicks)}</td>
                      <td className="px-3 py-2.5 num text-right text-ink">{n(p.diary)}</td>
                      <td className="px-3 py-2.5 num text-right text-ink">{n(p.plans)}</td>
                      <td className="px-3 py-2.5 num text-right text-ink">{n(p.favorites)}</td>
                      <td className="px-4 py-2.5 num text-right text-ink whitespace-nowrap">{p.rating !== null ? `${p.rating} (${p.rating_n})` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <h3 className="text-label font-bold text-ink mt-8 mb-2">이 제품들을 본 사람들의 목표</h3>
            {!d.audience || d.audience.people === null ? (
              <EmptyState title="아직 보여 드릴 만큼 모이지 않았어요" description="누구인지 짐작할 수 없도록, 본 사람이 10명 이상일 때부터 비율로만 보여 드려요" />
            ) : (
              <Card>
                <p className="text-caption text-ink-2 mb-3">약 <span className="num">{n(d.audience.people)}</span>명 기준 · 한 사람이 여러 목표를 고를 수 있어요</p>
                {(d.audience.goals || []).length === 0 ? (
                  <p className="text-label text-ink-2">10명 이상 모인 목표가 아직 없어요</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {(d.audience.goals || []).map((g) => (
                      <li key={g.label}>
                        <div className="flex justify-between text-label mb-1"><span className="text-ink">{g.label}</span><span className="num text-ink-2">{g.share}%</span></div>
                        <ProgressBar value={g.share} label={`${g.label} ${g.share}%`} />
                      </li>
                    ))}
                  </ul>
                )}
                {!!d.audience.hidden && <p className="text-caption text-ink-2 mt-3">10명 미만인 목표 <span className="num">{d.audience.hidden}</span>개는 가렸어요</p>}
                {onMakeSegment && d.audience.goals?.[0] && GOAL_KEY[d.audience.goals[0].label] && (
                  <Button size="sm" variant="secondary" className="mt-4" onClick={() => onMakeSegment(GOAL_KEY[d.audience!.goals![0].label])}>
                    &lsquo;{d.audience.goals[0].label}&rsquo; 목표인 사람으로 고객층 만들기
                  </Button>
                )}
              </Card>
            )}
          </>
        )}
    </section>
  );
}
