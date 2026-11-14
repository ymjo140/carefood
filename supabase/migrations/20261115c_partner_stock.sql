-- 재고 (v3 10.3) — 업체가 제품마다 남은 수량을 적어 두면(선택), 앱 주문이 들어올 때 줄고 취소되면 돌아온다.
-- 0 이 되면 판매 기간 계산(partner_refresh_availability)에서 '살 수 없음'이 되어 추천·식단 채우기에서 빠진다.
-- 비워 두면(null) 재고를 세지 않는다.

alter table public.partner_items add column if not exists stock integer check (stock is null or stock >= 0);
alter table public.partner_items add column if not exists stock_updated_at timestamptz;

-- 재고 빼기 — 남은 수량이 모자라면 빼지 않고 -1. 세지 않는 제품은 null. 한 줄을 잠그고 바꾼다(동시 주문에도 음수가 되지 않는다)
create or replace function public.partner_stock_take(p_partner uuid, p_sku text, p_qty integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare s integer; found_row boolean;
begin
  if p_qty <= 0 then return null; end if;
  select stock, true into s, found_row from public.partner_items where partner_id = p_partner and partner_sku = p_sku for update;
  if not coalesce(found_row, false) or s is null then return null; end if;
  if s < p_qty then return -1; end if;
  update public.partner_items set stock = s - p_qty, stock_updated_at = now() where partner_id = p_partner and partner_sku = p_sku;
  return s - p_qty;
end $$;

-- 재고 돌려놓기 — 취소된 주문 · 주문을 만들지 못했을 때
create or replace function public.partner_stock_put(p_partner uuid, p_sku text, p_qty integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare s integer;
begin
  if p_qty <= 0 then return null; end if;
  update public.partner_items set stock = stock + p_qty, stock_updated_at = now()
   where partner_id = p_partner and partner_sku = p_sku and stock is not null
  returning stock into s;
  return s;
end $$;

-- 판매 기간 + 재고로 '살 수 있음'을 맞춘다. p_item 을 주면 그 제품만
create or replace function public.partner_refresh_availability(p_item uuid default null) returns integer
language plpgsql security definer set search_path = ''
as $$
declare d date := (now() at time zone 'Asia/Seoul')::date; n integer;
begin
  with want as (
    select i.id as item_id, i.product_id,
           (pa.status = 'active'
            and i.approved_data->>'status' = 'on_sale'
            and coalesce(i.stock, 1) > 0
            and coalesce((i.approved_data->>'available_from')::date, d) <= d
            and coalesce((i.approved_data->>'available_to')::date, d) >= d) as live,
           (i.approved_data->>'status' = 'on_sale'
            and coalesce(i.stock, 1) > 0
            and coalesce((i.approved_data->>'available_from')::date, d) <= d
            and coalesce((i.approved_data->>'available_to')::date, d) >= d) as on_sale
      from public.partner_items i join public.partners pa on pa.id = i.partner_id
     where i.approved_data is not null and i.product_id is not null and (p_item is null or i.id = p_item)
  ), o as (
    update public.partner_offers po set is_available = w.on_sale, updated_at = now()
      from want w where po.item_id = w.item_id and po.is_available is distinct from w.on_sale
    returning 1
  ), p as (
    update public.products pr set is_purchasable = w.live, updated_at = now()
      from want w where pr.id = w.product_id and pr.data_source = 'partner' and pr.is_purchasable is distinct from w.live
    returning 1
  )
  select (select count(*) from o) + (select count(*) from p) into n;
  return n;
end $$;
drop function if exists public.partner_refresh_availability();

revoke all on function public.partner_stock_take(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.partner_stock_put(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.partner_refresh_availability(uuid) from public, anon, authenticated;
grant execute on function public.partner_stock_take(uuid, text, integer) to service_role;
grant execute on function public.partner_stock_put(uuid, text, integer) to service_role;
grant execute on function public.partner_refresh_availability(uuid) to service_role;
