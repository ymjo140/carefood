-- 추천 반응 기록에 홈 화면(home) 더하기 — 홈 '오늘 ○○ 추천'에서 보여 줌·'다른 한 상 보기'로 넘김을 남겨 다음 추천 점수에 쓴다 (lib/rec-events)
alter table public.rec_events drop constraint if exists rec_events_surface_check;
alter table public.rec_events add constraint rec_events_surface_check check (surface in ('ai_fill', 'next', 'chat', 'home'));

-- 기록: 1회 제공량 확인용 임시 작업 표(label_queue, 20261130c)는 쿠팡 접속 차단으로 일을 멈추고 지웠다 (2026-11-21)
drop table if exists public.label_queue;
