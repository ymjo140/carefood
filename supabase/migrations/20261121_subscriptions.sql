-- 캐릭터 구독 — 요금제 · 구독 · 결제 · 기록 (규칙: src/lib/plans.ts)
-- (public.subscriptions 는 예전 정기배송 표라 이름을 plan_* 로 따로 둔다)
-- 구독은 로그인 계정의 actor(user_id) 에만. 서비스 롤로만 읽고 쓴다 (RLS 켬, 정책 없음).
-- 결제 승인·갱신은 SUBSCRIPTION_ENABLED 를 켤 때 DB 함수로 붙인다 (금액은 서버의 요금제 값으로만).

create table if not exists public.subscription_plans (
  code text primary key check (code in ('basic', 'kkirok', 'all')),
  name text not null,
  price_month integer not null check (price_month >= 0),
  characters text[] not null default '{}',
  sort integer not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.subscription_plans (code, name, price_month, characters, sort) values
  ('basic', '기본', 0, '{}', 0),
  ('kkirok', '끼록이 플랜', 1900, '{kkirok}', 1),
  ('all', '모든 캐릭터 플랜', 3900, '{kkirok,rami,kkinyang}', 2)
on conflict (code) do update set name = excluded.name, price_month = excluded.price_month, characters = excluded.characters, sort = excluded.sort, updated_at = now();
alter table public.subscription_plans enable row level security;

create table if not exists public.plan_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  plan_code text not null references public.subscription_plans(code),
  status text not null default 'active' check (status in ('active', 'canceled', 'past_due', 'expired')),
  source text not null default 'pg' check (source in ('pg', 'gift', 'admin')),
  anchor_at timestamptz not null default now(),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  pg_customer_key text,
  -- 기간 안에 유료 캐릭터를 처음 쓴 시각 (7일 안 해지 환불 판단)
  first_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_period_end > current_period_start)
);
-- 한 사람에 살아 있는 구독은 하나
create unique index if not exists plan_subscriptions_one_live on public.plan_subscriptions (user_id) where status <> 'expired';
create index if not exists plan_subscriptions_period_end on public.plan_subscriptions (current_period_end) where status <> 'expired';
alter table public.plan_subscriptions enable row level security;

create table if not exists public.plan_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.plan_subscriptions(id) on delete set null,
  user_id text not null,
  order_id text not null unique,
  plan_code text not null references public.subscription_plans(code),
  kind text not null default 'renew' check (kind in ('first', 'renew', 'upgrade')),
  amount integer not null check (amount >= 0),
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'canceled', 'refunded')),
  pg_payment_key text unique,
  approved_at timestamptz,
  failure text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plan_payments_user on public.plan_payments (user_id, created_at desc);
alter table public.plan_payments enable row level security;

-- 시작·갱신·해지·되돌리기·요금제 변경·결제 실패·만료·환불·가격 변경 동의 — 동의는 문구 버전과 선택을 같이 남긴다
create table if not exists public.plan_events (
  id bigserial primary key,
  subscription_id uuid references public.plan_subscriptions(id) on delete set null,
  user_id text not null,
  kind text not null check (kind in ('start', 'renew', 'cancel', 'resume', 'change_plan', 'payment_failed', 'expire', 'refund', 'price_consent', 'gift')),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists plan_events_user on public.plan_events (user_id, created_at desc);
alter table public.plan_events enable row level security;
