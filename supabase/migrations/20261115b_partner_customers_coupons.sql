-- 업체 고객 관리 + 혜택(쿠폰) + 자동 알림 (v3 10.2)
--  · 고객 = 앱에서 이 업체 제품을 결제한 사람. 화면에는 업체마다 다른 가명 번호로만 보인다 (연락처·이름·목표 없음).
--  · 쿠폰은 업체 부담: 결제할 때 업체 묶음마다 가장 큰 할인 하나를 자동으로 쓰고, 정산에서 판매액에서 뺀다.
--  · 알림: 쿠폰 받음·자동 알림은 광고라 광고 동의자에게만 8~21시(야간 동의자는 예외), 앞에 (광고).

create table if not exists public.partner_coupons (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 30),
  kind text not null check (kind in ('amount', 'percent', 'free_shipping')),
  value integer not null default 0 check (value >= 0 and value <= 100000),
  max_discount integer check (max_discount is null or max_discount between 1 and 100000),
  min_order integer not null default 0 check (min_order between 0 and 1000000),
  valid_days integer not null default 14 check (valid_days between 1 and 90),
  status text not null default 'active' check (status in ('active', 'stopped')),
  created_by uuid,
  created_at timestamptz not null default now(),
  check ((kind = 'amount' and value between 500 and 100000) or (kind = 'percent' and value between 1 and 50) or (kind = 'free_shipping' and value = 0))
);
create index if not exists partner_coupons_partner_idx on public.partner_coupons (partner_id, created_at desc);

create table if not exists public.coupon_grants (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.partner_coupons(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete cascade,
  user_id text not null,
  source text not null default 'manual' check (source in ('manual', 'flow', 'influencer')),
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'used', 'revoked')),
  used_order_id uuid references public.orders(id) on delete set null,
  used_at timestamptz,
  discount_amount integer not null default 0,
  notified boolean not null default false
);
create index if not exists coupon_grants_user_idx on public.coupon_grants (user_id, status, expires_at);
create index if not exists coupon_grants_coupon_idx on public.coupon_grants (coupon_id);
create index if not exists coupon_grants_partner_idx on public.coupon_grants (partner_id, granted_at desc);
-- 같은 쿠폰은 한 사람에게 쓸 수 있는 것 하나만
create unique index if not exists coupon_grants_one_active on public.coupon_grants (coupon_id, user_id) where status = 'active';

alter table public.orders add column if not exists discount_fees jsonb not null default '{}'::jsonb;
alter table public.partner_settlements add column if not exists order_discount integer not null default 0;

-- 자동 알림 — 첫 주문 감사 · 다시 살 때 · 다시 찾아 주세요
create table if not exists public.partner_flows (
  partner_id uuid not null references public.partners(id) on delete cascade,
  kind text not null check (kind in ('first_thanks', 'replenish', 'winback')),
  is_on boolean not null default false,
  coupon_id uuid references public.partner_coupons(id) on delete set null,
  title text not null check (char_length(title) between 1 and 30),
  body text not null check (char_length(body) between 1 and 120),
  delay_days integer not null check (delay_days between 1 and 180),
  updated_at timestamptz not null default now(),
  primary key (partner_id, kind)
);

create table if not exists public.flow_sends (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  kind text not null,
  user_id text not null,
  trigger_key text not null,
  grant_id uuid references public.coupon_grants(id) on delete set null,
  title text not null,
  body text not null,
  sent_at timestamptz not null default now(),
  pushed boolean not null default false,
  unique (partner_id, kind, user_id, trigger_key)
);
create index if not exists flow_sends_user_idx on public.flow_sends (user_id, sent_at desc);
create index if not exists flow_sends_partner_idx on public.flow_sends (partner_id, sent_at desc);

do $$ declare t text; begin
  foreach t in array array['partner_coupons', 'coupon_grants', 'partner_flows', 'flow_sends'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
