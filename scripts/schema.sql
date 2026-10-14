-- ============================================
-- 케어푸드 플랫폼 DB 스키마 (Supabase/PostgreSQL)
-- ============================================

create extension if not exists "uuid-ossp";

-- ============================================
-- 1층: 제품 데이터 (식약처 공공 API + 크롤링)
-- ============================================

create table products (
  id              uuid primary key default uuid_generate_v4(),
  food_code       text unique,                    -- 식약처 식품코드
  report_no       text,                           -- 품목제조보고번호 (크롤링 매칭 키)
  name            text not null,                  -- 식품명
  manufacturer    text,                           -- 제조사명
  importer        text,                           -- 수입업체명
  distributor     text,                           -- 유통업체명

  -- 분류
  category_large  text,                           -- 대분류 (밀키트, 도시락, 간편식, 면류 등)
  category_medium text,                           -- 중분류
  category_small  text,                           -- 소분류
  food_type       text,                           -- 한식/양식/일식/중식
  meal_type       text,                           -- 국물/볶음/구이/샐러드/면

  -- 영양성분 (1회 제공량 기준, 식약처 API 원본)
  serving_size_g  numeric,                        -- 1회 섭취참고량 (g)
  calories        numeric,                        -- 에너지 (kcal)
  protein_g       numeric,                        -- 단백질 (g)
  fat_g           numeric,                        -- 지방 (g)
  saturated_fat_g numeric,                        -- 포화지방산 (g)
  trans_fat_g     numeric,                        -- 트랜스지방산 (g)
  carbs_g         numeric,                        -- 탄수화물 (g)
  sugar_g         numeric,                        -- 당류 (g)
  fiber_g         numeric,                        -- 식이섬유 (g)
  sodium_mg       numeric,                        -- 나트륨 (mg) ★ 짠맛 핵심
  potassium_mg    numeric,                        -- 칼륨 (mg) ★ 신장질환 핵심
  calcium_mg      numeric,                        -- 칼슘 (mg)
  phosphorus_mg   numeric,                        -- 인 (mg) ★ 신장질환 핵심
  iron_mg         numeric,                        -- 철 (mg)
  cholesterol_mg  numeric,                        -- 콜레스테롤 (mg)
  vitamin_a_ug    numeric,
  vitamin_c_mg    numeric,
  vitamin_d_ug    numeric,

  -- 원재료 (텍스트 원본 — 매운맛 파싱 소스)
  ingredients_raw text,                           -- 원재료명 전체 텍스트

  -- 매운맛 지수 (파싱 + 유저 피드백)
  spicy_score     smallint default 0,             -- 0~5
  spicy_source    text default 'parsed',          -- parsed | crowdsourced | manual

  -- 메타
  is_active       boolean default true,
  data_source     text default 'mfds_api',        -- mfds_api | crawled | manual
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- 맛 필터 쿼리 최적화 인덱스
create index idx_products_sodium on products (sodium_mg);
create index idx_products_sugar on products (sugar_g);
create index idx_products_fat on products (fat_g);
create index idx_products_spicy on products (spicy_score);
create index idx_products_category on products (category_large, food_type);
create index idx_products_name on products using gin (to_tsvector('simple', name));


-- 제품 가격/구매 링크 (크롤링, 시간에 따라 변동)
create table product_prices (
  id              uuid primary key default uuid_generate_v4(),
  product_id      uuid references products(id) on delete cascade,
  platform        text not null,                  -- coupang | kurly | naver
  price           integer,                        -- 원 단위
  price_per_serving integer,                      -- 1회분당 가격
  url             text not null,                  -- 아웃링크 URL
  image_url       text,                           -- 제품 이미지 (외부 URL 참조)
  is_available    boolean default true,
  last_crawled_at timestamptz default now(),
  created_at      timestamptz default now(),
  unique (product_id, platform)                   -- 제품×플랫폼 중복 방지 (upsert 키)
);

create index idx_prices_product on product_prices (product_id, platform);


-- ============================================
-- 유저 데이터
-- ============================================

create table users (
  id              uuid primary key default uuid_generate_v4(),
  email           text unique,
  nickname        text,
  birth_year      smallint,
  gender          text,                           -- male | female | other
  household_size  smallint default 1,
  tier            text default 'free',            -- free | basic | premium
  created_at      timestamptz default now()
);

-- 맛 프로파일 (온보딩에서 설정)
create table user_taste_profiles (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid unique references users(id) on delete cascade,
  salty_level     smallint not null check (salty_level between 1 and 5),
  sweet_level     smallint not null check (sweet_level between 1 and 5),
  spicy_level     smallint not null check (spicy_level between 1 and 5),
  fatty_level     smallint not null check (fatty_level between 1 and 5),
  preferred_food_types  text[],                   -- {'한식','양식'} 등
  preferred_meal_types  text[],                   -- {'국물','볶음'} 등
  excluded_ingredients  text[],                   -- 알레르기/기피 재료
  budget_per_meal integer,                        -- 1끼 예산 (원)
  has_microwave   boolean default true,
  updated_at      timestamptz default now()
);

-- 개인별 맛-성분 매핑 (피드백으로 보정되는 테이블)
create table user_taste_mappings (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references users(id) on delete cascade,
  taste_dimension text not null,                  -- salty | sweet | fatty
  level           smallint not null,              -- 1~5
  nutrient_min    numeric not null,               -- 해당 유저의 이 단계 최소값
  nutrient_max    numeric not null,               -- 해당 유저의 이 단계 최대값
  confidence      numeric default 0.5,            -- 0~1, 피드백 많을수록 상승
  feedback_count  integer default 0,
  updated_at      timestamptz default now(),
  unique (user_id, taste_dimension, level)
);

-- 건강 프로파일 (구독자 전용)
create table user_health_profiles (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid unique references users(id) on delete cascade,
  fasting_glucose   numeric,                      -- 공복혈당 (mg/dL)
  hba1c             numeric,                      -- 당화혈색소 (%)
  bp_systolic       numeric,                      -- 수축기 혈압
  bp_diastolic      numeric,                      -- 이완기 혈압
  total_cholesterol numeric,
  ldl               numeric,
  hdl               numeric,
  triglycerides     numeric,                      -- 중성지방
  creatinine        numeric,                      -- 크레아티닌 (신장)
  gfr               numeric,                      -- 사구체여과율 (신장)
  uric_acid         numeric,                      -- 요산 (통풍)
  bmi               numeric,
  weight_kg         numeric,
  height_cm         numeric,
  conditions        text[],                       -- {'prediabetes','hypertension'}
  dietary_goals     text[],                       -- {'reduce_sodium','reduce_sugar'}
  -- AI 계산 권장 섭취 범위
  rec_sodium_max    numeric,                      -- 일일 나트륨 상한 (mg)
  rec_sugar_max     numeric,                      -- 일일 당류 상한 (g)
  rec_fat_max       numeric,                      -- 일일 지방 상한 (g)
  rec_potassium_max numeric,                      -- 신장질환 시 칼륨 상한
  rec_phosphorus_max numeric,                     -- 신장질환 시 인 상한
  updated_at        timestamptz default now()
);


-- ============================================
-- 3층: 인터랙션 데이터 (핵심 자산)
-- ============================================

-- 맛 피드백 (해자의 원천)
create table taste_feedback (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references users(id) on delete cascade,
  product_id      uuid references products(id) on delete cascade,
  dimension       text not null,                  -- salty | sweet | spicy | fatty
  rating          text not null,                  -- too_much | just_right | too_little
  created_at      timestamptz default now()
);

create index idx_feedback_user on taste_feedback (user_id, created_at desc);
create index idx_feedback_product on taste_feedback (product_id, dimension);

-- 제품 클릭/구매 로그
create table product_events (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references users(id),
  product_id      uuid references products(id),
  event_type      text not null,                  -- view | click | outlink | bookmark
  platform        text,
  created_at      timestamptz default now()
);

create index idx_events_user on product_events (user_id, created_at desc);
create index idx_events_product on product_events (product_id, event_type);

-- 추천 이력
create table recommendations (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references users(id) on delete cascade,
  product_id      uuid references products(id),
  match_score     numeric,                        -- 0~100
  reason          text,
  rec_type        text default 'taste',           -- taste | health | weekly_box
  is_clicked      boolean default false,
  is_purchased    boolean default false,
  created_at      timestamptz default now()
);

-- 주간 배송 박스 (구독자)
create table weekly_boxes (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references users(id) on delete cascade,
  week_start      date not null,
  status          text default 'draft',           -- draft | confirmed | ordered
  total_price     integer,
  platform        text,
  order_url       text,                           -- 장바구니 딥링크
  created_at      timestamptz default now()
);

create table weekly_box_items (
  id              uuid primary key default uuid_generate_v4(),
  box_id          uuid references weekly_boxes(id) on delete cascade,
  product_id      uuid references products(id),
  quantity        smallint default 1,
  match_score     numeric
);


-- ============================================
-- 글로벌 설정
-- ============================================

-- 기본 맛-성분 매핑 (신규 유저 초기값)
create table default_taste_mappings (
  id              uuid primary key default uuid_generate_v4(),
  taste_dimension text not null,
  level           smallint not null,
  nutrient_min    numeric not null,
  nutrient_max    numeric not null,
  nutrient_unit   text not null,
  unique (taste_dimension, level)
);

insert into default_taste_mappings
  (taste_dimension, level, nutrient_min, nutrient_max, nutrient_unit)
values
  ('salty', 1,    0,  300, 'mg'),
  ('salty', 2,  300,  500, 'mg'),
  ('salty', 3,  500,  800, 'mg'),
  ('salty', 4,  800, 1200, 'mg'),
  ('salty', 5, 1200, 9999, 'mg'),
  ('sweet', 1,  0,  3, 'g'),
  ('sweet', 2,  3,  6, 'g'),
  ('sweet', 3,  6, 12, 'g'),
  ('sweet', 4, 12, 20, 'g'),
  ('sweet', 5, 20, 99, 'g'),
  ('fatty', 1,  0,  3, 'g'),
  ('fatty', 2,  3,  7, 'g'),
  ('fatty', 3,  7, 15, 'g'),
  ('fatty', 4, 15, 25, 'g'),
  ('fatty', 5, 25, 99, 'g');

-- 매운맛 키워드 사전 (원재료 파싱용)
create table spicy_keywords (
  id              uuid primary key default uuid_generate_v4(),
  keyword         text unique not null,
  base_score      smallint not null,              -- 1~5
  weight          numeric default 1.0
);

insert into spicy_keywords (keyword, base_score, weight) values
  ('청양고추',   5, 1.5),
  ('하바네로',   5, 1.5),
  ('캡사이신',   4, 1.3),
  ('고춧가루',   3, 1.0),
  ('고추',       3, 1.0),
  ('고추장',     3, 0.8),
  ('칠리',       3, 1.0),
  ('할라피뇨',   3, 1.2),
  ('라유',       2, 0.8),
  ('와사비',     2, 0.8),
  ('후추',       1, 0.5),
  ('겨자',       1, 0.5),
  ('생강',       1, 0.3);
