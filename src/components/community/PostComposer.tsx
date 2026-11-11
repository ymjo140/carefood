"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addDays, monthDay, todayKst } from "@/lib/day";
import {
  Button, Chip, ChipRow, IconButton, Field, Icon, Input, Kcal, Select, Sheet, SkeletonList, Textarea, cn, useToast,
} from "@/components/ui";
import { COMMUNITY_TOPICS } from "@/lib/community-topics";
import { POLL_DAYS, POLL_MAX_OPTIONS, POLL_OPTION_MAX } from "@/lib/community-poll";

/**
 * 글쓰기 시트 — 글 + 붙이기(사진 4장 · 기록한 끼니 · 저장한 식단 · 제품 태그 · 투표) + 모임.
 * 사진은 /api/community/upload 가 위치 정보 같은 메타데이터를 지우고 줄여서 올린다.
 * 작성자 건강 관심사는 붙이지 않는다 (서버도 받지 않음).
 */
export type Attach = "meal" | "plan" | "product" | "poll";

type DiaryEntry = { id: string; food_name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; meal_type: string };
type Plan = { id: string; title: string; avg_daily_calories: number | null; avg_daily_protein: number | null; filled_days: string[]; grid: Record<string, Record<string, { calories?: number } | null>> };
type Hit = { id: string; name: string };

const MEAL_TYPES = [
  { key: "breakfast", label: "아침" }, { key: "lunch", label: "점심" }, { key: "dinner", label: "저녁" }, { key: "snack", label: "간식" },
];
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function lastDays(n = 7) {
  const today = todayKst();
  return Array.from({ length: n }, (_, i) => {
    const iso = addDays(today, -i); // 식단 기록 화면과 같은 한국 날짜
    const md = monthDay(iso);
    return { iso, label: i === 0 ? "오늘" : i === 1 ? "어제" : `${md.month}/${md.date}` };
  });
}

type Load<T> = { status: "idle" | "loading" | "error" | "done"; items: T[] };

/** 기록·식단 리스트에서 '나누기'로 열 때 미리 고를 것 — 그 날짜·끼니의 기록, 또는 그 식단 */
export type ComposerPreset = { day?: string; meal?: string; planId?: string };

