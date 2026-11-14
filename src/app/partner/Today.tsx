"use client";

import { useCallback, useEffect, useState } from "react";
import { AsOf, Button, Card, EmptyState, HowCounted, Icon, SectionHeader, Skeleton, Stat, cn } from "@/components/ui";
import type { Tab } from "@/lib/partner/tabs";

type Kpi = { label: string; value: string; unit?: string; tab: Tab; note?: string; how?: string };
type Task = { kind: string; title: string; reason: string; action: string; tab: Tab; filter?: string; blocking: boolean };
type Step = { key: string; label: string; value: number };
type Data = {
  kpis: Kpi[]; tasks: Task[]; funnel: Step[] | null;
  demand: { key: string; label: string; rule: string; share: number | null; supply: number; mine: number } | null;
  counts: { approved: number; total: number };
};
const n = (v: number) => v.toLocaleString("ko-KR");
const BASE: Record<string, string> = { views: "impressions", saves: "views", clicks: "views", purchases: "clicks" };

/**
 * 오늘 — 지금 무엇을 해야 하나. 숫자 4개(유형별) → 할 일 Top 3 → 퍼널 한 줄 → 수요 한 줄. (v3 7.1)
 * 1순위는 할 일 첫째 줄. 숫자·퍼널은 해당 탭으로 데려간다.
 */
export function Today({ qs, go }: { qs: string; go: (tab: Tab, opts?: { filter?: string; need?: string }) => void }) {
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data?: Data; error?: string; at?: number }>({ status: "loading" });
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/partner/today?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setState({ status: "done", data: d, at: Date.now() });
    } catch (e) { setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-8" aria-busy="true">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
        <Skeleton className="h-44 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
    );
  }
  if (state.status === "error" || !state.data) {
    return (
      <EmptyState title="오늘 화면을 불러오지 못했어요" description={state.error}
        action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(); }}>다시 불러오기</Button>} />
    );
  }
  const d = state.data;

  if (d.counts.total === 0) {
    return (
      <section>
        <SectionHeader title="시작하기" />
        <Card>
          <ol className="flex flex-col gap-4">
            {[
              { t: "연동 방식 고르기", s: "피드·API를 권해요. 가격이 바뀌면 바로 반영돼요", tab: "connect" as Tab },
              { t: "제품 올리기", s: "양식에 한 줄에 제품 하나씩 적어 올려요", tab: "connect" as Tab },
              { t: "검수 기다리기", s: "영양·원재료를 케어푸드가 확인한 뒤 앱에 보여요", tab: "products" as Tab },
            ].map((x, i) => (
              <li key={x.t} className="flex gap-3">
                <span className="num text-label font-bold text-ink-2 w-5 shrink-0">{i + 1}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-body text-ink">{x.t}</span>
                  <span className="block text-label text-ink-2">{x.s}</span>
                </span>
              </li>
            ))}
          </ol>
          <Button className="mt-5" onClick={() => go("connect")}>연동 방식 고르기</Button>
        </Card>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {d.kpis.map((k) => (
          <button key={k.label} type="button" onClick={() => go(k.tab)} className="press text-left rounded-lg border border-line bg-surface p-4 hover:border-line-strong transition-colors">
            <Stat label={k.label} value={k.value} unit={k.unit} />
            {k.note && <span className="block text-caption text-ink-2 mt-1">{k.note}</span>}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 mt-3">
        <HowCounted>
          {d.kpis.filter((k) => k.how).map((k) => <p key={k.label}><span className="text-ink">{k.label}</span> — {k.how}</p>)}
          <p>사람 수가 10명 미만인 값은 누구인지 짐작할 수 없도록 —로 가려요.</p>
        </HowCounted>
        {state.at && <AsOf at={state.at} />}
      </div>
      </div>

      <section>
        <SectionHeader title="할 일" />
        {d.tasks.length === 0 ? (
          <EmptyState title="지금 막힌 일은 없어요" description="수요 빈틈을 보고 다음 제품을 정해 보세요"
            action={<Button size="sm" variant="secondary" onClick={() => go("demand")}>수요 보기</Button>} />
        ) : (
          <Card padding="none" className="divide-y divide-line">
            {d.tasks.map((t, i) => (
              <div key={t.kind} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                <span className="flex gap-3 flex-1 min-w-0">
                  <span className="num text-label font-bold text-ink-2 w-5 shrink-0 pt-0.5">{i + 1}</span>
                  <span className="flex-1 min-w-0">
                    <span className={cn("flex items-center gap-1.5 text-body text-ink", i === 0 && "font-bold")}>
                      {t.blocking && <Icon name="alert" size={16} className="text-danger shrink-0" aria-label="판매에 영향" />}
                      {t.title}
                    </span>
                    <span className="block text-label text-ink-2">{t.reason}</span>
                  </span>
                </span>
                <Button size="sm" variant={i === 0 ? "primary" : "secondary"} className="self-start sm:self-center shrink-0"
                  onClick={() => go(t.tab, { filter: t.filter })}>{t.action}</Button>
              </div>
            ))}
          </Card>
        )}
      </section>

      {d.funnel && (
        <section>
          <SectionHeader title="지난 28일" action={<Button size="sm" variant="ghost" onClick={() => go("report")}>성과 자세히</Button>} />
          <Card>
            <ol className="grid grid-cols-5 gap-2">
              {d.funnel.map((s, i) => {
                // 비율의 기준: 담기·클릭은 조회 대비, 확정 구매는 클릭 대비 (담기와 클릭은 나란한 행동이라 이어 붙이지 않는다)
                const base = BASE[s.key];
                const prev = base ? d.funnel!.find((x) => x.key === base)?.value || 0 : 0;
                return (
                  <li key={s.key} className="min-w-0">
                    <span className="block text-caption text-ink-2">{s.label}</span>
                    <span className="block num text-body font-bold text-ink truncate">{n(s.value)}</span>
                    <span className="block num text-caption text-ink-3">{i > 0 && prev > 0 ? `${Math.round((s.value / prev) * 100)}%` : " "}</span>
                  </li>
                );
              })}
            </ol>
            <p className="text-caption text-ink-2 mt-3">비율은 담기·클릭은 조회 대비, 확정 구매는 클릭 대비예요. 담기는 즐겨찾기·식단 리스트·식단 기록을 합친 수, 확정 구매는 업체가 보고한 구매확정이에요</p>
          </Card>
        </section>
      )}

      {d.demand && (
        <section>
          <SectionHeader title="이번 주 수요" />
          <Card>
            <p className="text-body font-bold text-ink">{d.demand.label}</p>
            <p className="text-label text-ink-2">{d.demand.rule}</p>
            <p className="text-label text-ink mt-2">
              찾는 사람 <span className="num font-bold">{d.demand.share}%</span> · 살 수 있는 제품 <span className="num font-bold">{n(d.demand.supply)}</span>개 · 내 제품 <span className="num">{n(d.demand.mine)}</span>개
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <Button size="sm" variant="secondary" onClick={() => go("demand")}>수요 전체 보기</Button>
              <Button size="sm" variant="ghost" onClick={() => go("segments", { need: d.demand!.key })}>이 조건으로 고객층 만들기</Button>
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}
