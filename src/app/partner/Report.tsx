"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, EmptyState, ProgressBar, SectionHeader, SkeletonList, Stat, Tabs, TextLink } from "@/components/ui";

type Product = { product_id: string; name: string; sku: string; impressions: number; views: number; clicks: number; diary: number; favorites: number; plans: number; rating: number | null; rating_n: number };
type Data = {
  days: number; products: Product[];
  totals: { impressions: number; views: number; clicks: number; diary: number; favorites: number; plans: number } | null;
  placements?: { key: string; label: string; count: number }[];
  audience: {
    people: number | null; goals?: Share[]; hidden?: number; tastes?: Share[]; tastes_hidden?: number;
    meals?: Share[]; meals_hidden?: number; meal_people?: number | null;
  } | null;
  /** 업체가 보고한 구매확정 수 — 보고가 한 번도 없으면 null */
  purchases?: number | null;
};
type Share = { key: string; label: string; share: number };
type Days = "7" | "28" | "90";
const n = (v: number) => v.toLocaleString("ko-KR");
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

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

            <h3 className="text-label font-bold text-ink mt-8 mb-2">어디에 보였나</h3>
            {!d.placements?.length ? (
              <p className="text-label text-ink-2">아직 노출이 쌓이지 않았어요</p>
            ) : (
              <Card padding="none">
                <ul className="divide-y divide-line">
                  {d.placements.map((pl) => (
                    <li key={pl.key} className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="text-label text-ink">{pl.label}</span>
                      <span className="text-label text-ink-2 whitespace-nowrap">
                        <span className="num font-bold text-ink">{n(pl.count)}</span>회 · <span className="num">{pct(pl.count, d.placements!.reduce((t, x) => t + x.count, 0))}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

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

            <h3 className="text-label font-bold text-ink mt-8 mb-2">이 제품들을 본 사람들</h3>
            {!d.audience || d.audience.people === null ? (
              <EmptyState title="아직 보여 드릴 만큼 모이지 않았어요" description="누구인지 짐작할 수 없도록, 본 사람이 10명 이상일 때부터 비율로만 보여 드려요" />
            ) : (
              <Card>
                <p className="text-caption text-ink-2 mb-4">본·누른·기록한 약 <span className="num">{n(d.audience.people)}</span>명 기준 · 한 사람이 여러 칸에 들 수 있어요</p>
                <div className="grid gap-6 sm:grid-cols-3">
                  <ShareList title="고른 목표" rows={d.audience.goals || []} hidden={d.audience.hidden || 0} />
                  <ShareList title="입맛" rows={d.audience.tastes || []} hidden={d.audience.tastes_hidden || 0} />
                  <ShareList title="식단 기록에 넣은 끼니" rows={d.audience.meals || []} hidden={d.audience.meals_hidden || 0}
                    note={d.audience.meal_people ? `기록한 약 ${n(d.audience.meal_people)}명 기준` : "기록한 사람이 10명이 안 돼요"} />
                </div>
                {onMakeSegment && d.audience.goals?.[0] && (
                  <Button size="sm" variant="secondary" className="mt-6" onClick={() => onMakeSegment(d.audience!.goals![0].key)}>
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

/** 비율 목록 — 10명 미만 칸은 가린 개수만 */
function ShareList({ title, rows, hidden, note }: { title: string; rows: Share[]; hidden: number; note?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-label font-medium text-ink mb-1">{title}</p>
      {note && <p className="text-caption text-ink-2 mb-2">{note}</p>}
      {rows.length === 0 ? (
        <p className="text-label text-ink-2">10명 이상 모인 칸이 아직 없어요</p>
      ) : (
        <ul className="flex flex-col gap-3 mt-2">
          {rows.map((g) => (
            <li key={g.key}>
              <div className="flex justify-between text-label mb-1"><span className="text-ink">{g.label}</span><span className="num text-ink-2">{g.share}%</span></div>
              <ProgressBar value={g.share} label={`${g.label} ${g.share}%`} />
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && <p className="text-caption text-ink-2 mt-2">10명 미만인 칸 <span className="num">{hidden}</span>개는 가렸어요</p>}
    </div>
  );
}
