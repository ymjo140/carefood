-- 추천 4단계: 끼니 역할 다시 가르기 + 건강 점수 다시 계산
--   끼니 역할: scripts/meal_role.py — 이름 위주 규칙. 1회 제공량(포장 무게)으로 '한 끼'를 가르던 것을 없앴다
--             (사탕·냉동 과일·빵이 한 끼로, 참깨·생물 고등어·반죽이 한 끼·반찬으로 잡히던 것)
--   건강 점수: scripts/health_score.py — 100g 당 성분으로 Nutri-Score(2023) 점수를 매기고 등급 구간을 0~100 에 옮긴다
--             (전에는 계산식이 저장소에 없었다)
-- 값은 scripts/build_taste_profile.py build → upload 로 products_taste_patch 에 올린 뒤 아래로 반영한다.
-- 바꾸기 전 값은 products_role_health_backup_20261111 에.

alter table public.products_taste_patch add column if not exists health_score smallint;

create table if not exists public.products_role_health_backup_20261111 as
select id, meal_role, health_score from public.products;
alter table public.products_role_health_backup_20261111 enable row level security;

update public.products p set meal_role = t.meal_role, health_score = t.health_score
from public.products_taste_patch t
where t.id = p.id and (p.meal_role is distinct from t.meal_role or p.health_score is distinct from t.health_score);

-- 되돌리기
-- update public.products p set meal_role = b.meal_role, health_score = b.health_score
-- from public.products_role_health_backup_20261111 b where b.id = p.id;
