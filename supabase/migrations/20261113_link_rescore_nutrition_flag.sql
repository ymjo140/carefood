-- 판매처 연결 다시 판정 반영 + 영양값 이상 표시 (2026-11-13)
--
-- 1) 판매처 연결 다시 판정 (scripts/verify/score_matches.py → apply_score.py)
--    판정 파일을 사람이 본 뒤 apply_link_rescore(batch, rows) 로 1,000 건씩 넣는다.
--    relink: 브랜드가 제조사와 맞는 다른 제품으로 옮김 · unlink: 연결을 끊음 (match_status = 'verify_unlinked', 매칭 스크립트가 다시 붙이지 않음)
--    라벨(품목보고번호)로 확인한 연결(verify_status same·relink·maker_kcal_same)은 건드리지 않는다.
--    지금 연결이 판정 때와 다르면(그사이 바뀜) 건너뛴다. 무엇을 바꿨는지는 link_rescore_log 에 남는다.
--    끝나면 finish_link_rescore(batch): 끊은 11번가 연결의 가격(product_prices)을 내리고, 바뀐 제품의 구매 가능 여부를 다시 계산한다.
--    되돌리기: undo_link_rescore(batch)
-- 2) 영양값 이상: 100g 당 값이 음식 종류에 비해 말이 안 되게 낮은 제품(예: 부대찌개 6kcal·나트륨 32mg)에
--    nutrition_flag 를 붙인다. 추천·건강 점수에서 빼고 상세에 "영양 정보 확인 필요"를 보인다.

create table if not exists public.link_rescore_log (
  id bigserial primary key,
  batch text not null,
  mall text not null check (mall in ('11st', 'kurly', 'oasis', 'homeplus')),
  row_id uuid not null,
  old_product_id uuid,
  new_product_id uuid,
  action text not null check (action in ('relink', 'unlink')),
  reason text,
  applied_at timestamptz not null default now(),
  undone_at timestamptz
);
create index if not exists link_rescore_log_batch_idx on public.link_rescore_log (batch);
alter table public.link_rescore_log enable row level security;
revoke all on public.link_rescore_log from anon, authenticated;

create or replace function public.apply_link_rescore(p_batch text, p_rows jsonb) returns integer
language plpgsql security definer set search_path = ''
as $$
declare t record; n integer := 0; m integer;
begin
  for t in select * from (values ('11st', 'st11_products'), ('kurly', 'kurly_products'), ('oasis', 'oasis_products'), ('homeplus', 'homeplus_products')) v(mall, tbl) loop
    execute format($q$
      with v as (
        select x.id, x.old, x.new, x.action, left(x.reason, 300) as reason
          from jsonb_to_recordset($1) as x(mall text, id uuid, old uuid, new uuid, action text, reason text)
         where x.mall = $2 and x.action in ('relink', 'unlink') and (x.action = 'unlink' or x.new is not null)
      ), u as (
        update public.%I t set
          prev_matched_product_id = coalesce(t.prev_matched_product_id, t.matched_product_id),
          matched_product_id = case when v.action = 'relink' then v.new end,
          match_status = case when v.action = 'relink' then 'matched' else 'verify_unlinked' end,
          true_product_id = case when v.action = 'relink' then v.new else t.true_product_id end,
          verify_status = 'score_' || v.action,
          verify_note = v.reason,
          verified_at = now()
        from v
        where t.id = v.id and t.matched_product_id = v.old
          and coalesce(t.verify_status, '') not in ('same', 'relink', 'maker_kcal_same', 'score_relink', 'score_unlink')
        returning t.id, v.old, v.new, v.action, v.reason
      )
      insert into public.link_rescore_log (batch, mall, row_id, old_product_id, new_product_id, action, reason)
      select $3, $2, u.id, u.old, case when u.action = 'relink' then u.new end, u.action, u.reason from u
    $q$, t.tbl) using p_rows, t.mall, p_batch;
    get diagnostics m = row_count;
    n := n + m;
  end loop;
  return n;
end $$;

