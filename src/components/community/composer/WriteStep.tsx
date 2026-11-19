"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button, Checkbox, Chip, ChipRow, ChoiceList, Field, Icon, IconButton, Input, ListRow, Notice, Select, SkeletonList, Textarea,
} from "@/components/ui";
import PeopleTagSheet, { type TagPerson } from "../PeopleTagSheet";
import { COMMUNITY_TOPICS } from "@/lib/community-topics";
import { POLL_DAYS, POLL_MAX_OPTIONS, POLL_OPTION_MAX } from "@/lib/community-poll";
import { VISIBILITY_LABEL, type Visibility } from "@/lib/community-visibility";

/**
 * 글쓰기 3단계 — 글 · 붙이기(사람 태그 · 제품 태그 · 투표 · 저장한 식단) · 모임 · 공개 범위.
 * 저장한 식단은 사진·끼니 없이 '저장한 식단 나누기'로 들어왔을 때 쓴다.
 */
export type Plan = { id: string; title: string; avg_daily_calories: number | null; avg_daily_protein: number | null; filled_days: string[]; grid: Record<string, Record<string, { calories?: number } | null>> };
export type Hit = { id: string; name: string };
export type Extra = "product" | "plan" | null;

export type WriteState = {
  content: string; topic: string; visibility: Visibility; showKcal: boolean;
  people: TagPerson[]; products: Hit[]; plan: Plan | null;
  pollOn: boolean; pollOpts: string[]; pollDays: number;
};
export const EMPTY_WRITE: WriteState = {
  content: "", topic: "", visibility: "public", showKcal: true, people: [], products: [], plan: null, pollOn: false, pollOpts: ["", ""], pollDays: 3,
};

type Load<T> = { status: "idle" | "loading" | "error" | "done"; items: T[] };

