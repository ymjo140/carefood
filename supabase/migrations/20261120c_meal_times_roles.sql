-- 끼니 때 · 역할 (사용자 승인 2026-11-20 "응 수정해줘")
--   meal_times    이 음식을 권할 수 있는 끼니 (breakfast·lunch·dinner·snack). 비어 있으면(null) 지금처럼 이름 규칙(lib/meal-time)으로
--   breakfast_pref 아침에 특히 많이 먹는 음식 (아침 추천에서 조금 앞으로)
--   dish_role     한 끼에서 맡는 몫: main(그것만으로 한 끼) · rice(밥) · soup(국·찌개) · side(반찬) · snack(간식) · ingredient(재료 — 추천에서 뺀다)
--   meal_class_src 근거: survey(국민건강영양조사 2024 식품섭취조사의 끼니별 섭취 비율) · rule(사용자가 정한 묶음 규칙) · review(이름만으로 알기 어려워 사람이 확인할 것)
-- 아침 기준: 그 음식을 세 끼로 먹은 것 중 아침 비중 8% 미만이면 아침에서 뺀다, 19% 이상이면 아침 우선 (전체 평균 23.4%).
-- 값은 data/mfds-sodium 갈래 data/meal-class/products.csv · products-menus.csv (scratchpad knh_times.py 로 만듦) 에서 net.http_get 으로 올렸다.
-- 바꾸기 전에는 이 칸들이 없었다 — 되돌리기는 칸을 지우면 된다(아래).

alter table public.products add column if not exists meal_times text[];
alter table public.products add column if not exists breakfast_pref boolean;
alter table public.products add column if not exists dish_role text check (dish_role in ('main', 'rice', 'soup', 'side', 'snack', 'ingredient'));
alter table public.products add column if not exists meal_class_src text check (meal_class_src in ('survey', 'rule', 'review'));
create index if not exists products_dish_role_idx on public.products (dish_role) where is_purchasable;

alter table public.common_foods add column if not exists meal_times text[];
alter table public.common_foods add column if not exists breakfast_pref boolean;
alter table public.common_foods add column if not exists dish_role text check (dish_role in ('main', 'rice', 'soup', 'side', 'snack', 'ingredient'));

-- 되돌리기
-- alter table public.products drop column meal_times, drop column breakfast_pref, drop column dish_role, drop column meal_class_src;
-- alter table public.common_foods drop column meal_times, drop column breakfast_pref, drop column dish_role;

-- 넣은 뒤 고친 것 (같은 날): 원물·육수를 재료로 — 건멸치·볶음용멸치·지리멸치, 육수 한포·분말·농축액, 냉면 육수 (39개, 김치·냉면·수제비 같은 음식은 그대로)
--   update products set dish_role = 'ingredient' where dish_role in ('side','soup','main')
--     and name ~ '^건멸치|볶음용멸치|(지리|세|중|대|고바|주바)멸치(\(.*\))?$|육수(한포|분말|농축|한컵|한알)|냉면\s?육수|육수.*농축|만능육수|참육수';
--   update products set dish_role = 'main' where dish_role = 'side' and name ~ '수제비$';
--   update products set dish_role = 'main' where dish_role = 'soup'
--     and name ~ '그라탕|떡국|만둣국|만두국|떡만두|수제비|칼국수|국수|짬뽕|우동|라면|쌀국수';  -- 그것만으로 한 끼 (29개)

-- 사용자가 확인한 것 (같은 날 17시)
--   역할에 condiment(소스·육수) 추가 — 육수 한포·농축액·냉면 육수 18개는 ingredient → condiment
alter table public.products drop constraint if exists products_dish_role_check;
alter table public.products add constraint products_dish_role_check check (dish_role in ('main', 'rice', 'soup', 'side', 'snack', 'ingredient', 'condiment'));
alter table public.common_foods drop constraint if exists common_foods_dish_role_check;
alter table public.common_foods add constraint common_foods_dish_role_check check (dish_role in ('main', 'rice', 'soup', 'side', 'snack', 'ingredient', 'condiment'));
--   update products set dish_role = 'condiment' where dish_role = 'ingredient' and name ~ '육수';
--   update products set meal_times = null, breakfast_pref = null where dish_role in ('ingredient', 'condiment');
--   구운란·반숙란·훈제란·참숯란·초란·맥반석 계란, 부어스트·닭꼬치·소시지·후랑크·프랑크·비엔나 → 반찬 + 간식도 (129개, 볶음밥·김밥·도시락·찌개 등 음식 이름에 든 것은 그대로)
--   update products set dish_role = 'side', meal_times = array['breakfast','lunch','dinner','snack'] where dish_role is not null
--     and (name ~ '맥반석\s?(구운)?\s?(란|계란|달걀|유정란)|구운\s?(란|계란|달걀|유정란)|반숙란|훈제란|참숯란|초란|구운란' or name ~ '부어스트|닭꼬치|소시지|후랑크|프랑크|비엔나')
--     and name !~ '볶음밥|김밥|도시락|찌개|핫도그$|덮밥|피자|파스타|떡볶이|버거|샌드위치|토스트|스테이크|닭꼬치맛|볶음$|전골|탕$|라면|면$';
--   훈제 삼겹·목살·바비큐, 안심까스·롤까스·텐더 13개 → main · 미듬애부각(반찬용) → side · 달곰마토(스테비아토마토) → snack(간식만)

-- 확인 필요 336개 — 사용자가 확인함 (17:35, "BBQ 오징어 → 간식, 나머지는 맞음")
alter table public.products drop constraint if exists products_meal_class_src_check;
alter table public.products add constraint products_meal_class_src_check check (meal_class_src in ('survey', 'rule', 'review', 'checked'));
--   update products set dish_role = 'snack', meal_times = array['snack'], breakfast_pref = false where name = 'BBQ 오징어';
--   update products set meal_class_src = 'checked' where meal_class_src = 'review';