-- 바뀐 제품들의 구매 가능 여부: 가격이 하나라도 남아 있으면 true, 없으면 false (입점 제품은 partner_refresh_availability 가 맡는다)
create or replace function public.refresh_purchasable(p_ids uuid[]) returns integer
language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  with priced as (select distinct product_id from public.v_all_prices where product_id = any(p_ids))
  update public.products p set is_purchasable = (p.id in (select product_id from priced)), updated_at = now()
   where p.id = any(p_ids) and p.data_source is distinct from 'partner'
     and p.is_purchasable is distinct from (p.id in (select product_id from priced));
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.finish_link_rescore(p_batch text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare prices integer; buyable integer; ids uuid[];
begin
  -- 끊거나 옮긴 11번가 연결에 딸린 예전 제품의 가격 — 그대로 두면 v_all_prices 에 남는다
  update public.product_prices pp set is_available = false
    from public.link_rescore_log l join public.st11_products s on s.id = l.row_id
   where l.batch = p_batch and l.mall = '11st' and l.undone_at is null
     and pp.platform = '11st' and pp.product_id = l.old_product_id and pp.url = s.product_url and pp.is_available;
  get diagnostics prices = row_count;

  select array_agg(distinct x) into ids from (
    select old_product_id x from public.link_rescore_log where batch = p_batch
    union select new_product_id from public.link_rescore_log where batch = p_batch) s where x is not null;
  buyable := public.refresh_purchasable(coalesce(ids, '{}'));
  return jsonb_build_object('prices_off', prices, 'purchasable_changed', buyable);
end $$;

create or replace function public.undo_link_rescore(p_batch text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare t record; n integer := 0; m integer; prices integer; ids uuid[];
begin
  for t in select * from (values ('11st', 'st11_products'), ('kurly', 'kurly_products'), ('oasis', 'oasis_products'), ('homeplus', 'homeplus_products')) v(mall, tbl) loop
    execute format($q$
      update public.%I t set matched_product_id = l.old_product_id, match_status = 'matched',
             verify_status = null, verify_note = null, verified_at = null,
             prev_matched_product_id = case when t.prev_matched_product_id = l.old_product_id then null else t.prev_matched_product_id end
        from public.link_rescore_log l
       where l.batch = $1 and l.mall = $2 and l.undone_at is null and t.id = l.row_id
         and t.verify_status in ('score_relink', 'score_unlink')
    $q$, t.tbl) using p_batch, t.mall;
    get diagnostics m = row_count;
    n := n + m;
  end loop;
  update public.product_prices pp set is_available = true
    from public.link_rescore_log l join public.st11_products s on s.id = l.row_id
   where l.batch = p_batch and l.mall = '11st' and l.undone_at is null
     and pp.platform = '11st' and pp.product_id = l.old_product_id and pp.url = s.product_url and not pp.is_available;
  get diagnostics prices = row_count;
  select array_agg(distinct x) into ids from (
    select old_product_id x from public.link_rescore_log where batch = p_batch and undone_at is null
    union select new_product_id from public.link_rescore_log where batch = p_batch and undone_at is null) s where x is not null;
  update public.link_rescore_log set undone_at = now() where batch = p_batch and undone_at is null;
  return jsonb_build_object('rows', n, 'prices_on', prices, 'purchasable_changed', public.refresh_purchasable(coalesce(ids, '{}')));
end $$;

revoke all on function public.apply_link_rescore(text, jsonb) from public, anon, authenticated;
revoke all on function public.refresh_purchasable(uuid[]) from public, anon, authenticated;
revoke all on function public.finish_link_rescore(text) from public, anon, authenticated;
revoke all on function public.undo_link_rescore(text) from public, anon, authenticated;
grant execute on function public.apply_link_rescore(text, jsonb) to service_role;
grant execute on function public.refresh_purchasable(uuid[]) to service_role;
grant execute on function public.finish_link_rescore(text) to service_role;
grant execute on function public.undo_link_rescore(text) to service_role;

-- ── 영양값 이상 ──
alter table public.products add column if not exists nutrition_flag text;
create index if not exists products_nutrition_flag_idx on public.products (nutrition_flag) where nutrition_flag is not null;

-- 100g 당 값 기준. 원래 열량이 낮은 국·탕·물김치·단무지는 걸리지 않게 이름으로 좁힌다.
create or replace function public.flag_implausible_nutrition() returns integer
language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  with c as (
    select p.id,
      case
        when p.name ~ '(찌개|전골|부대|감자탕|짜글이)' and p.calories < 20 and coalesce(p.sodium_mg, 0) < 120 then 'stew_low'
        when p.name ~ '김치' and p.name !~ '(물김치|동치미|볶음밥|찌개|만두|라면|볶음|묵|국|사발|덮밥)'
             and p.calories < 15 and coalesce(p.sodium_mg, 0) < 150 then 'kimchi_low'
        when p.name ~ '(갈비|불고기|제육|돈까스|돈가스|닭갈비|볶음밥|덮밥|스테이크|함박|떡갈비|만두|짜장|카레|볶음|찜닭|족발|보쌈|순대|떡볶이)'
             and p.name !~ '(소스|시즈닝|분말|가루|양념장|맛장|다시|육수|용$|탕|국|전골|찌개|김치)'
             and p.calories < 50 then 'dish_low'
      end as flag
      from public.products p
     where p.category_large = '상용제품' and p.calories is not null and p.meal_role in ('meal', 'side')
       and coalesce(nullif(p.nutrient_base_g, 0), 100) = 100
  )
  update public.products p set nutrition_flag = c.flag, updated_at = now()
    from c where c.id = p.id and p.nutrition_flag is distinct from c.flag;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.flag_implausible_nutrition() from public, anon, authenticated;
grant execute on function public.flag_implausible_nutrition() to service_role;

select public.flag_implausible_nutrition();
