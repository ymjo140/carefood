-- 묶음 가격을 개수로 나눈다 (2026-11-12)
--
-- 판매처 가격의 상당수는 묶음이다 — 즉석밥 "200g x 24개 41,540원", "180g 12개 34,300원".
-- 식단 리스트가 이 가격을 한 끼 값으로 써서, 밥 한 공기를 더하면 그 끼니에 34,300원이 붙었다.
-- 판매처 상품명에서 개수를 읽어(pack_count) 한 개 값(unit_price)을 같이 내보낸다.
-- 확인(2026-11-12): 11번가 매칭 상품명 59,463개 중 35,735개에서 개수를 읽었고 32,165개가 2개 이상 묶음.
--   쿠팡은 25,620개 중 1,291개만 개수가 있다(대부분 낱개).
-- 못 읽으면 null(=1개로 본다). 애매한 표기("3입 (270g) 5봉")는 읽지 않는다 — 나누지 않는 쪽이 안전하다.
-- 2배 넘는 가격을 빼는 규칙(20261107_price_outliers)은 그대로 둔다 — 낱개가 있으면 낱개를 보여 준다.

create or replace function public.pack_count(t text) returns smallint
language sql immutable parallel safe set search_path = ''
as $$
  select case when n between 1 and 100 then n::smallint end
  from (
    select coalesce(
      -- "총 16입", "(총 140포)"
      substring(t from '총\s*(\d{1,3})\s*(?:개|팩|입|봉|EA|ea|병|캔|컵|포|구)'),
      -- "(210gX3입) 6개(18EA)", "(10mlx30ea)"
      substring(t from '(\d{1,3})\s*(?:EA|ea)(?![a-zA-Z])'),
      -- "200g x 24개", "250g x 10봉", "*4개" — 뒤에 무게(g·ml·kg)가 붙으면 개수가 아니다
      substring(t from '[xX×*]\s*(\d{1,3})\s*(?:개|팩|입|봉|병|캔|컵|포|구)?(?![\d.gGmMlLkK])'),
      -- 개수 표기가 하나뿐일 때만: "180g 12개", "24개입", "32팩"
      case when (select count(*) from regexp_matches(t, '(\d{1,3})\s*(?:개입|개|팩|봉|입|병|캔|컵|포)(?![a-zA-Z가-힣])', 'g')) = 1
           then substring(t from '(\d{1,3})\s*(?:개입|개|팩|봉|입|병|캔|컵|포)(?![a-zA-Z가-힣])') end,
      case when t ~ '(^|[^\d])1\s*\+\s*1([^\d]|$)' then '2' end
    )::int as n
  ) x
$$;

create or replace view public.v_all_prices as
with base as (
  -- product_prices 에는 상품명이 없다 — 쿠팡은 찾은 기록(coupang_lookups), 11번가는 같은 주소의 st11_products 에서 읽는다
  SELECT pp.product_id, pp.platform, pp.price, pp.url, pp.image_url, pp.is_available, pp.last_crawled_at,
         public.pack_count(COALESCE(c.coupang_name, s.name)) AS pack_count
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
         public.pack_count(kurly_products.name)
    FROM kurly_products
   WHERE kurly_products.match_status = 'matched'::text AND kurly_products.matched_product_id IS NOT NULL
     AND kurly_products.is_available = true AND COALESCE(kurly_products.discounted_price, kurly_products.base_price) > 0
  UNION ALL
  SELECT oasis_products.matched_product_id, 'oasis'::text, COALESCE(oasis_products.discounted_price, oasis_products.base_price),
         oasis_products.url, oasis_products.main_image_url, oasis_products.is_available, oasis_products.last_crawled_at,
         public.pack_count(oasis_products.name)
    FROM oasis_products
   WHERE oasis_products.match_status = 'matched'::text AND oasis_products.matched_product_id IS NOT NULL
     AND oasis_products.is_available = true AND COALESCE(oasis_products.discounted_price, oasis_products.base_price) > 0
  UNION ALL
  SELECT homeplus_products.matched_product_id, 'homeplus'::text, COALESCE(homeplus_products.discounted_price, homeplus_products.base_price),
         homeplus_products.url, homeplus_products.main_image_url, homeplus_products.is_available, homeplus_products.last_crawled_at,
         public.pack_count(homeplus_products.name)
    FROM homeplus_products
   WHERE homeplus_products.match_status = 'matched'::text AND homeplus_products.matched_product_id IS NOT NULL
     AND homeplus_products.is_available = true AND COALESCE(homeplus_products.discounted_price, homeplus_products.base_price) > 0
  UNION ALL
  SELECT st11_products.matched_product_id, '11st'::text, st11_products.price, st11_products.product_url,
         st11_products.image_url, st11_products.is_active, st11_products.updated_at,
         public.pack_count(st11_products.name)
    FROM st11_products
   WHERE st11_products.match_status = 'matched'::text AND st11_products.matched_product_id IS NOT NULL
     AND st11_products.is_active = true AND st11_products.price > 0
)
SELECT b.product_id, b.platform, b.price, b.url, b.image_url, b.is_available, b.last_crawled_at,
       b.pack_count,
       round(b.price::numeric / COALESCE(b.pack_count, 1))::integer AS unit_price
  FROM (
    SELECT base.*, min(base.price) OVER (PARTITION BY base.product_id) AS min_price
      FROM base
     WHERE base.last_crawled_at IS NULL OR base.last_crawled_at > now() - interval '60 days'
  ) b
 WHERE b.price <= 2 * b.min_price;
