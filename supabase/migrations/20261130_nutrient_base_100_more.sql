-- 영양 기준량 오류 더 고치기 (2026-11-21 적용함)
-- 20261128 은 '1g 에 9.2kcal 초과'만 잡았다. 여기서는
--  · macros_over_weight: 탄수화물+단백질+지방 무게가 기준량보다 무거움(물리적으로 안 됨) — 예: 훈제닭가슴살 30g 에 단백질 30g
--  · broken_base: 기준량 칸에 숫자가 이어 붙음(2001003012080 · 150100 — '200,100,30,120,80' 같은 값)
-- 이면서 100g 기준으로 보면 정상(열량 920 이하, 탄단지 합 102g 이하)인 5,943개(3,396 + 2,547)를 100g 으로.
-- 남은 86개(100g 으로 봐도 안 맞음)는 그대로.
-- 되돌리기(사용자 확인 없이 실행하지 말 것): update public.products p set nutrient_base_g = b.old_base from public.products_base_fix_20261130 b where b.id = p.id;

create table if not exists public.products_base_fix_20261130 (
  id uuid primary key,
  old_base numeric not null,
  reason text not null,
  fixed_at timestamptz not null default now()
);
alter table public.products_base_fix_20261130 enable row level security;
revoke all on public.products_base_fix_20261130 from public, anon, authenticated;

insert into public.products_base_fix_20261130 (id, old_base, reason)
select id, nutrient_base_g,
       case when nutrient_base_g >= 100000 then 'broken_base' else 'macros_over_weight' end
  from public.products
 where is_purchasable and nutrient_base_g > 0 and nutrient_base_g <> 100
   and calories <= 920
   and coalesce(protein_g, 0) + coalesce(carbs_g, 0) + coalesce(fat_g, 0) <= 102
   and (nutrient_base_g >= 100000
        or coalesce(protein_g, 0) + coalesce(carbs_g, 0) + coalesce(fat_g, 0) > nutrient_base_g * 1.02)
on conflict (id) do nothing;

update public.products p set nutrient_base_g = 100, updated_at = now()
  from public.products_base_fix_20261130 b
 where b.id = p.id and p.nutrient_base_g = b.old_base;

select public.flag_implausible_nutrition();
