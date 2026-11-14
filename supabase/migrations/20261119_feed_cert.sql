-- 스토리 줄에 챌린지·연속 기록 인증도 (2026-11-14)
-- 인증 카드를 '오늘끼록 스토리에도 올리기' 하면 카드 그림을 붙인 글이 되고, 서버가 만든 요약을 cert 에 둔다.
-- cert: { kind: "challenge"|"streak"|"day", title?, done?, total_days?, goal?, streak?, url } — url 은 같이 하기(/j/<code>) 또는 하루 기록 링크
alter table public.community_feed add column if not exists cert jsonb;
