-- 수요 집계 (11/14 구조 진단 P2 · 집계 성능) — 온보딩을 마친 프로필을 한 줄씩 받지 않고(수십만 줄, 1,000줄씩 잘림),
-- 목표·식단·짠맛·단맛 조합마다 사람 수만 돌려준다. 어느 조건을 찾을지는 화면과 같은 규칙(lib/partner/demand.ts wants)으로 서버에서 센다.
create or replace function public.demand_profile_combos()
returns table (concerns text[], diet_type text, taste_salty integer, taste_sweet integer, n bigint)
language sql stable set search_path = public as $$
  select array(select unnest(coalesce(p.concerns, '{}'::text[])) order by 1) as concerns,
         p.diet_type, p.taste_salty::integer, p.taste_sweet::integer, count(*) as n
    from public.user_profiles p
   where p.onboarding_completed = true
   group by 1, 2, 3, 4
$$;
revoke all on function public.demand_profile_combos() from public, anon, authenticated;
