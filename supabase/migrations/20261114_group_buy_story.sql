-- 공구 만들기 — 진행자 사진·먹어 본 이야기·사람당 묶음·바라는 것 (2026-11-14)
--
-- 인플루언서 공구처럼 써 본 사람이 사진과 이야기로 연다. 이야기는 기존 description 칸을 쓴다.
-- image_urls : 커뮤니티 사진 버킷(community)의 주소, 4장까지
-- pack_size  : 한 사람이 살 묶음(팩 수). 관심 인원 × pack_size = 모두 합친 양
-- wishes     : 바라는 것 — 'off10' | 'off20' | 'plus1' | 'free_ship' (약속한 가격이 아님)

alter table public.group_buys
  add column if not exists image_urls text[] not null default '{}',
  add column if not exists pack_size integer,
  add column if not exists wishes text[] not null default '{}';

do $$ begin
  alter table public.group_buys add constraint group_buys_image_urls_max check (cardinality(image_urls) <= 4);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.group_buys add constraint group_buys_pack_size_range check (pack_size is null or pack_size between 1 and 100);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.group_buys add constraint group_buys_wishes_known
    check (wishes <@ array['off10', 'off20', 'plus1', 'free_ship']::text[]);
exception when duplicate_object then null; end $$;

-- 같은 제품 공구가 모집 중이면 새로 만들지 않고 그 공구로 보낸다 (API 가 먼저 찾고, 이 색인이 빠르게)
create index if not exists group_buys_recruiting_product_idx on public.group_buys (product_id) where status = 'recruiting';
