-- 글 사진 여러 장 (최대 4장) — 2026-11-07
-- image_url(한 장)은 첫 장으로 남겨 예전 화면과 맞춘다
alter table public.community_feed add column if not exists image_urls text[] not null default '{}';
update public.community_feed set image_urls = array[image_url] where image_url is not null and cardinality(image_urls) = 0;
alter table public.community_feed drop constraint if exists community_feed_image_urls_max4;
alter table public.community_feed add constraint community_feed_image_urls_max4 check (cardinality(image_urls) <= 4);
