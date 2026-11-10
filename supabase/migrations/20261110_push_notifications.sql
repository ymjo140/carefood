-- 웹 푸시 알림 — 기기 구독 · 알림 종류별 켜고 끄기 · 보낸 기록(같은 알림 두 번 안 보내기)
-- 알림은 사용자가 켜야만 간다. 보내는 쪽은 /api/push/run (GitHub Actions 가 30분마다 부른다)

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz,
  fail_count int not null default 0
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;

create table if not exists public.notification_prefs (
  user_id text primary key,
  meals boolean not null default true,      -- 점심·저녁 기록 알림
  weekly boolean not null default true,     -- 월요일 주간 요약
  community boolean not null default true,  -- 답글·팔로우 소식
  challenge boolean not null default true,  -- 챌린지 오늘 기록 없음
  community_pushed_at timestamptz,          -- 커뮤니티 소식을 어디까지 보냈는지
  updated_at timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;

create table if not exists public.push_log (
  user_id text not null,
  kind text not null,      -- meal · weekly · community · challenge · test
  key text not null,       -- 2026-11-10:lunch · 2026-11-09(주 월요일) …
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, key)
);
alter table public.push_log enable row level security;

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
  return n;
end $function$;
