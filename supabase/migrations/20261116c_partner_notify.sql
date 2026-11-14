-- 업체 알림 (11/14 구조 진단 P0) — 새 주문·취소 요청을 업체 담당자에게 푸시로 알린다 (/api/push/run 이 30분마다 돈다).
-- 알린 줄에 시각을 적어 두어 다시 보내지 않는다. 담당자 → account_links.actor_id → push_subscriptions 로 찾는다.
alter table public.order_items add column if not exists partner_notified_at timestamptz;
alter table public.order_items add column if not exists cancel_notified_at timestamptz;
-- 이 적용 전 주문은 이미 본 것으로 둔다 (한꺼번에 몰아서 알리지 않게)
update public.order_items set partner_notified_at = now() where partner_notified_at is null and fulfil_status <> 'new';
update public.order_items set cancel_notified_at = now() where cancel_notified_at is null and cancel_requested_at is not null;
create index if not exists order_items_notify_new_idx on public.order_items (partner_id) where fulfil_status = 'new' and partner_notified_at is null;
