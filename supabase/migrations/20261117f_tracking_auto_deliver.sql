-- 택배 조회로 배송 완료 자동 찍기 (11/14 결정 — 업체가 배송 완료를 누르지 않으면 구매확정 8일이 시작되지 않아 정산이 멈춘다)
--  · tracking_status: 마지막으로 조회한 상태(DELIVERED·OUT_FOR_DELIVERY·IN_TRANSIT 등, tracker.delivery 코드)
--  · tracking_checked_at: 마지막 조회 시각 — 3시간마다 한 번만 다시 묻는다
--  · delivered_by: 배송 완료를 누가 찍었나 — partner(업체) · tracking(택배 조회) · buyer(구매자가 받았어요)
alter table public.order_items
  add column if not exists tracking_status text,
  add column if not exists tracking_checked_at timestamptz,
  add column if not exists delivered_by text check (delivered_by is null or delivered_by in ('partner', 'tracking', 'buyer'));

create index if not exists order_items_tracking_due_idx on public.order_items (tracking_checked_at nulls first)
  where fulfil_status = 'shipped' and tracking_number is not null;
