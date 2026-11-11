"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, EmptyState, Estimate, Notice, Page, PageHeader, SectionHeader, SkeletonList, Stat, cn } from "@/components/ui";
import { LinkTabs, ADMIN_TABS } from "@/components/ui/LinkTabs";

type Week = {
  week: string; north_star: number; active: number; plan_savers: number; clickers: number;
  diarists: number; avg_diary_days: number; retained_next_week: number | null;
};
type ErrGroup = { source: string; path: string | null; message: string; count: number; last: string };
type Errors = { last24h: { server: number; client: number }; groups: ErrGroup[] };

/** 최근 오류 — 서버(instrumentation.ts)·브라우저(ErrorReporter)에서 남긴 것, 같은 메시지끼리 묶어 */
function RecentErrors() {
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data?: Errors; msg?: string }>({ status: "loading" });
  const load = useCallback(() => {
    setState({ status: "loading" });
    fetch("/api/admin/errors")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "불러오지 못했어요"); setState({ status: "done", data: d }); })
      .catch((e: Error) => setState({ status: "error", msg: e.message }));
  }, []);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- 처음 한 번 불러온다
  return (
    <section className="mb-8">
      <SectionHeader title="최근 오류" description="최근 7일 · 같은 메시지끼리 묶음 · 30일 지나면 지워요" />
      {state.status === "loading" ? <SkeletonList rows={3} thumb={false} /> : state.status === "error" ? (
        <EmptyState title="오류 기록을 불러오지 못했어요" description={state.msg}
          action={<Button size="sm" variant="secondary" icon="refresh" onClick={load}>다시 불러오기</Button>} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Card><Stat label="24시간 · 서버" value={state.data!.last24h.server} unit="건" /></Card>
            <Card><Stat label="24시간 · 브라우저" value={state.data!.last24h.client} unit="건" /></Card>
          </div>
          {state.data!.groups.length === 0 ? (
            <p className="text-label text-ink-2">최근 7일에 기록된 오류가 없어요</p>
          ) : (
            <Card padding="none" className="divide-y divide-line">
              {state.data!.groups.map((g, i) => (
                <div key={i} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-label text-ink line-clamp-2" data-ds-allow-break>{g.message}</p>
                    <p className="text-caption text-ink-2">{g.source === "server" ? "서버" : "브라우저"} · {g.path || "경로 없음"} · {new Date(g.last).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>
                  </div>
                  <span className="num text-label font-bold text-ink shrink-0">{g.count}</span>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </section>
  );
}

type Metrics = { weeks: Week[]; onboarded_total: number; placements: { placement: string; clicks: number }[] };

const PLACEMENT_LABEL: Record<string, string> = {
  detail_best: "제품 상세 · 최저가 버튼",
  detail_other: "제품 상세 · 다른 판매처",
  detail_origin: "제품 상세 · 원본 상품",
  shopping_list: "식단 리스트 · 장보기 목록",
};

const TH = "py-2.5 px-3 font-medium";
const TD = "py-2.5 px-3";

export default function MetricsPage() {
  const [data, setData] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(() => {
    fetch("/api/admin/metrics")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "불러오지 못했어요"); setData(d); })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);
  const load = () => { setError(null); setData(null); fetchMetrics(); };

  const thisWeek = data?.weeks.at(-1);
  const lastWeek = data?.weeks.at(-2);
  const empty = data && data.weeks.every((w) => w.active === 0);

  return (
    <Page width="wide">
      <PageHeader title="지표" description="주간 · 월요일 시작 · 최근 8주" />
      <LinkTabs items={ADMIN_TABS} current="/admin/metrics" label="관리자 메뉴" className="mb-6" />

      {!data && !error && <SkeletonList rows={3} thumb={false} />}

      {error && (
        <Notice tone="danger" title="지표를 불러오지 못했어요">
          <p>{error}</p>
          <Button size="sm" variant="secondary" className="mt-2" onClick={load}>다시 불러오기</Button>
        </Notice>
      )}

      {data && empty && <EmptyState title="아직 쌓인 활동이 없어요" description="사용자가 식단을 저장하거나 구매 링크를 누르면 여기에 주별로 쌓여요" />}

      {data && !empty && thisWeek && (
        <>
          <Card className="mb-6">
            <Stat size="lg" emphasis value={thisWeek.north_star} unit="명"
              label="이번 주 식단을 저장하고 구매 링크까지 누른 사람 (북극성)" />
            {lastWeek && <p className="text-caption text-ink-2 mt-2">지난주 <span className="num">{lastWeek.north_star}</span>명</p>}
          </Card>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <Card><Stat label="이번 주 활동한 사람" value={thisWeek.active} unit="명" /></Card>
            <Card><Stat label="이번 주 기록한 사람" value={thisWeek.diarists} unit="명" /></Card>
            <Card><Stat label="기록한 사람의 평균 기록 일수" value={thisWeek.avg_diary_days} unit="일" /></Card>
            <Card><Stat label="온보딩을 마친 사람 (누적)" value={data.onboarded_total} unit="명" /></Card>
          </div>

          <section className="mb-8">
            <SectionHeader title="주별" />
            <Card padding="none" className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-label">
                <thead>
                  <tr className="border-b border-line text-caption text-ink-2">
                    <th className={cn(TH, "text-left")}>주 (월요일)</th>
                    <th className={cn(TH, "text-right")}>북극성</th>
                    <th className={cn(TH, "text-right")}>활동</th>
                    <th className={cn(TH, "text-right")}>식단 저장</th>
                    <th className={cn(TH, "text-right")}>구매 링크</th>
                    <th className={cn(TH, "text-right")}>기록</th>
                    <th className={cn(TH, "text-right")}>평균 기록 일수</th>
                    <th className={cn(TH, "text-right")}>다음 주에도 옴</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.weeks].reverse().map((w) => (
                    <tr key={w.week} className="border-b border-line last:border-0">
                      <td className={cn(TD, "num")}>{w.week}</td>
                      <td className={cn(TD, "num text-right font-bold")}>{w.north_star}</td>
                      <td className={cn(TD, "num text-right")}>{w.active}</td>
                      <td className={cn(TD, "num text-right")}>{w.plan_savers}</td>
                      <td className={cn(TD, "num text-right")}>{w.clickers}</td>
                      <td className={cn(TD, "num text-right")}>{w.diarists}</td>
                      <td className={cn(TD, "num text-right")}>{w.avg_diary_days}</td>
                      <td className={cn(TD, "num text-right")}>{w.retained_next_week == null ? "—" : `${w.retained_next_week}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>

          <section className="mb-8">
            <SectionHeader title="구매 링크를 누른 자리" description="최근 4주 · 구매 여부는 쿠팡 파트너스 리포트에서" />
            {data.placements.length === 0 ? (
              <p className="text-label text-ink-2">최근 4주에 누른 구매 링크가 없어요</p>
            ) : (
              <Card padding="none" className="divide-y divide-line">
                {data.placements.map((p) => (
                  <div key={p.placement} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="text-label text-ink">{PLACEMENT_LABEL[p.placement] || p.placement}</span>
                    <span className="num text-label font-bold text-ink">{p.clicks}</span>
                  </div>
                ))}
              </Card>
            )}
          </section>

          <RecentErrors />

          <Estimate>사람 수는 기기 기준이에요. 로그인하지 않고 기기를 바꾸면 다른 사람으로 세요</Estimate>
        </>
      )}
    </Page>
  );
}
