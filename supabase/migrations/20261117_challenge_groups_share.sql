-- 챌린지 같이 하기(묶음) · 초대 코드 · 응원 · 공유 링크와 열람
-- 기획: https://claude.ai/artifact/VPHfaWvn4auvtrvJtXTv1T (1단계)
-- 묶음 = 같은 챌린지를 같은 날 시작하는 사람들. 혼자 참여도 1명 묶음이라 누구의 참여든 초대 링크가 있다.
-- 한 사람은 한 챌린지에 한 번만(기존 기본키 유지). 다른 묶음에 들어가면 참여가 그 묶음으로 옮겨진다.

-- ── 챌린지: 성공 기준·만든 사람(2단계 대비) ──
alter table public.community_challenges
  add column if not exists goal_days smallint,
  add column if not exists kind text not null default 'official' check (kind in ('official', 'user')),
  add column if not exists creator_id text,
  add column if not exists visibility text not null default 'public' check (visibility in ('link', 'public')),
  add column if not exists note text;

-- ── 묶음 ──
create table if not exists public.challenge_groups (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.community_challenges(id) on delete cascade,
  host_id text not null,
  code text not null unique check (code ~ '^[A-Za-z0-9]{8}$'),
  start_on date not null,
  max_members smallint not null default 20 check (max_members between 1 and 100),
  member_count int not null default 0 check (member_count >= 0),
  created_at timestamptz not null default now()
);
create index if not exists challenge_groups_challenge_idx on public.challenge_groups (challenge_id);
create index if not exists challenge_groups_host_idx on public.challenge_groups (host_id);
alter table public.challenge_groups enable row level security;

alter table public.community_challenge_members
  add column if not exists group_id uuid references public.challenge_groups(id) on delete set null,
  add column if not exists joined_on date,
  add column if not exists goal_days_eff smallint,
  add column if not exists invited_by text,
  add column if not exists via_share text,
  add column if not exists show_values boolean not null default false;
create index if not exists community_challenge_members_group_idx on public.community_challenge_members (group_id);

-- 기존 참여자 → 혼자 묶음 (시작일 = 참여한 날)
do $$
declare m record; g uuid; c text;
begin
  for m in select challenge_id, user_id, started_on from public.community_challenge_members where group_id is null loop
    loop
      c := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
      begin
        insert into public.challenge_groups (challenge_id, host_id, code, start_on, member_count)
        values (m.challenge_id, m.user_id, c, m.started_on, 1) returning id into g;
        exit;
      exception when unique_violation then null;
      end;
    end loop;
    update public.community_challenge_members set group_id = g, joined_on = m.started_on
      where challenge_id = m.challenge_id and user_id = m.user_id;
  end loop;
end $$;

-- ── 응원: 같은 묶음 사람에게 하루 한 번 ──
create table if not exists public.challenge_cheers (
  group_id uuid not null references public.challenge_groups(id) on delete cascade,
  from_user text not null,
  to_user text not null,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (group_id, from_user, to_user, day),
  check (from_user <> to_user)
);
create index if not exists challenge_cheers_to_idx on public.challenge_cheers (to_user, created_at desc);
alter table public.challenge_cheers enable row level security;

