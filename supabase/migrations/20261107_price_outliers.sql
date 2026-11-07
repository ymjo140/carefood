-- 가격 비교에서 '묶음·다른 상품일 가능성이 큰' 가격 빼기 + 오래된 가격 빼기 (2026-11-07)
--
-- 같은 제품의 가격 중 가장 싼 가격의 2배를 넘는 가격은 보기에서 뺀다 (데이터는 그대로).
-- 확인(2026-11-07): 쿠팡과 2배 넘게 차이 나는 11번가 가격 중 11번가가 비싼 3,922건의 80%(3,118건)는
-- 11번가 상품명에만 묶음 표시(x5, 20개, 10개입, 2팩, 박스, 세트 등)가 있었다. 반대 방향은 쿠팡이 다른 브랜드·큰 용량인 경우가 많았다.
-- 확인한 지 60일이 넘은 가격도 뺀다 (src/lib/prices.ts PRICE_HIDE_DAYS 와 같은 값).
create or replace view public.v_all_prices as
with base as (
  SELECT product_prices.product_id, product_prices.platform, product_prices.price, product_prices.url,
         product_prices.image_url, product_prices.is_available, product_prices.last_crawled_at
    FROM product_prices
   WHERE product_prices.is_available = true AND product_prices.price > 0
  UNION ALL
  SELECT kurly_products.matched_product_id, 'kurly'::text, COALESCE(kurly_products.discounted_price, kurly_products.base_price),
         kurly_products.url, kurly_products.main_image_url, kurly_products.is_available, kurly_products.last_crawled_at
    FROM kurly_products
   WHERE kurly_products.match_status = 'matched'::text AND kurly_products.matched_product_id IS NOT NULL
     AND kurly_products.is_available = true AND COALESCE(kurly_products.discounted_price, kurly_products.base_price) > 0
  UNION ALL
  SELECT oasis_products.matched_product_id, 'oasis'::text, COALESCE(oasis_products.discounted_price, oasis_products.base_price),
         oasis_products.url, oasis_products.main_image_url, oasis_products.is_available, oasis_products.last_crawled_at
    FROM oasis_products
   WHERE oasis_products.match_status = 'matched'::text AND oasis_products.matched_product_id IS NOT NULL
     AND oasis_products.is_available = true AND COALESCE(oasis_products.discounted_price, oasis_products.base_price) > 0
  UNION ALL
  SELECT homeplus_products.matched_product_id, 'homeplus'::text, COALESCE(homeplus_products.discounted_price, homeplus_products.base_price),
         homeplus_products.url, homeplus_products.main_image_url, homeplus_products.is_available, homeplus_products.last_crawled_at
    FROM homeplus_products
   WHERE homeplus_products.match_status = 'matched'::text AND homeplus_products.matched_product_id IS NOT NULL
     AND homeplus_products.is_available = true AND COALESCE(homeplus_products.discounted_price, homeplus_products.base_price) > 0
  UNION ALL
  SELECT st11_products.matched_product_id, '11st'::text, st11_products.price, st11_products.product_url,
         st11_products.image_url, st11_products.is_active, st11_products.updated_at
    FROM st11_products
   WHERE st11_products.match_status = 'matched'::text AND st11_products.matched_product_id IS NOT NULL
     AND st11_products.is_active = true AND st11_products.price > 0
)
SELECT b.product_id, b.platform, b.price, b.url, b.image_url, b.is_available, b.last_crawled_at
  FROM (
    SELECT base.*, min(base.price) OVER (PARTITION BY base.product_id) AS min_price
      FROM base
     WHERE base.last_crawled_at IS NULL OR base.last_crawled_at > now() - interval '60 days'
  ) b
 WHERE b.price <= 2 * b.min_price;
