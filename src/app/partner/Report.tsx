"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AsOf, Button, Card, EmptyState, HowCounted, ProgressBar, SectionHeader, SkeletonList, Stat, Tabs, TextButton, TextLink } from "@/components/ui";

type Product = { product_id: string; name: string; sku: string; impressions: number; views: number; clicks: number; diary: number; favorites: number; plans: number; rating: number | null; rating_n: number };
type Data = {
  days: number; products: Product[];
  totals: Totals | null;
  placements?: { key: string; label: string; count: number }[];
  audience: {
    people: number | null; goals?: Share[]; hidden?: number; tastes?: Share[]; tastes_hidden?: number;
    meals?: Share[]; meals_hidden?: number; meal_people?: number | null;
    category?: { label: string; people: number; goals: Record<string, number>; tastes: Record<string, number> } | null;
    category_failed?: boolean;
  } | null;
  /** 업체가 보고한 구매확정 수 — 보고가 한 번도 없으면 null */
  purchases?: number | null;
  period?: Period; from?: string; to?: string; as_of?: string;
  prev?: { from: string; to: string; totals: Totals | null; purchases: number | null; sales?: SalesTotals };
  sales?: { rows: SalesRow[]; totals: SalesTotals };
};
type SalesRow = { sku: string; name: string; quantity: number; revenue: number; buyers: number; repeat_buyers: number; repeat_rate: number | null; avg_gap: number | null; canceled: number; cancel_rate: number | null };
type SalesTotals = { quantity: number; revenue: number; buyers: number; repeat_buyers: number };
type Share = { key: string; label: string; share: number };
type SortKey = "impressions" | "views" | "saves" | "clicks";
/** 제품 표 정렬 — 위 퍼널의 단계와 같은 이름 (담기 = 식단 기록 + 식단 리스트 + 즐겨찾기) */
const SORTS: { value: SortKey; label: string }[] = [{ value: "impressions", label: "노출 순" }, { value: "views", label: "조회 순" }, { value: "saves", label: "담기 순" }, { value: "clicks", label: "클릭 순" }];
const saves = (p: Product) => p.diary + p.plans + p.favorites;
type Totals = { impressions: number; views: number; clicks: number; diary: number; favorites: number; plans: number };
type Period = "this_month" | "30d" | "last_month";
const PERIODS: { value: Period; label: string }[] = [{ value: "this_month", label: "이번 달" }, { value: "30d", label: "지난 30일" }, { value: "last_month", label: "지난달" }];
const day = (iso: string) => { const k = new Date(Date.parse(iso) + 9 * 3600e3); return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일`; };
/** 지난 기간 대비 — 지난 기간이 0이면 비교하지 않는다 */
function Delta({ cur, prev }: { cur: number; prev: number | null | undefined }) {
  if (prev === null || prev === undefined) return null;
  if (prev === 0) return <span className="block text-caption text-ink-2 mt-1">지난 기간 0</span>;
  const d = Math.round(((cur - prev) / prev) * 100);
  return <span className="block text-caption text-ink-2 mt-1 num">지난 기간보다 {d === 0 ? "같아요" : `${d > 0 ? "+" : "−"}${Math.abs(d)}%`}</span>;
}
const n = (v: number) => v.toLocaleString("ko-KR");
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

/** 성과 — 내 제품을 본·누른·기록한 수와, 그 사람들의 목표 분포(통계만) */
export function Report({ qs, onMakeSegment }: { qs: string; onMakeSegment?: (goal: string) => void }) {
  const [period, setPeriod] = useState<Period>("30d");
  const [sortBy, setSortBy] = useState<SortKey>("views");
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data?: Data; error?: string }>({ status: "loading" });

  // 기간을 빨리 바꾸면 늦게 온 예전 응답이 새 결과를 덮지 않게 — 마지막 요청만 상태를 바꾼다
  const seq = useRef(0);
  const load = useCallback(async (p: Period) => {
    const my = ++seq.current;
    try {
      const r = await fetch(`/api/partner/report?period=${p}&${qs}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (my === seq.current) setState({ status: "done", data: j });
    } catch (e) { if (my === seq.current) setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);
  useEffect(() => { load(period); }, [load, period]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const d = state.data;
  return (
    <section>
      <SectionHeader title="성과" action={d?.as_of ? <AsOf at={d.as_of} /> : undefined} />
      <Tabs value={period} onChange={(v) => { setPeriod(v); setState({ status: "loading" }); }} label="기간" className="mb-2" items={PERIODS} />
      {d?.from && d.to && state.status === "done" && (
        <p className="text-caption text-ink-2 mb-4">{day(d.from)} ~ {day(new Date(Date.parse(d.to) - 1).toISOString())}{d.prev && <> · 비교: {day(d.prev.from)} ~ {day(new Date(Date.parse(d.prev.to) - 1).toISOString())}</>}</p>
      )}
      {state.status === "loading" ? <SkeletonList rows={4} thumb={false} />
        : state.status === "error" || !d ? (
          <EmptyState title="성과를 불러오지 못했어요" description={state.error}
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(period); }}>다시 불러오기</Button>} />
        ) : (
          <>
          {d.sales && d.sales.rows.length > 0 && <AppSales sales={d.sales} prev={d.prev?.sales ?? null} />}
          {!d.totals ? (
          <EmptyState title="아직 반영된 제품이 없어요" description="제품이 반영되고 업체가 운영 중이 되면 여기 노출·조회·클릭 성과가 모여요" />
        ) : (
          <>
            {d.sales && d.sales.rows.length > 0 && <h3 className="text-label font-bold text-ink mb-2">앱에서 본·누른 것</h3>}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {([
                ["impressions", "노출"], ["views", "상세 조회"], ["clicks", "구매 링크 클릭"], ["diary", "식단 기록"], ["plans", "식단 리스트 담기"], ["favorites", "즐겨찾기"],
              ] as [keyof Totals, string][]).map(([k, label]) => (
                <Card key={k}>
                  <Stat label={label} value={n(d.totals![k])} emphasis={k === "clicks"} />
                  <Delta cur={d.totals![k]} prev={d.prev?.totals?.[k]} />
                </Card>
              ))}
            </div>
            <HowCounted className="mt-3">
              <p>노출은 추천·목록·식단 채우기에 내 제품이 보인 횟수예요 (11월 12일부터 세요).</p>
              <p>상세 조회·구매 링크 클릭·즐겨찾기는 그 일이 일어난 횟수로, 한 사람이 여러 번 하면 모두 세요.</p>
              <p>식단 기록은 그 기간 날짜의 식단에 넣은 횟수, 식단 리스트 담기는 그 기간에 저장한 식단 리스트에 들어 있는 횟수예요.</p>
              <p>지난 기간은 같은 길이의 바로 앞 기간이에요 (이번 달이면 지난달의 같은 날짜까지).</p>
            </HowCounted>
            <h3 className="text-label font-bold text-ink mt-8 mb-2">어디서 빠지나</h3>
            <Card>
              <ol className="grid grid-cols-5 gap-2">
                {([
                  { label: "노출", v: d.totals.impressions, prev: null },
                  { label: "조회", v: d.totals.views, prev: d.totals.impressions },
                  { label: "담기", v: d.totals.diary + d.totals.plans + d.totals.favorites, prev: d.totals.views },
                  { label: "클릭", v: d.totals.clicks, prev: d.totals.views },
                  { label: "확정 구매", v: d.purchases ?? null, prev: d.totals.clicks },
                ] as { label: string; v: number | null; prev: number | null }[]).map((s) => (
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

            <div className="flex flex-wrap items-center justify-between gap-2 mt-8 mb-2">
              <h3 className="text-label font-bold text-ink">제품별</h3>
              <Tabs variant="line" value={sortBy} onChange={setSortBy} label="제품 표 정렬" items={SORTS} />
            </div>
            <Card padding="none" className="overflow-x-auto">
              <table className="w-full text-label">
                <thead>
                  <tr className="text-ink-2 border-b border-line">
                    <th className="text-left font-medium px-4 py-2.5">제품</th>
                    <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">노출</th>
                    <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">조회</th>
                    <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">클릭</th>
                    <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">기록</th>
                    <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">식단 리스트</th>
                    <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">즐겨찾기</th>
                    <th className="text-right font-medium px-4 py-2.5 whitespace-nowrap">맛 평가</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...d.products].sort((a, b) => (sortBy === "saves" ? saves(b) - saves(a) : b[sortBy] - a[sortBy])).map((p) => (
                    <tr key={p.product_id}>
                      <td className="px-4 py-2.5 min-w-48"><TextLink href={`/products/${p.product_id}`}>{p.name}</TextLink></td>
                      <td className="px-3 py-2.5 num text-right text-ink whitespace-nowrap">{n(p.impressions)}</td>
                      <td className="px-3 py-2.5 num text-right text-ink whitespace-nowrap">{n(p.views)}</td>
                      <td className="px-3 py-2.5 num text-right text-ink whitespace-nowrap">{n(p.clicks)}</td>
                      <td className="px-3 py-2.5 num text-right text-ink whitespace-nowrap">{n(p.diary)}</td>
                      <td className="px-3 py-2.5 num text-right text-ink whitespace-nowrap">{n(p.plans)}</td>
                      <td className="px-3 py-2.5 num text-right text-ink whitespace-nowrap">{n(p.favorites)}</td>
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
                <p className="text-caption text-ink-2 mb-4">
                  본·누른·기록한 약 <span className="num">{n(d.audience.people)}</span>명 기준 · 한 사람이 여러 칸에 들 수 있어요
                  {d.audience.category && <> · 옆의 회색 숫자는 같은 기간 {d.audience.category.label} 제품을 본 약 <span className="num">{n(d.audience.category.people)}</span>명의 비율이에요</>}
                </p>
                {d.audience.category_failed && (
                  <p className="text-caption text-ink-2 -mt-2 mb-4">
                    같은 카테고리 비교는 불러오지 못했어요. 내 숫자는 맞게 나와요 ·{" "}
                    <TextButton className="text-caption" onClick={() => { setState({ status: "loading" }); load(period); }}>다시 불러오기</TextButton>
                  </p>
                )}
                <div className="grid gap-6 sm:grid-cols-3">
                  <ShareList title="고른 목표" rows={d.audience.goals || []} hidden={d.audience.hidden || 0} compare={d.audience.category?.goals} compareLabel={d.audience.category?.label} />
                  <ShareList title="입맛" rows={d.audience.tastes || []} hidden={d.audience.tastes_hidden || 0} compare={d.audience.category?.tastes} compareLabel={d.audience.category?.label} />
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
          </>
        )}
    </section>
  );
}

/** 비율 목록 — 10명 미만 칸은 가린 개수만 */
function ShareList({ title, rows, hidden, note, compare, compareLabel }: {
  title: string; rows: Share[]; hidden: number; note?: string; compare?: Record<string, number>; compareLabel?: string;
}) {
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
              <div className="flex justify-between gap-2 text-label mb-1">
                <span className="text-ink">{g.label}</span>
                <span className="num whitespace-nowrap">
                  <span className="text-ink font-medium">{g.share}%</span>
                  {compare && <span className="text-ink-3 ml-1.5" title={`${compareLabel} 평균`}>{compare[g.key] !== undefined ? `${compare[g.key]}%` : "—"}</span>}
                </span>
              </div>
              <ProgressBar value={g.share} label={`${g.label} ${g.share}%`} />
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && <p className="text-caption text-ink-2 mt-2">10명 미만인 칸 <span className="num">{hidden}</span>개는 가렸어요</p>}
    </div>
  );
}

/** 앱 주문 판매 — 제품별 판매 수량·판매액·구매자·재주문율·재주문 간격·취소율 (같은 기간, 결제 시각 기준) */
function AppSales({ sales, prev }: { sales: { rows: SalesRow[]; totals: SalesTotals }; prev: SalesTotals | null }) {
  const t = sales.totals;
  return (
    <div className="mb-10">
      <h3 className="text-label font-bold text-ink mb-2">앱 주문 판매</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><Stat label="판매액" value={`${n(t.revenue)}원`} /><Delta cur={t.revenue} prev={prev?.revenue} /></Card>
        <Card><Stat label="판매 수량" value={n(t.quantity)} unit="개" /><Delta cur={t.quantity} prev={prev?.quantity} /></Card>
        <Card><Stat label="구매자" value={n(t.buyers)} unit="명" /><Delta cur={t.buyers} prev={prev?.buyers} /></Card>
        <Card><Stat label="다시 산 사람" value={t.buyers ? `${Math.round((t.repeat_buyers / t.buyers) * 100)}%` : "—"} /><span className="block text-caption text-ink-2 mt-1 num">{n(t.repeat_buyers)}명</span></Card>
      </div>
      <Card padding="none" className="mt-3 overflow-x-auto">
        <table className="w-full text-label">
          <thead>
            <tr className="text-left text-ink-2 border-b border-line">
              <th className="px-4 py-2 font-medium min-w-40">제품</th>
              <th className="px-3 py-2 font-medium text-right whitespace-nowrap">수량</th>
              <th className="px-3 py-2 font-medium text-right whitespace-nowrap">판매액</th>
              <th className="px-3 py-2 font-medium text-right whitespace-nowrap">구매자</th>
              <th className="px-3 py-2 font-medium text-right whitespace-nowrap">재주문율</th>
              <th className="px-3 py-2 font-medium text-right whitespace-nowrap">재주문 간격</th>
              <th className="px-4 py-2 font-medium text-right whitespace-nowrap">취소율</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sales.rows.map((r) => (
              <tr key={r.sku}>
                <td className="px-4 py-2.5 min-w-40"><span className="text-ink">{r.name}</span><span className="block text-caption text-ink-2 num">{r.sku}</span></td>
                <td className="px-3 py-2.5 num text-right whitespace-nowrap">{n(r.quantity)}</td>
                <td className="px-3 py-2.5 num text-right whitespace-nowrap">{n(r.revenue)}원</td>
                <td className="px-3 py-2.5 num text-right whitespace-nowrap">{n(r.buyers)}명</td>
                <td className="px-3 py-2.5 num text-right whitespace-nowrap">{r.repeat_rate === null ? "—" : `${r.repeat_rate}%`}<span className="block text-caption text-ink-2">{n(r.repeat_buyers)}명</span></td>
                <td className="px-3 py-2.5 num text-right whitespace-nowrap">{r.avg_gap === null ? "—" : `${r.avg_gap}일`}</td>
                <td className="px-4 py-2.5 num text-right whitespace-nowrap">{r.cancel_rate === null ? "—" : `${r.cancel_rate}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <HowCounted className="mt-3">
        <p>앱에서 결제한 주문만 세요 (자사몰 주문은 들어가지 않아요). 결제한 때가 이 기간 안인 것, 취소된 줄은 판매에서 빼고 취소율에 넣어요.</p>
        <p>재주문율은 이 기간에 그 제품을 산 사람 중, 기간 끝까지 그 제품을 서로 다른 주문으로 두 번 이상 산 사람의 비율이에요. 재주문 간격은 그 사람들의 주문 사이 날 수 평균이에요.</p>
        <p>판매액은 쿠폰 할인 전 상품 금액이에요. 쿠폰 할인과 배송비는 정산에서 셈해요.</p>
      </HowCounted>
    </div>
  );
}
