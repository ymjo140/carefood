-- 출시 전 정리 (2026-11-11)
-- (1) 공개 키(anon)·로그인 사용자로 읽히던 뷰 — RLS 를 우회하는 security definer 뷰라 사용자 행동·클릭 통계가 그대로 보였다.
--     앱은 서버(서비스 키)로만 읽는다. 가격 뷰(v_all_prices·v_purchasable_products)는 공개 정보라 그대로 둔다.
revoke select on public.v_user_preferences, public.product_click_stats, public.coupang_queue from anon, authenticated;

-- (2) 오류 기록 — 서버(src/instrumentation.ts)·브라우저(components/ErrorReporter)
create table if not exists public.app_errors (
  id bigserial primary key,
  source text not null check (source in ('server','client')),
  path text, method text, kind text,
  message text not null, digest text, stack text, user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists app_errors_created_idx on public.app_errors (created_at desc);
alter table public.app_errors enable row level security;

-- (3) 알림 예약 — GitHub 예약은 4~6시간 간격으로만 돌아 끼니 알림에 늦었다. Supabase pg_cron 으로 30분마다.
--     비밀값은 DB 안에서 만들어 Vault 에 두고(밖으로 꺼내지 않음), 서버는 cron_secret_ok() 로 맞는지만 묻는다.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_cron_secret', '알림 예약 작업 → /api/push/run')
where not exists (select 1 from vault.secrets where name = 'push_cron_secret');

create or replace function public.cron_secret_ok(p text) returns boolean
language sql security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'push_cron_secret' and decrypted_secret = p);
$$;
revoke all on function public.cron_secret_ok(text) from public, anon, authenticated;
grant execute on function public.cron_secret_ok(text) to service_role;

select cron.schedule('push-reminders', '5,35 * * * *', $job$
  select net.http_post(
    url := 'https://carefood-iota.vercel.app/api/push/run',
    headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')),
    timeout_milliseconds := 60000
  );
$job$);
