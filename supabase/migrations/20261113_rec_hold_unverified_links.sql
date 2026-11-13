-- 확인 안 된 판매처 연결만 있는 제품은 추천에서 잠시 뺀다 (2026-11-13)
--
-- 판매처 연결은 이름만 보고 붙인 것이 많아(11번가 표본: 제조사가 적힌 8건 중 6건이 다른 제품) 틀린 제품이 추천될 수 있다.
-- 1) mark_link_check(rows): score_matches.py 판정을 판매처 행에 남긴다 — confirmed → 'score_confirmed', suspect·risky → 'score_unsure'
--    (이미 판정이 있는 행은 건드리지 않음)
-- 2) refresh_rec_hold(): 구매 가능한 제품 중 '확인된' 가격 출처가 하나도 없으면 products.rec_hold = 'unverified_link'
--    확인된 출처: 쿠팡 등 product_prices(11번가 제외) · 입점 업체 · 라벨/브랜드로 확인한 판매처 연결
--    추천·식단 리스트·다음 끼니 후보에서 rec_hold 가 있는 제품을 뺀다. 가격·구매 버튼은 그대로.
--    새로 들어온(아직 판정 없는) 연결도 확인 전까지는 '확인 안 됨'으로 본다. 매일 05:30(KST) 다시 계산.

create or replace function public.mark_link_check(p_rows jsonb) returns integer
language plpgsql security definer set search_path = ''
as $$
declare t record; n integer := 0; m integer;
begin
  for t in select * from (values ('11st', 'st11_products'), ('kurly', 'kurly_products'), ('oasis', 'oasis_products'), ('homeplus', 'homeplus_products')) v(mall, tbl) loop
    execute format($q$
      update public.%I t set verify_status = v.status, verified_at = now()
        from jsonb_to_recordset($1) as v(mall text, id uuid, old uuid, status text)
       where v.mall = $2 and t.id = v.id and t.matched_product_id = v.old and t.verify_status is null
         and v.status in ('score_confirmed', 'score_unsure')
    $q$, t.tbl) using p_rows, t.mall;
    get diagnostics m = row_count;
    n := n + m;
  end loop;
  return n;
end $$;

alter table public.products add column if not exists rec_hold text;
create index if not exists products_rec_hold_idx on public.products (rec_hold) where rec_hold is not null;

create or replace function public.refresh_rec_hold() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare ok_status text[] := array['same', 'relink', 'maker_kcal_same', 'score_confirmed', 'score_relink'];
        held integer; released integer;
begin
  create temp table _ok on commit drop as
    select pp.product_id from public.product_prices pp
     where pp.platform <> '11st' and pp.is_available and pp.price > 0
    union select o.product_id from public.partner_offers o where o.product_id is not null and o.is_available
    union select s.matched_product_id from public.st11_products s
     where s.match_status = 'matched' and s.is_active and s.verify_status = any(ok_status)
    union select k.matched_product_id from public.kurly_products k
     where k.match_status = 'matched' and k.is_available and k.verify_status = any(ok_status)
    union select o.matched_product_id from public.oasis_products o
     where o.match_status = 'matched' and o.is_available and o.verify_status = any(ok_status)
    union select h.matched_product_id from public.homeplus_products h
     where h.match_status = 'matched' and h.is_available and h.verify_status = any(ok_status);
  create index on _ok (product_id);

  update public.products p set rec_hold = 'unverified_link'
   where p.is_purchasable and p.is_active and p.data_source is distinct from 'partner' and p.rec_hold is null
     and not exists (select 1 from _ok where _ok.product_id = p.id);
  get diagnostics held = row_count;

  update public.products p set rec_hold = null
   where p.rec_hold = 'unverified_link'
     and (not p.is_purchasable or p.data_source = 'partner' or exists (select 1 from _ok where _ok.product_id = p.id));
  get diagnostics released = row_count;
  return jsonb_build_object('held', held, 'released', released);
end $$;

revoke all on function public.mark_link_check(jsonb) from public, anon, authenticated;
revoke all on function public.refresh_rec_hold() from public, anon, authenticated;
grant execute on function public.mark_link_check(jsonb) to service_role;
grant execute on function public.refresh_rec_hold() to service_role;

select cron.schedule('rec-hold-refresh', '30 20 * * *', 'select public.refresh_rec_hold()');
