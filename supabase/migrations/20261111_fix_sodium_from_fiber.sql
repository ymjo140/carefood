-- 나트륨 칸에 식이섬유 값이 들어갔던 제품을 식약처 Info03 의 나트륨(AMT_NUM13, 확인됨)으로 고친다 (사용자 승인 2026-11-10)
-- 원인: 예전 가져오기가 나트륨으로 AMT_NUM8(실은 식이섬유)을 읽고, 비어 있을 때만 AMT_NUM13 으로 넘어갔다
--   → 식이섬유 값이 있는 15,140개는 나트륨이 0.7mg·0mg 처럼 들어가 '저나트륨'·높은 건강 점수로 보였다 (+ 출처가 바뀐 399개)
-- 같이: 이 제품들의 식이섬유·포화지방·트랜스지방·콜레스테롤도 Info03 값으로
-- 건강 점수: 나트륨 몫(최대 30점)과 식이섬유 몫(최대 10점)만 근사로 다시 — 나트륨 120mg 이하 30점 ~ 2,000mg 0점 직선
--   (운영 데이터의 나트륨 구간별 평균 점수로 맞춘 근사식)
-- 바꾸기 전 값은 products_sodium_backup_20261111 에

create table if not exists public.products_sodium_backup_20261111 as
select p.id, p.sodium_mg, p.fiber_g, p.saturated_fat_g, p.trans_fat_g, p.cholesterol_mg, p.health_score
from public.products p join public.products_sodium_patch n on n.id = p.id;
alter table public.products_sodium_backup_20261111 enable row level security;

update public.products p set
  sodium_mg = n.sodium_mg,
  fiber_g = n.fiber_g,
  saturated_fat_g = n.saturated_fat_g,
  trans_fat_g = n.trans_fat_g,
  cholesterol_mg = n.cholesterol_mg,
  health_score = case when p.health_score is null then null else greatest(0, least(100,
      p.health_score
      + round(30 * (least(1, greatest(0, (2000 - n.sodium_mg) / 1880.0)) - least(1, greatest(0, (2000 - coalesce(p.sodium_mg, 0)) / 1880.0))))
      + round(10 * least(greatest(coalesce(n.fiber_g, 0), 0), 3) / 3)
      - round(10 * least(greatest(coalesce(p.fiber_g, 0), 0), 3) / 3)
    )) end
from public.products_sodium_patch n
where n.id = p.id;
