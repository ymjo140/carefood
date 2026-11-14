"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, EmptyState, Estimate, Notice, Price, ProgressBar, SectionHeader, SkeletonList, Stat } from "@/components/ui";
import type { GroupBuyRow, MealRow, PriceRow } from "@/lib/partner/demand-more";

type Row = { key: string; label: string; rule: string; share: number | null; supply: number; partner_supply: number; mine: number };
type Data = {
  people: number | null; segments: Row[];
  more?: { meals: MealRow[]; prices: PriceRow[]; group_buys: GroupBuyRow[] } | null;
  more_error?: string;
};
const n = (v: number) => v.toLocaleString("ko-KR");

/** 수요 — 조건별로 찾는 사람 비율과 지금 살 수 있는 제품 수. 찾는 사람이 많은데 제품이 적은 조건이 위로 온다 */
export function Demand({ qs, onMakeSegment }: { qs: string; onMakeSegment?: (need: string) => void }) {
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
              {onMakeSegment && <Button size="sm" variant="secondary" className="mt-4" onClick={() => onMakeSegment(top.key)}>이 조건을 찾는 사람으로 고객층 만들기</Button>}
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
                        {onMakeSegment && s.share !== null && (
                          <button type="button" className="press mt-1 text-caption font-medium text-brand-ink hover:underline underline-offset-4" onClick={() => onMakeSegment(s.key)}>고객층 만들기</button>
                        )}
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
            {d.more === null || d.more === undefined ? (
              <Notice tone="danger" className="mt-8" title="끼니·가격대·공구 수요를 불러오지 못했어요">
                {d.more_error || "다시 불러오기를 눌러 주세요"}
                <Button size="sm" variant="secondary" icon="refresh" className="mt-3" onClick={() => { setState({ status: "loading" }); load(); }}>다시 불러오기</Button>
              </Notice>
            ) : <More more={d.more} />}
          </>
        )}
    </section>
  );
}

/** 끼니 · 가격대 · 공구 수요 */
function More({ more }: { more: NonNullable<Data["more"]> }) {
  const meals = more.meals.filter((m) => m.people !== null);
  return (
    <>
      <h3 className="text-label font-bold text-ink mt-8 mb-2">언제 먹나</h3>
      {more.meals.length === 0 ? (
        <p className="text-label text-ink-2">제품이 반영되면 내 제품 카테고리를 어느 끼니에 기록하는지 보여 드려요</p>
      ) : meals.length === 0 ? (
        <p className="text-label text-ink-2">내 제품 카테고리를 식단에 기록한 사람이 아직 10명이 안 돼요</p>
      ) : (
        <Card padding="none" className="overflow-x-auto">
          <table className="w-full text-label">
            <thead>
              <tr className="text-ink-2 border-b border-line">
                <th className="text-left font-medium px-4 py-2.5">카테고리</th>
                {meals[0].meals.map((m) => <th key={m.key} className="text-right font-medium px-3 py-2.5 whitespace-nowrap">{m.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {meals.map((r) => (
                <tr key={r.category}>
                  <td className="px-4 py-2.5">
                    <span className="block text-ink">{r.label}</span>
                    <span className="block text-caption text-ink-2">기록한 약 <span className="num">{r.people}</span>명 기준</span>
                  </td>
                  {r.meals.map((m) => <td key={m.key} className="px-3 py-2.5 num text-right text-ink">{m.share !== null ? `${m.share}%` : "—"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <h3 className="text-label font-bold text-ink mt-8 mb-2">가격대</h3>
      {more.prices.length === 0 ? (
        <p className="text-label text-ink-2">비교할 만큼 같은 카테고리 제품이 모이면 보여 드려요</p>
      ) : (
        <>
          <Card padding="none" className="overflow-x-auto">
            <table className="w-full text-label">
              <thead>
                <tr className="text-ink-2 border-b border-line">
                  <th className="text-left font-medium px-4 py-2.5">제품</th>
                  <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">내 가격</th>
                  <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">비슷한 제품 가격</th>
                  <th className="text-right font-medium px-4 py-2.5 whitespace-nowrap">나보다 싼 제품</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {more.prices.map((r) => (
                  <tr key={r.product_id}>
                    <td className="px-4 py-2.5 min-w-40 sm:min-w-48">
                      <span className="block text-ink">{r.name}</span>
                      <span className="block text-caption text-ink-2">{r.label} <span className="num">{r.count.toLocaleString("ko-KR")}</span>개와 비교</span>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">{r.price !== null ? <Price value={r.price} /> : <span className="text-ink-2">판매 중 가격 없음</span>}</td>
                    <td className="px-3 py-2.5 num text-right text-ink whitespace-nowrap">{r.low.toLocaleString("ko-KR")}~{r.high.toLocaleString("ko-KR")}원</td>
                    <td className="px-4 py-2.5 num text-right font-bold text-ink">{r.rank !== null ? `${r.rank}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Estimate className="mt-3">
            앱에서 파는 같은 카테고리 제품의 1개당 가장 싼 가격으로 셌어요. 실제로 팔린 가격이 아니라 올라와 있는 가격이에요.
            &lsquo;비슷한 제품 가격&rsquo;은 싼 쪽 4분의 1과 비싼 쪽 4분의 1을 뺀 가운데 절반의 범위예요.
          </Estimate>
        </>
      )}

      <h3 className="text-label font-bold text-ink mt-8 mb-2">공구 수요</h3>
      {more.group_buys.length === 0 ? (
        <p className="text-label text-ink-2">내 제품에 열린 공구가 아직 없어요. 사용자가 공구를 열면 모인 인원과 바라는 가격이 여기 보여요</p>
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-line">
            {more.group_buys.map((g) => (
              <li key={g.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-label font-medium text-ink min-w-0 truncate">{g.title}</span>
                  <span className="text-label text-ink-2 whitespace-nowrap"><span className="num font-bold text-ink">{g.current}</span>/<span className="num">{g.target}</span>명</span>
                </div>
                <ProgressBar value={g.current} max={g.target} className="mt-2" label={`${g.target}명 중 ${g.current}명`} />
                <p className="text-caption text-ink-2 mt-2">
                  {g.status === "achieved" ? "목표 인원을 채웠어요" : "모으는 중"}
                  {g.target_price !== null && <> · 바라는 가격 <span className="num">{g.target_price.toLocaleString("ko-KR")}</span>원{g.discount !== null && <> (<span className="num">{g.discount}</span>% 할인)</>}</>}
                  {g.goal && <> · {g.goal}</>}
                  {g.expires_at && <> · {new Date(g.expires_at).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })} 마감</>}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-caption text-ink-2 mt-2">공구 가격을 받아들이는 기능은 앱 주문이 열린 뒤에 생겨요</p>
    </>
  );
}
