"use client";

import { useEffect, useState } from "react";
import { Button, Checkbox, Chip, ChipRow, Kcal, ListRow, Notice, SectionHeader, SkeletonList, TextLink, useToast } from "@/components/ui";
import { addDays, monthDay, todayKst } from "@/lib/day";

/**
 * 글쓰기 2단계 — 무엇을 먹었나.
 *  - 끼니·날짜를 고르면 그 끼니에 기록한 음식이 나온다 → 체크해서 글에 붙인다(영양값은 서버가 기록에서 가져온다)
 *  - 사진으로 음식 찾기: 대표 사진으로 후보를 받아 바로 식단에 기록하고 붙인다('사진으로 기록'으로 센다)
 *  - 챌린지 인증: 오늘 글이면 하고 있는 사진 인증 챌린지가 줄로 나온다 — 체크하면 이 글의 사진으로 인증
 */
export type DiaryEntry = { id: string; food_name: string; calories: number | null; meal_type: string };
export type ProofChallenge = { id: string; title: string; state: string };

export const MEAL_TYPES = [
  { key: "breakfast", label: "아침" }, { key: "lunch", label: "점심" }, { key: "dinner", label: "저녁" }, { key: "snack", label: "간식" },
] as const;

export function lastDays(n = 7) {
  const today = todayKst();
  return Array.from({ length: n }, (_, i) => {
    const iso = addDays(today, -i);
    const md = monthDay(iso);
    return { iso, label: i === 0 ? "오늘" : i === 1 ? "어제" : `${md.month}/${md.date}` };
  });
}

type Load<T> = { status: "loading" | "error" | "done"; items: T[] };
type Cand = { key: string; name: string; meta: string; body: Record<string, unknown> };

const STATE_LINE: Record<string, string> = {
  done: "오늘 인증했어요 · 사진을 더 붙여도 돼요",
  photo_needed: "식단 기준은 채웠어요 · 사진을 올리면 인증돼요",
  today: "오늘 아직이에요",
};

async function dataUrl(blob: Blob, max = 800) {
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}

