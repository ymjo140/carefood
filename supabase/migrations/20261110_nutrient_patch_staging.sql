-- 식약처 Info03 에서 받은 식이섬유·포화지방·트랜스지방·콜레스테롤을 잠깐 올려 두는 표 (scripts/enrich_mfds03.py apply)
-- products 에 반영한 뒤에는 지워도 된다
create table if not exists public.products_nutrient_patch (
  id uuid primary key references public.products(id) on delete cascade,
  fiber_g numeric,
  saturated_fat_g numeric,
  trans_fat_g numeric,
  cholesterol_mg numeric
);
alter table public.products_nutrient_patch enable row level security;
