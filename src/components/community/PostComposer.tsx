"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button, Chip, ChipRow, Field, Icon, Input, Kcal, Select, Sheet, SkeletonList, Textarea, cn, useToast,
} from "@/components/ui";
import { COMMUNITY_TOPICS } from "@/lib/community-topics";

/**
 * 글쓰기 시트 — 글 + 붙이기(사진 · 기록한 끼니 · 저장한 식단 · 제품 태그) + 모임.
 * 사진은 /api/community/upload 가 위치 정보 같은 메타데이터를 지우고 줄여서 올린다.
 * 작성자 건강 관심사는 붙이지 않는다 (서버도 받지 않음).
 */
export type Attach = "meal" | "plan" | "product";

type DiaryEntry = { id: string; food_name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; meal_type: string };
type Plan = { id: string; title: string; avg_daily_calories: number | null; avg_daily_protein: number | null; filled_days: string[]; grid: Record<string, Record<string, { calories?: number } | null>> };
type Hit = { id: string; name: string };

const MEAL_TYPES = [
  { key: "breakfast", label: "아침" }, { key: "lunch", label: "점심" }, { key: "dinner", label: "저녁" }, { key: "snack", label: "간식" },
];
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function lastDays(n = 7) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.now() - i * 86400e3);
    const iso = d.toISOString().slice(0, 10); // 식단 기록 화면과 같은 날짜 기준
    return { iso, label: i === 0 ? "오늘" : i === 1 ? "어제" : `${d.getMonth() + 1}/${d.getDate()}` };
  });
}

type Load<T> = { status: "idle" | "loading" | "error" | "done"; items: T[] };

export default function PostComposer({ isOpen, initialAttach, nickname, onClose, onPosted }: {
  isOpen: boolean;
  initialAttach?: Attach | null;
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
  // 사진 한 장
  const [photo, setPhoto] = useState<{ status: "idle" | "uploading" | "done"; url?: string; preview?: string }>({ status: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);

  const pickPhoto = async (picked: File | undefined) => {
    if (!picked) return;
    // 서버로 보낼 수 있는 크기(약 4MB)를 넘으면 브라우저에서 먼저 줄인다
    let file: Blob = picked;
    if (picked.size > 3.5 * 1024 * 1024) {
      try {
        const bmp = await createImageBitmap(picked, { imageOrientation: "from-image" });
        const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
        canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
        file = await new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("줄이지 못했어요"))), "image/jpeg", 0.85));
      } catch {
        toast.show("사진이 너무 커요. 더 작은 사진으로 해 주세요", { tone: "danger" });
        return;
      }
      if (file.size > 4 * 1024 * 1024) { toast.show("사진이 너무 커요. 더 작은 사진으로 해 주세요", { tone: "danger" }); return; }
    }
    const preview = URL.createObjectURL(file);
    setPhoto({ status: "uploading", preview });
    try {
      const fd = new FormData();
      fd.append("file", file, "photo");
      const r = await fetch("/api/community/upload", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error);
      setPhoto({ status: "done", url: d.url, preview });
    } catch (e) {
      URL.revokeObjectURL(preview);
      setPhoto({ status: "idle" });
      toast.show(e instanceof Error && e.message ? e.message : "사진을 올리지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  // 글에 쓰지 않은 사진은 저장소에서도 지운다 (올린 뒤 빼거나 글쓰기를 취소했을 때)
  const dropPhoto = (discardUpload = true) => {
    if (photo.preview) URL.revokeObjectURL(photo.preview);
    if (discardUpload && photo.url) {
      fetch("/api/community/upload", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: photo.url }) })
        .catch(() => {}); // ds-allow: 정리는 보조 — 남아도 글에는 안 나온다
    }
    setPhoto({ status: "idle" });
  };

  // 시트를 열 때 고른 붙이기로 시작
  const [lastOpen, setLastOpen] = useState(false);
  if (isOpen !== lastOpen) {
    setLastOpen(isOpen);
    if (isOpen) {
      const d = lastDays();
      setDays(d);
      setDay(d[0].iso);
      setAttach(initialAttach ?? null);
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
    setContent(""); setAttach(null); setTopic(""); setPicked([]); setPlan(null); setProducts([]); setQ(""); dropPhoto(!posted);
    setHits({ status: "idle", items: [] }); if (days[0]) setDay(days[0].iso);
  };
  const close = () => { reset(); onClose(); };

  const togglePick = (e: DiaryEntry) => {
    const next = picked.some((m) => m.id === e.id) ? picked.filter((m) => m.id !== e.id) : [...picked, e];
    setPicked(next);
    if (next.length === 1) setMealType(next[0].meal_type === "supplement" ? "snack" : next[0].meal_type || mealType);
  };

  const hasMeal = picked.length > 0;
  const canPost = !posting && photo.status !== "uploading" && (content.trim().length > 0 || hasMeal || !!plan || !!photo.url);

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
          image_url: photo.url ?? null,
          topic: topic || null,
          author_nickname: nickname,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error);
      toast.show("올렸어요");
      reset(true);
      onPosted();
      onClose();
    } catch {
      toast.show("올리지 못했어요. 다시 시도해 주세요", { tone: "danger" });
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
            placeholder="오늘 뭐 먹었는지, 궁금한 점, 꿀팁을 나눠 보세요" />
        </Field>

        {/* 붙인 것 */}
        {(hasMeal || plan || products.length > 0 || photo.status !== "idle") && (
          <div className="flex flex-col gap-2">
            {photo.status !== "idle" && (
              <div className="relative self-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.preview} alt="붙인 사진" className={cn("h-32 w-auto max-w-full rounded-md border border-line object-cover", photo.status === "uploading" && "opacity-50")} />
                {photo.status === "uploading"
                  ? <p className="text-caption text-ink-2 mt-1">사진을 올리고 있어요</p>
                  : <Button size="sm" variant="ghost" className="mt-1 -ml-2" onClick={() => dropPhoto()}>사진 빼기</Button>}
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
            <Chip disabled={photo.status !== "idle"} onClick={() => fileRef.current?.click()}>
              <Icon name="camera" size={16} />사진
            </Chip>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" tabIndex={-1} aria-hidden="true"
              name="photo" onChange={(e) => pickPhoto(e.target.files?.[0])} />
            {([["meal", "notebook", "기록한 끼니"], ["plan", "calendar", "저장한 식단"], ["product", "tag", "제품 태그"]] as const).map(([k, icon, label]) => (
              <Chip key={k} selected={attach === k} onClick={() => setAttach(attach === k ? null : k)}>
                <Icon name={icon} size={16} />{label}
              </Chip>
            ))}
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
