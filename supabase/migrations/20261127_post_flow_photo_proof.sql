-- 피드 올리기 고도화 + 챌린지 사진 인증
--  · community_feed
--      visibility  'public'(전체) | 'followers'(팔로워만 — 글쓴이·팔로워·태그된 사람에게만 보인다. 리그램·스토리 공유 안 됨)
--      client_key  올리기 버튼을 두 번 누르거나 네트워크가 끊겨 다시 보내도 글 하나만 (사람마다 unique)
--      day         그 글의 끼니 날짜(한국 날짜). 챌린지 인증 판정에 쓴다
--      diary_ids   글에 연결한 식단 기록 — 영양값은 서버가 이 기록에서 복사한다(보낸 숫자를 믿지 않는다)
--      media       사진마다 { upload_id, w, h } — 순서는 image_urls 와 같다
--      show_kcal   식단 숫자(열량) 보이기
--  · community_uploads  올린 사진 한 장 = 한 줄. 찍은 시각(EXIF)·출처·지문(dHash)을 서버가 남긴다.
--      used_post_id 는 글 하나에만 붙는다(조건부 update 로 잡는다)
--  · challenge_proofs  챌린지 하루 인증 = 사진 한 장. 같은 사진(지문 가까움)을 다른 날 다시 쓰면 인증되지 않는다.
--      글이 지워지면 인증도 지워진다(on delete cascade, 글 삭제 API 도 같이 지운다)
--  · community_challenges.proof  'photo'(사진 인증 필요, 기본) | 'none'(기록만으로)
--  · challenge_cohorts  공식 챌린지 기수 — 격주 월요일 시작
-- 서버(service role)에서만 읽고 쓴다.

alter table public.community_feed add column if not exists visibility text not null default 'public';
alter table public.community_feed drop constraint if exists community_feed_visibility_check;
alter table public.community_feed add constraint community_feed_visibility_check check (visibility in ('public', 'followers'));
alter table public.community_feed add column if not exists client_key text;
create unique index if not exists community_feed_client_key on public.community_feed (user_id, client_key) where client_key is not null;
alter table public.community_feed add column if not exists day date;
alter table public.community_feed add column if not exists diary_ids uuid[] not null default '{}';
alter table public.community_feed add column if not exists media jsonb;
alter table public.community_feed add column if not exists show_kcal boolean not null default true;
create index if not exists community_feed_visibility on public.community_feed (visibility) where visibility <> 'public';

create table if not exists public.community_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  url text not null,
  path text not null,
  width int,
  height int,
  -- 찍은 시각 — 'exif'(파일 안 촬영 시각) · 'client'(기기가 읽어 보낸 값) · 'none'(없음 → '앨범에서 고름' 표시)
  taken_at timestamptz,
  taken_source text not null default 'none' check (taken_source in ('exif', 'client', 'none')),
  -- 64비트 dHash 16진수 — 같은 사진 다시 쓰기를 거른다
  phash text,
  created_at timestamptz not null default now(),
  used_post_id uuid references public.community_feed(id) on delete set null
);
create index if not exists community_uploads_user on public.community_uploads (user_id, created_at desc);
create index if not exists community_uploads_post on public.community_uploads (used_post_id) where used_post_id is not null;
alter table public.community_uploads enable row level security;

create table if not exists public.challenge_proofs (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.community_challenges(id) on delete cascade,
  user_id text not null,
  day date not null,
  meal_type text,
  post_id uuid not null references public.community_feed(id) on delete cascade,
  upload_id uuid not null references public.community_uploads(id) on delete cascade,
  phash text,
  status text not null default 'ok' check (status in ('ok', 'hidden')),
  created_at timestamptz not null default now(),
  unique (challenge_id, user_id, day, upload_id)
);
create index if not exists challenge_proofs_member on public.challenge_proofs (challenge_id, user_id, day);
create index if not exists challenge_proofs_recent on public.challenge_proofs (challenge_id, created_at desc) where status = 'ok';
create index if not exists challenge_proofs_post on public.challenge_proofs (post_id);
alter table public.challenge_proofs enable row level security;

alter table public.community_challenges add column if not exists proof text not null default 'photo';
alter table public.community_challenges drop constraint if exists community_challenges_proof_check;
alter table public.community_challenges add constraint community_challenges_proof_check check (proof in ('none', 'photo'));
alter table public.community_challenges add column if not exists cover_url text;
alter table public.community_challenges add column if not exists how_to text;

create table if not exists public.challenge_cohorts (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.community_challenges(id) on delete cascade,
  -- 시작일 = 격주 월요일(한국 날짜). 모집은 시작 전날까지
  start_on date not null,
  apply_until date not null,
  days int not null,
  created_at timestamptz not null default now(),
  unique (challenge_id, start_on)
);
create index if not exists challenge_cohorts_start on public.challenge_cohorts (start_on);
alter table public.challenge_cohorts enable row level security;

alter table public.community_challenge_members add column if not exists cohort_id uuid references public.challenge_cohorts(id) on delete set null;
alter table public.challenge_groups add column if not exists cohort_id uuid references public.challenge_cohorts(id) on delete set null;

-- 신고 이유 — 남의 사진으로 인증 · 몸·체중 사진 (인증 사진 갤러리에서)
alter table public.community_reports drop constraint if exists community_reports_reason_check;
alter table public.community_reports add constraint community_reports_reason_check
  check (reason in ('spam', 'abuse', 'medical', 'ad', 'privacy', 'stolen_photo', 'body_photo', 'other'));

-- 아직 배포 전 — 사진 규칙을 모두에게 적용하므로 테스트로 쌓인 참여 기록을 비운다
delete from public.challenge_cheers;
delete from public.community_challenge_members;
delete from public.challenge_groups;
