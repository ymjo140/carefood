"use client";

import { useEffect, useRef, useState } from "react";
import { ADMIN_TABS, Button, Card, EmptyState, LinkTabs, Page, PageHeader, SectionHeader, SkeletonList, Stat, timeAgo, useToast } from "@/components/ui";

/**
 * 관리자 · 챌린지 — 인증 공유와 같이 하기가 도는지 본다 (기획서 관문 2).
 * 위: 이번 주 공유율 · 링크 전환율 · 완주율(혼자 vs 같이) / 가운데: 주별 표 / 아래: 사람이 만든 챌린지(숨기기)
 * 사람 수만 보인다. 표본이 30명 미만인 비율에는 '표본 적음'.
 */
type Week = { week: string; recorders: number; sharers: number; share_rate: number | null; visits: number; joins: number; join_rate: number | null };
type Comp = { people: number; reached: number };
type UC = { id: string; title: string; note: string | null; creator: string; is_active: boolean; created_at: string; people: number };
type Data = { weeks: Week[]; completion: { solo: Comp; together: Comp }; user_challenges: UC[] };

const pct = (c: Comp) => (c.people ? Math.round((c.reached / c.people) * 100) : null);
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export default function AdminChallengesPage() {
  const toast = useToast();
  const [state, setState] = useState<{ status: "loading" | "error" | "done"; data: Data | null; error?: string }>({ status: "loading", data: null });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const n = ++seq.current;
    fetch("/api/admin/challenges")
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || ""); if (n === seq.current) setState({ status: "done", data: d }); })
      .catch((e) => { if (n === seq.current) setState({ status: "error", data: null, error: (e as Error).message }); });
  }, [attempt]);

  const toggle = async (c: UC) => {
    setBusy(c.id);
    try {
      const r = await fetch("/api/admin/challenges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, active: !c.is_active }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "");
      setState((s) => (s.data ? { ...s, data: { ...s.data, user_challenges: s.data.user_challenges.map((x) => (x.id === c.id ? { ...x, is_active: d.is_active } : x)) } } : s));
      toast.show(d.is_active ? "다시 보이게 했어요" : "숨겼어요. 목록·초대에서 빠져요");
    } catch (e) {
      toast.show((e as Error).message || "바꾸지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setBusy(null); }
  };

  return (
    <Page width="wide">
      <LinkTabs items={ADMIN_TABS} current="/admin/challenges" label="관리자 메뉴" className="mb-6" />
      <PageHeader title="챌린지" description="인증 카드 공유 → 링크 열람 → 같이 하기 → 완주가 도는지 봐요. 사람 수만 보여요" />

      {state.status === "loading" && <SkeletonList rows={4} thumb={false} />}
      {state.status === "error" && (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-label text-ink">챌린지 지표를 불러오지 못했어요{state.error ? ` (${state.error})` : ""}</p>
          <Button variant="secondary" size="sm" icon="refresh" onClick={() => { setState({ status: "loading", data: null }); setAttempt((n) => n + 1); }}>다시 불러오기</Button>
        </Card>
      )}
      {state.status === "done" && state.data && (() => {
        const d = state.data;
        const now = d.weeks[d.weeks.length - 1];
        const solo = pct(d.completion.solo), together = pct(d.completion.together);
        const small = (n: number) => n > 0 && n < 30;
        return (
          <div className="flex flex-col gap-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card><Stat label={<>이번 주 공유율{small(now.recorders) && " · 표본 적음"}</>} value={now.share_rate ?? "–"} unit={now.share_rate != null ? "%" : undefined} emphasis /></Card>
              <Card><Stat label={<>링크 → 같이 시작{small(now.visits) && " · 표본 적음"}</>} value={now.join_rate ?? "–"} unit={now.join_rate != null ? "%" : undefined} /></Card>
              <Card><Stat label={<>완주율 · 같이 (<span className="num">{d.completion.together.people}</span>명)</>} value={together ?? "–"} unit={together != null ? "%" : undefined} /></Card>
              <Card><Stat label={<>완주율 · 혼자 (<span className="num">{d.completion.solo.people}</span>명)</>} value={solo ?? "–"} unit={solo != null ? "%" : undefined} /></Card>
            </div>

            <section>
              <SectionHeader title="주별" description="월요일 시작 · 공유율 = 공유한 사람 ÷ 기록한 사람 · 전환율 = 같이 시작 ÷ 링크 본 사람" />
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-label">
                  <thead className="bg-sunken text-ink-2">
                    <tr>
                      <th className="text-left font-medium px-3 py-2 whitespace-nowrap">주</th>
                      {["기록한 사람", "공유한 사람", "공유율", "링크 본 사람", "같이 시작", "전환율"].map((h) => <th key={h} className="text-right font-medium px-3 py-2 whitespace-nowrap">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {[...d.weeks].reverse().map((w) => (
                      <tr key={w.week}>
                        <td className="px-3 py-2 whitespace-nowrap text-ink">{md(w.week)}~</td>
                        <td className="px-3 py-2 text-right num whitespace-nowrap">{w.recorders}</td>
                        <td className="px-3 py-2 text-right num whitespace-nowrap">{w.sharers}</td>
                        <td className="px-3 py-2 text-right num whitespace-nowrap">{w.share_rate != null ? `${w.share_rate}%` : "–"}</td>
                        <td className="px-3 py-2 text-right num whitespace-nowrap">{w.visits}</td>
                        <td className="px-3 py-2 text-right num whitespace-nowrap">{w.joins}</td>
                        <td className="px-3 py-2 text-right num whitespace-nowrap">{w.join_rate != null ? `${w.join_rate}%` : "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <SectionHeader title="사람이 만든 챌린지" description="링크가 있는 사람만 들어가요. 문제 있는 것은 숨기면 목록·초대에서 빠져요" />
              {d.user_challenges.length === 0 ? (
                <EmptyState title="아직 사람이 만든 챌린지가 없어요" description="챌린지 화면의 '내 챌린지 만들기'로 만들어져요" />
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {d.user_challenges.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-body text-ink truncate">{c.title}{!c.is_active && <span className="text-label text-ink-2"> · 숨김</span>}</p>
                        <p className="text-caption text-ink-2 truncate">{c.creator} · {timeAgo(c.created_at)} · <span className="num">{c.people}</span>명{c.note ? ` · “${c.note}”` : ""}</p>
                      </div>
                      <Button size="sm" variant="secondary" loading={busy === c.id} onClick={() => toggle(c)}>{c.is_active ? "숨기기" : "다시 보이기"}</Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        );
      })()}
    </Page>
  );
}
