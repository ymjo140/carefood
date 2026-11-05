-- 판매처 ↔ 식약처 제품 연결 검증 결과를 적는 칸 (기존 matched_product_id · match_status 는 그대로 둔다)
-- Supabase 대시보드 → SQL Editor 에 붙여 넣고 실행. 여러 번 실행해도 안전(if not exists).
do $$
declare t text;
begin
  foreach t in array array['kurly_products','oasis_products','homeplus_products','st11_products'] loop
    execute format('alter table %I add column if not exists verify_status text', t);          -- same | relink | not_in_db | maker_kcal_same | maker_kcal_diff | unknown
    execute format('alter table %I add column if not exists verify_note text', t);            -- 사람이 읽는 이유
    execute format('alter table %I add column if not exists label_report_no text', t);       -- 상품정보 이미지에서 읽은 품목보고번호
    execute format('alter table %I add column if not exists true_product_id uuid', t);        -- 번호로 찾은 진짜 제품
    execute format('alter table %I add column if not exists prev_matched_product_id uuid', t); -- 연결을 바꾸거나 끊을 때 원래 값
    execute format('alter table %I add column if not exists verified_at timestamptz', t);
  end loop;
end $$;
