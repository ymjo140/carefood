-- 사용자가 만드는 챌린지 (2단계) — 규칙 목록에서 고르고 목표값·기간·성공 기준·시작일만 정한다.
-- 링크가 있는 사람만 볼 수 있다(visibility link). 열량 규칙은 사용자가 고를 수 없다(kcal_max 는 공식 전용).
alter table public.community_challenges drop constraint if exists community_challenges_metric_check;
alter table public.community_challenges add constraint community_challenges_metric_check
  check (metric in ('sodium_max', 'protein_min', 'sugar_max', 'meals_min', 'kcal_max', 'fiber_min', 'breakfast', 'record_any'));
alter table public.community_challenges drop constraint if exists community_challenges_user_metric_check;
alter table public.community_challenges add constraint community_challenges_user_metric_check
  check (kind = 'official' or metric <> 'kcal_max');
alter table public.community_challenges drop constraint if exists community_challenges_goal_check;
alter table public.community_challenges add constraint community_challenges_goal_check
  check (goal_days is null or (goal_days >= 1 and goal_days <= days));
create index if not exists community_challenges_creator_idx on public.community_challenges (creator_id, created_at desc);

-- 만들기 + 묶음 열기 + 만든 사람 참여를 한 번에. 같은 사람의 동시 요청은 줄 세운다(한도를 넘지 않게).
-- status: created | too_many(하루 3개) | too_many_active(진행 중 5개) | bad_start | missing
create or replace function public.challenge_user_create(
  p_user text, p_metric text, p_target numeric, p_days smallint, p_goal smallint,
  p_title text, p_rule text, p_note text, p_start date, p_today date, p_code text)
returns jsonb language plpgsql set search_path = public as $$
declare cid uuid; r jsonb; n int;
begin
  perform pg_advisory_xact_lock(hashtext('challenge_create:' || p_user));
  select count(*) into n from community_challenges where creator_id = p_user and kind = 'user' and created_at > now() - interval '1 day';
  if n >= 3 then return jsonb_build_object('status', 'too_many'); end if;
  select count(*) into n from community_challenges c where c.creator_id = p_user and c.kind = 'user' and c.is_active
    and exists (select 1 from challenge_groups g where g.challenge_id = c.id and g.start_on + c.days - 1 >= p_today);
  if n >= 5 then return jsonb_build_object('status', 'too_many_active'); end if;
  insert into community_challenges (slug, title, rule, metric, target, days, goal_days, sort, is_active, kind, creator_id, visibility, note)
  values ('u-' || p_code, p_title, p_rule, p_metric, p_target, p_days, p_goal, 1000, true, 'user', p_user, 'link', nullif(p_note, ''))
  returning id into cid;
  r := challenge_group_open(cid, p_user, p_start, p_today, p_code);
  if r->>'status' <> 'opened' then raise exception '묶음을 열지 못했어요: %', r->>'status'; end if;
  return jsonb_build_object('status', 'created', 'challenge_id', cid, 'group_id', r->>'group_id', 'code', p_code);
end $$;
revoke all on function public.challenge_user_create(text, text, numeric, smallint, smallint, text, text, text, date, date, text) from public, anon, authenticated;
grant execute on function public.challenge_user_create(text, text, numeric, smallint, smallint, text, text, text, date, date, text) to service_role;