export default function MealStep({ day, setDay, days, mealType, setMealType, linked, setLinked, photo, challenges, picked, setPicked }: {
  day: string; setDay: (d: string) => void; days: { iso: string; label: string }[];
  mealType: string; setMealType: (m: string) => void;
  linked: string[]; setLinked: (ids: string[]) => void;
  /** 대표 사진 — 사진으로 음식 찾기에 쓴다 (이어 쓰기로 불러온 사진은 원본이 없어 못 쓴다) */
  photo: Blob | null;
  challenges: Load<ProofChallenge>;
  picked: string[]; setPicked: (ids: string[]) => void;
}) {
  const toast = useToast();
  const [entries, setEntries] = useState<Load<DiaryEntry>>({ status: "loading", items: [] });
  const [reload, setReload] = useState(0);
  const [cands, setCands] = useState<{ status: "idle" | "loading" | "error" | "done"; items: Cand[]; error?: string }>({ status: "idle", items: [] });
  const [adding, setAdding] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setEntries({ status: "loading", items: [] }); // eslint-disable-line react-hooks/set-state-in-effect -- 날짜를 바꿀 때마다 다시 불러온다
    fetch(`/api/diary?date=${day}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (alive) setEntries({ status: "done", items: d.entries || [] }); })
      .catch((e) => { console.error("[composer] 기록 불러오기", e); if (alive) setEntries({ status: "error", items: [] }); });
    return () => { alive = false; };
  }, [day, reload]);

  const here = entries.items.filter((e) => (e.meal_type === "supplement" ? "snack" : e.meal_type) === mealType);
  const toggle = (id: string) => setLinked(linked.includes(id) ? linked.filter((x) => x !== id) : [...linked, id]);
  // 끼니·날짜를 바꾸면 다른 끼니에서 고른 기록은 뺀다 (한 끼니만 붙인다)
  const pickMeal = (m: string) => { setMealType(m); setLinked([]); };
  const pickDay = (d: string) => { setDay(d); setLinked([]); };

  const find = async () => {
    if (!photo) return;
    setCands({ status: "loading", items: [] });
    try {
      const image = await dataUrl(photo);
      const r = await fetch("/api/diary/photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "사진을 분석하지 못했어요");
      if (d.configured === false) { setCands({ status: "error", items: [], error: "사진으로 찾기를 쓸 수 없어요. 식단 기록에서 검색해 더해 주세요" }); return; }
      setToken(d.photo_token || null);
      type CF = { id: string; name: string; serving_desc?: string; serving_size_g?: number; calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; sodium_mg: number | null; sugar_g?: number | null };
      type PR = { id: string; name: string; brand?: string; calories: number | null };
      const items: Cand[] = [
        ...((d.matched?.commonFoods || []) as CF[]).slice(0, 5).map((f) => ({
          key: `f-${f.id}`, name: f.name, meta: [f.serving_desc, f.calories != null ? `${Math.round(f.calories)}kcal` : null].filter(Boolean).join(" · "),
          body: { food_name: f.name, serving_g: f.serving_size_g || 100, calories: f.calories, protein_g: f.protein_g, carbs_g: f.carbs_g, fat_g: f.fat_g, sodium_mg: f.sodium_mg, sugar_g: f.sugar_g ?? null },
        })),
        ...((d.matched?.products || []) as PR[]).slice(0, 3).map((p) => ({
          key: `p-${p.id}`, name: p.name, meta: [p.brand, p.calories != null ? `${Math.round(p.calories)}kcal` : null].filter(Boolean).join(" · "),
          body: { product_id: p.id, food_name: p.name },
        })),
      ];
      setCands({ status: "done", items });
    } catch (e) {
      setCands({ status: "error", items: [], error: e instanceof Error && e.message ? `${e.message}. 다시 시도해 주세요` : "사진을 분석하지 못했어요. 다시 시도해 주세요" });
    }
  };

  const record = async (c: Cand) => {
    setAdding(c.key);
    try {
      const r = await fetch("/api/diary", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: day, meal_type: mealType, serving_multiplier: 1, ...c.body, ...(token ? { photo_token: token } : {}) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.id) throw new Error(d.error);
      setLinked([...linked, d.id]);
      setCands((x) => ({ ...x, items: x.items.filter((i) => i.key !== c.key) }));
      setReload((n) => n + 1);
      toast.show(`${c.name}을(를) 식단에 기록했어요`);
    } catch (e) {
      toast.show(e instanceof Error && e.message ? e.message : "기록하지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally { setAdding(null); }
  };

  const today = todayKst();
  // 오늘 글일 때만 — 하고 있는 사진 인증 챌린지가 없으면 줄을 그리지 않는다
  const showProof = day === today && (challenges.status !== "done" || challenges.items.length > 0);
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-label="끼니">
        <ChipRow>{MEAL_TYPES.map((m) => <Chip key={m.key} selected={mealType === m.key} onClick={() => pickMeal(m.key)}>{m.label}</Chip>)}</ChipRow>
        <ChipRow>{days.map((d) => <Chip key={d.iso} size="sm" selected={day === d.iso} onClick={() => pickDay(d.iso)}>{d.label}</Chip>)}</ChipRow>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader title="기록한 음식" />
        {entries.status === "loading" && <SkeletonList rows={2} thumb={false} />}
        {entries.status === "error" && (
          <Notice tone="danger" title="기록을 불러오지 못했어요">
            <Button size="sm" variant="secondary" icon="refresh" onClick={() => setReload((n) => n + 1)}>다시 불러오기</Button>
          </Notice>
        )}
        {entries.status === "done" && here.length === 0 && (
          <p className="text-label text-ink-2">이 끼니에 기록한 음식이 없어요. 사진으로 찾거나 그냥 넘어가도 돼요</p>
        )}
        {entries.status === "done" && here.map((e) => (
          <Checkbox key={e.id} checked={linked.includes(e.id)} onChange={() => toggle(e.id)} className="w-full"
            label={<span className="flex flex-1 min-w-0 items-center justify-between gap-2"><span className="truncate">{e.food_name}</span>{e.calories != null && <Kcal value={e.calories} className="text-caption shrink-0" />}</span>} />
        ))}
        {photo && cands.status === "idle" && (
          <Button size="sm" variant="secondary" icon="camera" className="self-start" onClick={find}>사진으로 음식 찾기</Button>
        )}
        {cands.status === "loading" && <SkeletonList rows={2} thumb={false} />}
        {cands.status === "error" && (
          <Notice tone="danger" title={cands.error}>
            <Button size="sm" variant="secondary" icon="refresh" onClick={find}>다시 찾기</Button>
          </Notice>
        )}
        {cands.status === "done" && cands.items.length === 0 && <p className="text-label text-ink-2">맞는 음식을 찾지 못했어요. 식단 기록에서 검색해 더해 주세요</p>}
        {cands.status === "done" && cands.items.length > 0 && (
          <div className="flex flex-col">
            <p className="text-caption text-ink-2">사진에서 찾은 음식 — 기록하면 이 글에 붙어요</p>
            {cands.items.map((c) => (
              <ListRow key={c.key} title={c.name} meta={c.meta}
                trailing={<Button size="sm" variant="secondary" loading={adding === c.key} disabled={!!adding} onClick={() => record(c)}>기록하기</Button>} />
            ))}
          </div>
        )}
        <TextLink href={`/diary?date=${day}`} className="self-start text-label">식단 기록에서 검색해 더하기</TextLink>
      </section>

      {showProof && (
        <section className="flex flex-col gap-2">
          <SectionHeader title="챌린지 인증" />
          {challenges.status === "loading" && <SkeletonList rows={1} thumb={false} />}
          {challenges.status === "error" && <p className="text-label text-danger">하고 있는 챌린지를 불러오지 못했어요. 인증 없이 올라가요</p>}
          {challenges.status === "done" && challenges.items.map((c) => (
            <Checkbox key={c.id} checked={picked.includes(c.id)} onChange={() => setPicked(picked.includes(c.id) ? picked.filter((x) => x !== c.id) : [...picked, c.id])}
              className="w-full"
              label={<span className="flex flex-col min-w-0"><span className="truncate">{c.title}</span><span className="text-caption text-ink-2">{STATE_LINE[c.state] || "오늘 인증할 수 있어요"}</span></span>} />
          ))}
          {challenges.status === "done" && <p className="text-caption text-ink-2">오늘 밤 12시까지 올린 사진만 인증돼요. 사진 없이 올리면 인증되지 않아요</p>}
        </section>
      )}
    </div>
  );
}
