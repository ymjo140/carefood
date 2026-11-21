-- 입점 양식에 '상에서의 자리'(dish_role, 필수)·'먹는 때'(meal_times, 권장)를 받는다 (lib/partner/schema DISH_ROLES·MEAL_TIMES)
-- 업체가 고른 값의 근거는 meal_class_src = 'partner'. 이름·열량과 어긋나면 검수 사유(role_mismatch)로 올라온다.
alter table public.products drop constraint if exists products_meal_class_src_check;
alter table public.products add constraint products_meal_class_src_check
  check (meal_class_src in ('survey', 'rule', 'review', 'checked', 'partner'));

-- 이미 들어온 업체 제품(2026-11-21 기준 시연 업체 8개)은 자리 없이 저장됐다 — 카테고리·먹는 역할로 채운다 (legacyDishRole 과 같은 규칙)
with m as (
  select id, product_id,
    case
      when data->>'meal_role' = 'side' then 'side'
      when data->>'meal_role' = 'snack' then 'snack'
      when data->>'meal_role' = 'drink' then 'drink'
      when data->>'category' = 'soup' then 'soup'
      when data->>'category' = 'side' then 'side'
      when data->>'category' in ('snack', 'dairy', 'bread') then 'snack'
      when data->>'category' = 'drink' then 'drink'
      else 'main'
    end as role
  from public.partner_items
  where data->>'dish_role' is null
)
update public.partner_items i set
  data = i.data || jsonb_build_object('dish_role', m.role),
  approved_data = case when i.approved_data is null then null else i.approved_data || jsonb_build_object('dish_role', m.role) end
from m where m.id = i.id;

update public.products p set
  dish_role = nullif(i.data->>'dish_role', 'drink'),
  meal_class_src = 'partner'
from public.partner_items i
where i.product_id = p.id and p.data_source = 'partner';
