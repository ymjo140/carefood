-- 주문 문의 — 주문자가 판매 업체 묶음에 묻고, 업체가 업체 화면에서 답한다 (11/14, B2B 남은 일 "문의·리뷰를 업체에 보여 주기").
--  · 결제한 주문만. 한 묶음에 답을 기다리는 문의는 3개까지(같은 말을 여러 번 보내지 않게).
--  · 업체는 가명 번호(업체마다 다른 번호)·주문 날짜·그 묶음 상품만 본다 — 이름·연락처·건강 정보 없음.
--  · 답은 한 번(조건부 update). 답에는 표현 점검(금지 표현 사전)을 건다 — 질병·치료 효능을 말하지 않게.
--  · partner_notified_at: /api/push/run 이 업체 담당자에게 푸시로 알린 때. 예시 주문(is_demo)은 알리지 않고 적기만 한다.
create table if not exists public.order_inquiries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete cascade,
  user_id text not null,
  kind text not null check (kind in ('shipping', 'product', 'return', 'other')),
  body text not null check (char_length(body) between 2 and 500),
  answer text check (answer is null or char_length(answer) between 2 and 1000),
  answered_at timestamptz,
  answered_by uuid,
  partner_notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists order_inquiries_partner_idx on public.order_inquiries (partner_id, created_at desc);
create index if not exists order_inquiries_open_idx on public.order_inquiries (partner_id, created_at) where answer is null;
create index if not exists order_inquiries_order_idx on public.order_inquiries (order_id);
create index if not exists order_inquiries_user_idx on public.order_inquiries (user_id, answered_at desc) where answer is not null;

alter table public.order_inquiries enable row level security;
revoke all on public.order_inquiries from anon, authenticated;

-- 로그인하면 기기 기록을 계정으로 옮긴다 — 주문(orders)과 함께 문의도 옮긴다.
-- 같이: 빠져 있던 업체 기능 기록(받은 쿠폰 coupon_grants · 자동 알림 보낸 기록 flow_sends · 협업 제안 partner_collabs · 협업 받기 프로필 creator_profiles)과
--       사람이 만든 챌린지(community_challenges.creator_id)도 옮긴다. 로그인 전에 받은 쿠폰이 로그인 뒤 쿠폰함에서 사라지던 것.
--       같은 것이 계정에 이미 있으면(고유 키 충돌) 기기 쪽 줄을 지운다 — 기존 규칙 그대로.
create or replace function public.merge_actor(from_id text, to_id text)
 returns integer
 language plpgsql
 set search_path to 'public'
as $function$
declare t record; r record; n int := 0; gids uuid[];
begin
  if from_id is null or to_id is null or from_id = to_id then return 0; end if;
  gids := array(select group_id from public.community_challenge_members where user_id in (from_id, to_id) and group_id is not null);
  for t in select * from (values
    ('community_bookmarks','user_id'), ('community_feed','user_id'), ('community_feed_comments','user_id'),
    ('community_feed_likes','user_id'), ('community_follows','follower_id'), ('community_follows','following_id'),
    ('community_reports','reporter_id'), ('community_hidden_posts','user_id'),
    ('community_blocks','blocker_id'), ('community_blocks','blocked_id'), ('notification_reads','user_id'),
    ('community_poll_votes','user_id'), ('community_challenge_members','user_id'), ('community_profiles','actor_id'),
    ('push_subscriptions','user_id'), ('notification_prefs','user_id'), ('push_log','user_id'),
    ('marketing_consents','user_id'), ('marketing_consent_log','user_id'), ('campaign_recipients','user_id'),
    ('daily_nutrition_goals','user_id'), ('delivery_addresses','user_id'), ('group_buy_participants','user_id'),
    ('group_buys','creator_id'), ('group_buy_comments','user_id'), ('group_buy_likes','user_id'),
    ('meal_diary','user_id'), ('meal_plan_comments','user_id'), ('meal_plan_likes','user_id'),
    ('orders','user_id'), ('payments','user_id'), ('product_clicks','user_id'), ('product_reviews','user_id'),
    ('purchase_order_items','user_id'), ('saved_meal_plans','user_id'), ('shared_meal_plans','user_id'),
    ('subscriptions','user_id'), ('user_behavior_tags','user_id'), ('user_favorites','user_id'),
    ('user_interactions','user_id'), ('user_profiles','user_id'), ('user_taste_preferences','user_id'),
    ('challenge_groups','host_id'), ('challenge_cheers','from_user'), ('challenge_cheers','to_user'),
    ('community_challenge_members','invited_by'), ('share_links','owner'), ('share_events','visitor'),
    ('order_inquiries','user_id'), ('coupon_grants','user_id'), ('flow_sends','user_id'), ('partner_collabs','user_id'),
    ('creator_profiles','user_id'), ('community_challenges','creator_id')
  ) v(tbl, col) loop
    for r in execute format('select ctid from public.%I where %I = $1', t.tbl, t.col) using from_id loop
      begin
        execute format('update public.%I set %I = $1 where ctid = $2', t.tbl, t.col) using to_id, r.ctid;
        n := n + 1;
      exception when unique_violation or check_violation then
        execute format('delete from public.%I where ctid = $1', t.tbl) using r.ctid;
      end;
    end loop;
  end loop;
  update public.challenge_groups g set member_count = (select count(*) from public.community_challenge_members m where m.group_id = g.id)
    where g.id = any(gids);
  update public.community_feed f set author_nickname = p.nickname from public.community_profiles p where p.actor_id = to_id and f.user_id = to_id;
  update public.community_feed_comments c set author_nickname = p.nickname from public.community_profiles p where p.actor_id = to_id and c.user_id = to_id;
  update public.group_buy_comments c set author_nickname = p.nickname from public.community_profiles p where p.actor_id = to_id and c.user_id = to_id;
  return n;
end $function$;
