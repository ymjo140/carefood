-- 공구 조건표 — 진행자가 숫자를 정한다 (2026-11-14)
--
-- offer (jsonb, 검증은 API lib/group-buy.ts parseOffer):
--   { options: [{ packs, price }] (1~3개, 묶음 수량·희망 공구가),
--     shipping: { type: "free" | "fee" | "free_over", fee?, over? },
--     gift: { type: "none" | "plus" | "first", n?, item? },   -- plus: n개 사면 1개 더 · first: 선착순 n명에게 item
--     per_person_max: null | 1~20 }
-- days: 관심을 모으는 기간 7·14·21·30일 · target_count: 진행자가 10~100명 안에서
-- 알림 받는 사람마다 고른 구성(option = options 의 순번)과 수량(qty 세트) → 판매처에 보여 줄 실제 수요

alter table public.group_buys
  add column if not exists offer jsonb,
  add column if not exists days smallint;
do $$ begin
  alter table public.group_buys add constraint group_buys_days_known check (days is null or days in (7, 14, 21, 30));
exception when duplicate_object then null; end $$;

alter table public.group_buy_participants
  add column if not exists option smallint,
  add column if not exists qty smallint not null default 1;
do $$ begin
  alter table public.group_buy_participants add constraint group_buy_participants_choice check ((option is null or option between 0 and 2) and qty between 1 and 20);
exception when duplicate_object then null; end $$;

-- 관심 표시·거두기 + 고른 구성·수량. 이미 알림을 받는 사람이 다시 켜면 구성·수량만 바꾼다 (changed: "choice")
drop function if exists public.group_buy_mark(uuid, text, boolean, boolean);
create or replace function public.group_buy_mark(p_id uuid, p_user text, p_on boolean, p_sales_open boolean default false, p_option smallint default null, p_qty smallint default 1)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g record; n integer; existed boolean;
begin
  select * into g from public.group_buys where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'missing'); end if;
  if g.status <> 'recruiting' then return jsonb_build_object('ok', false, 'error', 'closed', 'current_count', g.current_count); end if;
  if p_on and g.expires_at is not null and g.expires_at < now() then return jsonb_build_object('ok', false, 'error', 'expired', 'current_count', g.current_count); end if;

  select exists (select 1 from public.group_buy_participants where group_buy_id = p_id and user_id = p_user) into existed;
  if p_on then
    if existed then
      update public.group_buy_participants set option = p_option, qty = coalesce(p_qty, 1) where group_buy_id = p_id and user_id = p_user;
    else
      insert into public.group_buy_participants (group_buy_id, user_id, option, qty) values (p_id, p_user, p_option, coalesce(p_qty, 1));
    end if;
  else
    delete from public.group_buy_participants where group_buy_id = p_id and user_id = p_user;
  end if;

  select count(*) into n from public.group_buy_participants where group_buy_id = p_id;
  update public.group_buys set
    current_count = n,
    updated_at = now(),
    reached_at = case when reached_at is null and n >= target_count then now() else reached_at end,
    status = case when p_sales_open and n >= target_count then 'achieved' else status end,
    achieved_at = case when p_sales_open and n >= target_count and achieved_at is null then now() else achieved_at end
  where id = p_id;

  return jsonb_build_object('ok', true, 'current_count', n, 'reached', n >= g.target_count, 'changed', case when p_on and existed then 'choice' else null end);
end $$;
revoke all on function public.group_buy_mark(uuid, text, boolean, boolean, smallint, smallint) from public, anon, authenticated;
grant execute on function public.group_buy_mark(uuid, text, boolean, boolean, smallint, smallint) to service_role;
