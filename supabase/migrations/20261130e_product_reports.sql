-- 정보 오류 신고 — 사용자가 "포장 표시와 달라요"를 보내면 관리자가 확인하고 고친다 (화면: 제품 상세 → 신고 시트, 관리 › 정보 신고)
-- 서버(서비스 키)만 읽고 쓴다 — RLS 켬, 정책 없음. 익명 → 계정 합치기(merge_actor)가 신고한 사람을 옮긴다.
create table if not exists public.product_reports (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  reporter_id text not null,
  kind text not null check (kind in ('nutrition', 'serving', 'wrong_page', 'price', 'other')),
  claimed jsonb,                                   -- 맞는 값(선택): kcal · protein_g · sodium_mg · carbs_g · serving_g
  note text check (char_length(note) <= 500),
  photo_path text,                                 -- 비공개 버킷 product-reports (EXIF 지운 webp)
  status text not null default 'new' check (status in ('new', 'checking', 'fixed', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);
-- 같은 사람이 같은 제품·같은 종류를 처리 중에 또 보내면 한 줄로 (서버가 고쳐 쓴다)
create unique index if not exists product_reports_open_uniq on public.product_reports (product_id, reporter_id, kind) where status in ('new', 'checking');
create index if not exists product_reports_status_idx on public.product_reports (status, created_at desc);
create index if not exists product_reports_reporter_idx on public.product_reports (reporter_id, resolved_at desc);
alter table public.product_reports enable row level security;

-- 관리자가 고친 값 기록 — 근거가 된 신고와 같이, 되돌릴 수 있게
create table if not exists public.product_fixes (
  id bigserial primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  field text not null,
  old_value text,
  new_value text,
  report_kind text,
  fixed_by text,
  fixed_at timestamptz not null default now()
);
create index if not exists product_fixes_product_idx on public.product_fixes (product_id, fixed_at desc);
alter table public.product_fixes enable row level security;

-- 라벨 사진 — 비공개 (관리자 화면은 서버가 1시간짜리 서명 주소로 보여 준다)
insert into storage.buckets (id, name, public) values ('product-reports', 'product-reports', false) on conflict (id) do nothing;

-- 익명 → 계정 합치기에 신고한 사람 더하기 (지금 함수 정의에 한 줄만 덧붙인다)
do $$
declare d text;
begin
  d := pg_get_functiondef('public.merge_actor(text,text)'::regprocedure);
  if position('product_reports' in d) = 0 then
    d := replace(d, '(''rec_events'',''user_id'')', '(''rec_events'',''user_id''), (''product_reports'',''reporter_id'')');
    execute d;
  end if;
end $$;
