-- 금지 표현 사전 · 정산 이의 (2026-11-14)
-- 둘 다 서버(서비스 키)로만 읽고 쓴다 — RLS 켜고 정책 없음, anon·authenticated 권한 없음.

-- 1) 금지 표현 사전 — 케어푸드가 관리자 화면에서 관리한다 (식약처 고시가 바뀌면 바로, 그 밖엔 분기마다 점검)
--    pattern 은 자바스크립트 정규식 본문. kind 가 이유 문구를 정한다 (lib/partner/claims.ts)
create table if not exists public.partner_claim_terms (
  id uuid primary key default gen_random_uuid(),
  pattern text not null check (char_length(pattern) between 1 and 200),
  kind text not null check (kind in ('disease', 'health_food', 'review')),
  suggest text check (suggest is null or char_length(suggest) <= 60),
  note text check (note is null or char_length(note) <= 200),
  is_active boolean not null default true,
  sort integer not null default 0,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists partner_claim_terms_sort_idx on public.partner_claim_terms (sort, created_at);

-- 처음 한 번만 지금 코드의 사전으로 채운다
insert into public.partner_claim_terms (pattern, kind, suggest, sort)
select v.pattern, v.kind, v.suggest, v.sort from (values
  ('당뇨|혈당\s*(관리|조절|개선|강하|낮춰|떨어)', 'disease', '저당 · 당류 ○g', 10),
  ('고혈압|혈압\s*(관리|조절|개선|낮춰|떨어)', 'disease', '저염 · 나트륨 ○mg', 20),
  ('콜레스테롤\s*(관리|개선|낮춰|감소)|고지혈', 'disease', '포화지방 ○g', 30),
  ('신장\s*(보호|건강|질환)|콩팥', 'disease', '저염·저단백', 40),
  ('간\s*(보호|해독|건강)|숙취\s*해소', 'disease', null, 50),
  ('변비\s*(해소|개선|예방)|장\s*(질환|트러블\s*개선)', 'disease', '식이섬유 ○g', 60),
  ('(암|항암|종양)\s*(예방|억제)|항암', 'disease', null, 70),
  ('염증\s*(완화|감소|억제)|항염', 'disease', null, 80),
  ('치료|처방|진단|완치|낫는|낫게', 'disease', null, 90),
  ('(질병|질환)\s*(예방|개선)|예방\s*효과', 'disease', null, 100),
  ('환자(용|식)?', 'disease', '○○이 궁금한 분', 110),
  ('면역력\s*(강화|증진|높)|면역\s*증강', 'health_food', null, 120),
  ('체지방\s*(감소|분해|연소)|지방\s*(분해|연소)|살\s*빠지|살이\s*빠|다이어트\s*효과|붓기\s*(제거|빠)', 'health_food', '열량 ○kcal', 130),
  ('디톡스|해독', 'health_food', null, 140),
  ('혈관\s*(청소|건강)|혈액\s*순환\s*개선', 'health_food', null, 150),
  ('근육\s*(생성|증가)\s*효과|근손실\s*방지', 'health_food', '단백질 ○g', 160),
  ('(의사|약사|한의사|교수|전문의)\s*(추천|인증|보증|가\s*만든)', 'review', null, 170),
  ('후기\s*(인증|보장)|먹고\s*\d+\s*(kg|킬로)\s*(빠|감량)', 'review', null, 180)
) v(pattern, kind, suggest, sort)
where not exists (select 1 from public.partner_claim_terms);

-- 2) 정산 이의 — 업체가 월 정산·충전금 내역에서 "다르게 보여요"를 남기면 관리자가 답하고 닫는다
create table if not exists public.partner_disputes (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  target text not null check (target in ('month', 'ledger')),
  month text check (month is null or month ~ '^\d{4}-\d{2}$'),        -- target = month
  ledger_id uuid references public.partner_credit_ledger(id) on delete set null, -- target = ledger
  reason text not null check (char_length(reason) between 5 and 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'rejected')),
  reply text check (reply is null or char_length(reply) <= 1000),
  created_by uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists partner_disputes_partner_idx on public.partner_disputes (partner_id, created_at desc);
create index if not exists partner_disputes_open_idx on public.partner_disputes (status, created_at) where status = 'open';

do $$ declare t text; begin
  foreach t in array array['partner_claim_terms', 'partner_disputes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
