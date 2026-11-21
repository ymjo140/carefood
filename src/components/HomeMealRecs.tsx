"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/ui/AppLink";
import { PLATFORM_LABELS } from "@/lib/platforms";
import { Button, Card, EmptyState, Price, ProductImage, SectionHeader, Select, Skeleton, TextLink, Thumb, useToast } from "@/components/ui";
import { defaultMeal, HOME_MEAL_LABEL, HOME_MEALS, hourKst } from "@/lib/home-meal";
import type { MealKey } from "@/lib/menu-pick";

/**
 * 홈 '오늘 ○○ 추천' — 오른쪽 위에서 아침·점심·저녁·간식을 고르면 그 끼니 몫에 맞춘
 *   1) 제품 추천: 그것만으로 한 끼인 메인 제품
 *   2) 식단 추천: 밥 + 국·찌개 + 반찬 한 상 (간식은 없음)
 * 서버: /api/home/meal-recs (규칙: lib/home-meal · lib/next-picks — 식단 탭 'AI 추천'과 같다)
 * 처음 끼니는 지금 시각으로 (lib/home-meal defaultMeal). '담기'는 오늘 그 끼니의 예정으로 — 먹었다는 기록이 아니다.
 * 순서는 영양 기준뿐 — 광고비로 바꾸지 않는다.
 */
type Food = {
  id: string; name: string; manufacturer: string | null; role: string;
  calories: number; protein_g: number; sodium_mg: number | null;
  image_url: string | null; price: number | null; platform: string | null;
};
type Recs = {
  meal: MealKey; budget: { kcal: number; sodiumCap: number };
  products: Food[];
  combos: { foods: Food[]; calories: number; protein_g: number; sodium_mg: number | null }[];
};
const ROLE_SHORT: Record<string, string> = { rice: "밥", soup: "국", side: "반찬" };
const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");

