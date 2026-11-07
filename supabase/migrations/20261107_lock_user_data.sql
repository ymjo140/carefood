-- 사용자 데이터 잠금 (2026-11-07)
-- 브라우저에 공개된 anon 키로 사용자 테이블을 직접 읽고 쓸 수 있던 것을 막는다.
-- 앱 서버는 service role 로 접근하므로(RLS 를 건너뜀) 동작은 그대로다.

-- 1) RLS 가 꺼져 있던 테이블 모두 켜기 (정책 없음 = service role 만)
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end $$;

-- 2) 이름은 'Service role full access' 인데 실제로는 모두(anon 포함)에게 열려 있던 정책 지우기
do $$
declare p record;
begin
  for p in select tablename, policyname from pg_policies
           where schemaname = 'public' and policyname = 'Service role full access' and qual = 'true' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- 3) 로그인 계정 ↔ 기록 주인(actor) 연결, 예전 익명 ID 옮긴 기록
create table if not exists public.account_links (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  actor_id text not null unique,
  created_at timestamptz not null default now()
);
alter table public.account_links enable row level security;

create table if not exists public.actor_claims (
  legacy_id text primary key,
  actor_id text not null,
  moved int not null default 0,
  claimed_at timestamptz not null default now()
);
alter table public.actor_claims enable row level security;

-- 4) 구매 링크를 어느 화면·자리에서 눌렀는지
alter table public.product_clicks add column if not exists placement text;

-- 5) 기록 주인 바꾸기 (예전 익명 ID → 새 ID, 기기 ID → 계정 ID). 같은 키가 이미 있으면 옮기는 쪽을 지운다.
create or replace function public.merge_actor(from_id text, to_id text) returns int
language plpgsql set search_path = public as $$
declare t record; r record; n int := 0;
begin
  if from_id is null or to_id is null or from_id = to_id then return 0; end if;
  for t in select * from (values
    ('community_bookmarks','user_id'), ('community_feed','user_id'), ('community_feed_comments','user_id'),
    ('community_feed_likes','user_id'), ('community_follows','follower_id'), ('community_follows','following_id'),
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
      exception when unique_violation then
        execute format('delete from public.%I where ctid = $1', t.tbl) using r.ctid;
      end;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function public.merge_actor(text, text) from public, anon, authenticated;
grant execute on function public.merge_actor(text, text) to service_role;
