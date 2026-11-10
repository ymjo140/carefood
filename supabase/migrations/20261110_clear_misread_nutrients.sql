-- 식약처 영양 DB 를 가져올 때 확인하지 않고 연결한 칸 3개를 비운다 (사용자 승인 2026-11-10)
--   fiber_g        ← AMT_NUM2: 100g 당 중앙값 68g, 1,908개는 100g 초과 → 식이섬유가 아니라 수분으로 보임
--   trans_fat_g    ← AMT_NUM11: 100g 당 중앙값 73g → 트랜스지방일 수 없음
--   cholesterol_mg ← AMT_NUM9: 우유 100mg·라면 96~128mg → 칼슘으로 보임
-- 되돌릴 수 있게 원래 값을 products_nutrient_backup_20261110 에 먼저 남긴다.
-- health_score 는 식이섬유(최대 10점)를 반영해 계산돼 있었다 → 식이섬유 값이 있던 제품만 그 몫을 뺀다(3g 이상이면 10점으로 근사).

create table if not exists public.products_nutrient_backup_20261110 as
select id, fiber_g, trans_fat_g, cholesterol_mg, health_score
from public.products
where data_source = 'mfds_api' and (fiber_g is not null or trans_fat_g is not null or cholesterol_mg is not null);
alter table public.products_nutrient_backup_20261110 enable row level security;

update public.products p set
  health_score = case when b.fiber_g is not null and b.health_score is not null
                      then greatest(0, least(100, b.health_score - round(10 * least(greatest(b.fiber_g, 0), 3) / 3)))
                      else p.health_score end,
  fiber_g = null, trans_fat_g = null, cholesterol_mg = null
from public.products_nutrient_backup_20261110 b
where p.id = b.id;

-- 되돌리기:
-- update public.products p set fiber_g = b.fiber_g, trans_fat_g = b.trans_fat_g, cholesterol_mg = b.cholesterol_mg, health_score = b.health_score
-- from public.products_nutrient_backup_20261110 b where p.id = b.id;