export default function HomeMealRecs() {
  const toast = useToast();
  const [meal, setMeal] = useState<MealKey | null>(null);
  const [recs, setRecs] = useState<Recs | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const req = useRef(0);

  // 처음 끼니는 지금 시각으로 (화면을 그린 뒤 — 서버와 기기 시각이 달라도 어긋나지 않게)
  useEffect(() => { setMeal(defaultMeal(hourKst())); }, []); // eslint-disable-line react-hooks/set-state-in-effect -- 시각은 기기에서만 안다

  useEffect(() => {
    if (!meal) return;
    const n = ++req.current; // 끼니를 빨리 바꾸면 늦게 온 앞 응답이 덮지 않게 — 마지막 요청만 반영
    setRecs(null); setFailed(false); // eslint-disable-line react-hooks/set-state-in-effect -- 끼니를 바꾸면 불러오는 중으로
    fetch(`/api/home/meal-recs?meal=${meal}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || String(r.status));
        if (n === req.current) setRecs(data);
      })
      .catch((e) => {
        console.error("홈 끼니 추천:", e);
        if (n === req.current) setFailed(true);
      });
  }, [meal, attempt]);

  const label = meal ? HOME_MEAL_LABEL[meal] : "";

  const add = useCallback(async (key: string, ids: string[]) => {
    if (!meal || saving) return;
    setSaving(key);
    try {
      const r = await fetch("/api/home/meal-recs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meal, product_ids: ids }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.show(r.status >= 500 ? "담지 못했어요. 다시 시도해 주세요" : data.error || "담지 못했어요", { tone: "danger" });
        return;
      }
      toast.show(`오늘 ${label} 예정에 담았어요. 식단 탭에서 볼 수 있어요`);
    } catch (e) {
      console.error("홈 끼니 담기:", e);
      toast.show("담지 못했어요. 다시 시도해 주세요", { tone: "danger" });
    } finally {
      setSaving(null);
    }
  }, [meal, saving, toast, label]);

  return (
    <section aria-labelledby="home-meal-title" className="pt-8 flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="home-meal-title" className="text-title font-bold text-ink">{meal ? `오늘 ${label} 추천` : "오늘 추천"}</h2>
          {recs ? (
            <p className="text-label text-ink-2 mt-0.5">
              남은 하루에 맞춰 골랐어요 · 이번 끼니 몫 <span className="num">{fmt(recs.budget.kcal)}</span>kcal · 나트륨 <span className="num">{fmt(recs.budget.sodiumCap)}</span>mg까지
            </p>
          ) : (
            <Skeleton className="h-4 w-64 mt-1.5" />
          )}
        </div>
        {/* Select 는 칸을 꽉 채운다 — 폭은 감싼 칸이 정한다 */}
        <div className="w-24 shrink-0">
          <Select aria-label="끼니 고르기" className="font-medium" value={meal ?? ""} disabled={!meal}
            onChange={(e) => setMeal(e.target.value as MealKey)}>
            {!meal && <option value="">끼니</option>}
            {HOME_MEALS.map((m) => <option key={m} value={m}>{HOME_MEAL_LABEL[m]}</option>)}
          </Select>
        </div>
      </div>

      {failed ? (
        <EmptyState title="추천을 불러오지 못했어요" description="잠시 뒤 다시 불러와 주세요"
          action={<Button variant="secondary" size="sm" icon="refresh" onClick={() => setAttempt((n) => n + 1)}>다시 불러오기</Button>} />
      ) : !recs ? (
        <RecsSkeleton />
      ) : recs.products.length === 0 && recs.combos.length === 0 ? (
        <EmptyState title="지금 몫에 맞는 음식을 찾지 못했어요" description="오늘 많이 먹었거나 조건이 빠듯하면 그래요"
          action={<TextLink href="/diary">식단에서 직접 고르기</TextLink>} />
      ) : (
        <>
          <div>
            <SectionHeader title="제품 추천" action={<TextLink href={`/products?type=${meal === "snack" ? "snack" : "main"}`}>더보기</TextLink>} />
            {recs.products.length === 0 ? (
              <p className="text-label text-ink-2">이 끼니 몫에 맞는 메인 제품을 찾지 못했어요. 아래 한 상을 봐 주세요</p>
            ) : (
              <div className="flex gap-3 scroll-row -mx-4 px-4 pb-2">
                {recs.products.map((p, i) => (
                  <div key={p.id} className="w-44 shrink-0 rounded-lg border border-line bg-surface overflow-hidden flex flex-col">
                    <Link href={`/products/${p.id}`} className="block transition-colors hover:bg-sunken">
                      <div className="h-28">
                        <ProductImage src={p.image_url} />
                      </div>
                      <div className="p-3 pb-2">
                        <p className="text-caption font-medium text-brand-ink mb-0.5">{i === 0 ? "가장 잘 맞아요" : "잘 맞아요"}</p>
                        <h3 className="text-label font-medium text-ink line-clamp-2 mb-1">{p.name}</h3>
                        <p className="text-caption text-ink-2 num">{fmt(p.calories)}kcal · 단백질 {Math.round(p.protein_g)}g</p>
                        {p.price != null && <Price value={p.price} className="text-body mt-1 block" />}
                        {p.platform && <p className="text-caption text-ink-2">{PLATFORM_LABELS[p.platform] || p.platform} 외</p>}
                      </div>
                    </Link>
                    <div className="px-3 pb-3 mt-auto">
                      <Button variant="secondary" size="sm" block loading={saving === p.id} disabled={!!saving && saving !== p.id}
                        onClick={() => add(p.id, [p.id])}>{label}에 담기</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {meal !== "snack" && (
            <div>
              <SectionHeader title="식단 추천" description="밥 · 국 · 반찬을 한 상으로" />
              {recs.combos.length === 0 ? (
                <p className="text-label text-ink-2">이 끼니 몫에 맞는 한 상을 찾지 못했어요. 위 제품에서 골라 주세요</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {recs.combos.map((c) => {
                    const key = c.foods.map((f) => f.id).join("+");
                    return (
                      <Card key={key} className="flex flex-col gap-3">
                        <ul className="flex flex-col gap-2">
                          {c.foods.map((f) => (
                            <li key={f.id}>
                              <Link href={`/products/${f.id}`} className="flex items-center gap-3 rounded-md transition-colors hover:bg-sunken">
                                <Thumb src={f.image_url} size={44} />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-caption text-ink-2">{ROLE_SHORT[f.role] || "메인"}</span>
                                  <span className="block text-label text-ink truncate">{f.name}</span>
                                </span>
                                <span className="text-caption text-ink-2 num whitespace-nowrap">{fmt(f.calories)}kcal</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                        <div className="pt-3 border-t border-line text-label">
                          <p><span className="num text-title font-bold text-ink">{fmt(c.calories)}</span> kcal</p>
                          <p className="flex flex-wrap gap-x-4 mt-1 text-ink-2">
                            <span>단백질 <span className="num font-bold text-protein">{Math.round(c.protein_g)}g</span></span>
                            {c.sodium_mg != null && <span>나트륨 <span className="num font-bold text-sodium">{fmt(c.sodium_mg)}mg</span></span>}
                          </p>
                        </div>
                        <Button variant="secondary" block loading={saving === key} disabled={!!saving && saving !== key}
                          onClick={() => add(key, c.foods.map((f) => f.id))}>{label}에 담기</Button>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {meal === "snack" && <p className="text-label text-ink-2 -mt-2">간식은 한 상 대신 하나씩 권해요</p>}
        </>
      )}
    </section>
  );
}

/** 불러오는 중 — 카드 모양 그대로 */
function RecsSkeleton() {
  return (
    <div role="status" aria-label="추천을 불러오는 중" className="flex flex-col gap-6">
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="w-44 shrink-0 rounded-lg border border-line bg-surface overflow-hidden">
            <Skeleton className="h-28" />
            <div className="p-3 flex flex-col gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-56 rounded-lg" />)}
      </div>
    </div>
  );
}
