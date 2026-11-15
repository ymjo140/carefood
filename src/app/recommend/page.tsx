"use client";

import { useEffect, useRef, useState } from "react";
import { BackButton, Button, EmptyState, ListRow, Notice, Page, PageHeader, Price, SkeletonList, TextLink, Thumb } from "@/components/ui";
import { profileLabel, type QuickProduct } from "@/components/HomePersonalized";
import { useImpressions } from "@/lib/impressions";

/**
 * /recommend — 홈 추천의 '더보기': 같은 추천(/api/recommend)을 100개까지 (살 수 있는 것만)
 *   프로필이 있으면 내 목표·입맛에 맞춘 추천, 없으면 처음 온 사람 추천(건강 점수 순)
 *   한 번에 20개씩 보여 주고 '더 보기'로 이어서 펼친다
 * ds-wiring-drop: /products — 예전엔 이 경로가 /products 로 넘겼다. 전체 제품은 홈 아래 목록이 맡는다
 */
const LIMIT = 100;
const STEP = 20;

type Rec = QuickProduct & { health_score?: number | null };
type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; items: Rec[]; cold: boolean; label: string; degradeMessage?: string; learned: number };

/** 점수 높은 순 — 같으면 원래 순서 */
function sortBy(list: Rec[], score: (p: Rec) => number): Rec[] {
  return list.map((p, i) => ({ p, i }))
    .sort((a, b) => score(b.p) - score(a.p) || a.i - b.i)
    .map(({ p }) => p);
}

export default function RecommendMorePage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [shown, setShown] = useState(STEP);
  const [attempt, setAttempt] = useState(0);
  const seq = useRef(0);
  const seen = useImpressions("reco_more");

  useEffect(() => {
    const my = ++seq.current;
    // 홈과 같은 입력 — 이 브라우저에 남긴 목표·검진 수치
    let profile: Record<string, unknown> | null = null;
    let health: Record<string, unknown> | null = null;
    try {
      const raw = localStorage.getItem("carefood_profile");
      if (raw) profile = JSON.parse(raw);
      const h = localStorage.getItem("carefood_health");
      if (h) health = JSON.parse(h);
    } catch { /* 못 읽으면 처음 온 사람 추천 */ } // ds-allow: 저장된 프로필을 못 읽으면 처음 온 사람 추천으로 보여 준다
    const cold = !profile || Object.keys(profile).length === 0;

    fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cold ? { cold: true, limit: LIMIT } : { profile, health, limit: LIMIT }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || String(r.status));
        if (my !== seq.current) return;
        setState({
          kind: "ready",
          // 화면에 적합도 점수를 보여 주므로 점수 순 (서버 순서는 다양성 섞기·탐색 칸이 들어가 점수와 어긋나 보였다 — 11/15)
          //  처음 온 사람(적합도 없음)은 건강 점수 순. 점수가 같으면 서버 순서
          items: sortBy(data.recommendations || [], (p) => (cold ? p.health_score : p.match_score) ?? 0),
          cold,
          label: cold ? "" : profileLabel(profile),
          degradeMessage: data.degraded ? data.degradeMessage : undefined,
          learned: data.learned?.samples || 0,
        });
        setShown(STEP);
      })
      .catch((e) => {
        console.error(e);
        if (my === seq.current) setState({ kind: "error" });
      });
  }, [attempt]);

  const reload = () => { setState({ kind: "loading" }); setAttempt((n) => n + 1); };

  const ready = state.kind === "ready" ? state : null;
  const title = !ready ? "추천" : ready.cold ? "지금 살 수 있는 건강한 한 끼" : `${ready.label} 추천`;
  const description = !ready ? undefined
    : ready.cold ? "건강 점수가 높은 한 끼·반찬이에요. 목표를 알려 주면 맞춰 골라요"
    : "적합도가 높은 순서예요. 지금 살 수 있는 제품만 보여 줘요";

  return (
    <Page>
      <BackButton fallback="/" />
      <PageHeader title={title} description={description} className="mt-2"
        actions={ready?.cold ? <TextLink href="/onboarding">목표 알려 주기</TextLink> : undefined} />

      {state.kind === "loading" && <SkeletonList rows={8} />}

      {state.kind === "error" && (
        <EmptyState title="추천을 불러오지 못했어요" description="잠시 뒤 다시 불러와 주세요"
          action={<Button variant="secondary" size="sm" icon="refresh" onClick={reload}>다시 불러오기</Button>} />
      )}

      {ready && ready.items.length === 0 && (
        <EmptyState title="조건에 맞는 제품을 아직 못 찾았어요" description="목표나 알레르기 조건을 바꾸면 더 찾을 수 있어요"
          action={<TextLink href="/me/profile">내 조건 바꾸기</TextLink>} />
      )}

      {ready && ready.items.length > 0 && (
        <>
          {ready.degradeMessage && <Notice className="mb-3">{ready.degradeMessage}</Notice>}
          <ul className="flex flex-col">
            {ready.items.slice(0, shown).map((p) => {
              const prices = (p.product_prices || []).filter((pp) => pp.price > 0);
              const best = prices.length ? Math.min(...prices.map((pp) => pp.price)) : null;
              const img = prices.find((pp) => pp.image_url)?.image_url;
              return (
                <li key={p.id} ref={seen(p.id)} className="border-b border-line last:border-b-0">
                  <ListRow
                    href={`/products/${p.id}`}
                    leading={<Thumb src={img} alt="" size={56} />}
                    title={p.name}
                    meta={<>
                      {(p.is_exploration || p.reason_detail) && (
                        <span className="block line-clamp-1">
                          {p.is_exploration && <span className="text-brand-ink font-medium">새로 시도해 보기{p.reason_detail ? " · " : ""}</span>}
                          {p.reason_detail}
                        </span>
                      )}
                      {best != null && <Price value={best} className="block text-label text-ink mt-0.5" />}
                    </>}
                    trailing={ready.cold ? undefined : (
                      <span className="flex flex-col items-end">
                        <span className="num text-label font-bold text-brand-ink whitespace-nowrap">{p.match_score}점</span>
                        <span className="text-caption text-ink-3 whitespace-nowrap">적합도</span>
                      </span>
                    )}
                  />
                </li>
              );
            })}
          </ul>
          {ready.learned > 0 && <p className="text-caption text-ink-2 mt-3">맛 평가 <span className="num">{ready.learned}</span>개로 입맛을 맞춰 골랐어요</p>}
          {shown < ready.items.length && (
            <Button variant="secondary" block className="mt-4" onClick={() => setShown((n) => n + STEP)}>
              더 보기 <span className="num text-ink-2 font-regular">{Math.min(shown, ready.items.length)}/{ready.items.length}</span>
            </Button>
          )}
        </>
      )}
    </Page>
  );
}
