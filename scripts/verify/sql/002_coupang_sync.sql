-- 쿠팡 가격 자동 검색 — 기록 테이블 · 대기열 뷰 · 작업 상태
-- (Supabase SQL Editor 에서 실행해도 되고, 승인 후 제가 실행해도 됩니다. 여러 번 실행해도 안전)

create table if not exists coupang_lookups (
  product_id uuid primary key references products(id) on delete cascade,
  status text not null,                 -- found | none | error
  keyword text,
  coupang_product_id bigint,
  coupang_name text,
  price integer,
  reason text,
  checked_at timestamptz not null default now()
);
create index if not exists coupang_lookups_status_idx on coupang_lookups(status, checked_at);

create table if not exists coupang_sync_state (
  id text primary key,
  paused_until timestamptz,             -- 403 등으로 멈추면 이 시각까지 쉰다
  note text,
  updated_at timestamptz not null default now()
);
insert into coupang_sync_state (id, note) values ('search', '시작') on conflict (id) do nothing;

alter table coupang_lookups enable row level security;
alter table coupang_sync_state enable row level security;

-- 아직 안 찾아본 제품 — 우선순위: 0 컬리 라벨로 확인된 제품 · 1 판매처 가격이 있던 제품 · 2 구매 가능/식사 · 3 나머지
create or replace view coupang_queue as
with verified as (
  select distinct on (matched_product_id) matched_product_id as product_id, name as mall_name, volume
  from kurly_products
  where verify_status in ('same', 'relink') and matched_product_id is not null
  order by matched_product_id, name
), priced as (
  select distinct product_id from v_all_prices
)
select p.id, p.name, p.manufacturer, p.serving_size_g, p.total_weight_g,
       v.mall_name, v.volume,
       case when v.product_id is not null then 0
            when pr.product_id is not null then 1
            when p.is_purchasable or p.is_meal then 2
            else 3 end as priority
from products p
left join coupang_lookups l on l.product_id = p.id
left join verified v on v.product_id = p.id
left join priced pr on pr.product_id = p.id
where l.product_id is null and p.is_active;
