-- 제품 맛 6축 + 끼니 역할 (추천 2단계)
-- 값은 scripts/build_taste_profile.py 가 계산해 products_taste_patch 에 올리고, 아래 update 로 반영한다
--   taste_* : 1~10 단계 (영양 수치 + 원재료 + 이름). 모르면 null
--   meal_role: meal · side · snack · drink · supplement · condiment · ingredient
alter table public.products
  add column if not exists taste_salty smallint check (taste_salty between 1 and 10),
  add column if not exists taste_sweet smallint check (taste_sweet between 1 and 10),
  add column if not exists taste_fatty smallint check (taste_fatty between 1 and 10),
  add column if not exists taste_spicy smallint check (taste_spicy between 1 and 10),
  add column if not exists taste_sour smallint check (taste_sour between 1 and 10),
  add column if not exists taste_umami smallint check (taste_umami between 1 and 10),
  add column if not exists meal_role text check (meal_role in ('meal','side','snack','drink','supplement','condiment','ingredient'));
create index if not exists products_meal_role_idx on public.products (meal_role);

create table if not exists public.products_taste_patch (
  id uuid primary key references public.products(id) on delete cascade,
  taste_salty smallint, taste_sweet smallint, taste_fatty smallint,
  taste_spicy smallint, taste_sour smallint, taste_umami smallint,
  meal_role text
);
alter table public.products_taste_patch enable row level security;

-- (올린 뒤) 반영
-- update public.products p set taste_salty = t.taste_salty, taste_sweet = t.taste_sweet, taste_fatty = t.taste_fatty,
--   taste_spicy = t.taste_spicy, taste_sour = t.taste_sour, taste_umami = t.taste_umami, meal_role = t.meal_role
-- from public.products_taste_patch t where t.id = p.id;
