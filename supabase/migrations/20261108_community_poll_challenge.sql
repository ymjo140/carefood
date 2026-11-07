-- 커뮤니티 투표 + 챌린지
-- 투표: 글에 선택지 2~4개(poll), 한 사람 한 표(바꿀 수 있음)
-- 챌린지: 정해 둔 규칙(나트륨 2,000mg 이하 등)을 참여한 날부터 N일 동안 — 달성 여부는 식단 기록(meal_diary)에서 계산한다

alter table public.community_feed add column if not exists poll jsonb;
comment on column public.community_feed.poll is '투표 { options: text[2..4], closes_at: timestamptz }';

create table if not exists public.community_poll_votes (
  post_id uuid not null references public.community_feed(id) on delete cascade,
  user_id text not null,
  choice smallint not null check (choice between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists community_poll_votes_post_idx on public.community_poll_votes (post_id);
alter table public.community_poll_votes enable row level security;

create table if not exists public.community_challenges (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  rule text not null,
  metric text not null check (metric in ('sodium_max', 'protein_min', 'sugar_max', 'meals_min', 'kcal_max')),
  target numeric not null check (target > 0),
  days smallint not null default 7 check (days between 3 and 30),
  sort smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.community_challenges enable row level security;

create table if not exists public.community_challenge_members (
  challenge_id uuid not null references public.community_challenges(id) on delete cascade,
  user_id text not null,
  started_on date not null,
  finished_runs int not null default 0,
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
create index if not exists community_challenge_members_user_idx on public.community_challenge_members (user_id);
alter table public.community_challenge_members enable row level security;

insert into public.community_challenges (slug, title, rule, metric, target, days, sort) values
  ('sodium-2000', '일주일 나트륨 2,000mg 이하', '하루에 기록한 나트륨이 2,000mg 이하인 날', 'sodium_max', 2000, 7, 1),
  ('protein-60', '일주일 단백질 60g 채우기', '하루에 기록한 단백질이 60g 이상인 날', 'protein_min', 60, 7, 2),
  ('sugar-25', '일주일 당류 25g 이하', '하루에 기록한 당류가 25g 이하인 날', 'sugar_max', 25, 7, 3),
  ('meals-3', '일주일 세 끼 기록하기', '아침·점심·저녁을 모두 기록한 날', 'meals_min', 3, 7, 4)
on conflict (slug) do nothing;

-- 로그인하면 기기 기록을 계정으로 옮기는 함수에 새 표를 더한다
create or replace function public.merge_actor(from_id text, to_id text)
 returns integer
 language plpgsql
 set search_path to 'public'
as $function$
declare t record; r record; n int := 0;
begin
  if from_id is null or to_id is null or from_id = to_id then return 0; end if;
  for t in select * from (values
    ('community_bookmarks','user_id'), ('community_feed','user_id'), ('community_feed_comments','user_id'),
    ('community_feed_likes','user_id'), ('community_follows','follower_id'), ('community_follows','following_id'),
    ('community_reports','reporter_id'), ('community_hidden_posts','user_id'),
    ('community_blocks','blocker_id'), ('community_blocks','blocked_id'), ('notification_reads','user_id'),
    ('community_poll_votes','user_id'), ('community_challenge_members','user_id'),
    ('daily_nutrition_goals','user_id'), ('delivery_addresses','user_id'), ('group_buy_participants','user_id'),
    ('group_buys','creator_id'), ('meal_diary','user_id'), ('meal_plan_comments','user_id'), ('meal_plan_likes','user_id'),
    ('orders','user_id'), ('payments','user_id'), ('product_clicks','user_id'), ('product_reviews','user_id'),
    ('purchase_order_items','user_id'), ('saved_meal_plans','user_id'), ('shared_meal_plans','user_id'),
    ('subscriptions','user_id'), ('user_behavior_tags','user_id'), ('user_favorites','user_id'),
    ('user_interactions','user_id'), ('user_profiles','user_id'), ('user_taste_preferences','user_id')
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
  return n;
end $function$;
