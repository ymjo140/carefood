-- '구매 가능'(products.is_purchasable)을 실제 가격과 맞춘다 — 가격이 하나라도 살아 있으면 true, 없으면 false.
-- 왜 (11/15): 쿠팡 동기화 등이 가격을 '판매 안 함'·60일 지남으로 바꿔도 이 표시는 그대로라, 가격 없는 제품 5,673개가 목록·가격순·추천에 나왔다
--   (가격이 있는데 숨겨진 것도 818개). 가격 기준은 v_all_prices 와 같다(살아 있음 · 0원 초과 · 60일 안).
-- 입점 업체 제품(data_source='partner')은 partner_refresh_availability 가 맡는다.
-- 매시 45분에 돈다 (쿠팡 동기화가 매시 7분에 시작).
create or replace function public.refresh_purchasable_all() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare on_n integer; off_n integer;
begin
  create temp table _priced (product_id uuid primary key) on commit drop;
  insert into _priced
  select product_id from public.product_prices where is_available and price > 0 and (last_crawled_at is null or last_crawled_at > now() - interval '60 days')
  union select matched_product_id from public.kurly_products where match_status = 'matched' and matched_product_id is not null and is_available and coalesce(discounted_price, base_price) > 0 and (last_crawled_at is null or last_crawled_at > now() - interval '60 days')
  union select matched_product_id from public.oasis_products where match_status = 'matched' and matched_product_id is not null and is_available and coalesce(discounted_price, base_price) > 0 and (last_crawled_at is null or last_crawled_at > now() - interval '60 days')
  union select matched_product_id from public.homeplus_products where match_status = 'matched' and matched_product_id is not null and is_available and coalesce(discounted_price, base_price) > 0 and (last_crawled_at is null or last_crawled_at > now() - interval '60 days')
  union select matched_product_id from public.st11_products where match_status = 'matched' and matched_product_id is not null and is_active and price > 0 and (updated_at is null or updated_at > now() - interval '60 days');

  update public.products p set is_purchasable = false, updated_at = now()
   where p.is_purchasable and p.data_source is distinct from 'partner'
     and not exists (select 1 from _priced x where x.product_id = p.id);
  get diagnostics off_n = row_count;
  update public.products p set is_purchasable = true, updated_at = now()
   where not p.is_purchasable and p.data_source is distinct from 'partner'
     and exists (select 1 from _priced x where x.product_id = p.id);
  get diagnostics on_n = row_count;
  return jsonb_build_object('off', off_n, 'on', on_n);
end $$;
revoke all on function public.refresh_purchasable_all() from public, anon, authenticated;

select cron.unschedule('purchasable-refresh') where exists (select 1 from cron.job where jobname = 'purchasable-refresh');
select cron.schedule('purchasable-refresh', '45 * * * *', 'select public.refresh_purchasable_all()');
