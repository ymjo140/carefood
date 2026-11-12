-- 입점 5단계: 노출 수 · 수요 빈틈 · 정산 · 주문 전달 (2026-11-12)

-- (1) 노출 수 — 누가 봤는지는 남기지 않고 제품·날짜·자리별 횟수만 센다
create table if not exists public.product_impressions (
  product_id uuid not null,
  day date not null,
  placement text not null,
  count integer not null default 0,
  primary key (product_id, day, placement)
);
create index if not exists product_impressions_day_idx on public.product_impressions (day);
alter table public.product_impressions enable row level security;
revoke all on public.product_impressions from anon, authenticated;

create or replace function public.bump_impressions(p_ids uuid[], p_placement text) returns void
language sql security definer set search_path = '' as $$
  insert into public.product_impressions (product_id, day, placement, count)
  select distinct id, (now() at time zone 'Asia/Seoul')::date, p_placement, 1 from unnest(p_ids) as id
  on conflict (product_id, day, placement) do update set count = public.product_impressions.count + 1;
$$;
revoke all on function public.bump_impressions(uuid[], text) from public, anon, authenticated;
grant execute on function public.bump_impressions(uuid[], text) to service_role;

-- (2) 수요 빈틈 — 조건별로 지금 살 수 있는 제품 수 (1회 제공량 기준) + 그 업체가 반영해 둔 제품 수.
--     조건의 이름·설명은 src/lib/partner/demand.ts 의 SEGMENTS 에 있다. 1회 양은 20~500g 이면 그 값, 아니면 한 끼 300g·간식 100g
--     (앱의 국물 요리 규칙까지는 따르지 않는다 — 시장 규모를 어림하는 숫자다).
create or replace function public.demand_gap_supply(p_partner uuid default null)
returns table (segment text, supply bigint, partner_supply bigint, mine bigint)
language sql stable security definer set search_path = '' as $$
  with mine as (
    select distinct product_id from public.partner_items
     where p_partner is not null and partner_id = p_partner and status = 'approved' and product_id is not null
  ), p as (
    select pr.meal_role, pr.data_source, pr.is_purchasable, (m.product_id is not null) as is_mine,
           (case when pr.serving_size_g between 20 and 500 then pr.serving_size_g when pr.meal_role = 'meal' then 300 else 100 end)
             / coalesce(nullif(pr.nutrient_base_g, 0), 100) as r,
           pr.calories, pr.protein_g, pr.sodium_mg, pr.sugar_g, pr.fiber_g
      from public.products pr left join mine m on m.product_id = pr.id
     where pr.is_active and pr.category_large = '상용제품' and pr.meal_role in ('meal', 'snack') and pr.calories is not null
       and (pr.is_purchasable or m.product_id is not null)
  ), s as (
    select meal_role, data_source, is_purchasable, is_mine,
           calories * r as kcal, protein_g * r as pro, sodium_mg * r as sod, sugar_g * r as sug, fiber_g * r as fib from p
  )
  select v.seg, count(*) filter (where s.is_purchasable), count(*) filter (where s.is_purchasable and s.data_source = 'partner'),
         count(*) filter (where s.is_mine)
    from s cross join lateral (values
      ('meal_high_protein',        s.meal_role = 'meal' and s.kcal >= 150 and s.pro >= 25),
      ('meal_low_sodium',          s.meal_role = 'meal' and s.kcal >= 150 and s.sod >= 20 and s.sod <= 600),
      ('meal_low_sugar',           s.meal_role = 'meal' and s.kcal >= 150 and s.sug <= 5),
      ('meal_light',               s.meal_role = 'meal' and s.kcal >= 150 and s.kcal <= 400),
      ('meal_high_fiber',          s.meal_role = 'meal' and s.kcal >= 150 and s.fib >= 6),
      ('meal_protein_low_sodium',  s.meal_role = 'meal' and s.kcal >= 150 and s.pro >= 25 and s.sod >= 20 and s.sod <= 600),
      ('meal_protein_light',       s.meal_role = 'meal' and s.kcal >= 150 and s.kcal <= 450 and s.pro >= 25),
      ('snack_high_protein',       s.meal_role = 'snack' and s.pro >= 10),
      ('snack_low_sugar',          s.meal_role = 'snack' and s.kcal >= 50 and s.sug <= 5)
    ) as v(seg, ok)
   where v.ok
   group by v.seg;
$$;
revoke all on function public.demand_gap_supply(uuid) from public, anon, authenticated;
grant execute on function public.demand_gap_supply(uuid) to service_role;

-- (3) 정산 — 달을 마감하면 그때의 숫자를 적어 둔다 (마감 뒤 바뀐 주문은 화면에서 차이로 보인다)
create table if not exists public.partner_settlements (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  clicks integer not null default 0,
  orders integer not null default 0,
  confirmed_amount integer not null default 0,
  commission integer not null default 0,      -- 구매 링크 수수료 (업체 → 케어푸드)
  order_sales integer not null default 0,     -- 앱 주문 판매액 (케어푸드가 받아 둔 돈)
  order_fee integer not null default 0,       -- 앱 주문 수수료
  status text not null default 'closed' check (status in ('closed', 'paid')),
  closed_at timestamptz not null default now(),
  closed_by uuid,
  paid_at timestamptz,
  note text,
  unique (partner_id, month)
);
alter table public.partner_settlements enable row level security;
revoke all on public.partner_settlements from anon, authenticated;

-- (4) 앱 주문 → 업체 전달. 주문 기능은 아직 꺼져 있다(NEXT_PUBLIC_ORDERING_ENABLED).
alter table public.order_items add column if not exists partner_id uuid references public.partners(id) on delete set null;
alter table public.order_items add column if not exists partner_sku text;
alter table public.order_items add column if not exists fulfil_status text not null default 'new'
  check (fulfil_status in ('new', 'accepted', 'shipped', 'delivered', 'canceled'));
alter table public.order_items add column if not exists tracking_carrier text;
alter table public.order_items add column if not exists tracking_number text;
alter table public.order_items add column if not exists accepted_at timestamptz;
alter table public.order_items add column if not exists shipped_at timestamptz;
alter table public.order_items add column if not exists delivered_at timestamptz;
create index if not exists order_items_partner_idx on public.order_items (partner_id, created_at desc) where partner_id is not null;
-- 배송을 위해 판매 업체에 받는 분·연락처·주소를 주는 데 동의한 시각 (없으면 업체에 주지 않는다)
alter table public.orders add column if not exists third_party_consent_at timestamptz;
-- 받는 분 정보는 주문에 그대로 적어 둔다 (주문 뒤 주소록을 고쳐도 그 주문의 배송지는 그대로)
alter table public.orders add column if not exists shipping jsonb;
-- 업체가 취소한 이유 (재고 없음 등) — 환불은 케어푸드가 처리한다
alter table public.order_items add column if not exists cancel_reason text;
