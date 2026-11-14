-- 몰아서 배포 예약을 지운다 (11/14 사용자 결정: 시간을 정하지 않고 사용자가 "배포해"라고 할 때만 배포한다).
-- main 푸시 자동 배포는 계속 꺼 둔다(vercel.json git.deploymentEnabled.main=false). 배포는 Vercel 에서 main 을 production 으로 직접 만든다.
select cron.unschedule('batched-deploy') where exists (select 1 from cron.job where jobname = 'batched-deploy');
