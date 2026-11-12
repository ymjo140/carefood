-- 입점 4단계: API 키 (2026-11-12)
-- 키 원문은 만들 때 한 번만 보여 주고 저장하지 않는다 — sha256 해시와 앞 12글자(알아보기용)만 둔다.
create table if not exists public.partner_api_keys (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  created_by uuid,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists partner_api_keys_partner_idx on public.partner_api_keys (partner_id, created_at desc);
alter table public.partner_api_keys enable row level security;
revoke all on public.partner_api_keys from anon, authenticated;
