-- 가족 2단계 — 보여 줄 것 더하기 요청(동의 푸시) · 먹은 음식 보기 · 대신 기록하기 · 음식 추천 보내기
--  · family_links.share_foods  먹은 음식(끼니마다 음식 이름·열량) — 건강 관련 정보라 확인받는 사람이 따로 켠다. 기본 꺼짐
--  · family_links.share_proxy  대신 기록하기 — 보는 사람이 확인받는 사람의 끼니(보낸·계획한 음식)와 약 체크를 대신 기록. 기본 꺼짐
--  · family_requests  보는 사람이 '이것도 보여 줄래요?'를 보내면 확인받는 사람이 푸시·알림함 → 동의 화면에서 직접 켠다
--      연결마다 기다리는 요청은 하나(부분 unique). 답하면 accepted / declined (조건부 update 로 한 번만)
--  · family_link_log.action 에 request · answer 추가 (동의·변경 기록은 그대로 scopes)
--  · planned_meals.sent_by / sent_name / note  가족이 보낸 예정 ('예정 · 지은이 보냄' + 한마디)
--  · meal_diary.recorded_by/recorded_name · med_check_log.checked_by/checked_name  대신 기록한 사람 (기록 주인 화면에 '지은이 기록'으로)
-- 서버(service role)에서만 읽고 쓴다.

alter table public.family_links add column if not exists share_foods boolean not null default false;
alter table public.family_links add column if not exists share_proxy boolean not null default false;

create table if not exists public.family_requests (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.family_links(id) on delete cascade,
  asks text[] not null check (asks <@ array['foods', 'proxy']::text[] and cardinality(asks) between 1 and 2),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  granted text[] not null default '{}',
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create unique index if not exists family_requests_one_pending on public.family_requests (link_id) where status = 'pending';
create index if not exists family_requests_link_at on public.family_requests (link_id, created_at desc);
alter table public.family_requests enable row level security;

alter table public.family_link_log drop constraint if exists family_link_log_action_check;
alter table public.family_link_log add constraint family_link_log_action_check check (action in ('invite', 'accept', 'scopes', 'end', 'request', 'answer'));

alter table public.planned_meals add column if not exists sent_by text;
alter table public.planned_meals add column if not exists sent_name text check (sent_name is null or char_length(sent_name) <= 20);
alter table public.planned_meals add column if not exists note text check (note is null or char_length(note) <= 60);

alter table public.meal_diary add column if not exists recorded_by text;
alter table public.meal_diary add column if not exists recorded_name text check (recorded_name is null or char_length(recorded_name) <= 20);
alter table public.med_check_log add column if not exists checked_by text;
alter table public.med_check_log add column if not exists checked_name text check (checked_name is null or char_length(checked_name) <= 20);
