-- 입점 3단계: 상품 피드 (2026-11-12)
-- 업체가 같은 양식의 CSV·JSON 을 정해진 주소에 올려 두면 하루 두 번 가져간다.
-- 예약 작업은 매시 20분에 돌고, 서버가 '가져온 지 11시간 반이 지난 피드'만 가져온다(한 번에 다 못 돌면 다음 시간에 이어서).
-- 비밀값은 알림 예약과 같은 것(Vault push_cron_secret)을 쓴다 — 서버는 cron_secret_ok() 로 맞는지만 묻는다.

create table if not exists public.partner_feeds (
  partner_id uuid primary key references public.partners(id) on delete cascade,   -- 업체당 하나
  url text not null check (url ~ '^https://'),
  is_active boolean not null default true,
  last_fetched_at timestamptz,
  last_status text check (last_status in ('ok', 'unchanged', 'failed')),
  last_error text,
  last_hash text,                          -- 내용이 그대로면 건너뛴다
  last_batch_id uuid references public.ingest_batches(id) on delete set null,
  last_summary jsonb,
  failures smallint not null default 0,    -- 잇따라 실패한 횟수
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.partner_feeds enable row level security;
revoke all on public.partner_feeds from anon, authenticated;

select cron.schedule('partner-feeds', '20 * * * *', $job$
  select net.http_post(
    url := 'https://carefood-iota.vercel.app/api/partner/feeds/run',
    headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')),
    timeout_milliseconds := 60000
  );
$job$);
