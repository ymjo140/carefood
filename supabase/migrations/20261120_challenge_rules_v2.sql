-- 챌린지 규칙 넓히기 (1단계): 사진과 함께 기록 · 간식 줄이기 · 끼니마다 단백질 · 열량 구간 · 탄단지 유형
-- 열량 구간은 사람마다 다르다 — 참여한 사람마다 내 구간(target_eff, kcal)을 따로 둔다. 숫자는 본인만 본다.
alter table public.community_challenges drop constraint if exists community_challenges_metric_check;
alter table public.community_challenges add constraint community_challenges_metric_check
  check (metric in ('sodium_max', 'protein_min', 'sugar_max', 'meals_min', 'kcal_max', 'fiber_min', 'breakfast', 'record_any',
                    'photo_meals', 'snack_max', 'protein_each', 'kcal_band', 'macro_type'));

alter table public.community_challenge_members add column if not exists target_eff numeric;
alter table public.community_challenge_members drop constraint if exists community_challenge_members_target_eff_check;
alter table public.community_challenge_members add constraint community_challenge_members_target_eff_check
  check (target_eff is null or (target_eff >= 1200 and target_eff <= 3000));

