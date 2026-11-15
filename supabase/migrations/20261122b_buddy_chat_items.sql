-- 캐릭터 대화의 추천 카드 — 우리 DB(제품·대표 메뉴)에서 고른 것을 말과 같이 남긴다 (lib/chat-recs.ts Pick[])
alter table public.buddy_chats add column if not exists items jsonb;
