-- 고객층(CRM) — 업체는 조건과 숫자만 보고, 사람 목록·동의 기록은 케어푸드 안에만 둔다 (2026-11-14)
-- 설계: Claude Docs "케어푸드 B2B 입점 기획 v3" 7.5·8장
-- 결정(11/13)
--   · 발송비는 보낼 때 업체가 낸다 — 검수 요청 때 충전금에서 잡아 두고, 보낸 수만큼 확정, 나머지·반려·취소분은 돌려준다
--   · 한 사람은 업체 광고를 주 2회, 같은 업체 것은 주 1회까지 · 한 업체는 주 2번 발송
--   · 같은 조건의 10%는 비교용으로 보내지 않는다(비용 없음) · 발송 후 7일 안의 반응을 그 발송의 몫으로 센다
--   · 고른 목표로 대상을 고르려면 '맞춤 광고 대상 고르기' 동의(targeting)가 따로 있어야 한다
-- 모든 표는 서버(서비스 키)로만 읽고 쓴다 — RLS 켜고 정책 없음, anon·authenticated 권한 없음.

-- 1) 광고성 정보 수신 동의 (정보통신망법 제50조) — 매체는 앱(알림함·이 기기 알림) 하나로 시작
create table if not exists public.marketing_consents (
  user_id text primary key,
  ads boolean not null default false,          -- 업체 소식·할인(광고) 받기
  ads_at timestamptz,                          -- 마지막으로 켜거나 끈 시각 (2년 확인의 기준)
  night boolean not null default false,        -- 21~8시에도 받기 (별도 동의, 제50조③)
  night_at timestamptz,
  targeting boolean not null default false,    -- 고른 목표·입맛을 맞춤 광고 대상 고르기에 쓰기 (민감정보 이용 목적)
  targeting_at timestamptz,
  confirmed_at timestamptz,                    -- 2년마다 동의 확인 안내를 보낸 시각
  updated_at timestamptz not null default now()
);
create index if not exists marketing_consents_ads_idx on public.marketing_consents (user_id) where ads;

create table if not exists public.marketing_consent_log (
  id bigserial primary key,
  user_id text not null,
  field text not null check (field in ('ads', 'night', 'targeting')),
  value boolean not null,
  at timestamptz not null default now()
);
create index if not exists marketing_consent_log_user_idx on public.marketing_consent_log (user_id, at desc);

-- 2) 업체별 건당 발송비(원). 비어 있으면 그 업체는 고객층 발송을 예약할 수 없다 (관리자가 비워서 닫는다)
--    결정(11/13): 처음에는 모든 업체 건당 100원
alter table public.partners add column if not exists crm_unit_price integer
  check (crm_unit_price is null or crm_unit_price between 0 and 10000);
alter table public.partners alter column crm_unit_price set default 100;
update public.partners set crm_unit_price = 100 where crm_unit_price is null;

-- 2-1) 온보딩에서 고른 목표를 그대로 저장한다 (concerns 는 추천용으로 접힌 값이라 muscle·balanced 가 없다)
--      질환 관심(diabetes·blood_pressure·kidney)은 conditions 에만 두고 여기에는 넣지 않는다
alter table public.user_profiles add column if not exists goals text[];

-- 3) 저장한 고객층 (조건 묶음만 — 사람은 저장하지 않는다)
create table if not exists public.partner_segments (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  conditions jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists partner_segments_partner_idx on public.partner_segments (partner_id, updated_at desc);

-- 4) 발송 — 검수(review) → 예약(scheduled) → 보내는 중(sending) → 보냄(sent). 반려(rejected)·취소(canceled)
create table if not exists public.partner_campaigns (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  segment_id uuid references public.partner_segments(id) on delete set null,
  conditions jsonb not null,
  template text not null check (template in ('new', 'discount', 'restock', 'groupbuy')),
  title text not null check (char_length(title) between 1 and 30),
  body text not null check (char_length(body) between 1 and 120),
  product_id uuid references public.products(id) on delete set null,
  send_at timestamptz not null,
  night boolean not null default false,        -- 21~8시 발송 (야간 동의자만)
  status text not null default 'review' check (status in ('review', 'rejected', 'scheduled', 'sending', 'sent', 'canceled')),
  reject_note text,
  unit_price integer not null check (unit_price >= 0),
  estimate_count integer not null check (estimate_count >= 0),   -- 요청 때 받을 수 있던 인원 (비교용 제외)
  held_amount integer not null check (held_amount >= 0),         -- 잡아 둔 발송비
  sent_count integer,                          -- 실제로 보낸 인원 (비교용 제외)
  holdout_count integer,                       -- 비교용으로 보내지 않은 인원
  charged_amount integer,                      -- 확정한 발송비
  created_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists partner_campaigns_due_idx on public.partner_campaigns (status, send_at);
create index if not exists partner_campaigns_partner_idx on public.partner_campaigns (partner_id, created_at desc);

-- 5) 받은 사람 — 케어푸드 안에서만 쓴다. 업체 API 는 합계만 낸다 (10명 미만은 가림)
create table if not exists public.campaign_recipients (
  campaign_id uuid not null references public.partner_campaigns(id) on delete cascade,
  user_id text not null,
  holdout boolean not null default false,      -- 비교용 (보내지 않음)
  sent_at timestamptz not null default now(),
  pushed boolean not null default false,       -- 이 기기 알림까지 갔는지 (알림함에는 늘 들어간다)
  opened_at timestamptz,
  primary key (campaign_id, user_id)
);
create index if not exists campaign_recipients_user_idx on public.campaign_recipients (user_id, sent_at desc);

