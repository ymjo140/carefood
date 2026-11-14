-- 공구: 판매처에 요청한 시각 (2026-11-14)
-- 관심이 목표 인원에 닿은(reached_at) 공구를 관리자가 판매처에 요청하면 requested_at 을 적는다.
-- 알림 받는 사람에게 "판매처에 공구를 요청했어요" 소식이 간다 (lib/notifications).
alter table public.group_buys
  add column if not exists requested_at timestamptz,
  add column if not exists request_note text check (request_note is null or char_length(request_note) <= 200);
create index if not exists group_buys_reached_idx on public.group_buys (reached_at) where reached_at is not null;
