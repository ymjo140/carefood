-- 입점 업체 데이터 받기 1단계 (2026-11-12) — 설계: Claude Docs "케어푸드 입점 업체 데이터 연동 구조"
--
-- 업체가 보낸 원본(partner_items)과 앱이 쓰는 제품(products)을 나눈다. 검수를 통과한 값만 products·가격 뷰에 들어간다.
-- 모든 표는 서버(서비스 키)로만 읽고 쓴다 — RLS 켜고 정책 없음, anon·authenticated 권한 없음.

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),   -- 가격 뷰의 platform 값 (그리팅이면 greating)
  name text not null,
  kind text not null check (kind in ('meal_service', 'brand', 'mall')),
  business_number text,
  status text not null default 'onboarding' check (status in ('onboarding', 'active', 'paused')),
  contact_email text,
  contact_phone text,
  website_url text,
  commission_rate numeric(5, 2),          -- 구매 수수료(CPS) %, 계약 뒤에 채운다
  attribution_days smallint,              -- 클릭 뒤 며칠 안의 주문까지
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_members (
  partner_id uuid not null references public.partners(id) on delete cascade,
  auth_user_id uuid not null,
  email text,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  created_at timestamptz not null default now(),
  primary key (partner_id, auth_user_id)
);
create index if not exists partner_members_user_idx on public.partner_members (auth_user_id);

create table if not exists public.ingest_batches (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  channel text not null check (channel in ('excel', 'feed', 'api')),
  file_name text,
  row_count integer not null default 0,
  ok_count integer not null default 0,        -- 바로 반영(가격·재고만 바뀜)
  review_count integer not null default 0,    -- 검수로 감
  error_count integer not null default 0,     -- 반려(형식 오류)
  unchanged_count integer not null default 0,
  errors jsonb not null default '[]',         -- [{row, sku, field, code, message}] 앞 500개
  status text not null default 'done' check (status in ('processing', 'done', 'failed')),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists ingest_batches_partner_idx on public.ingest_batches (partner_id, created_at desc);

create table if not exists public.partner_items (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  partner_sku text not null,
  product_id uuid references public.products(id) on delete set null,   -- 반영된 제품
  data jsonb not null,                    -- 정리한 값 (src/lib/partner/schema.ts 의 PartnerItem)
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'discontinued')),
  review_reasons text[] not null default '{}',   -- 검수로 간 이유 코드
  warnings text[] not null default '{}',
  reject_note text,
  approved_data jsonb,                    -- 마지막으로 반영한 값 (다음 변경과 견줄 때)
  approved_at timestamptz,
  last_batch_id uuid references public.ingest_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_id, partner_sku)
);
create index if not exists partner_items_status_idx on public.partner_items (status, updated_at desc);

