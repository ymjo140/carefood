-- 재료 캐릭터(버디) — 보자기(받은 것) · 버디(푼 것). 규칙: src/lib/buddy.ts
-- 보자기는 기록으로만 받는다(가입 · 연속 30일마다 · 시즌 참여). 돈으로 사는 랜덤 뽑기는 없다.
-- 서비스 롤로만 읽고 쓴다 (RLS 켬, 정책 없음). user_id = actor (익명이면 계정 합치기 merge_actor 가 옮긴다 — 아래 함수 갱신).

create table if not exists public.buddy_wraps (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  kind text not null check (kind in ('start', 'streak', 'season')),
  -- 같은 보자기를 두 번 받지 않게: start · streak:<n> · season:<slug>
  key text not null,
  earned_at timestamptz not null default now(),
  opened_at timestamptz,
  buddy_id uuid,
  unique (user_id, key)
);
create index if not exists buddy_wraps_open on public.buddy_wraps (user_id) where opened_at is null;
alter table public.buddy_wraps enable row level security;

create table if not exists public.buddies (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  ingredient text not null,
  personality text not null check (personality in ('kind', 'picky', 'prim', 'calm', 'chatty', 'brave', 'shy', 'odd')),
  wrap_id uuid references public.buddy_wraps(id) on delete set null,
  active boolean not null default false,
  hatched_at timestamptz not null default now()
);
create unique index if not exists buddies_one_active on public.buddies (user_id) where active;
create index if not exists buddies_user on public.buddies (user_id, hatched_at);
alter table public.buddies enable row level security;

-- 보자기 풀기 — 한 번만 (조건부 update 로 잠근 뒤 버디를 만든다). 첫 버디면 바로 같이 다니는 버디가 된다.
create or replace function public.buddy_open(p_user text, p_wrap uuid, p_ingredient text, p_personality text)
returns public.buddies language plpgsql security definer set search_path = public as $$
declare w public.buddy_wraps; b public.buddies; has_active boolean;
begin
  update public.buddy_wraps set opened_at = now() where id = p_wrap and user_id = p_user and opened_at is null returning * into w;
  if w.id is null then raise exception '이미 풀었거나 없는 보자기예요' using errcode = 'P0001'; end if;
  select exists(select 1 from public.buddies where user_id = p_user and active) into has_active;
  insert into public.buddies (user_id, ingredient, personality, wrap_id, active)
    values (p_user, p_ingredient, p_personality, w.id, not has_active) returning * into b;
  update public.buddy_wraps set buddy_id = b.id where id = w.id;
  return b;
end $$;
revoke all on function public.buddy_open(text, uuid, text, text) from public, anon, authenticated;

-- 같이 다니는 버디 바꾸기 — 하나만 active
create or replace function public.buddy_activate(p_user text, p_buddy uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.buddies where id = p_buddy and user_id = p_user) then
    raise exception '내 캐릭터가 아니에요' using errcode = 'P0001';
  end if;
  update public.buddies set active = false where user_id = p_user and active and id <> p_buddy;
  update public.buddies set active = true where id = p_buddy;
end $$;
revoke all on function public.buddy_activate(text, uuid) from public, anon, authenticated;

-- 요금제 뜻 바꾸기 (11/14): 캐릭터 1마리는 무료. 기본 구독 = 숫자 체크·매 끼니 추천·주간 리포트, 플러스 = 여기에 3마리·성격 바꾸기·꾸미기.
alter table public.subscription_plans add column if not exists slots integer not null default 1;
update public.subscription_plans set name = '무료', slots = 1, characters = '{}' where code = 'basic';
update public.subscription_plans set name = '기본 구독', slots = 1, characters = '{}' where code = 'kkirok';
update public.subscription_plans set name = '플러스 구독', slots = 3, characters = '{}' where code = 'all';

-- 익명 → 계정 합치기: 버디·보자기·시즌 시작 알림도 옮긴다. 양쪽 다 같이 다니는 버디가 있으면 익명 쪽은 보관함으로(지우지 않음).
create or replace function public.merge_actor(from_id text, to_id text)
 returns integer language plpgsql set search_path to 'public' as $function$
declare t record; r record; n int := 0; gids uuid[];
begin
  if from_id is null or to_id is null or from_id = to_id then return 0; end if;
  gids := array(select group_id from public.community_challenge_members where user_id in (from_id, to_id) and group_id is not null);
  if exists (select 1 from public.buddies where user_id = to_id and active) then
    update public.buddies set active = false where user_id = from_id and active;
  end if;
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
    ('community_challenge_members','invited_by'), ('share_links','owner'), ('share_events','visitor'),
    ('order_inquiries','user_id'), ('coupon_grants','user_id'), ('flow_sends','user_id'), ('partner_collabs','user_id'),
    ('creator_profiles','user_id'), ('community_challenges','creator_id'),
    ('buddy_wraps','user_id'), ('buddies','user_id'), ('season_watchers','user_id')
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
  update public.challenge_groups g set member_count = (select count(*) from public.community_challenge_members m where m.group_id = g.id)
    where g.id = any(gids);
  update public.community_feed f set author_nickname = p.nickname from public.community_profiles p where p.actor_id = to_id and f.user_id = to_id;
  update public.community_feed_comments c set author_nickname = p.nickname from public.community_profiles p where p.actor_id = to_id and c.user_id = to_id;
  update public.group_buy_comments c set author_nickname = p.nickname from public.community_profiles p where p.actor_id = to_id and c.user_id = to_id;
  return n;
end $function$;
