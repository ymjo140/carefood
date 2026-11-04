"use client";

/**
 * 일반 메뉴 넣기 — 외식·직접 만든 음식을 "보통 1인분 kcal" 로 간단히 넣는다.
 *
 *   <FoodEntryForm food={{ name: "파스타 (크림)", serving_desc: "1인분 350g", calories: 650, … }} onSubmit={…} />
 *   <FoodEntryForm onSubmit={…} />          ← 목록에 없을 때: 이름 + kcal 직접 입력
 *
 * - 양은 ½·1·1.5·2인분. 고르면 kcal·영양이 같이 바뀐다.
 * - kcal 는 고쳐 쓸 수 있다. 고치면 영양도 같은 비율로 맞춘다.
 */

import { useState } from "react";
import { Button } from "./Button";
import { Chip, ChipRow } from "./Chip";
import { Field, Input } from "./Field";
import { MacroInline } from "./Nutrition";

export type FoodBase = {
  id?: string;
  name: string;
  serving_desc?: string | null;
  serving_size_g?: number | null;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  sodium_mg?: number | null;
  sugar_g?: number | null;
  source?: string;
};

export type FoodEntry = {
  name: string;
  calories: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  sodium_mg?: number;
  serving_g?: number;
  portion: number;
  food_id?: string;
  source?: string;
};

const PORTIONS = [0.5, 1, 1.5, 2];
const portionLabel = (p: number) => (p === 0.5 ? "½인분" : `${p}인분`);
const round1 = (v: number) => Math.round(v * 10) / 10;

export function FoodEntryForm({ food, onSubmit, submitLabel = "넣기", note }: {
  food?: FoodBase;
  onSubmit: (entry: FoodEntry) => void;
  submitLabel?: string;
  /** 값의 기준을 알리는 한 줄 (예: 식약처 1인분 기준) */
  note?: string;
}) {
  const manual = !food;
  const base = food?.calories ?? 0;
  const [name, setName] = useState(food?.name ?? "");
  const [portion, setPortion] = useState(1);
  const [kcalText, setKcalText] = useState(food ? String(Math.round(base)) : "");

  const kcal = Number(kcalText) || 0;
  // 영양은 kcal 비율로 맞춘다 (양을 바꾸든 kcal 를 고치든 같은 비율)
  const ratio = base > 0 ? kcal / base : 0;
  const scaled = (v?: number | null) => (v != null && ratio > 0 ? round1(v * ratio) : undefined);
  const valid = name.trim().length > 0 && kcal > 0 && kcal < 5000;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSubmit({
          name: name.trim(),
          calories: Math.round(kcal),
          protein_g: scaled(food?.protein_g), carbs_g: scaled(food?.carbs_g), fat_g: scaled(food?.fat_g), sodium_mg: scaled(food?.sodium_mg),
          serving_g: food?.serving_size_g ? Math.round(food.serving_size_g * portion) : undefined,
          portion,
          food_id: food?.id,
          source: food?.source,
        });
      }}
    >
      <Field label="메뉴 이름">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 크림 파스타" autoFocus={manual} />
      </Field>

      {!manual && (
        <div>
          <p className="text-label font-medium text-ink mb-2">
            먹은 양 {food?.serving_desc && <span className="text-caption text-ink-2 font-regular">· 1인분 = {food.serving_desc.replace(/^1인분\s*/, "")}</span>}
          </p>
          <ChipRow>
            {PORTIONS.map((p) => (
              <Chip key={p} selected={portion === p}
                onClick={() => { setPortion(p); setKcalText(String(Math.round(base * p))); }}>
                {portionLabel(p)}
              </Chip>
            ))}
          </ChipRow>
        </div>
      )}

      <Field label="칼로리 (kcal)" hint={manual ? "모르면 대략 넣어도 돼요" : "직접 고쳐도 돼요"}>
        <Input inputMode="numeric" value={kcalText} onChange={(e) => setKcalText(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="예: 600" className="num" />
      </Field>

      {!manual && ratio > 0 && (
        <MacroInline values={{ protein: scaled(food?.protein_g), carbs: scaled(food?.carbs_g), fat: scaled(food?.fat_g), sodium: scaled(food?.sodium_mg) }} />
      )}
      {note && <p className="text-caption text-ink-2">{note}</p>}

      <Button type="submit" block disabled={!valid}>{submitLabel}</Button>
    </form>
  );
}
