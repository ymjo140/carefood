-- 업체 설정 (11/14 구조 진단 3b) — 세금계산서 메일·정산 계좌, 담당자별 새 주문 알림.
-- partners·partner_members 는 RLS 를 켜 두고 정책이 없다 → 서버(service role)만 읽고 쓴다. 계좌는 업체 화면에 가려서(끝 4자리) 보인다.
alter table public.partners
  add column if not exists tax_email text,
  add column if not exists bank_name text,
  add column if not exists bank_holder text,
  add column if not exists bank_account text,
  add column if not exists settings_updated_at timestamptz,
  add column if not exists settings_updated_by uuid;

alter table public.partner_members
  add column if not exists notify_orders boolean not null default true;

-- 지난 달 자동 마감 표시 — 자동인지 사람이 눌렀는지 (closed_by 가 비어 있고 auto 면 자동)
alter table public.partner_settlements
  add column if not exists auto_closed boolean not null default false;
