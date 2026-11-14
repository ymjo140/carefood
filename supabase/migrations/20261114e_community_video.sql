-- 짧은 영상 (식단 글·공구 글) — 2026-11-14
--
-- 휴대폰 영상에는 촬영 위치·기기 정보가 들어 있는 경우가 많다. 인스타그램처럼 서버에서 새 파일로 다시 만들어
-- 공개 파일에는 그런 정보가 남지 않게 한다. 원본은 처리하자마자 지운다(인스타그램과 달리 남기지 않음).
--   community-video-raw (비공개) : 휴대폰이 서명된 주소로 바로 올린다. 50MB, mp4·mov·webm
--   community-video     (공개)   : 서버가 다시 만든 H.264 mp4 (긴 변 1280, 30초 이하)
--   표지(poster) 사진은 기존 community 버킷(webp)에 둔다
-- 글·공구에는 한 개만: video_url · video_poster · video_seconds

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('community-video-raw', 'community-video-raw', false, 52428800, array['video/mp4', 'video/quicktime', 'video/webm']),
  ('community-video', 'community-video', true, 20971520, array['video/mp4'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

alter table public.community_feed
  add column if not exists video_url text,
  add column if not exists video_poster text,
  add column if not exists video_seconds numeric(5, 1);
alter table public.group_buys
  add column if not exists video_url text,
  add column if not exists video_poster text,
  add column if not exists video_seconds numeric(5, 1);
