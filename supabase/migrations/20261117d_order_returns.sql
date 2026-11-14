-- 반품·교환 (11/14 구조 진단 P2) — 배송 완료 뒤 구매확정 전에 주문자가 업체 묶음 단위로 요청한다.
--  · return_status: requested(요청) → approved(업체가 받아들임, 회수 중) → returned(회수 확인·환불) | exchanged(교환품 보냄)
--                   requested → rejected(업체가 거절, 이유를 남김)
--  · 요청·회수 중에는 구매확정하지 않는다(자동 확정도 건너뜀). 거절되면 그날부터 다시 8일을 센다(delivered_at 을 거절한 때로).
--  · 반품 완료는 그 묶음을 취소(canceled)로 바꿔 정산에서 빼고 환불할 금액을 늘린다. 마음이 바뀐 반품은 업체가 적은 반품 배송비(return_fee)를 빼고 돌려준다.
--    먹을거리라 돌아온 상품은 재고로 돌려놓지 않는다.
--  · 교환은 같은 상품을 다시 보내는 것 — 발송(shipped)으로 돌아가 배송 완료 → 구매확정을 다시 밟는다.
alter table public.order_items
  add column if not exists return_status text check (return_status is null or return_status in ('requested', 'approved', 'rejected', 'returned', 'exchanged')),
  add column if not exists return_type text check (return_type is null or return_type in ('return', 'exchange')),
  add column if not exists return_reason text check (return_reason is null or return_reason in ('defect', 'damaged', 'wrong', 'change_mind')),
  add column if not exists return_note text,
  add column if not exists return_requested_at timestamptz,
  add column if not exists return_resolved_at timestamptz,
  add column if not exists return_reply text,
  add column if not exists return_fee integer check (return_fee is null or (return_fee >= 0 and return_fee <= 100000)),
  add column if not exists return_notified_at timestamptz;

create index if not exists order_items_return_open_idx on public.order_items (partner_id, return_status) where return_status in ('requested', 'approved');

create or replace function public.order_auto_confirm(p_days integer default 8)
returns integer language plpgsql set search_path = public as $$
declare n integer;
begin
  update public.order_items
     set confirmed_at = delivered_at + make_interval(days => p_days), confirm_by = 'auto'
   where fulfil_status = 'delivered' and confirmed_at is null and delivered_at is not null
     and delivered_at <= now() - make_interval(days => p_days)
     and (return_status is null or return_status not in ('requested', 'approved'));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.order_auto_confirm(integer) from public, anon, authenticated;
