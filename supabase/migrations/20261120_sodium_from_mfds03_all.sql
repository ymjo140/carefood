-- 나트륨을 식약처 Info03 전체(AMT_NUM13)로 채우고 고친다 (사용자 승인 2026-11-20 "응 적용하고")
-- 원인: 예전 가져오기가 나트륨으로 AMT_NUM8(실은 식이섬유)을 읽었다 — 가공식품(P)은 대부분 비고, 요리(D)는 식이섬유 값이 들어갔다
--   (20261111 은 일부만 고쳤다). 이제 가져오기(scripts/ingest_mfds.py)도 AMT_NUM13 을 읽는다.
-- 값: 식약처 347,333개 전부를 받아(GitHub Actions, data/mfds-sodium 갈래) 식품코드로 맞췄다 — 열량이 모두 같아 연결이 맞음을 확인.
--   채움(비어 있던 것) 328,997 · 고침(식이섬유 값 등) 16,801 · 100g 당 39,300mg(순수 소금)을 넘는 11개는 뺐다.
-- 건강 점수: scripts/health_score.py 로 새 나트륨을 넣어 다시 계산 — 저장값이 계산값과 다른 줄은 차이만 더했다.
-- 반영 파일은 data/mfds-sodium 갈래 data/mfds/apply/na-*.csv (id,나트륨,건강 점수) → products_sodium_patch_20261120 에 올린 뒤 아래로.
-- 바꾸기 전 값은 products_sodium_backup_20261120 에.

create table if not exists public.products_sodium_backup_20261120 as
select p.id, p.sodium_mg, p.health_score
from public.products p join public.products_sodium_patch_20261120 n on n.id = p.id;
alter table public.products_sodium_backup_20261120 enable row level security;

update public.products p set sodium_mg = n.sodium_mg, health_score = n.health_score
from public.products_sodium_patch_20261120 n
where n.id = p.id and (p.sodium_mg is distinct from n.sodium_mg or p.health_score is distinct from n.health_score);

-- 되돌리기
-- update public.products p set sodium_mg = b.sodium_mg, health_score = b.health_score
-- from public.products_sodium_backup_20261120 b where b.id = p.id;
