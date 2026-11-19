-- 리그램 스토리 · 같이 먹기 기록 (3단계 ③)
--  · community_feed.regram_of  다른 사람 글을 '내 스토리에 올리기' 한 글 — 스토리 줄에만 나오고 피드 목록에는 나오지 않는다.
--      사진·영상·식단은 원본 것을 읽어 보여 준다(복사하지 않는다). 원본이 지워지거나 가려지면 리그램도 보이지 않는다.
--      한 사람이 한 글을 한 번만(보이는 것 기준 unique).
--  · community_profiles.allow_regram  다른 사람이 내 글을 스토리에 올리는 것을 허락(기본 켜짐). 끄면 이미 올린 리그램도 보이지 않는다.
--  · community_post_people.recorded_at  태그된 사람이 그 끼니를 '내 식단에도 기록하기' 한 시각 — 한 번만(조건부 update)
-- 서버(service role)에서만 읽고 쓴다.

alter table public.community_profiles add column if not exists allow_regram boolean not null default true;

alter table public.community_feed add column if not exists regram_of uuid references public.community_feed(id) on delete set null;
create unique index if not exists community_feed_one_regram on public.community_feed (user_id, regram_of) where regram_of is not null and is_active;
create index if not exists community_feed_regram on public.community_feed (regram_of) where regram_of is not null;

alter table public.community_post_people add column if not exists recorded_at timestamptz;
