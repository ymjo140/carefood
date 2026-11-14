-- 공구 글 — 질문 댓글 · 좋아요 · 목표 도달 시각 (2026-11-14)
--
-- 인플루언서 공구에서 잘 팔리는 신호는 구매 의도가 있는 질문 댓글이다. 공구 글에 질문(댓글)·진행자 답·좋아요를 단다.
-- 수는 트리거로 센다(동시에 눌러도 어긋나지 않게). 관심 표시·거두기는 함수 하나에서 줄을 잠그고 센다.
-- reached_at: 관심이 목표 인원에 처음 닿은 시각 — 진행자·참여자 알림(lib/notifications)의 기준

alter table public.group_buys
  add column if not exists like_count integer not null default 0,
  add column if not exists comment_count integer not null default 0,
  add column if not exists reached_at timestamptz;

create table if not exists public.group_buy_comments (
  id uuid primary key default gen_random_uuid(),
  group_buy_id uuid not null references public.group_buys (id) on delete cascade,
  parent_id uuid references public.group_buy_comments (id) on delete cascade,
  user_id text not null,
  author_nickname text,
  content text not null check (char_length(content) between 1 and 300),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists group_buy_comments_gb_idx on public.group_buy_comments (group_buy_id, created_at);
create index if not exists group_buy_comments_parent_idx on public.group_buy_comments (parent_id) where parent_id is not null;
create index if not exists group_buy_comments_user_idx on public.group_buy_comments (user_id);
alter table public.group_buy_comments enable row level security;

create table if not exists public.group_buy_likes (
  group_buy_id uuid not null references public.group_buys (id) on delete cascade,
  user_id text not null,
  created_at timestamptz not null default now(),
  primary key (group_buy_id, user_id)
);
create index if not exists group_buy_likes_user_idx on public.group_buy_likes (user_id);
alter table public.group_buy_likes enable row level security;

-- 수 세기
create or replace function public.group_buy_count_talk() returns trigger
language plpgsql security definer set search_path = '' as $$
declare gid uuid := coalesce(new.group_buy_id, old.group_buy_id);
begin
  if tg_table_name = 'group_buy_likes' then
    update public.group_buys set like_count = (select count(*) from public.group_buy_likes where group_buy_id = gid) where id = gid;
  else
    update public.group_buys set comment_count = (select count(*) from public.group_buy_comments where group_buy_id = gid and is_active) where id = gid;
  end if;
  return null;
end $$;
drop trigger if exists group_buy_likes_count on public.group_buy_likes;
create trigger group_buy_likes_count after insert or delete on public.group_buy_likes for each row execute function public.group_buy_count_talk();
drop trigger if exists group_buy_comments_count on public.group_buy_comments;
create trigger group_buy_comments_count after insert or delete or update of is_active on public.group_buy_comments for each row execute function public.group_buy_count_talk();

-- 관심 표시·거두기 — 공구 줄을 잠그고 참여 기록과 수를 함께 바꾼다
-- 반환: { ok, current_count, reached, error? }  error: missing | closed | expired | already
create or replace function public.group_buy_mark(p_id uuid, p_user text, p_on boolean, p_sales_open boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g record; n integer; changed integer;
begin
  select * into g from public.group_buys where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'missing'); end if;
  if g.status <> 'recruiting' then return jsonb_build_object('ok', false, 'error', 'closed', 'current_count', g.current_count); end if;
  if p_on and g.expires_at is not null and g.expires_at < now() then return jsonb_build_object('ok', false, 'error', 'expired', 'current_count', g.current_count); end if;

  if p_on then
    insert into public.group_buy_participants (group_buy_id, user_id)
      select p_id, p_user where not exists (select 1 from public.group_buy_participants where group_buy_id = p_id and user_id = p_user);
  else
    delete from public.group_buy_participants where group_buy_id = p_id and user_id = p_user;
  end if;
  get diagnostics changed = row_count;

  select count(*) into n from public.group_buy_participants where group_buy_id = p_id;
  update public.group_buys set
    current_count = n,
    updated_at = now(),
    reached_at = case when reached_at is null and n >= target_count then now() else reached_at end,
    status = case when p_sales_open and n >= target_count then 'achieved' else status end,
    achieved_at = case when p_sales_open and n >= target_count and achieved_at is null then now() else achieved_at end
  where id = p_id;

  if p_on and changed = 0 then return jsonb_build_object('ok', false, 'error', 'already', 'current_count', n); end if;
  return jsonb_build_object('ok', true, 'current_count', n, 'reached', n >= g.target_count);
end $$;

-- 좋아요 켜고 끄기 — { liked, like_count }
create or replace function public.group_buy_like(p_id uuid, p_user text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare liked boolean; c integer;
begin
  delete from public.group_buy_likes where group_buy_id = p_id and user_id = p_user;
  if found then liked := false;
  else
    insert into public.group_buy_likes (group_buy_id, user_id) values (p_id, p_user);
    liked := true;
  end if;
  select like_count into c from public.group_buys where id = p_id;
  return jsonb_build_object('liked', liked, 'like_count', coalesce(c, 0));
end $$;

revoke all on function public.group_buy_mark(uuid, text, boolean, boolean) from public, anon, authenticated;
revoke all on function public.group_buy_like(uuid, text) from public, anon, authenticated;
grant execute on function public.group_buy_mark(uuid, text, boolean, boolean) to service_role;
grant execute on function public.group_buy_like(uuid, text) to service_role;

-- 지금 수로 한 번 맞추기
update public.group_buys g set current_count = (select count(*) from public.group_buy_participants p where p.group_buy_id = g.id);

-- 비회원 → 계정으로 옮길 때 공구 댓글·좋아요도 같이 (20261114_partner_crm 의 merge_actor 에 두 표를 더함)
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
    ('marketing_consents','user_id'), ('marketing_consent_log','user_id'), ('campaign_recipients','user_id'),
    ('daily_nutrition_goals','user_id'), ('delivery_addresses','user_id'), ('group_buy_participants','user_id'),
    ('group_buys','creator_id'), ('group_buy_comments','user_id'), ('group_buy_likes','user_id'),
    ('meal_diary','user_id'), ('meal_plan_comments','user_id'), ('meal_plan_likes','user_id'),
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
  update public.community_feed f set author_nickname = p.nickname from public.community_profiles p where p.actor_id = to_id and f.user_id = to_id;
  update public.community_feed_comments c set author_nickname = p.nickname from public.community_profiles p where p.actor_id = to_id and c.user_id = to_id;
  update public.group_buy_comments c set author_nickname = p.nickname from public.community_profiles p where p.actor_id = to_id and c.user_id = to_id;
  return n;
end $function$;
