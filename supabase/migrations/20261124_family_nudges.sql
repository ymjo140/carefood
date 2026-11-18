-- 가족 1단계 — 식단 탭에서 가족 하루 보기 · 콕 찌르기 · 약 체크가 늦으면 보는 사람에게도 알림
--  · alert_meds  (보는 사람 설정) 가족이 정한 약 시각에서 1시간이 지나도 체크가 없으면 나에게 알림 — 약 체크를 보여 주기로 한 연결만
--  · allow_nudge (확인받는 사람 설정) 콕 찌르기 받기 — 끄면 보는 사람 화면에 버튼이 나오지 않고, 서버도 받지 않는다
--  · family_nudges 콕 찌르기 기록 — 연결·날짜·끼니마다 한 번 (unique 로 동시에 두 번 눌러도 한 번)
-- 두 사람 모두 로그인한 계정(기록 주인 id)이라 merge_actor 대상이 아니다. 서버(service role)에서만 읽고 쓴다.

alter table public.family_links add column if not exists alert_meds boolean not null default true;
alter table public.family_links add column if not exists allow_nudge boolean not null default true;

create table if not exists public.family_nudges (
  id bigserial primary key,
  link_id uuid not null references public.family_links(id) on delete cascade,
  day date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner')),
  created_at timestamptz not null default now(),
  unique (link_id, day, meal)
);
create index if not exists family_nudges_link_at on public.family_nudges (link_id, created_at desc);
alter table public.family_nudges enable row level security;
