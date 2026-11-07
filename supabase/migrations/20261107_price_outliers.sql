-- 가격 비교에서 '묶음이 다를 가능성이 큰' 가격 빼기 + 오래된 가격 빼기 (2026-11-07)
--
-- 쿠팡 가격은 총중량(±12%)·묶음 수까지 맞춘 것만 넣는다(scripts/verify/coupang_match.py).
-- 같은 제품의 다른 몰 가격이 그 쿠팡 가격의 2배를 넘거나 절반보다 낮으면 대부분 묶음·용량이 다른 상품이라
-- 비교 화면에서 뺀다 (데이터는 그대로, 보기에서만). 11번가는 이름으로만 붙여 76%가 ±30% 밖이었다.
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
  FROM base b
 WHERE (b.last_crawled_at IS NULL OR b.last_crawled_at > now() - interval '60 days')
   AND (b.platform = 'coupang' OR NOT EXISTS (
         SELECT 1 FROM product_prices c
          WHERE c.product_id = b.product_id AND c.platform = 'coupang' AND c.is_available AND c.price > 0
            AND (b.price > 2 * c.price OR b.price * 2 < c.price)));
