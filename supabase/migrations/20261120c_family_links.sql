-- 가족 연결 — 자녀(보는 사람)가 초대 링크를 보내고, 부모님(확인받는 사람)이 보여 줄 것을 골라 동의하면 연결된다.
-- 보여 줄 수 있는 것: 끼니 기록 여부 · 고른 제품 · 약 먹었는지 · 열량·영양 숫자(기본 꺼짐). 체중·건강 목표·먹은 음식 이름은 보여 주지 않는다.
-- 건강에 관한 정보를 다른 사람에게 보여 주는 일이라 따로 동의받고(개인정보보호법 제23조), 동의·변경·그만두기를 기록으로 남긴다.
-- 두 사람 모두 로그인한 계정이어야 한다 (기록 주인 id = account_links 의 actor_id). 서버(service role)에서만 읽고 쓴다.
create table if not exists public.family_links (
  id uuid primary key default gen_random_uuid(),
  viewer_id text not null,                 -- 보는 사람(초대한 사람)
  owner_id text,                           -- 확인받는 사람 (동의한 뒤)
  label text not null check (char_length(label) between 1 and 10),   -- 보는 사람이 부르는 이름 (예: 엄마)
  code text not null unique,
  status text not null default 'pending' check (status in ('pending', 'active', 'ended')),
  share_meals boolean not null default true,
  share_products boolean not null default true,
  share_meds boolean not null default false,
  share_numbers boolean not null default false,
  alert_evening boolean not null default true,  -- 보는 사람 설정: 저녁 8시까지 기록이 없으면 나에게 알림
  consent_version text,
  consented_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check (owner_id is null or owner_id <> viewer_id)
);
create unique index if not exists family_links_pair_active on public.family_links (viewer_id, owner_id) where status = 'active';
create index if not exists family_links_viewer on public.family_links (viewer_id, status);
create index if not exists family_links_owner on public.family_links (owner_id, status);
alter table public.family_links enable row level security;

create table if not exists public.family_link_log (
  id bigserial primary key,
  link_id uuid not null references public.family_links(id) on delete cascade,
  actor text not null,
  action text not null check (action in ('invite', 'accept', 'scopes', 'end')),
  scopes jsonb,
  consent_version text,
  at timestamptz not null default now()
);
alter table public.family_link_log enable row level security;

-- 약 먹었는지 체크 — 이름은 본인이 정한다(약 이름·용량은 받지 않는다). 앱은 체크와 시간 알림만 한다.
create table if not exists public.med_checks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  label text not null check (char_length(label) between 1 and 20),
  remind_at time,
  sort smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists med_checks_user on public.med_checks (user_id) where is_active;
alter table public.med_checks enable row level security;

create table if not exists public.med_check_log (
  item_id uuid not null references public.med_checks(id) on delete cascade,
  user_id text not null,
  day date not null,
  checked_at timestamptz not null default now(),
  primary key (item_id, day)
);
alter table public.med_check_log enable row level security;

-- 초대 받기 — 줄을 잠그고 한 번에: 기다리는 초대 · 만료 전 · 자기 자신 아님 · 이미 연결된 두 사람 아님
-- status: accepted | missing | expired | used | self | exists
create or replace function public.family_link_accept(
  p_code text, p_owner text, p_meals boolean, p_products boolean, p_meds boolean, p_numbers boolean, p_version text)
returns jsonb language plpgsql set search_path = public as $$
declare l public.family_links%rowtype;
begin
  select * into l from family_links where code = p_code for update;
  if not found then return jsonb_build_object('status', 'missing'); end if;
  if l.status <> 'pending' then return jsonb_build_object('status', case when l.owner_id = p_owner and l.status = 'active' then 'accepted' else 'used' end, 'id', l.id); end if;
  if l.expires_at < now() then return jsonb_build_object('status', 'expired'); end if;
  if l.viewer_id = p_owner then return jsonb_build_object('status', 'self'); end if;
  if exists (select 1 from family_links where viewer_id = l.viewer_id and owner_id = p_owner and status = 'active') then
    return jsonb_build_object('status', 'exists');
  end if;
  update family_links set owner_id = p_owner, status = 'active', share_meals = p_meals, share_products = p_products,
    share_meds = p_meds, share_numbers = p_numbers, consent_version = p_version, consented_at = now()
  where id = l.id;
  insert into family_link_log (link_id, actor, action, scopes, consent_version)
  values (l.id, p_owner, 'accept', jsonb_build_object('meals', p_meals, 'products', p_products, 'meds', p_meds, 'numbers', p_numbers), p_version);
  return jsonb_build_object('status', 'accepted', 'id', l.id);
end $$;
revoke all on function public.family_link_accept(text, text, boolean, boolean, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.family_link_accept(text, text, boolean, boolean, boolean, boolean, text) to service_role;
