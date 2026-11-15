-- 식단 탭: 날짜에 담아 둔 끼니 계획(예정) — 식단 불러오기 시트가 담고, 하루 보기에서 '먹었어요'로 기록하면 지운다
-- (API: /api/diary/planned, 화면: src/app/diary/PlanSheet.tsx). 서비스 롤로만 읽고 쓴다 (RLS 켬, 정책 없음).
-- 한 사람·날짜·끼니에 하나 — 다시 담으면 바꾼다. foods 는 식단 리스트 칸의 음식 목록 그대로(PlanFood[]).
-- 익명 → 계정 합치기(merge_actor)가 옮긴다 (같은 날·끼니가 이미 있으면 계정 쪽을 남긴다).

create table if not exists public.planned_meals (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  foods jsonb not null check (jsonb_typeof(foods) = 'array' and jsonb_array_length(foods) between 1 and 12),
  plan_title text check (plan_title is null or char_length(plan_title) <= 60),
  created_at timestamptz not null default now(),
  unique (user_id, date, meal)
);
create index if not exists planned_meals_user_date on public.planned_meals (user_id, date);
alter table public.planned_meals enable row level security;

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
    ('buddy_wraps','user_id'), ('buddies','user_id'), ('season_watchers','user_id'), ('buddy_chats','user_id'), ('supplements','user_id'), ('supplement_logs','user_id'), ('planned_meals','user_id')
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