export default function WriteStep({ w, set, hasMeal, initialExtra, source, onDropSource }: {
  w: WriteState; set: (p: Partial<WriteState>) => void;
  /** 식단 기록을 붙였는지 — 열량 보이기를 보여 준다 */
  hasMeal: boolean;
  initialExtra?: Extra;
  source: { id: string; nickname: string } | null;
  onDropSource: () => void;
}) {
  const [extra, setExtra] = useState<Extra>(initialExtra ?? null);
  const [tagOpen, setTagOpen] = useState(false);
  const [plans, setPlans] = useState<Load<Plan>>({ status: "idle", items: [] });
  const [planTry, setPlanTry] = useState(0);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Load<Hit>>({ status: "idle", items: [] });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (extra !== "plan" || plans.status === "done") return;
    let alive = true;
    setPlans({ status: "loading", items: [] }); // eslint-disable-line react-hooks/set-state-in-effect -- 처음 열 때 한 번
    fetch("/api/meal-plans?include=grid")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (alive) setPlans({ status: "done", items: d.plans || [] }); })
      .catch((e) => { console.error("[composer] 식단 불러오기", e); if (alive) setPlans({ status: "error", items: [] }); });
    return () => { alive = false; };
  }, [extra, plans.status, planTry]);

  // 제품 찾기 — 마지막에 입력한 것만 결과를 바꾼다
  const search = useCallback((v: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) { setHits({ status: "idle", items: [] }); return; }
    timer.current = setTimeout(() => {
      const my = ++seq.current;
      setHits((h) => ({ ...h, status: "loading" }));
      fetch(`/api/products?q=${encodeURIComponent(v.trim())}&limit=5&sort=name`)
        .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (my === seq.current) setHits({ status: "done", items: (d.products || []).map((p: Hit) => ({ id: p.id, name: p.name })) }); })
        .catch((e) => { console.error("[composer] 제품 찾기", e); if (my === seq.current) setHits({ status: "error", items: [] }); });
    }, 300);
  }, []);

  const pollFilled = [...new Set(w.pollOpts.map((o) => o.trim()).filter(Boolean))];
  const pollReady = !w.pollOn || (pollFilled.length >= 2 && w.content.trim().length > 0);

  return (
    <div className="flex flex-col gap-6">
      <Field label="내용">
        <Textarea value={w.content} name="content" rows={3} maxLength={1000} onChange={(e) => set({ content: e.target.value })}
          placeholder={w.pollOn ? "무엇을 물어볼까요? (예: 점심 도시락 뭐가 나아요?)" : "오늘 끼니 이야기, 꿀팁, 궁금한 점을 적어 보세요"} />
      </Field>

      {w.pollOn && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-label font-medium text-ink mb-2">투표 선택지</legend>
          {w.pollOpts.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={o} name={`poll_option_${i + 1}`} maxLength={POLL_OPTION_MAX} aria-label={`선택지 ${i + 1}`} placeholder={`선택지 ${i + 1}`}
                onChange={(e) => set({ pollOpts: w.pollOpts.map((x, j) => (j === i ? e.target.value : x)) })} />
              {w.pollOpts.length > 2 && <IconButton icon="close" size="sm" label={`선택지 ${i + 1} 빼기`} onClick={() => set({ pollOpts: w.pollOpts.filter((_, j) => j !== i) })} />}
            </div>
          ))}
          {w.pollOpts.length < POLL_MAX_OPTIONS && <Button size="sm" variant="ghost" icon="plus" className="self-start" onClick={() => set({ pollOpts: [...w.pollOpts, ""] })}>선택지 더하기</Button>}
          <div className="flex items-center gap-2">
            <span className="text-label text-ink-2 shrink-0">기간</span>
            <ChipRow>{POLL_DAYS.map((d) => <Chip key={d} size="sm" selected={w.pollDays === d} onClick={() => set({ pollDays: d })}>{`${d}일`}</Chip>)}</ChipRow>
          </div>
          {!pollReady && <p className="text-caption text-ink-2">{w.content.trim() ? "서로 다른 선택지를 2개 이상 적어 주세요" : "위 내용 칸에 질문을 적어 주세요"}</p>}
        </fieldset>
      )}

      {/* 붙인 것 */}
      {(w.plan || w.products.length > 0 || w.people.length > 0 || source) && (
        <div className="flex flex-col gap-2">
          {w.plan && <ListRow leading={<Icon name="calendar" size={18} className="text-ink-2" />} title={w.plan.title} meta={`${w.plan.filled_days.length}일`}
            trailing={<Button size="sm" variant="ghost" onClick={() => set({ plan: null })}>빼기</Button>} />}
          {source && <ListRow leading={<Icon name="copy" size={18} className="text-ink-2" />} title={`따라 한 원본 · ${source.nickname} 님의 글`}
            trailing={<Button size="sm" variant="ghost" onClick={onDropSource}>빼기</Button>} />}
          {w.people.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap gap-1.5">
                {w.people.map((p) => (
                  <Chip key={p.id} size="sm" selected aria-label={`${p.nickname} 태그 빼기`} onClick={() => set({ people: w.people.filter((x) => x.id !== p.id) })}>
                    <Icon name="user" size={14} /><span className="max-w-40 truncate">{p.nickname}</span><Icon name="close" size={14} />
                  </Chip>
                ))}
              </div>
              {w.people.some((p) => p.pending) && <p className="text-caption text-ink-2">{w.people.filter((p) => p.pending).map((p) => p.nickname).join(", ")} 님은 승인하면 글에 보여요</p>}
            </div>
          )}
          {w.products.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {w.products.map((p) => (
                <Chip key={p.id} size="sm" selected aria-label={`${p.name} 태그 빼기`} onClick={() => set({ products: w.products.filter((x) => x.id !== p.id) })}>
                  <Icon name="tag" size={14} /><span className="max-w-48 truncate">{p.name}</span><Icon name="close" size={14} />
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-label font-medium text-ink">붙이기</span>
        <ChipRow>
          <Chip selected={tagOpen} onClick={() => setTagOpen(true)}><Icon name="user" size={16} />사람 태그{w.people.length > 0 && <span className="num">{w.people.length}</span>}</Chip>
          <Chip selected={extra === "product"} onClick={() => setExtra(extra === "product" ? null : "product")}><Icon name="tag" size={16} />제품 태그</Chip>
          <Chip selected={w.pollOn} onClick={() => set({ pollOn: !w.pollOn })}><Icon name="poll" size={16} />투표</Chip>
          <Chip selected={extra === "plan"} onClick={() => setExtra(extra === "plan" ? null : "plan")}><Icon name="calendar" size={16} />저장한 식단</Chip>
        </ChipRow>
        <PeopleTagSheet open={tagOpen} onClose={() => setTagOpen(false)} chosen={w.people}
          onAdd={(p) => set({ people: w.people.some((x) => x.id === p.id) ? w.people : [...w.people, p] })} />
      </div>

      {extra === "plan" && (
        <div className="flex flex-col gap-2">
          {plans.status === "loading" && <SkeletonList rows={2} thumb={false} />}
          {plans.status === "error" && (
            <Notice tone="danger" title="식단을 불러오지 못했어요">
              <Button size="sm" variant="secondary" icon="refresh" onClick={() => { setPlans({ status: "idle", items: [] }); setPlanTry((n) => n + 1); }}>다시 불러오기</Button>
            </Notice>
          )}
          {plans.status === "done" && plans.items.length === 0 && <p className="text-label text-ink-2">저장한 식단이 없어요. 식단 탭에서 일주일 식단을 만들어 보세요</p>}
          {plans.status === "done" && plans.items.map((p) => (
            <ListRow key={p.id} onClick={() => set({ plan: w.plan?.id === p.id ? null : p })} title={p.title}
              meta={<><span className="num">{p.filled_days.length}</span>일{p.avg_daily_calories ? <> · 하루 평균 <span className="num">{Math.round(p.avg_daily_calories).toLocaleString("ko-KR")}</span>kcal</> : null}</>}
              trailing={w.plan?.id === p.id ? <Icon name="check" size={18} className="text-brand-ink" /> : null} />
          ))}
        </div>
      )}

      {extra === "product" && (
        <div className="flex flex-col gap-2">
          <Field label="먹은 제품 찾기" hint="3개까지 붙일 수 있어요. 누르면 제품 페이지로 가요">
            <Input value={q} name="product_query" placeholder="제품 이름 (예: 닭가슴살)" disabled={w.products.length >= 3}
              onChange={(e) => { setQ(e.target.value); search(e.target.value); }} />
          </Field>
          {hits.status === "loading" && <SkeletonList rows={2} thumb={false} />}
          {hits.status === "error" && <p className="text-caption text-danger">제품을 찾지 못했어요. 다시 입력해 주세요</p>}
          {hits.status === "done" && hits.items.length === 0 && <p className="text-caption text-ink-2">맞는 제품이 없어요. 다른 이름으로 찾아보세요</p>}
          {hits.status === "done" && hits.items.map((h) => {
            const on = w.products.some((p) => p.id === h.id);
            return <ListRow key={h.id} title={h.name} onClick={on || w.products.length >= 3 ? undefined : () => set({ products: [...w.products, h] })}
              trailing={<Icon name={on ? "check" : "plus"} size={16} className="text-ink-2" />} />;
          })}
        </div>
      )}

      <Field label="올릴 모임" hint="모임을 고르면 그 모임 보기에도 나와요. 건강 관심사는 글에 붙지 않아요">
        <Select name="topic" value={w.topic} onChange={(e) => set({ topic: e.target.value })}>
          <option value="">모임 없이</option>
          {COMMUNITY_TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </Field>

      <div className="flex flex-col gap-2">
        <span className="text-label font-medium text-ink">공개 범위</span>
        <ChoiceList<Visibility> label="공개 범위" value={w.visibility} onChange={(v) => set({ visibility: v })}
          options={[
            { value: "public", label: <span className="flex flex-col"><span>{VISIBILITY_LABEL.public}</span><span className="text-caption text-ink-2">누구나 볼 수 있어요</span></span> },
            { value: "followers", label: <span className="flex flex-col"><span>{VISIBILITY_LABEL.followers}</span><span className="text-caption text-ink-2">나를 팔로우하는 사람과 태그한 사람만 봐요 · 스토리에 올릴 수 없어요</span></span> },
          ]} />
        {hasMeal && <Checkbox checked={w.showKcal} onChange={(e) => set({ showKcal: e.target.checked })} label="식단 열량 보이기" name="show_kcal" />}
      </div>
    </div>
  );
}

export function pollOf(w: WriteState) {
  const filled = [...new Set(w.pollOpts.map((o) => o.trim()).filter(Boolean))];
  return { filled, ready: !w.pollOn || (filled.length >= 2 && w.content.trim().length > 0) };
}
