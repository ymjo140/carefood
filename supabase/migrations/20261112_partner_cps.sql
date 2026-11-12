-- 입점 2단계: 구매 수수료(CPS) 추적 + 판매 기간 자동 반영 (2026-11-12)
--
-- 1) 클릭 번호: 입점 업체 링크를 누르면 무작위 번호(click_id)를 만들어 링크에 cf_click 으로 붙이고 여기 남긴다.
--    번호에는 사용자를 알아볼 정보가 없다. 업체는 그 번호로 들어온 주문을 돌려준다(partner_conversions).
-- 2) 판매 기간: 주마다 바뀌는 메뉴는 available_to 가 지나면 내려가야 한다 — 올릴 때만 계산하면 다음 주에도 남는다.
--    partner_refresh_availability() 를 매일 00:05(KST) 돌린다.

alter table public.product_clicks add column if not exists click_id uuid;
alter table public.product_clicks add column if not exists partner_id uuid references public.partners(id) on delete set null;
create unique index if not exists product_clicks_click_id_uq on public.product_clicks (click_id) where click_id is not null;
create index if not exists product_clicks_partner_idx on public.product_clicks (partner_id, created_at desc) where partner_id is not null;

create table if not exists public.partner_conversions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  click_id uuid not null,
  product_id uuid,
  order_no text not null,
  amount integer not null check (amount >= 0),
  status text not null check (status in ('ordered', 'confirmed', 'canceled', 'returned')),
  ordered_at timestamptz not null,
  commission_rate numeric(5, 2),          -- 받은 때의 수수료율 (나중에 요율이 바뀌어도 그대로)
  commission integer,                     -- 구매확정일 때만 amount × rate
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_id, order_no)
);
create index if not exists partner_conversions_month_idx on public.partner_conversions (partner_id, ordered_at desc);
alter table public.partner_conversions enable row level security;
revoke all on public.partner_conversions from anon, authenticated;

create or replace function public.partner_refresh_availability() returns integer
language plpgsql security definer set search_path = ''
as $$
declare d date := (now() at time zone 'Asia/Seoul')::date; n integer;
begin
  with want as (
    select i.id as item_id, i.product_id,
           (pa.status = 'active'
            and i.approved_data->>'status' = 'on_sale'
            and coalesce((i.approved_data->>'available_from')::date, d) <= d
            and coalesce((i.approved_data->>'available_to')::date, d) >= d) as live,
           (i.approved_data->>'status' = 'on_sale'
            and coalesce((i.approved_data->>'available_from')::date, d) <= d
            and coalesce((i.approved_data->>'available_to')::date, d) >= d) as on_sale
      from public.partner_items i join public.partners pa on pa.id = i.partner_id
     where i.approved_data is not null and i.product_id is not null
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
revoke all on function public.partner_refresh_availability() from public, anon, authenticated;
grant execute on function public.partner_refresh_availability() to service_role;

select cron.schedule('partner-sale-window', '5 15 * * *', 'select public.partner_refresh_availability()');