create table if not exists public.partner_item_versions (
  id bigserial primary key,
  item_id uuid not null references public.partner_items(id) on delete cascade,
  batch_id uuid references public.ingest_batches(id) on delete set null,
  data jsonb not null,
  changed text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists partner_item_versions_item_idx on public.partner_item_versions (item_id, created_at desc);

create table if not exists public.partner_offers (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.partner_items(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  channel text not null,                  -- own_mall · smartstore · coupang · ...
  price integer not null check (price > 0),
  pack_count smallint not null default 1 check (pack_count between 1 and 100),
  url text not null,
  image_url text,
  is_available boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (item_id, channel)
);
create index if not exists partner_offers_product_idx on public.partner_offers (product_id);

-- 제품: 업체가 준 알레르기 코드·바코드·영양 출처
alter table public.products add column if not exists allergens text[];
alter table public.products add column if not exists barcode text;
alter table public.products add column if not exists nutrition_source text;
create index if not exists products_barcode_idx on public.products (barcode) where barcode is not null;
create index if not exists products_report_no_idx on public.products (report_no) where report_no is not null;

do $$ declare t text; begin
  foreach t in array array['partners', 'partner_members', 'ingest_batches', 'partner_items', 'partner_item_versions', 'partner_offers'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on sequence public.partner_item_versions_id_seq from anon, authenticated;

-- 가격 뷰: 운영 중(active) 업체의 가격을 더한다. 업체 가격은 묶음이 낱개보다 2배 넘게 비싸도 숨기지 않는다(개수를 업체가 알려 준다).
-- 끝에 seller_name(업체명)·is_partner(입점 업체 = 수수료 링크) 두 열을 붙인다.
create or replace view public.v_all_prices as
with base as (
  SELECT pp.product_id, pp.platform, pp.price, pp.url, pp.image_url, pp.is_available, pp.last_crawled_at,
         public.pack_count(COALESCE(c.coupang_name, s.name)) AS pack_count, NULL::text AS seller_name, false AS is_partner
    FROM product_prices pp
    LEFT JOIN coupang_lookups c ON pp.platform = 'coupang' AND c.product_id = pp.product_id AND c.status = 'found'
    LEFT JOIN LATERAL (
      SELECT s1.name FROM st11_products s1
       WHERE pp.platform = '11st' AND s1.matched_product_id = pp.product_id AND s1.product_url = pp.url
       LIMIT 1
    ) s ON true
   WHERE pp.is_available = true AND pp.price > 0
  UNION ALL
  SELECT kurly_products.matched_product_id, 'kurly'::text, COALESCE(kurly_products.discounted_price, kurly_products.base_price),
         kurly_products.url, kurly_products.main_image_url, kurly_products.is_available, kurly_products.last_crawled_at,
         public.pack_count(kurly_products.name), NULL::text, false
    FROM kurly_products
   WHERE kurly_products.match_status = 'matched'::text AND kurly_products.matched_product_id IS NOT NULL
     AND kurly_products.is_available = true AND COALESCE(kurly_products.discounted_price, kurly_products.base_price) > 0
  UNION ALL
  SELECT oasis_products.matched_product_id, 'oasis'::text, COALESCE(oasis_products.discounted_price, oasis_products.base_price),
         oasis_products.url, oasis_products.main_image_url, oasis_products.is_available, oasis_products.last_crawled_at,
         public.pack_count(oasis_products.name), NULL::text, false
    FROM oasis_products
   WHERE oasis_products.match_status = 'matched'::text AND oasis_products.matched_product_id IS NOT NULL
     AND oasis_products.is_available = true AND COALESCE(oasis_products.discounted_price, oasis_products.base_price) > 0
  UNION ALL
  SELECT homeplus_products.matched_product_id, 'homeplus'::text, COALESCE(homeplus_products.discounted_price, homeplus_products.base_price),
         homeplus_products.url, homeplus_products.main_image_url, homeplus_products.is_available, homeplus_products.last_crawled_at,
         public.pack_count(homeplus_products.name), NULL::text, false
    FROM homeplus_products
   WHERE homeplus_products.match_status = 'matched'::text AND homeplus_products.matched_product_id IS NOT NULL
     AND homeplus_products.is_available = true AND COALESCE(homeplus_products.discounted_price, homeplus_products.base_price) > 0
  UNION ALL
  SELECT st11_products.matched_product_id, '11st'::text, st11_products.price, st11_products.product_url,
         st11_products.image_url, st11_products.is_active, st11_products.updated_at,
         public.pack_count(st11_products.name), NULL::text, false
    FROM st11_products
   WHERE st11_products.match_status = 'matched'::text AND st11_products.matched_product_id IS NOT NULL
     AND st11_products.is_active = true AND st11_products.price > 0
  UNION ALL
  SELECT o.product_id, pa.slug, o.price, o.url, o.image_url, o.is_available, o.updated_at,
         o.pack_count, pa.name, true
    FROM partner_offers o
    JOIN partners pa ON pa.id = o.partner_id AND pa.status = 'active'
   WHERE o.product_id IS NOT NULL AND o.is_available = true AND o.price > 0
)
SELECT b.product_id, b.platform, b.price, b.url, b.image_url, b.is_available, b.last_crawled_at,
       b.pack_count,
       round(b.price::numeric / COALESCE(b.pack_count, 1))::integer AS unit_price,
       b.seller_name, b.is_partner
  FROM (
    SELECT base.*, min(base.price) OVER (PARTITION BY base.product_id) AS min_price
      FROM base
     WHERE base.last_crawled_at IS NULL OR base.last_crawled_at > now() - interval '60 days'
  ) b
 WHERE b.price <= 2 * b.min_price OR b.is_partner;
