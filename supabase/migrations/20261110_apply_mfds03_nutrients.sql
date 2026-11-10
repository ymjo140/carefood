-- 식약처 Info03(성분 번호 확인됨)에서 받은 식이섬유·포화지방·트랜스지방·콜레스테롤을 products 에 반영 (사용자 승인 2026-11-10)
-- 대상: products_nutrient_patch — 식품 코드가 같고 나트륨도 같은(2% 안) 제품만 (scripts/enrich_mfds03.py apply)
-- 바꾸기 전 포화지방·건강 점수는 products_nutrient_backup2_20261110 에 남긴다
-- 건강 점수: 진짜 식이섬유가 있는 제품에 식이섬유 몫을 다시 더한다 (3g 이상 10점, 비례 — 비울 때 뺀 것과 같은 식)

create table if not exists public.products_nutrient_backup2_20261110 as
select p.id, p.saturated_fat_g, p.health_score
from public.products p join public.products_nutrient_patch n on n.id = p.id;
alter table public.products_nutrient_backup2_20261110 enable row level security;

update public.products p set
  fiber_g = n.fiber_g,
  saturated_fat_g = n.saturated_fat_g,
  trans_fat_g = n.trans_fat_g,
  cholesterol_mg = n.cholesterol_mg,
  health_score = case when n.fiber_g is not null and p.health_score is not null
                      then greatest(0, least(100, p.health_score + round(10 * least(greatest(n.fiber_g, 0), 3) / 3)))
                      else p.health_score end
from public.products_nutrient_patch n
where n.id = p.id;
