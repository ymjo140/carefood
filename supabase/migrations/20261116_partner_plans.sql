-- 수요 → 기획 → 추천 (v3 10.5 고도화)
--  · partner_plans: 업체가 수요 빈틈(조건)을 보고 정한 "만들 제품" 기획. 기획 중 → 만드는 중 → 출시 (또는 접음).
--    조건(segment)은 lib/partner/demand.ts SEGMENTS 의 key. 성분 조건만 담는다 — 효능 문구는 저장할 때 걸러진다.
--  · partner_collabs.plan_id: 어떤 기획으로 보낸 제안인지 — 협업 관리에서 기획별로 묶어 본다.

create table if not exists public.partner_plans (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  segment text not null check (char_length(segment) between 1 and 40),
  name text not null check (char_length(name) between 2 and 40),
  note text check (note is null or char_length(note) <= 300),
  target_price integer check (target_price is null or target_price between 0 and 10000000),
  status text not null default 'planning' check (status in ('planning', 'making', 'launched', 'dropped')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists partner_plans_partner_idx on public.partner_plans (partner_id, created_at desc);

alter table public.partner_collabs add column if not exists plan_id uuid references public.partner_plans(id) on delete set null;
create index if not exists partner_collabs_plan_idx on public.partner_collabs (plan_id) where plan_id is not null;

alter table public.partner_plans enable row level security;
revoke all on public.partner_plans from anon, authenticated;