export default function PostComposer({ isOpen, initialAttach, preset, nickname, onClose, onPosted }: {
  isOpen: boolean;
  initialAttach?: Attach | null;
  preset?: ComposerPreset | null;
  nickname: string;
  onClose: () => void;
  onPosted: () => void;
}) {
  const toast = useToast();
  const [content, setContent] = useState("");
  const [attach, setAttach] = useState<Attach | null>(null);
  const [topic, setTopic] = useState("");
  const [posting, setPosting] = useState(false);

  // 기록한 끼니
  // 날짜는 시트를 열 때 정한다 (미리 그릴 때 시계를 읽지 않게)
  const [days, setDays] = useState<{ iso: string; label: string }[]>([]);
  const [day, setDay] = useState("");
  const [entries, setEntries] = useState<Load<DiaryEntry>>({ status: "idle", items: [] });
  const [picked, setPicked] = useState<DiaryEntry[]>([]);
  const [mealType, setMealType] = useState("lunch");
  // 저장한 식단
  const [plans, setPlans] = useState<Load<Plan>>({ status: "idle", items: [] });
  const [plan, setPlan] = useState<Plan | null>(null);
  // 제품
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Load<Hit>>({ status: "idle", items: [] });
  const [products, setProducts] = useState<Hit[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [retry, setRetry] = useState(0);
  // 사진 4장까지
  type Photo = { key: string; status: "uploading" | "done"; url?: string; preview: string };
  const MAX_PHOTOS = 4;
  const [photos, setPhotos] = useState<Photo[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  // 투표 — 내용이 질문, 선택지 2~4개
  const [pollOn, setPollOn] = useState(false);
  const [pollOpts, setPollOpts] = useState<string[]>(["", ""]);
  const [pollDays, setPollDays] = useState<number>(3);

  // 서버로 보낼 수 있는 크기(약 4MB)를 넘으면 브라우저에서 먼저 줄인다
  const shrink = async (picked: File): Promise<Blob | null> => {
    if (picked.size <= 3.5 * 1024 * 1024) return picked;
    try {
      const bmp = await createImageBitmap(picked, { imageOrientation: "from-image" });
      const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const out = await new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("줄이지 못했어요"))), "image/jpeg", 0.85));
      return out.size > 4 * 1024 * 1024 ? null : out;
    } catch {
      return null;
    }
  };

  const pickPhotos = async (list: FileList | null) => {
    const files = Array.from(list || []);
    if (fileRef.current) fileRef.current.value = "";
    if (!files.length) return;
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) toast.show(`사진은 ${MAX_PHOTOS}장까지 붙일 수 있어요. 앞의 ${Math.max(0, room)}장만 붙였어요`);
    // 한 장씩 차례로 올린다 (요청 크기 한도·느린 연결 대비)
    for (const picked of files.slice(0, Math.max(0, room))) {
      const blob = await shrink(picked);
      if (!blob) { toast.show("사진이 너무 커요. 더 작은 사진으로 해 주세요", { tone: "danger" }); continue; }
      const key = crypto.randomUUID();
      const preview = URL.createObjectURL(blob);
      setPhotos((cur) => [...cur, { key, status: "uploading", preview }]);
      try {
        const fd = new FormData();
        fd.append("file", blob, "photo");
        const r = await fetch("/api/community/upload", { method: "POST", body: fd });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error);
        setPhotos((cur) => cur.map((p) => (p.key === key ? { ...p, status: "done", url: d.url } : p)));
      } catch (e) {
        URL.revokeObjectURL(preview);
        setPhotos((cur) => cur.filter((p) => p.key !== key));
        toast.show(e instanceof Error && e.message ? e.message : "사진을 올리지 못했어요. 다시 시도해 주세요", { tone: "danger" });
      }
    }
  };

  // 글에 쓰지 않은 사진은 저장소에서도 지운다 (올린 뒤 빼거나 글쓰기를 취소했을 때)
  const discard = (url?: string) => {
    if (!url) return;
    fetch("/api/community/upload", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) })
      .catch(() => {}); // ds-allow: 정리는 보조 — 남아도 글에는 안 나온다
  };
  const dropPhoto = (key: string) => {
    const p = photos.find((x) => x.key === key);
    if (!p) return;
    URL.revokeObjectURL(p.preview);
    discard(p.url);
    setPhotos((cur) => cur.filter((x) => x.key !== key));
  };
  const dropAllPhotos = (discardUploads: boolean) => {
    for (const p of photos) { URL.revokeObjectURL(p.preview); if (discardUploads) discard(p.url); }
    setPhotos([]);
  };

  // 시트를 열 때 고른 붙이기로 시작
  const [lastOpen, setLastOpen] = useState(false);
  const [pending, setPending] = useState<ComposerPreset | null>(null);
  if (isOpen !== lastOpen) {
    setLastOpen(isOpen);
    if (isOpen) {
      const d = lastDays();
      setDays(d);
      setDay(preset?.day && d.some((x) => x.iso === preset.day) ? preset.day : d[0].iso);
      setPending(preset ?? null);
      setEntries({ status: "idle", items: [] }); // 지난번 연 날짜의 목록으로 미리 고르지 않게
      setAttach(initialAttach === "poll" ? null : initialAttach ?? null);
      if (initialAttach === "poll") setPollOn(true);
    }
  }

  useEffect(() => {
    if (!isOpen || attach !== "meal" || !day) return;
    let alive = true;
    setEntries({ status: "loading", items: [] }); // eslint-disable-line react-hooks/set-state-in-effect -- 날짜를 바꿀 때마다 다시 불러온다
    fetch(`/api/diary?date=${day}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (alive) setEntries({ status: "done", items: d.entries || [] }); })
      .catch(() => { if (alive) setEntries({ status: "error", items: [] }); });
    return () => { alive = false; };
  }, [isOpen, attach, day, retry]);

  // 미리 고를 것 — 목록이 오면 한 번만 적용
  if (pending?.meal && entries.status === "done") {
    const hit = entries.items.filter((e) => e.meal_type === pending.meal);
    setPending(null);
    if (hit.length) { setPicked(hit); setMealType(pending.meal === "supplement" ? "snack" : pending.meal); }
  }
  if (pending?.planId && plans.status === "done") {
    const hit = plans.items.find((x) => x.id === pending.planId);
    setPending(null);
    if (hit) { setPlan(hit); setPicked([]); }
  }

  useEffect(() => {
    if (!isOpen || attach !== "plan" || plans.status === "done") return;
    let alive = true;
    setPlans({ status: "loading", items: [] }); // eslint-disable-line react-hooks/set-state-in-effect -- 처음 열 때 한 번
    fetch("/api/meal-plans?include=grid")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (alive) setPlans({ status: "done", items: d.plans || [] }); })
      .catch(() => { if (alive) setPlans({ status: "error", items: [] }); });
    return () => { alive = false; };
  }, [isOpen, attach, plans.status, retry]);

  const search = useCallback((v: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) { setHits({ status: "idle", items: [] }); return; }
    timer.current = setTimeout(() => {
      setHits((h) => ({ ...h, status: "loading" }));
      fetch(`/api/products?q=${encodeURIComponent(v.trim())}&limit=5&sort=name`)
        .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setHits({ status: "done", items: (d.products || []).map((p: Hit) => ({ id: p.id, name: p.name })) }); })
        .catch(() => setHits({ status: "error", items: [] }));
    }, 300);
  }, []);

  const reset = (posted = false) => {
    setContent(""); setAttach(null); setTopic(""); setPicked([]); setPlan(null); setProducts([]); setQ(""); dropAllPhotos(!posted);
    setPollOn(false); setPollOpts(["", ""]); setPollDays(3);
    setHits({ status: "idle", items: [] }); if (days[0]) setDay(days[0].iso);
  };
  const close = () => { reset(); onClose(); };

  const togglePick = (e: DiaryEntry) => {
    const next = picked.some((m) => m.id === e.id) ? picked.filter((m) => m.id !== e.id) : [...picked, e];
    setPicked(next);
    if (next.length === 1) setMealType(next[0].meal_type === "supplement" ? "snack" : next[0].meal_type || mealType);
  };

  const hasMeal = picked.length > 0;
  const uploading = photos.some((p) => p.status === "uploading");
  const photoUrls = photos.filter((p) => p.url).map((p) => p.url!);
  const pollFilled = [...new Set(pollOpts.map((o) => o.trim()).filter(Boolean))];
  const pollReady = !pollOn || (pollFilled.length >= 2 && content.trim().length > 0);
  const canPost = !posting && !uploading && pollReady && (content.trim().length > 0 || hasMeal || !!plan || photoUrls.length > 0);

  const submit = async () => {
    setPosting(true);
    try {
      let meal_data: Record<string, unknown> | null = null;
      if (plan) {
        const day_kcal = DAY_KEYS.map((d) => {
          const sum = Object.values(plan.grid?.[d] || {}).reduce((s, c) => s + (c?.calories || 0), 0);
          return sum > 0 ? Math.round(sum) : null;
        });
        meal_data = { plan: { title: plan.title, grid: plan.grid, day_kcal, avg_kcal: plan.avg_daily_calories, avg_protein: plan.avg_daily_protein, days: plan.filled_days.length } };
      } else if (hasMeal) {
        const total = picked.reduce((a, m) => ({
          calories: a.calories + (m.calories || 0), protein_g: a.protein_g + (m.protein_g || 0),
          carbs_g: a.carbs_g + (m.carbs_g || 0), fat_g: a.fat_g + (m.fat_g || 0),
        }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
        meal_data = { foods: picked.map((m) => ({ name: m.food_name, calories: m.calories, protein_g: m.protein_g, carbs_g: m.carbs_g, fat_g: m.fat_g })), total };
      }
      const res = await fetch("/api/community/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_type: meal_data ? "meal" : "daily",
          content: content.trim() || null,
          meal_type: hasMeal && !plan ? mealType : null,
          meal_data,
          product_ids: products.map((p) => p.id),
          image_urls: photoUrls,
          poll: pollOn ? { options: pollFilled, days: pollDays } : null,
          topic: topic || null,
          author_nickname: nickname,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error);
      toast.show(pollOn ? "투표를 올렸어요" : "올렸어요");
      reset(true);
      onPosted();
      onClose();
    } catch (e) {
      const known = ["선택지를 서로 다르게 2개 이상 적어 주세요", "투표 질문을 내용에 적어 주세요"];
      const msg = e instanceof Error ? e.message : "";
      toast.show(known.includes(msg) || msg.startsWith("짧은 시간에") ? msg : "올리지 못했어요. 다시 시도해 주세요", { tone: "danger" }); // 횟수 제한은 언제 다시 하면 되는지까지
    } finally { setPosting(false); }
  };

  return (
    <Sheet open={isOpen} onClose={close} title="새 글"
      footer={
        <>
          <Button variant="secondary" block onClick={close}>취소</Button>
          <Button block onClick={submit} disabled={!canPost} loading={posting}>올리기</Button>
        </>
      }>
      <div className="flex flex-col gap-5">
        <Field label="내용">
          <Textarea value={content} name="content" rows={3} maxLength={1000} onChange={(e) => setContent(e.target.value)}
            placeholder={pollOn ? "무엇을 물어볼까요? (예: 점심 도시락 뭐가 나아요?)" : "오늘 뭐 먹었는지, 궁금한 점, 꿀팁을 나눠 보세요"} />
        </Field>

        {/* ── 투표 ── */}
        {pollOn && (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-label font-medium text-ink mb-2">투표 선택지</legend>
            {pollOpts.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={o} name={`poll_option_${i + 1}`} maxLength={POLL_OPTION_MAX} aria-label={`선택지 ${i + 1}`} placeholder={`선택지 ${i + 1}`}
                  onChange={(e) => setPollOpts(pollOpts.map((x, j) => (j === i ? e.target.value : x)))} />
                {pollOpts.length > 2 && (
                  <IconButton icon="close" size="sm" label={`선택지 ${i + 1} 빼기`} onClick={() => setPollOpts(pollOpts.filter((_, j) => j !== i))} />
                )}
              </div>
            ))}
            {pollOpts.length < POLL_MAX_OPTIONS && (
              <Button size="sm" variant="ghost" icon="plus" className="self-start" onClick={() => setPollOpts([...pollOpts, ""])}>선택지 더하기</Button>
            )}
            <div className="flex items-center gap-2">
              <span className="text-label text-ink-2 shrink-0">기간</span>
              <ChipRow>
                {POLL_DAYS.map((d) => <Chip key={d} size="sm" selected={pollDays === d} onClick={() => setPollDays(d)}>{`${d}일`}</Chip>)}
              </ChipRow>
            </div>
            {!pollReady && (
              <p className="text-caption text-ink-2">{content.trim() ? "서로 다른 선택지를 2개 이상 적어 주세요" : "위 내용 칸에 질문을 적어 주세요"}</p>
            )}
          </fieldset>
        )}

        {/* 붙인 것 */}
        {(hasMeal || plan || products.length > 0 || photos.length > 0) && (
          <div className="flex flex-col gap-2">
            {photos.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="grid grid-cols-4 gap-2">
                  {photos.map((p, i) => (
                    <div key={p.key} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.preview} alt={`붙인 사진 ${i + 1}`} className={cn("aspect-square w-full rounded-md border border-line object-cover", p.status === "uploading" && "opacity-50")} />
                      {p.status === "done" && (
                        <IconButton icon="close" size="sm" tone="secondary" label={`사진 ${i + 1} 빼기`} className="absolute -top-2 -right-2" onClick={() => dropPhoto(p.key)} />
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-caption text-ink-2">
                  {uploading ? "사진을 올리고 있어요" : <>사진 <span className="num">{photos.length}</span> / {MAX_PHOTOS}장 · 위치 같은 촬영 정보는 지우고 올려요</>}
                </p>
              </div>
            )}
            {plan && (
              <div className="flex items-center gap-3 rounded-md bg-sunken px-3 py-2.5">
                <Icon name="calendar" size={18} className="text-ink-2" />
                <span className="flex-1 min-w-0 text-label text-ink truncate">{plan.title} · <span className="num">{plan.filled_days.length}</span>일</span>
                <Button size="sm" variant="ghost" onClick={() => setPlan(null)}>빼기</Button>
              </div>
            )}
            {hasMeal && (
              <div className="flex items-center gap-3 rounded-md bg-sunken px-3 py-2.5">
                <Icon name="notebook" size={18} className="text-ink-2" />
                <span className="flex-1 min-w-0 text-label text-ink truncate">{picked.map((p) => p.food_name).join(" · ")}</span>
                <Button size="sm" variant="ghost" onClick={() => setPicked([])}>빼기</Button>
              </div>
            )}
            {products.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {products.map((p) => (
                  <Chip key={p.id} size="sm" selected aria-label={`${p.name} 태그 빼기`} onClick={() => setProducts(products.filter((x) => x.id !== p.id))}>
                    <Icon name="tag" size={14} /><span className="max-w-[12rem] truncate">{p.name}</span><Icon name="close" size={14} />
                  </Chip>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-label font-medium text-ink">붙이기</span>
          <ChipRow>
            <Chip disabled={photos.length >= MAX_PHOTOS || uploading} onClick={() => fileRef.current?.click()}>
              <Icon name="camera" size={16} />사진{photos.length > 0 && <span className="num">{photos.length}/{MAX_PHOTOS}</span>}
            </Chip>
            <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" tabIndex={-1} aria-hidden="true"
              name="photo" onChange={(e) => pickPhotos(e.target.files)} />
            {([["meal", "notebook", "기록한 끼니"], ["plan", "calendar", "저장한 식단"], ["product", "tag", "제품 태그"]] as const).map(([k, icon, label]) => (
              <Chip key={k} selected={attach === k} onClick={() => setAttach(attach === k ? null : k)}>
                <Icon name={icon} size={16} />{label}
              </Chip>
            ))}
            <Chip selected={pollOn} onClick={() => setPollOn(!pollOn)}>
              <Icon name="poll" size={16} />투표
            </Chip>
          </ChipRow>
        </div>

        {/* ── 기록한 끼니 ── */}
        {attach === "meal" && (
          <div className="flex flex-col gap-2">
            {plan && <p className="text-caption text-ink-2">저장한 식단과 끼니는 하나만 붙일 수 있어요. 끼니를 고르면 식단은 빠져요</p>}
            <ChipRow>
              {days.map((d) => <Chip key={d.iso} size="sm" selected={day === d.iso} onClick={() => setDay(d.iso)}>{d.label}</Chip>)}
            </ChipRow>
            {entries.status === "loading" && <SkeletonList rows={2} thumb={false} />}
            {entries.status === "error" && (
              <div className="flex items-center justify-between gap-2 rounded-md bg-sunken px-3 py-2.5">
                <p className="text-label text-ink-2">기록을 불러오지 못했어요</p>
                <Button size="sm" variant="ghost" icon="refresh" onClick={() => setRetry((n) => n + 1)}>다시 불러오기</Button>
              </div>
            )}
            {entries.status === "done" && entries.items.length === 0 && (
              <p className="text-label text-ink-2 rounded-md bg-sunken px-3 py-4 text-center">이 날 기록한 음식이 없어요</p>
            )}
            {entries.status === "done" && entries.items.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {entries.items.map((e) => {
                  const on = picked.some((m) => m.id === e.id);
                  return (
                    <button key={e.id} type="button" aria-pressed={on}
                      onClick={() => { togglePick(e); if (plan) setPlan(null); }}
                      className={cn("press w-full flex items-center gap-3 rounded-md border px-3 h-12 text-left transition-colors",
                        on ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-line-strong")}>
                      <span className={cn("size-5 rounded-sm border flex items-center justify-center shrink-0", on ? "border-brand bg-brand text-on-brand" : "border-line-strong")}>
                        {on && <Icon name="check" size={14} />}
                      </span>
                      <span className="flex-1 min-w-0 text-label font-medium text-ink truncate">{e.food_name}</span>
                      <Kcal value={e.calories} className="text-caption shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
            {hasMeal && (
              <ChipRow>
                {MEAL_TYPES.map((m) => <Chip key={m.key} size="sm" selected={mealType === m.key} onClick={() => setMealType(m.key)}>{m.label}</Chip>)}
              </ChipRow>
            )}
          </div>
        )}

        {/* ── 저장한 식단 ── */}
        {attach === "plan" && (
          <div className="flex flex-col gap-2">
            {plans.status === "loading" && <SkeletonList rows={2} thumb={false} />}
            {plans.status === "error" && (
              <div className="flex items-center justify-between gap-2 rounded-md bg-sunken px-3 py-2.5">
                <p className="text-label text-ink-2">식단을 불러오지 못했어요</p>
                <Button size="sm" variant="ghost" icon="refresh" onClick={() => { setPlans({ status: "idle", items: [] }); setRetry((n) => n + 1); }}>다시 불러오기</Button>
              </div>
            )}
            {plans.status === "done" && plans.items.length === 0 && (
              <p className="text-label text-ink-2 rounded-md bg-sunken px-3 py-4 text-center">저장한 식단이 없어요. 식단 탭에서 일주일 식단을 만들어 보세요</p>
            )}
            {plans.status === "done" && plans.items.map((p) => {
              const on = plan?.id === p.id;
              return (
                <button key={p.id} type="button" aria-pressed={on}
                  onClick={() => { setPlan(on ? null : p); if (!on) setPicked([]); }}
                  className={cn("press w-full flex items-center gap-3 rounded-md border px-3 min-h-12 py-2 text-left transition-colors",
                    on ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-line-strong")}>
                  <span className="flex-1 min-w-0">
                    <span className="block text-label font-medium text-ink truncate">{p.title}</span>
                    <span className="block text-caption text-ink-2"><span className="num">{p.filled_days.length}</span>일{p.avg_daily_calories ? <> · 하루 평균 <span className="num">{Math.round(p.avg_daily_calories).toLocaleString("ko-KR")}</span>kcal</> : null}</span>
                  </span>
                  {on && <Icon name="check" size={18} className="text-brand-ink" />}
                </button>
              );
            })}
          </div>
        )}

        {/* ── 제품 태그 ── */}
        {attach === "product" && (
          <div className="flex flex-col gap-2">
            <Field label="먹은 제품 찾기" hint="3개까지 붙일 수 있어요. 누르면 제품 페이지로 가요">
              <Input value={q} name="product_query" placeholder="제품 이름 (예: 닭가슴살)" disabled={products.length >= 3}
                onChange={(e) => { setQ(e.target.value); search(e.target.value); }} />
            </Field>
            {hits.status === "loading" && <SkeletonList rows={2} thumb={false} />}
            {hits.status === "error" && <p className="text-caption text-danger">제품을 찾지 못했어요. 다시 입력해 주세요</p>}
            {hits.status === "done" && hits.items.length === 0 && <p className="text-caption text-ink-2">맞는 제품이 없어요. 다른 이름으로 찾아보세요</p>}
            {hits.status === "done" && hits.items.length > 0 && (
              <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
                {hits.items.map((h) => {
                  const on = products.some((p) => p.id === h.id);
                  return (
                    <li key={h.id}>
                      <button type="button" disabled={on || products.length >= 3}
                        onClick={() => setProducts([...products, h])}
                        className="press w-full min-h-11 px-3 py-2 text-left text-label text-ink flex items-center justify-between gap-2 hover:bg-sunken transition-colors disabled:opacity-50">
                        <span className="min-w-0 line-clamp-1">{h.name}</span>
                        <Icon name={on ? "check" : "plus"} size={16} className="text-ink-2 shrink-0" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <Field label="올릴 모임" hint="모임을 고르면 그 모임 보기에도 나와요. 건강 관심사는 글에 붙지 않아요">
          <Select name="topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="">모임 없이</option>
            {COMMUNITY_TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
      </div>
    </Sheet>
  );
}
