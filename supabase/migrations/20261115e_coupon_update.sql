-- 쿠폰 고치기 (v3 10.2) — 아직 아무에게도 주지 않은 쿠폰은 모든 칸을, 이미 준 쿠폰은 이름만 고친다.
-- 쿠폰 줄을 잠그고 준 기록을 센다: 쿠폰을 주는 insert 는 같은 줄에 FOR KEY SHARE 를 잡으므로 동시에 주는 일과 엇갈리지 않는다.
create or replace function public.partner_coupon_update(
  p_id uuid, p_partner uuid, p_name text, p_kind text, p_value integer, p_max integer, p_min integer, p_days integer
) returns text language plpgsql security definer set search_path = '' as $$
declare c record; granted boolean;
begin
  select * into c from public.partner_coupons where id = p_id and partner_id = p_partner for update;
  if not found then return 'not_found'; end if;
  select exists(select 1 from public.coupon_grants where coupon_id = p_id) into granted;
  if granted and (c.kind is distinct from p_kind or c.value is distinct from p_value or c.max_discount is distinct from p_max
                  or c.min_order is distinct from p_min or c.valid_days is distinct from p_days) then
    return 'granted';
  end if;
  update public.partner_coupons set name = p_name, kind = p_kind, value = p_value, max_discount = p_max, min_order = p_min, valid_days = p_days
   where id = p_id;
  return 'ok';
end $$;
revoke all on function public.partner_coupon_update(uuid, uuid, text, text, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.partner_coupon_update(uuid, uuid, text, text, integer, integer, integer, integer) to service_role;
