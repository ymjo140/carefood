-- 앱 주문 마무리 (PG 결제 전): 업체별 배송비 · 취소 요청 · 환불 기록 · 앱 주문 수수료율 (2026-11-12)
-- 주문 기능은 아직 꺼져 있다(NEXT_PUBLIC_ORDERING_ENABLED). 모두 칸을 더하기만 한다.

-- 배송비: 주문할 때 판매 업체마다 계산해 적어 둔다 ({partner_id: 원}). final_price = 상품 금액 + 배송비
alter table public.orders add column if not exists shipping_fee integer not null default 0;
alter table public.orders add column if not exists shipping_fees jsonb not null default '{}'::jsonb;

-- 환불: 결제 뒤 취소된 업체 묶음의 상품 금액 + 그 업체 배송비. PG 를 붙이기 전에는 관리자가 직접 환불하고 표시한다
alter table public.orders add column if not exists refund_amount integer not null default 0;   -- 돌려줘야 할 금액 (누적)
alter table public.orders add column if not exists refunded_amount integer not null default 0; -- 돌려준 금액
alter table public.orders add column if not exists refunded_at timestamptz;
alter table public.orders add column if not exists refund_note text;
create index if not exists orders_refund_due_idx on public.orders (created_at desc) where refund_amount > refunded_amount;

-- 취소 요청: 업체가 접수한 뒤에는 주문자가 바로 취소하지 못하고 요청한다. 업체가 취소하거나 그대로 발송한다
alter table public.order_items add column if not exists cancel_requested_at timestamptz;
alter table public.order_items add column if not exists cancel_request_reason text;
-- 누가 취소했는지: buyer(주문자) · partner(판매 업체) · admin
alter table public.order_items add column if not exists canceled_by text check (canceled_by in ('buyer', 'partner', 'admin'));
alter table public.order_items add column if not exists canceled_at timestamptz;

-- 앱 주문 수수료율 — 구매 링크 수수료율과 따로 정한다 (없으면 그 달 앱 주문은 마감할 수 없다)
alter table public.partners add column if not exists order_commission_rate numeric(5, 2);

-- 정산: 앱 주문 배송비(업체에 그대로 준다). 업체에 줄 돈 = 판매액 + 배송비 − 수수료
alter table public.partner_settlements add column if not exists order_shipping integer not null default 0;
