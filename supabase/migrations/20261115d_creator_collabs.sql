-- 수요 → 만들 제품 → 협업할 사람 (v3 10.5)
--  · creator_profiles: 커뮤니티 사용자가 스스로 켜는 "협업 제안 받기". 켠 사람만 업체 후보에 나온다.
--    업체에 보이는 것: 닉네임 · 자기소개 · 고른 주제 · 최근 90일 글·반응·팔로워 수 (건강 목표·연락처 없음)
--  · partner_collabs: 업체가 보낸 제안 → 그 사람이 앱에서 받거나 거절한다. 받으면 전용 코드가 생기고,
--    다른 사람이 쿠폰함에서 그 코드를 넣으면 업체 쿠폰을 받는다(coupon_grants.collab_id 로 판매를 센다).
--  · community_feed.sponsor: 협업 중인 사람이 그 업체 제품을 붙여 쓴 글 — 글 맨 앞에 "협찬 · 업체"가 붙는다
--    (추천·보증 심사지침: 경제적 이해관계를 제목·첫 부분에).

create table if not exists public.creator_profiles (
  user_id text primary key,
  is_open boolean not null default false,
  intro text check (intro is null or char_length(intro) <= 100),
  topics text[] not null default '{}',
  opened_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_collabs (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  user_id text not null,
  title text not null check (char_length(title) between 2 and 30),
  offer text not null check (char_length(offer) between 5 and 300),
  product_name text check (product_name is null or char_length(product_name) <= 60),
  coupon_id uuid references public.partner_coupons(id) on delete set null,
  code text unique,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'declined', 'canceled', 'ended')),
  reply text check (reply is null or char_length(reply) <= 200),
  created_by uuid,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  ends_at timestamptz
);
create index if not exists partner_collabs_partner_idx on public.partner_collabs (partner_id, created_at desc);
create index if not exists partner_collabs_user_idx on public.partner_collabs (user_id, status);
-- 한 업체가 같은 사람에게 답을 기다리는 제안은 하나만
create unique index if not exists partner_collabs_one_open on public.partner_collabs (partner_id, user_id) where status = 'proposed';

alter table public.coupon_grants add column if not exists collab_id uuid references public.partner_collabs(id) on delete set null;
create index if not exists coupon_grants_collab_idx on public.coupon_grants (collab_id) where collab_id is not null;

alter table public.community_feed add column if not exists sponsor jsonb;

do $$ declare t text; begin
  foreach t in array array['creator_profiles', 'partner_collabs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
