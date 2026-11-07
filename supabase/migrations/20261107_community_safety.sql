-- 커뮤니티 안전·답글·알림 읽음·사진 (2026-11-07)
-- 1) 신고 — 글·답글. 같은 사람이 같은 걸 두 번 신고하지 못한다. 3건이 모이면 관리자가 볼 때까지 모두에게서 가린다
-- 2) 숨기기 — 나에게만 안 보이게
-- 3) 차단 — 그 사람의 글·답글을 나에게 보이지 않게
-- 4) 답글에 답글 (parent_id), 답글 지우기 (is_active)
-- 5) 알림 읽음 — 마지막으로 알림을 본 시각 (기기가 아니라 사람 기준)
-- 6) 사진 — 공개 버킷 community (서버가 메타데이터를 지운 webp 만 올린다)
-- 모든 표는 RLS 켜고 정책 없음 = 서버(service role)만 읽고 쓴다

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id text not null,
  post_id uuid references public.community_feed(id) on delete cascade,
  comment_id uuid references public.community_feed_comments(id) on delete cascade,
  reason text not null check (reason in ('spam', 'abuse', 'medical', 'ad', 'privacy', 'other')),
  detail text check (detail is null or char_length(detail) <= 300),
  status text not null default 'pending' check (status in ('pending', 'kept', 'removed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check ((post_id is not null) <> (comment_id is not null))
);
create unique index if not exists community_reports_post_once on public.community_reports (reporter_id, post_id) where post_id is not null;
create unique index if not exists community_reports_comment_once on public.community_reports (reporter_id, comment_id) where comment_id is not null;
create index if not exists community_reports_pending on public.community_reports (status, created_at desc);
alter table public.community_reports enable row level security;

create table if not exists public.community_hidden_posts (
  user_id text not null,
  post_id uuid not null references public.community_feed(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
alter table public.community_hidden_posts enable row level security;

create table if not exists public.community_blocks (
  blocker_id text not null,
  blocked_id text not null,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.community_blocks enable row level security;

alter table public.community_feed
  add column if not exists report_count int not null default 0,
  add column if not exists hidden_by_reports boolean not null default false;

alter table public.community_feed_comments
  add column if not exists parent_id uuid references public.community_feed_comments(id) on delete cascade,
  add column if not exists is_active boolean not null default true,
  add column if not exists report_count int not null default 0,
  add column if not exists hidden_by_reports boolean not null default false;
create index if not exists community_feed_comments_parent on public.community_feed_comments (parent_id) where parent_id is not null;

create table if not exists public.notification_reads (
  user_id text primary key,
  seen_at timestamptz not null default now()
);
alter table public.notification_reads enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community', 'community', true, 2097152, array['image/webp'])
on conflict (id) do nothing;

-- 기록 주인 바꾸기에 새 표를 더한다 (로그인할 때 기기 기록을 계정으로 옮김)
create or replace function public.merge_actor(from_id text, to_id text) returns int
language plpgsql set search_path = public as $$
declare t record; r record; n int := 0;
begin
  if from_id is null or to_id is null or from_id = to_id then return 0; end if;
  for t in select * from (values
    ('community_bookmarks','user_id'), ('community_feed','user_id'), ('community_feed_comments','user_id'),
    ('community_feed_likes','user_id'), ('community_follows','follower_id'), ('community_follows','following_id'),
    ('community_reports','reporter_id'), ('community_hidden_posts','user_id'),
    ('community_blocks','blocker_id'), ('community_blocks','blocked_id'), ('notification_reads','user_id'),
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
end $$;
revoke all on function public.merge_actor(text, text) from public, anon, authenticated;
grant execute on function public.merge_actor(text, text) to service_role;
