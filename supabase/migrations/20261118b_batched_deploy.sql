-- 몰아서 배포 (11/14 사용자 결정) — 2시간마다 /api/deploy/run 을 부른다. 운영 커밋과 main 끝이 다를 때만 배포 훅을 부른다(lib/deploy-batch.ts).
-- 비밀값은 알림 예약과 같은 것(Vault push_cron_secret)을 쓴다.
select cron.unschedule('batched-deploy') where exists (select 1 from cron.job where jobname = 'batched-deploy');
select cron.schedule('batched-deploy', '7 */2 * * *', $job$
  select net.http_post(
    url := 'https://carefood-iota.vercel.app/api/deploy/run',
    headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')),
    timeout_milliseconds := 30000
  );
$job$);
