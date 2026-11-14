-- 제품 원가·과세 구분 (11/14 구조 진단 P2) — 업체가 판매·재고 표에서 적는다. 업체 화면에만 쓰고 앱(구매자)에는 내보내지 않는다.
--  · unit_cost: 판매 단위 하나의 원가(원). 마진 = (판매가 − 원가) ÷ 판매가
--  · tax_type: taxable(과세) · exempt(면세). 비우면 모름 — 정산 엑셀의 과세 구분 시트에서 '미정'으로 모인다
alter table public.partner_items
  add column if not exists unit_cost integer check (unit_cost is null or (unit_cost >= 0 and unit_cost <= 10000000)),
  add column if not exists tax_type text check (tax_type is null or tax_type in ('taxable', 'exempt'));
