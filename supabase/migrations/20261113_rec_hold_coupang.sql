-- 쿠팡 연결도 다시 채점 판정을 남기고, 확인 안 된 쿠팡 연결은 추천 보류 계산에서 '확인된 출처'로 치지 않는다 (2026-11-13)
-- 쿠팡 표본 40건 중 약 9건이 다른 제품(피자 도구, 생상추, 다른 회사 만두 등). 다시 채점: 확인 86% · 브랜드 확인 불가 13%.
-- 연결 자체는 그대로 둔다(쿠팡 동기화가 맡는 곳). 가격·구매 버튼도 그대로 — 추천에서만 뺀다.

alter table public.coupang_lookups add column if not exists verify_status text;

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
  -- 쿠팡: 제품당 한 줄 (id = 제품 id). 다시 채점할 때마다 덮어쓴다
  update public.coupang_lookups c set verify_status = v.status
    from jsonb_to_recordset(p_rows) as v(mall text, id uuid, old uuid, status text)
   where v.mall = 'coupang' and c.product_id = v.id and c.status = 'found'
     and v.status in ('score_confirmed', 'score_unsure') and c.verify_status is distinct from v.status;
  get diagnostics m = row_count;
  return n + m;
end $$;

create or replace function public.refresh_rec_hold() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare ok_status text[] := array['same', 'relink', 'maker_kcal_same', 'score_confirmed', 'score_relink'];
        held integer; released integer;
begin
  create temp table _ok on commit drop as
    select pp.product_id from public.product_prices pp
     where pp.platform <> '11st' and pp.is_available and pp.price > 0
       and not (pp.platform = 'coupang' and exists (
         select 1 from public.coupang_lookups c where c.product_id = pp.product_id and c.verify_status = 'score_unsure'))
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
