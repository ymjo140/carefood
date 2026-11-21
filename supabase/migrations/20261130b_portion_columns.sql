-- 2026-11-21 적용함 — 구조는 마이그레이션으로, 판매 제품 56,566개 채우기는 25,000개씩 나눠서(긴 잠금을 피하려고) 아래 update 와 같게.
-- 1회분 값 · 100g당 값을 따로 저장 (2026-11-21)
-- 영양 값(calories 등)은 기준량(nutrient_base_g) 당이라 제품마다 30g·80g·200g … 으로 기준이 달랐다.
-- 검색 '단백질 20g 이상'은 사람이 먹는 양(1회분)으로, 맛(짠맛·단맛·고소한맛)과 제품끼리 비교는 100g당으로 본다.
--   serving_g          : 한 번 먹는 양 — lib/serving.ts defaultServingG 와 같은 규칙 (바꾸면 둘 다)
--   serving_*          : 1회분 값 = 값 × serving_g ÷ 기준량
--   per100_*           : 100g당 값 = 값 × 100 ÷ 기준량
-- 기준량이 비었거나 0이면 100g. 판매 중인 제품만 채우고, 이후에는 트리거가 넣거나 고칠 때마다 다시 계산한다.

create or replace function public.default_serving_g(sv numeric, mrole text, nm text)
returns numeric language sql immutable as $$
  select case
    when coalesce(sv, 0) between 20 and 500 then sv
    when mrole is distinct from 'meal' then 100
    when coalesce(nm, '') ~ '삼계탕|백숙|반계탕' then case when sv > 500 and sv <= 1200 then sv else 900 end
    when coalesce(nm, '') ~ '갈비탕|곰탕|설렁탕|우족탕|도가니탕|육개장|해장국|국밥|추어탕|감자탕|탕(?=[\s\d(]|$)|국(?=[\s\d(]|$)'
      then case when coalesce(sv, 0) > 500 then least(sv, 600) else 600 end
    when coalesce(nm, '') ~ '찌개|전골|죽(?=[\s\d(]|$)' then 400
    else 300
  end
$$;

alter table public.products
  add column if not exists serving_g numeric,
  add column if not exists serving_kcal numeric,
  add column if not exists serving_protein_g numeric,
  add column if not exists serving_sodium_mg numeric,
  add column if not exists serving_sugar_g numeric,
  add column if not exists per100_kcal numeric,
  add column if not exists per100_protein_g numeric,
  add column if not exists per100_sodium_mg numeric,
  add column if not exists per100_sugar_g numeric,
  add column if not exists per100_fat_g numeric;

create or replace function public.products_fill_portion()
returns trigger language plpgsql as $$
declare
  base numeric := case when new.nutrient_base_g > 0 then new.nutrient_base_g else 100 end;
begin
  if not coalesce(new.is_purchasable, false) then
    return new;
  end if;
  new.serving_g := public.default_serving_g(new.serving_size_g, new.meal_role, new.name);
  new.serving_kcal := round(new.calories * new.serving_g / base, 1);
  new.serving_protein_g := round(new.protein_g * new.serving_g / base, 1);
  new.serving_sodium_mg := round(new.sodium_mg * new.serving_g / base, 1);
  new.serving_sugar_g := round(new.sugar_g * new.serving_g / base, 1);
  new.per100_kcal := round(new.calories * 100 / base, 1);
  new.per100_protein_g := round(new.protein_g * 100 / base, 1);
  new.per100_sodium_mg := round(new.sodium_mg * 100 / base, 1);
  new.per100_sugar_g := round(new.sugar_g * 100 / base, 1);
  new.per100_fat_g := round(new.fat_g * 100 / base, 1);
  return new;
end $$;

drop trigger if exists products_fill_portion on public.products;
create trigger products_fill_portion
  before insert or update of is_purchasable, serving_size_g, meal_role, name, nutrient_base_g, calories, protein_g, sodium_mg, sugar_g, fat_g
  on public.products for each row execute function public.products_fill_portion();

-- 판매 중인 제품 채우기 (updated_at 은 건드리지 않는다)
update public.products set serving_size_g = serving_size_g where is_purchasable;
