-- 커뮤니티 안전 (1) 이름을 서버에 (2) 횟수 제한 기록
-- 앱 서버(서비스 키)만 읽고 쓴다 — RLS 를 켜고 정책은 두지 않는다

-- (1) 사람(기록 주인 id)마다 이름 하나. nickname_key 는 소문자 — 대소문자만 다른 이름도 겹치지 않게
create table if not exists public.community_profiles (
  actor_id text primary key,
  nickname text not null,
  nickname_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.community_profiles enable row level security;

-- 이미 글·답글을 쓴 사람은 가장 최근 이름으로 (규칙에 맞고 아직 아무도 안 쓴 것만 — 나머지는 다음 글을 쓸 때 정해진다)
insert into public.community_profiles (actor_id, nickname, nickname_key)
select distinct on (lower(nickname)) user_id, nickname, lower(nickname)
from (
  select distinct on (user_id) user_id, author_nickname as nickname, created_at
  from (
    select user_id, author_nickname, created_at from public.community_feed
    union all
    select user_id, author_nickname, created_at from public.community_feed_comments
  ) x
  where author_nickname ~ '^[가-힣a-zA-Z0-9_]{2,12}$'
  order by user_id, created_at desc
) y
order by lower(nickname), created_at desc
on conflict do nothing;

-- (2) 횟수 제한 기록 — IP 는 해시만 (src/lib/rate-limit.ts), 이틀 지나면 지운다
create table if not exists public.community_rate (
  id bigserial primary key,
  action text not null,
  actor_id text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists community_rate_actor_idx on public.community_rate (action, actor_id, created_at);
create index if not exists community_rate_ip_idx on public.community_rate (action, ip_hash, created_at);
alter table public.community_rate enable row level security;

-- 로그인하면 이 기기 기록을 계정으로 옮기는 함수에 이름도 넣는다 (계정에 이미 이름이 있으면 그 이름이 남는다)
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
    ('community_poll_votes','user_id'), ('community_challenge_members','user_id'), ('community_profiles','actor_id'),
    ('push_subscriptions','user_id'), ('notification_prefs','user_id'), ('push_log','user_id'),
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
  -- 옮긴 글·답글의 이름을 계정 이름으로 맞춘다
  update public.community_feed f set author_nickname = p.nickname from public.community_profiles p where p.actor_id = to_id and f.user_id = to_id;
  update public.community_feed_comments c set author_nickname = p.nickname from public.community_profiles p where p.actor_id = to_id and c.user_id = to_id;
  return n;
end $function$;
