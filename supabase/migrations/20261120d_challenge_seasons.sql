-- 챌린지 2단계: 큰 시즌 · 내 버전 · 공개 챌린지 · 순위
-- 시즌: 매달 첫 월요일부터 4주(월간) · 1월 첫 월요일부터 8주(새해). 2월은 새해 시즌이 덮는다. 시즌 안에 규칙별 챌린지(kind season)가 여럿.
-- 내 버전: 시즌 챌린지에서 숫자만 바꾼 사용자 챌린지(kind user, season_id·parent_id). 기간은 시즌과 같고 시즌 인원에 같이 센다.
-- 공개: 사용자 챌린지는 기본 '링크로만'(visibility link), 만든 사람이 public 으로 바꾸면 순위·추천에 나온다.
create table if not exists public.challenge_seasons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,                  -- 2026-12 · 2027-newyear
  title text not null,
  kind text not null check (kind in ('monthly', 'newyear')),
  start_on date not null,
  days smallint not null check (days in (28, 56)),
  intro text,
  created_at timestamptz not null default now()
);
alter table public.challenge_seasons enable row level security;

alter table public.community_challenges drop constraint if exists community_challenges_kind_check;
alter table public.community_challenges add constraint community_challenges_kind_check check (kind in ('official', 'user', 'season'));
alter table public.community_challenges add column if not exists season_id uuid references public.challenge_seasons(id) on delete set null;
alter table public.community_challenges add column if not exists parent_id uuid references public.community_challenges(id) on delete set null;
create index if not exists community_challenges_season_idx on public.community_challenges (season_id) where season_id is not null;
create index if not exists community_challenges_public_idx on public.community_challenges (visibility, kind) where is_active;

-- 시즌 시작 알림 받기 (시즌 첫날 아침에 한 번)
create table if not exists public.season_watchers (
  season_id uuid not null references public.challenge_seasons(id) on delete cascade,
  user_id text not null,
  created_at timestamptz not null default now(),
  primary key (season_id, user_id)
);
alter table public.season_watchers enable row level security;

-- 시즌 챌린지 참여 = 내 묶음 열기 (시작일은 시즌 첫날). 남은 날이 7일보다 적으면 닫힘, 늦게 들어오면 오늘부터 세고 목표는 남은 날의 70%.
-- 이미 이 챌린지를 하고 있으면 already. status: opened | already | closed | missing | too_many
create or replace function public.challenge_season_open(p_challenge uuid, p_user text, p_today date, p_code text)
returns jsonb language plpgsql set search_path = public as $$
declare c record; s record; gid uuid; r jsonb; open_count int; cur record;
begin
  select id, days, is_active, season_id into c from community_challenges where id = p_challenge;
  if not found or not c.is_active or c.season_id is null then return jsonb_build_object('status', 'missing'); end if;
  select * into s from challenge_seasons where id = c.season_id;
  if not found then return jsonb_build_object('status', 'missing'); end if;
  if p_today > s.start_on + s.days - 7 then return jsonb_build_object('status', 'closed'); end if;
  if s.start_on > p_today + 31 then return jsonb_build_object('status', 'missing'); end if;
  select m.group_id, g.start_on into cur from community_challenge_members m left join challenge_groups g on g.id = m.group_id
    where m.challenge_id = p_challenge and m.user_id = p_user;
  if found and cur.start_on = s.start_on then return jsonb_build_object('status', 'already', 'group_id', cur.group_id); end if;
  select count(*) into open_count from challenge_groups where host_id = p_user and created_at > now() - interval '1 day';
  if open_count >= 10 then return jsonb_build_object('status', 'too_many'); end if;
  insert into challenge_groups (challenge_id, host_id, code, start_on) values (p_challenge, p_user, p_code, s.start_on) returning id into gid;
  r := challenge_group_join(gid, p_user, p_today, null);
  if r->>'status' not in ('joined', 'moved') then raise exception '묶음에 들어가지 못했어요: %', r->>'status'; end if;
  return jsonb_build_object('status', 'opened', 'group_id', gid, 'code', p_code);
end $$;
revoke all on function public.challenge_season_open(uuid, text, date, text) from public, anon, authenticated;
grant execute on function public.challenge_season_open(uuid, text, date, text) to service_role;

-- 내 버전 만들기: 시즌 챌린지의 규칙에 목표값만 바꾼 사용자 챌린지 + 내 묶음(시즌 첫날 시작)
create or replace function public.challenge_version_create(
  p_parent uuid, p_user text, p_target numeric, p_title text, p_rule text, p_today date, p_code text, p_public boolean)
returns jsonb language plpgsql set search_path = public as $$
declare p record; s record; cid uuid; gid uuid; r jsonb; n int;
begin
  perform pg_advisory_xact_lock(hashtext('challenge_create:' || p_user));
  select * into p from community_challenges where id = p_parent and kind = 'season' and is_active;
  if not found then return jsonb_build_object('status', 'missing'); end if;
  select * into s from challenge_seasons where id = p.season_id;
  if not found then return jsonb_build_object('status', 'missing'); end if;
  if p_today > s.start_on + s.days - 7 then return jsonb_build_object('status', 'closed'); end if;
  select count(*) into n from community_challenges where creator_id = p_user and kind = 'user' and created_at > now() - interval '1 day';
  if n >= 3 then return jsonb_build_object('status', 'too_many'); end if;
  insert into community_challenges (slug, title, rule, metric, target, days, goal_days, sort, is_active, kind, creator_id, visibility, season_id, parent_id)
  values ('u-' || p_code, p_title, p_rule, p.metric, p_target, s.days, null, 1000, true, 'user', p_user,
          case when p_public then 'public' else 'link' end, s.id, p.id)
  returning id into cid;
  insert into challenge_groups (challenge_id, host_id, code, start_on) values (cid, p_user, p_code, s.start_on) returning id into gid;
  r := challenge_group_join(gid, p_user, p_today, null);
  if r->>'status' not in ('joined', 'moved') then raise exception '묶음에 들어가지 못했어요: %', r->>'status'; end if;
  return jsonb_build_object('status', 'created', 'challenge_id', cid, 'group_id', gid, 'code', p_code);
end $$;
revoke all on function public.challenge_version_create(uuid, text, numeric, text, text, date, text, boolean) from public, anon, authenticated;
grant execute on function public.challenge_version_create(uuid, text, numeric, text, text, date, text, boolean) to service_role;
