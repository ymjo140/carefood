-- 시즌을 매달 1일 시작으로: 월간은 그달 1일~마지막 날(28~31일), 새해는 1월 1일~2월 마지막 날(59~60일)
alter table public.challenge_seasons drop constraint if exists challenge_seasons_days_check;
alter table public.challenge_seasons add constraint challenge_seasons_days_check check (days between 28 and 62);
-- 챌린지 기간 한도 3~30일 → 3~62일 (시즌 챌린지·내 버전은 시즌 길이, 사용자가 직접 만드는 것은 화면에서 3·7·14·21·30일만)
alter table public.community_challenges drop constraint if exists community_challenges_days_check;
alter table public.community_challenges add constraint community_challenges_days_check check (days between 3 and 62);
-- 이미 만든 12월 시즌(12월 7일·28일, 참여 0명)을 12월 1일·31일로 옮긴다
update public.challenge_seasons set start_on = '2026-12-01', days = 31,
  intro = '약속이 많은 연말, 한 달 동안 세 끼 기록과 내 열량 구간을 지켜요'
  where slug = '2026-12' and start_on = '2026-12-07';
update public.community_challenges c set days = s.days, goal_days = ceil(s.days * 0.7)
  from public.challenge_seasons s where c.season_id = s.id and s.slug = '2026-12';