-- 6) 충전금 장부 — 잔액 = 확정(confirmed)된 금액의 합. 들어오면 +, 나가면 −
create table if not exists public.partner_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  kind text not null check (kind in ('topup', 'hold', 'release', 'charge', 'adjust')),
  amount integer not null,
  status text not null default 'confirmed' check (status in ('requested', 'confirmed', 'canceled')),
  campaign_id uuid references public.partner_campaigns(id) on delete set null,
  note text,
  created_by uuid,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists partner_credit_ledger_partner_idx on public.partner_credit_ledger (partner_id, created_at desc);

do $$ declare t text; begin
  foreach t in array array['marketing_consents', 'marketing_consent_log', 'partner_segments', 'partner_campaigns', 'campaign_recipients', 'partner_credit_ledger'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on sequence public.marketing_consent_log_id_seq from anon, authenticated;

-- 7) 발송비 잡아 두기 — 업체 줄을 잠그고 잔액을 확인한 뒤 hold 를 적는다 (두 요청이 같은 잔액을 쓰지 않게)
create or replace function public.partner_credit_hold(p_partner uuid, p_campaign uuid, p_amount integer)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare bal bigint;
begin
  if p_amount < 0 then raise exception 'amount must be >= 0'; end if;
  perform 1 from public.partners where id = p_partner for update;
  select coalesce(sum(amount), 0) into bal from public.partner_credit_ledger where partner_id = p_partner and status = 'confirmed';
  if bal < p_amount then return false; end if;
  if p_amount > 0 then
    insert into public.partner_credit_ledger (partner_id, kind, amount, campaign_id, note)
    values (p_partner, 'hold', -p_amount, p_campaign, '발송비 잡아 둠');
  end if;
  return true;
