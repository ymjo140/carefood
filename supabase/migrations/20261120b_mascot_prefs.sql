-- 캐릭터 고르기 · 간단 모드 — 알림 설정 줄에 같이 둔다 (익명 → 계정 합치기 merge_actor 가 이미 옮기는 표)
alter table public.notification_prefs
  add column if not exists mascot text not null default 'kkirok',
  add column if not exists mascot_sulk boolean not null default true,
  add column if not exists mascot_moods boolean not null default true,
  add column if not exists simple_mode boolean not null default false;
alter table public.notification_prefs drop constraint if exists notification_prefs_mascot_check;
alter table public.notification_prefs add constraint notification_prefs_mascot_check
  check (mascot in ('kkirok', 'rami', 'kkinyang', 'none'));
