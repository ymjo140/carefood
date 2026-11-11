-- 끼니 역할 다시 반영 (추천 3단계)
-- scripts/build_taste_profile.py 의 role() 규칙을 보완한 뒤(김밥용 김·두부피·유부·만두피·라이스페이퍼·마른 파스타 → ingredient)
-- 다시 계산해 products_taste_patch 에 올린 값으로 meal_role 만 바꾼다. 맛 6축은 그대로.
update public.products p set meal_role = t.meal_role
from public.products_taste_patch t
where t.id = p.id and p.meal_role is distinct from t.meal_role;