end $$;
revoke all on function public.partner_credit_hold(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.partner_credit_hold(uuid, uuid, integer) to service_role;

-- 7-1) 발송비 정산 — 잡아 둔 금액을 돌려놓고 실제 발송분을 차감하는 일을 업체 줄을 잠근 채 한 번에 한다.
--      (돌려놓은 뒤 차감 전에 다른 요청이 그 돈을 다시 잡아 잔액이 음수가 되지 않게)
--      한 발송은 한 번만 정산한다. 차감은 잡아 둔 금액을 넘지 않는다.
create or replace function public.partner_credit_settle(p_partner uuid, p_campaign uuid, p_release integer, p_charge integer, p_release_note text, p_charge_note text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if p_release < 0 or p_charge < 0 then raise exception 'amount must be >= 0'; end if;
  if p_charge > p_release then raise exception 'charge exceeds hold'; end if;
  perform 1 from public.partners where id = p_partner for update;
  if exists (select 1 from public.partner_credit_ledger where campaign_id = p_campaign and kind in ('release', 'charge')) then
    return false; -- 이미 정산함
  end if;
  if p_release > 0 then
    insert into public.partner_credit_ledger (partner_id, kind, amount, campaign_id, note)
    values (p_partner, 'release', p_release, p_campaign, p_release_note);
  end if;
  if p_charge > 0 then
    insert into public.partner_credit_ledger (partner_id, kind, amount, campaign_id, note)
    values (p_partner, 'charge', -p_charge, p_campaign, p_charge_note);
  end if;
  return true;
end $$;
revoke all on function public.partner_credit_settle(uuid, uuid, integer, integer, text, text) from public, anon, authenticated;
grant execute on function public.partner_credit_settle(uuid, uuid, integer, integer, text, text) to service_role;

-- 7-2) 광고 동의 하나 바꾸기 — 사람 줄을 잠그고 지금 값 위에서 바꾼다 (먼저 읽은 값으로 덮어써 끈 동의가 되살아나지 않게)
--      ads 를 끄면 night·targeting 도 끈다. 바뀐 칸만 시각을 적고 기록을 남긴다.
create or replace function public.marketing_consent_set(p_user text, p_key text, p_value boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  cur public.marketing_consents%rowtype;
  a boolean; n boolean; g boolean; t timestamptz := now();
begin
  if p_key not in ('ads', 'night', 'targeting') then raise exception 'unknown consent key %', p_key; end if;
  insert into public.marketing_consents (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into cur from public.marketing_consents where user_id = p_user for update;
  a := case when p_key = 'ads' then p_value else cur.ads end;
  n := case when p_key = 'night' then p_value else cur.night end;
  g := case when p_key = 'targeting' then p_value else cur.targeting end;
  if not a then n := false; g := false; end if;
  update public.marketing_consents set
    ads = a, ads_at = case when a is distinct from cur.ads then t else cur.ads_at end,
    night = n, night_at = case when n is distinct from cur.night then t else cur.night_at end,
    targeting = g, targeting_at = case when g is distinct from cur.targeting then t else cur.targeting_at end,
    updated_at = t
  where user_id = p_user;
  insert into public.marketing_consent_log (user_id, field, value, at)
  select p_user, f, v, t from (values ('ads', a, cur.ads), ('night', n, cur.night), ('targeting', g, cur.targeting)) x(f, v, prev)
  where v is distinct from prev;
  return jsonb_build_object('ads', a, 'night', n, 'targeting', g,
    'ads_at', case when a is distinct from cur.ads then t else cur.ads_at end);
end $$;
revoke all on function public.marketing_consent_set(text, text, boolean) from public, anon, authenticated;
grant execute on function public.marketing_consent_set(text, text, boolean) to service_role;

-- 8) 로그인하면 이 기기 기록을 계정으로 옮기는 함수에 동의·받은 기록을 넣는다
create or replace function public.merge_actor(from_id text, to_id text)
 returns integer
 language plpgsql
 set search_path to 'public'
as $function$
declare t record; r record; n int := 0;
begin
  if from_id is null or to_id is null or from_id = to_id then return 0; end if;
  for t in select * from (values
    ('community_bookmarks','user_id'), ('community_feed','user_id'), ('community_feed_comments','user_id'),
    ('community_feed_likes','user_id'), ('community_follows','follower_id'), ('community_follows','following_id'),
    ('community_reports','reporter_id'), ('community_hidden_posts','user_id'),
    ('community_blocks','blocker_id'), ('community_blocks','blocked_id'), ('notification_reads','user_id'),
    ('community_poll_votes','user_id'), ('community_challenge_members','user_id'), ('community_profiles','actor_id'),
    ('push_subscriptions','user_id'), ('notification_prefs','user_id'), ('push_log','user_id'),
    ('marketing_consents','user_id'), ('marketing_consent_log','user_id'), ('campaign_recipients','user_id'),
    ('daily_nutrition_goals','user_id'), ('delivery_addresses','user_id'), ('group_buy_participants','user_id'),
    ('group_buys','creator_id'), ('meal_diary','user_id'), ('meal_plan_comments','user_id'), ('meal_plan_likes','user_id'),
    ('orders','user_id'), ('payments','user_id'), ('product_clicks','user_id'), ('product_reviews','user_id'),
    ('purchase_order_items','user_id'), ('saved_meal_plans','user_id'), ('shared_meal_plans','user_id'),
    ('subscriptions','user_id'), ('user_behavior_tags','user_id'), ('user_favorites','user_id'),
    ('user_interactions','user_id'), ('user_profiles','user_id'), ('user_taste_preferences','user_id')
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
  -- 옮긴 글·답글의 이름을 계정 이름으로 맞춘다
  update public.community_feed f set author_nickname = p.nickname from public.community_profiles p where p.actor_id = to_id and f.user_id = to_id;
  update public.community_feed_comments c set author_nickname = p.nickname from public.community_profiles p where p.actor_id = to_id and c.user_id = to_id;
  return n;
end $function$;
