"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, EmptyState, Estimate, SectionHeader, SkeletonList, Stat } from "@/components/ui";

type Row = { key: string; label: string; rule: string; share: number | null; supply: number; partner_supply: number; mine: number };
type Data = { people: number | null; segments: Row[] };
const n = (v: number) => v.toLocaleString("ko-KR");

/** 수요 — 조건별로 찾는 사람 비율과 지금 살 수 있는 제품 수. 찾는 사람이 많은데 제품이 적은 조건이 위로 온다 */
export function Demand({ qs }: { qs: string }) {
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data?: Data; error?: string }>({ status: "loading" });
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/partner/demand?${qs}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setState({ status: "done", data: j });
    } catch (e) { setState({ status: "error", error: (e as Error).message || "불러오지 못했어요" }); }
  }, [qs]);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- 불러온 뒤에 상태를 바꾼다

  const d = state.data;
  const top = d?.segments[0];
  return (
    <section>
      <SectionHeader title="수요" />
      {state.status === "loading" ? <SkeletonList rows={5} thumb={false} />
        : state.status === "error" || !d ? (
          <EmptyState title="수요를 불러오지 못했어요" description={state.error}
            action={<Button size="sm" variant="secondary" icon="refresh" onClick={() => { setState({ status: "loading" }); load(); }}>다시 불러오기</Button>} />
        ) : !top ? (
          <EmptyState title="아직 보여 드릴 조건이 없어요" description="제품과 가입자가 모이면 여기 조건별로 보여요" />
        ) : (
          <>
            <Card>
              <p className="text-caption text-ink-2 mb-2">{top.share !== null ? "찾는 사람에 비해 제품이 가장 적은 조건" : "지금 살 수 있는 제품이 가장 적은 조건"}</p>
              <p className="text-body font-bold text-ink">{top.label}</p>
              <p className="text-label text-ink-2 mb-4">{top.rule}</p>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="찾는 사람" value={top.share !== null ? top.share : "—"} unit={top.share !== null ? "%" : undefined} />
                <Stat label="살 수 있는 제품" value={n(top.supply)} unit="개" emphasis />
                <Stat label="내 제품" value={n(top.mine)} unit="개" />
              </div>
            </Card>

            <Card padding="none" className="overflow-x-auto mt-3">
              <table className="w-full text-label">
                <thead>
                  <tr className="text-ink-2 border-b border-line">
                    <th className="text-left font-medium px-4 py-2.5">조건</th>
                    <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">찾는 사람</th>
                    <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">제품 수</th>
                    <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap hidden sm:table-cell">입점 업체 제품</th>
                    <th className="text-right font-medium px-4 py-2.5 whitespace-nowrap">내 제품</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {d.segments.map((s) => (
                    <tr key={s.key}>
                      <td className="px-4 py-2.5 sm:min-w-48">
                        <span className="block text-ink">{s.label}</span>
                        <span className="block text-caption text-ink-2">{s.rule}</span>
                      </td>
                      <td className="px-3 py-2.5 num text-right text-ink whitespace-nowrap">{s.share !== null ? `${s.share}%` : "—"}</td>
                      <td className="px-3 py-2.5 num text-right text-ink">{n(s.supply)}</td>
                      <td className="px-3 py-2.5 num text-right text-ink hidden sm:table-cell">{n(s.partner_supply)}</td>
                      <td className="px-4 py-2.5 num text-right font-bold text-ink">{n(s.mine)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Estimate className="mt-3">
              찾는 사람 비율은 가입할 때 고른 목표와 입맛으로 짐작한 값이에요
              {d.people !== null ? <> (약 <span className="num">{n(d.people)}</span>명 기준)</> : null}.
              누구인지 짐작할 수 없도록 10명 이상 모인 조건만 비율로 보여 드리고, 모이지 않은 조건은 —로 둬요.
              제품 수는 1회 제공량 기준으로, 지금 앱에서 살 수 있는 제품만 세요. 내 제품은 반영된 제품이에요.
            </Estimate>
          </>
        )}
    </section>
  );
}
