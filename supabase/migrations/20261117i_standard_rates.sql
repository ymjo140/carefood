-- 기본 수수료율 (11/14 사용자 결정: 진입 때 쿠팡·11번가보다 싸게) — 앱 주문 5% 고정 · 구매 링크 2%.
-- 새 업체는 이 값으로 시작한다(비워 두면 정산 마감이 막혔다). 화면·서버의 같은 값: src/lib/partner/rates.ts
alter table public.partners alter column commission_rate set default 2;
alter table public.partners alter column order_commission_rate set default 5;
alter table public.partners alter column attribution_days set default 7;
-- 테스트 매장도 같은 값으로 (예시 정산은 다시 채울 때 새 율로 마감된다)
update public.partners set commission_rate = 2, order_commission_rate = 5 where slug = 'test-demo' and is_demo;
