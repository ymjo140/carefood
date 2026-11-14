-- 테스트 업체(is_demo) 제품은 앱에서 살 수 없다 — 검수를 통과해도 업체 화면에서만 쓴다.
-- 재고·판매 기간을 맞추는 함수가 is_purchasable 을 다시 켜지 않게 is_demo 를 본다.
create or replace function public.partner_refresh_availability(p_item uuid default null)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare d date := (now() at time zone 'Asia/Seoul')::date; n integer;
begin
  with want as (
    select i.id as item_id, i.product_id,
           (pa.status = 'active'
            and not pa.is_demo
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
end $function$;

-- 이미 붙은 테스트 업체 제품이 있으면 숨긴다
update public.products pr set is_active = false, is_purchasable = false, updated_at = now()
  from public.partner_items i join public.partners pa on pa.id = i.partner_id
 where pa.is_demo and i.product_id = pr.id and pr.data_source = 'partner';
