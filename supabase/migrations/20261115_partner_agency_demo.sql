-- 대행 연동 + 예시 데이터 (v3 10.6)
--  · 대행: 케어푸드 담당자가 업체 대신 엑셀을 올리면 바로 반영하지 않고 업체가 '반영하기'를 눌러야 들어간다.
--    받은 줄은 partner_agency_uploads.rows 에 두고, 업체가 반영하면 ingest_batches(channel='agency') 로 들어간다.
--  · 예시: 테스트 업체(is_demo)만 '예시로 채워 보기'로 엑셀·API·대행 예시와 예시 주문을 만든다.
--    예시 주문은 orders.is_demo 로 표시해 실제 매출·관리자 집계와 나눈다.

alter table public.ingest_batches drop constraint if exists ingest_batches_channel_check;
alter table public.ingest_batches add constraint ingest_batches_channel_check check (channel in ('excel', 'feed', 'api', 'agency'));

alter table public.partners add column if not exists is_demo boolean not null default false;
update public.partners set is_demo = true where slug = 'test-demo';

alter table public.orders add column if not exists is_demo boolean not null default false;
create index if not exists orders_is_demo_idx on public.orders (is_demo) where is_demo;

create table if not exists public.partner_agency_uploads (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  file_name text,
  rows jsonb not null,
  row_count integer not null check (row_count between 1 and 2000),
  preview jsonb not null default '{}'::jsonb,
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'waiting' check (status in ('waiting', 'confirmed', 'returned', 'canceled')),
  created_by uuid,
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  decided_note text check (decided_note is null or char_length(decided_note) <= 500),
  batch_id uuid references public.ingest_batches(id) on delete set null
);
create index if not exists partner_agency_uploads_partner_idx on public.partner_agency_uploads (partner_id, created_at desc);

alter table public.partner_agency_uploads enable row level security;
revoke all on public.partner_agency_uploads from anon, authenticated;
