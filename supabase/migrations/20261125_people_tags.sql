-- 사람 태그 · 원본 출처 (3단계 ②)
--  · 글에 사람을 태그한다 — 서로 팔로우하지 않아도(인플루언서 포함), 받는 사람의 설정 안에서만.
--      community_profiles.tag_allow   누가 나를 태그할 수 있나: all(누구나, 기본) · following(내가 팔로우한 사람만) · none(아무도)
--      community_profiles.tag_review  태그된 글을 바로 보일지: auto(바로, 기본) · manual(내가 승인한 것만 — 그 전엔 pending)
--      community_tag_mutes            '이 사람 태그 받지 않기' — 그 사람은 나를 더 태그할 수 없다 (상대에게는 '태그할 수 없는 사람'으로만)
--  · community_post_people  글 하나에 태그된 사람 (글마다 10명까지 — 서버). 태그된 사람이 지우면 removed (다시 붙지 않음: unique)
--  · community_feed.source_post_id  원본 출처 — '이 식단 따라 한 글 올리기'로 쓴 글이 가리키는 원래 글. 원본이 지워지면 null
-- 서버(service role)에서만 읽고 쓴다.

alter table public.community_profiles add column if not exists tag_allow text not null default 'all' check (tag_allow in ('all', 'following', 'none'));
alter table public.community_profiles add column if not exists tag_review text not null default 'auto' check (tag_review in ('auto', 'manual'));

create table if not exists public.community_post_people (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_feed(id) on delete cascade,
  tagger_id text not null,
  tagged_id text not null,
  status text not null default 'shown' check (status in ('shown', 'pending', 'removed')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  unique (post_id, tagged_id),
  check (tagger_id <> tagged_id)
);
create index if not exists community_post_people_tagged on public.community_post_people (tagged_id, created_at desc);
create index if not exists community_post_people_post on public.community_post_people (post_id);
alter table public.community_post_people enable row level security;

create table if not exists public.community_tag_mutes (
  actor_id text not null,
  muted_id text not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, muted_id),
  check (actor_id <> muted_id)
);
alter table public.community_tag_mutes enable row level security;

alter table public.community_feed add column if not exists source_post_id uuid references public.community_feed(id) on delete set null;
create index if not exists community_feed_source on public.community_feed (source_post_id) where source_post_id is not null;
