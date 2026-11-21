-- 영양 기준량 오류 고치기 (2026-11-21 적용)
-- 식약처 API 값은 100g 기준인데 기준량 칸(nutrient_base_g)에 1회 섭취참고량(30·10·5·20·15g)이 들어가,
-- 앱이 1회분 열량을 3~20배로 보여 주던 제품(살 수 있는 것 14,962개)의 기준량을 100g 으로.
-- 대상: 기준량 1g 에 9.2kcal 초과 또는 단백질이 기준량보다 많음(물리적으로 안 됨) 이면서
--       100g 기준으로 보면 정상(열량 920 이하, 탄·단·지 100g 이하)이고 열량과 탄단지(4·4·9) 합이 맞는 것(0.75~1.3) — 값이 없으면 맞춤은 보지 않음.
-- 나머지 140개(당알코올 제품 등)는 '확인 필요'로 두었다 — 영양_기준량_오류_수정대상.xlsx
-- health_score 는 원래 값을 100g 기준으로 보고 매겨서(scripts/health_score.py) 바뀌지 않는다.
-- ※ 2026-11-21 밤사이 누군가 아래 되돌리기 줄을 실행해 원래대로 돌아갔다가 다시 적용함. 사용자 확인 없이 실행하지 말 것.
-- 되돌리기: update public.products p set nutrient_base_g = b.old_base from public.products_base_fix_20261128 b where b.id = p.id;

create table if not exists public.products_base_fix_20261128 (
  id uuid primary key,
  old_base numeric not null,
  fixed_at timestamptz not null default now()
);
alter table public.products_base_fix_20261128 enable row level security;
revoke all on public.products_base_fix_20261128 from public, anon, authenticated;

insert into public.products_base_fix_20261128 (id, old_base)
select id, nutrient_base_g from public.products
 where is_purchasable and nutrient_base_g > 0
   and (calories / nutrient_base_g > 9.2 or protein_g / nutrient_base_g > 1)
   and calories <= 920 and coalesce(protein_g, 0) <= 100 and coalesce(carbs_g, 0) <= 100 and coalesce(fat_g, 0) <= 100
   and (protein_g is null or carbs_g is null or fat_g is null
        or (calories > 0 and (4 * protein_g + 4 * carbs_g + 9 * fat_g) / calories between 0.75 and 1.3))
on conflict (id) do nothing;

update public.products p set nutrient_base_g = 100, updated_at = now()
  from public.products_base_fix_20261128 b
 where b.id = p.id and p.nutrient_base_g = b.old_base;

-- 기준량이 100g 이 되면 '한 끼인데 열량이 너무 낮음' 검사 대상이 된다
select public.flag_implausible_nutrition();
