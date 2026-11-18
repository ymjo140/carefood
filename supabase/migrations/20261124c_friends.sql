-- 내 친구 — 가족 연결과 같은 표(family_links)를 쓰되 kind = 'friend'. 친구는 서로 같은 관계라 받으면 두 줄(서로 보는 줄)을 만든다.
--  · 친구가 서로 볼 수 있는 것: 끼니 기록 여부(기본) · 먹은 음식·숫자(각자 켤 때만). 약 체크·고른 제품·대신 기록하기는 친구에게 없다.
--  · 초대한 사람은 초대를 만들 때 '친구가 받으면 서로 끼니 기록 여부가 보여요'에 동의한다(서버가 agree 를 받는다).
--  · 저녁 8시 확인·약 체크 알림은 가족에게만.
-- 받기(family_link_accept)는 줄을 잠그고 한 번에 — 친구면 받은 사람 쪽에서 초대한 사람을 보는 줄도 같이 만든다(이미 있으면 그대로).

alter table public.family_links add column if not exists kind text not null default 'family' check (kind in ('family', 'friend'));

create or replace function public.family_link_accept(
  p_code text, p_owner text, p_meals boolean, p_products boolean, p_meds boolean, p_numbers boolean, p_version text)
returns jsonb language plpgsql set search_path = public as $$
declare l public.family_links%rowtype; v_back uuid; v_label text; v_code text;
begin
  select * into l from family_links where code = p_code for update;
  if not found then return jsonb_build_object('status', 'missing'); end if;
  if l.status <> 'pending' then return jsonb_build_object('status', case when l.owner_id = p_owner and l.status = 'active' then 'accepted' else 'used' end, 'id', l.id); end if;
  if l.expires_at < now() then return jsonb_build_object('status', 'expired'); end if;
  if l.viewer_id = p_owner then return jsonb_build_object('status', 'self'); end if;
  if exists (select 1 from family_links where viewer_id = l.viewer_id and owner_id = p_owner and status = 'active') then
    return jsonb_build_object('status', 'exists');
  end if;
  if l.kind = 'friend' then
    -- 친구에게는 약 체크·고른 제품을 보여 주지 않는다
    update family_links set owner_id = p_owner, status = 'active', share_meals = p_meals, share_products = false,
      share_meds = false, share_numbers = p_numbers, consent_version = p_version, consented_at = now()
    where id = l.id;
    insert into family_link_log (link_id, actor, action, scopes, consent_version)
    values (l.id, p_owner, 'accept', jsonb_build_object('meals', p_meals, 'numbers', p_numbers, 'kind', 'friend'), p_version);
    -- 받은 사람이 초대한 사람을 보는 줄 — 초대한 사람은 초대를 만들 때 끼니 기록 여부를 보여 주는 데 동의했다
    if not exists (select 1 from family_links where viewer_id = p_owner and owner_id = l.viewer_id and status = 'active') then
      select left(coalesce(nickname, '친구'), 10) into v_label from community_profiles where actor_id = l.viewer_id;
      -- 이미 연결된 줄이라 초대 코드로 쓰이지 않는다 — 표의 unique 만 맞춘다
      v_code := substr(md5(random()::text || clock_timestamp()::text || l.id::text), 1, 10);
      insert into family_links (viewer_id, owner_id, label, code, status, kind, share_meals, share_products, share_meds, share_numbers,
        alert_evening, consent_version, consented_at, expires_at)
      values (p_owner, l.viewer_id, coalesce(v_label, '친구'), v_code, 'active', 'friend', true, false, false, false,
        false, p_version, now(), now())
      returning id into v_back;
      insert into family_link_log (link_id, actor, action, scopes, consent_version)
      values (v_back, l.viewer_id, 'accept', jsonb_build_object('meals', true, 'kind', 'friend', 'by_invite', l.id), p_version);
    end if;
    return jsonb_build_object('status', 'accepted', 'id', l.id, 'kind', 'friend');
  end if;
  update family_links set owner_id = p_owner, status = 'active', share_meals = p_meals, share_products = p_products,
    share_meds = p_meds, share_numbers = p_numbers, consent_version = p_version, consented_at = now()
  where id = l.id;
  insert into family_link_log (link_id, actor, action, scopes, consent_version)
  values (l.id, p_owner, 'accept', jsonb_build_object('meals', p_meals, 'products', p_products, 'meds', p_meds, 'numbers', p_numbers), p_version);
  return jsonb_build_object('status', 'accepted', 'id', l.id, 'kind', 'family');
end $$;
revoke all on function public.family_link_accept(text, text, boolean, boolean, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.family_link_accept(text, text, boolean, boolean, boolean, boolean, text) to service_role;
