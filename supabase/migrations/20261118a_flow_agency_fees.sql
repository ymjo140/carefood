-- 자동 알림 건당 10원 · 대행 연동 상품당 500원 (11/14 사용자 결정) · 입점 신청 관리자 알림
--  · 두 요금 모두 충전금에서 빠진다. 혜택 메시지(고객층 발송)와 같은 장부(partner_credit_ledger)를 쓴다.

-- 1) 대행 파일마다 실제로 낸 금액 (반영할 때 적는다. 예시 파일·예시 업체는 0)
alter table public.partner_agency_uploads add column if not exists fee integer not null default 0;

-- 2) 입점 신청을 관리자에게 알렸는지 — 30분마다 알리고 적는다 (다시 보내지 않게)
alter table public.vendor_applications add column if not exists admin_notified_at timestamptz;
-- 지금 쌓인 신청은 이미 관리자 화면에서 보고 있으니 알린 것으로 친다
update public.vendor_applications set admin_notified_at = now() where admin_notified_at is null;

-- 3) 충전금에서 건수만큼 빼기 — 업체 줄을 잠그고 잔액을 본 뒤 한 번에 적는다 (두 요청이 같은 잔액을 쓰지 않게)
--    p_want 건을 원하고, 잔액으로 낼 수 있는 만큼(n)만 뺀다. p_all 이면 전부 낼 수 없을 때 하나도 빼지 않는다.
--    돌려주는 값 = 낸 건수 n. 단가 0 이면 빼지 않고 p_want 를 돌려준다. 메모의 {n} 은 건수로 바뀐다.
create or replace function public.partner_credit_take(p_partner uuid, p_unit integer, p_want integer, p_all boolean, p_note text)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare bal bigint; n integer;
begin
  if p_unit < 0 or p_want < 0 then raise exception 'amount must be >= 0'; end if;
  if p_want = 0 then return 0; end if;
  if p_unit = 0 then return p_want; end if;
  perform 1 from public.partners where id = p_partner for update;
  select coalesce(sum(amount), 0) into bal from public.partner_credit_ledger where partner_id = p_partner and status = 'confirmed';
  n := least(p_want::bigint, greatest(bal, 0) / p_unit)::integer;
  if p_all and n < p_want then return 0; end if;
  if n > 0 then
    insert into public.partner_credit_ledger (partner_id, kind, amount, note)
    values (p_partner, 'charge', -(n * p_unit), replace(coalesce(p_note, ''), '{n}', n::text));
  end if;
  return n;
end $$;
revoke all on function public.partner_credit_take(uuid, integer, integer, boolean, text) from public, anon, authenticated;
grant execute on function public.partner_credit_take(uuid, integer, integer, boolean, text) to service_role;