-- ── 공유 링크 · 열람 ──
create table if not exists public.share_links (
  code text primary key check (code ~ '^[A-Za-z0-9]{8}$'),
  owner text not null,
  kind text not null check (kind in ('meal', 'day', 'streak', 'challenge', 'group_buy', 'month')),
  target_id text not null,
  target_url text not null check (target_url ~ '^/[A-Za-z0-9/_?=&.-]*$'),
  group_id uuid references public.challenge_groups(id) on delete set null,
  card_url text,
  shared_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists share_links_owner_idx on public.share_links (owner, created_at desc);
create index if not exists share_links_group_idx on public.share_links (group_id, created_at desc);
alter table public.share_links enable row level security;

create table if not exists public.share_events (
  id bigint generated always as identity primary key,
  code text not null references public.share_links(code) on delete cascade,
  visitor text not null,
  type text not null check (type in ('visit', 'join', 'first_record', 'gb_mark')),
  day date not null,
  created_at timestamptz not null default now(),
  unique (code, visitor, type, day)
);
create index if not exists share_events_code_idx on public.share_events (code, type);
alter table public.share_events enable row level security;

-- 카드 그림 (공개, 무작위 경로)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('share-cards', 'share-cards', true, 3145728, array['image/png'])
on conflict (id) do nothing;

-- ── 묶음에 들어가기 — 줄을 잠그고 자리·차단·남은 날·중복을 한 번에 확인 ──
-- 결과 status: joined | moved | already | closed | full | blocked | missing
create or replace function public.challenge_group_join(p_group uuid, p_user text, p_today date, p_via text default null)
returns jsonb language plpgsql set search_path = public as $$
declare g record; c record; cur record; had boolean; remaining int; goal int; status text := 'joined';
begin
  select * into g from challenge_groups where id = p_group for update;
  if not found then return jsonb_build_object('status', 'missing'); end if;
  select id, days, goal_days, is_active into c from community_challenges where id = g.challenge_id;
  if not found or not c.is_active then return jsonb_build_object('status', 'missing'); end if;

  select * into cur from community_challenge_members where challenge_id = g.challenge_id and user_id = p_user for update;
  had := found;
  if had and cur.group_id = g.id then return jsonb_build_object('status', 'already', 'group_id', g.id); end if;

  -- 남은 날 3일 미만이면 닫힘 (시작 전이면 전부 남음)
  remaining := c.days - greatest(0, p_today - g.start_on);
  if remaining < 3 then return jsonb_build_object('status', 'closed'); end if;
  if g.member_count >= g.max_members then return jsonb_build_object('status', 'full'); end if;
  if exists (select 1 from community_blocks where (blocker_id = p_user and blocked_id = g.host_id) or (blocker_id = g.host_id and blocked_id = p_user)) then
    return jsonb_build_object('status', 'blocked');
  end if;

  goal := ceil(least(remaining, c.days) * coalesce(c.goal_days::numeric / c.days, 0.7));

  if had then
    -- 하고 있던 묶음에서 빼고 옮긴다 (끝난 참여는 다시 하기로 센다)
    if cur.group_id is not null then
      update challenge_groups set member_count = greatest(0, member_count - 1) where id = cur.group_id;
    end if;
    update community_challenge_members set
      group_id = g.id, started_on = greatest(g.start_on, p_today), joined_on = p_today, goal_days_eff = goal,
      invited_by = case when g.host_id = p_user then null else g.host_id end, via_share = p_via, joined_at = now(),
      finished_runs = finished_runs + case when cur.started_on + c.days - 1 < p_today then 1 else 0 end
    where challenge_id = g.challenge_id and user_id = p_user;
    status := 'moved';
  else
    insert into community_challenge_members (challenge_id, user_id, started_on, finished_runs, joined_at, group_id, joined_on, goal_days_eff, invited_by, via_share)
    values (g.challenge_id, p_user, greatest(g.start_on, p_today), 0, now(), g.id, p_today, goal,
            case when g.host_id = p_user then null else g.host_id end, p_via);
  end if;
  update challenge_groups set member_count = member_count + 1 where id = g.id;
  return jsonb_build_object('status', status, 'group_id', g.id);
end $$;

-- ── 묶음 열기 (+ 연 사람 참여). 코드는 API 가 뽑고, 겹치면 unique_violation 으로 다시 ──
create or replace function public.challenge_group_open(p_challenge uuid, p_user text, p_start date, p_today date, p_code text)
returns jsonb language plpgsql set search_path = public as $$
declare gid uuid; r jsonb; open_count int;
begin
  if p_start < p_today or p_start > p_today + 14 then return jsonb_build_object('status', 'bad_start'); end if;
  if not exists (select 1 from community_challenges where id = p_challenge and is_active) then return jsonb_build_object('status', 'missing'); end if;
  -- 하루에 여는 묶음 10개까지 (장난 방지)
  select count(*) into open_count from challenge_groups where host_id = p_user and created_at > now() - interval '1 day';
  if open_count >= 10 then return jsonb_build_object('status', 'too_many'); end if;
  insert into challenge_groups (challenge_id, host_id, code, start_on) values (p_challenge, p_user, p_code, p_start) returning id into gid;
  r := challenge_group_join(gid, p_user, p_today, null);
  if r->>'status' not in ('joined', 'moved') then raise exception '묶음에 들어가지 못했어요: %', r->>'status'; end if;
  return jsonb_build_object('status', 'opened', 'group_id', gid, 'code', p_code);
end $$;

-- ── 나가기 ──
create or replace function public.challenge_group_leave(p_challenge uuid, p_user text)
returns jsonb language plpgsql set search_path = public as $$
declare cur record;
begin
  select * into cur from community_challenge_members where challenge_id = p_challenge and user_id = p_user for update;
  if not found then return jsonb_build_object('status', 'missing'); end if;
  if cur.group_id is not null then
    perform 1 from challenge_groups where id = cur.group_id for update;
    update challenge_groups set member_count = greatest(0, member_count - 1) where id = cur.group_id;
  end if;
  delete from community_challenge_members where challenge_id = p_challenge and user_id = p_user;
  return jsonb_build_object('status', 'left');
end $$;

-- ── 응원 — 둘 다 그 묶음에 있어야 ──
create or replace function public.challenge_cheer(p_group uuid, p_from text, p_to text, p_day date)
returns jsonb language plpgsql set search_path = public as $$
declare n int;
begin
  if p_from = p_to then return jsonb_build_object('status', 'self'); end if;
  if (select count(*) from community_challenge_members where group_id = p_group and user_id in (p_from, p_to)) < 2 then
    return jsonb_build_object('status', 'not_member');
  end if;
  insert into challenge_cheers (group_id, from_user, to_user, day) values (p_group, p_from, p_to, p_day) on conflict do nothing;
  get diagnostics n = row_count;
  return jsonb_build_object('status', case when n = 1 then 'sent' else 'already' end);
end $$;

revoke all on function public.challenge_group_join(uuid, text, date, text) from public, anon, authenticated;
revoke all on function public.challenge_group_open(uuid, text, date, date, text) from public, anon, authenticated;
revoke all on function public.challenge_group_leave(uuid, text) from public, anon, authenticated;
revoke all on function public.challenge_cheer(uuid, text, text, date) from public, anon, authenticated;
grant execute on function public.challenge_group_join(uuid, text, date, text) to service_role;
grant execute on function public.challenge_group_open(uuid, text, date, date, text) to service_role;
grant execute on function public.challenge_group_leave(uuid, text) to service_role;
grant execute on function public.challenge_cheer(uuid, text, text, date) to service_role;

-- ── 로그인으로 합칠 때 새 표도 함께 ──
create or replace function public.merge_actor(from_id text, to_id text)
returns integer language plpgsql set search_path to 'public' as $function$
declare t record; r record; n int := 0; gids uuid[];
begin
  if from_id is null or to_id is null or from_id = to_id then return 0; end if;
  gids := array(select group_id from public.community_challenge_members where user_id in (from_id, to_id) and group_id is not null);
  for t in select * from (values
    ('community_bookmarks','user_id'), ('community_feed','user_id'), ('community_feed_comments','user_id'),
    ('community_feed_likes','user_id'), ('community_follows','follower_id'), ('community_follows','following_id'),
    ('community_reports','reporter_id'), ('community_hidden_posts','user_id'),
    ('community_blocks','blocker_id'), ('community_blocks','blocked_id'), ('notification_reads','user_id'),
    ('community_poll_votes','user_id'), ('community_challenge_members','user_id'), ('community_profiles','actor_id'),
    ('push_subscriptions','user_id'), ('notification_prefs','user_id'), ('push_log','user_id'),
    ('marketing_consents','user_id'), ('marketing_consent_log','user_id'), ('campaign_recipients','user_id'),
    ('daily_nutrition_goals','user_id'), ('delivery_addresses','user_id'), ('group_buy_participants','user_id'),
    ('group_buys','creator_id'), ('group_buy_comments','user_id'), ('group_buy_likes','user_id'),
    ('meal_diary','user_id'), ('meal_plan_comments','user_id'), ('meal_plan_likes','user_id'),
    ('orders','user_id'), ('payments','user_id'), ('product_clicks','user_id'), ('product_reviews','user_id'),
    ('purchase_order_items','user_id'), ('saved_meal_plans','user_id'), ('shared_meal_plans','user_id'),
    ('subscriptions','user_id'), ('user_behavior_tags','user_id'), ('user_favorites','user_id'),
    ('user_interactions','user_id'), ('user_profiles','user_id'), ('user_taste_preferences','user_id'),
    ('challenge_groups','host_id'), ('challenge_cheers','from_user'), ('challenge_cheers','to_user'),
    ('community_challenge_members','invited_by'), ('share_links','owner'), ('share_events','visitor')
  ) v(tbl, col) loop
    for r in execute format('select ctid from public.%I where %I = $1', t.tbl, t.col) using from_id loop
      begin
        execute format('update public.%I set %I = $1 where ctid = $2', t.tbl, t.col) using to_id, r.ctid;
        n := n + 1;
      exception when unique_violation or check_violation then
        execute format('delete from public.%I where ctid = $1', t.tbl) using r.ctid;
      end;
    end loop;
  end loop;
  -- 합쳐지며 지워진 참여가 있으면 묶음 인원 수를 다시 센다
  update public.challenge_groups g set member_count = (select count(*) from public.community_challenge_members m where m.group_id = g.id)
    where g.id = any(gids);
  update public.community_feed f set author_nickname = p.nickname from public.community_profiles p where p.actor_id = to_id and f.user_id = to_id;
  update public.community_feed_comments c set author_nickname = p.nickname from public.community_profiles p where p.actor_id = to_id and c.user_id = to_id;
  update public.group_buy_comments c set author_nickname = p.nickname from public.community_profiles p where p.actor_id = to_id and c.user_id = to_id;
  return n;
end $function$;
revoke all on function public.merge_actor(text, text) from public, anon, authenticated;
grant execute on function public.merge_actor(text, text) to service_role;
