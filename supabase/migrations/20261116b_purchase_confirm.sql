-- 구매확정과 월 정산 (11/14 결정: 정산 월 1회 · 구매확정 = 구매자가 누르거나 배송 완료 8일 뒤 저절로)
--  · order_items.confirmed_at / confirm_by: 업체 묶음 단위로 구매자가 '구매확정하기'를 누르면 buyer, 배송 완료 8일 뒤 auto.
--    앱 주문 대금은 확정일(한국 시간)이 속한 달에 정산하고, 다음 달 10일에 지급한다 (lib/partner/payout.ts).
--  · order_auto_confirm(): 배송 완료 8일이 지난 줄을 확정한다 (확정 시각 = 배송 완료 + 8일). /api/push/run 이 돌린다.
--    돌기 전이라도 정산 계산은 같은 규칙(배송 완료 + 8일)으로 확정을 본다 — 숫자가 늦게 바뀌지 않게.
--  · partner_settlements.paid_amount: 관리자가 정산을 끝낼 때 실제 보낸(받은) 금액. 계산과 다르면 업체 화면에 차이를 보여 준다.
-- 이 적용 전에 마감한 정산은 없다(0건) — 배송 완료 기준에서 확정 기준으로 바꿔도 겹쳐 세는 달이 없다.

alter table public.order_items add column if not exists confirmed_at timestamptz;
alter table public.order_items add column if not exists confirm_by text check (confirm_by is null or confirm_by in ('buyer', 'auto'));
create index if not exists order_items_partner_confirmed_idx on public.order_items (partner_id, confirmed_at) where confirmed_at is not null;
create index if not exists order_items_partner_delivered_idx on public.order_items (partner_id, delivered_at) where delivered_at is not null;

alter table public.partner_settlements add column if not exists paid_amount integer;

create or replace function public.order_auto_confirm(p_days integer default 8)
returns integer language plpgsql set search_path = public as $$
declare n integer;
begin
  update public.order_items
     set confirmed_at = delivered_at + make_interval(days => p_days), confirm_by = 'auto'
   where fulfil_status = 'delivered' and confirmed_at is null and delivered_at is not null
     and delivered_at <= now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.order_auto_confirm(integer) from public, anon, authenticated;
