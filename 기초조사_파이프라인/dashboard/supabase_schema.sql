-- 기초조사 대시보드 팀 공유 DB (Supabase 'kaya') — 현재 적용된 최종 상태
-- 원칙: 지오코더 좌표·인증키는 저장하지 않는다(브이월드 이용조건 · 6주차 32·33·35·36쪽). 좌표 열이 없다.
-- 접근: 로그인 없음. 누구나(publishable 키) 읽기·저장, 수정·삭제는 API 로 막음 → 관리자가 Supabase 대시보드에서만.

create table if not exists public.survey_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  author text not null default '익명' check (char_length(author) between 1 and 40),
  site_name text not null,
  address text not null,                 -- 지오코더 입력 주소 (좌표 대신 이것으로 재호출)
  addr_type text not null check (addr_type in ('PARCEL', 'ROAD')),
  refined_address text,
  radius_m int not null check (radius_m between 100 and 1000),
  query_date date not null,
  sido_sigungu text,
  note text,
  constraint survey_runs_text_len check (
    char_length(site_name) <= 100 and char_length(address) <= 200 and char_length(coalesce(refined_address, '')) <= 200
    and char_length(coalesce(note, '')) <= 1000)
);

create table if not exists public.survey_rows (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.survey_runs(id) on delete cascade,
  category text not null,                -- 대항목
  item text not null,                    -- 세부항목
  indicator text not null,               -- 지표
  value text,                            -- 값 (원문 그대로)
  unit text,
  source text,                           -- 출처
  query_date text,                       -- 조회일
  reproduce text,                        -- 재현 (키 제외 요청 URL · 지오코더 범위는 가림)
  status text,                           -- 수집 / 조회대기 / 화면열람 / 실패
  note text,                             -- 비고
  collector text,                        -- 수집기
  constraint survey_rows_text_len check (
    char_length(indicator) <= 300 and char_length(coalesce(value, '')) <= 300 and char_length(coalesce(source, '')) <= 500
    and char_length(coalesce(reproduce, '')) <= 2000 and char_length(coalesce(note, '')) <= 2000)
);
create index if not exists survey_rows_run_id_idx on public.survey_rows(run_id);

alter table public.survey_runs enable row level security;
alter table public.survey_rows enable row level security;

create policy "anyone reads runs" on public.survey_runs for select to anon, authenticated using (true);
create policy "anyone saves runs" on public.survey_runs for insert to anon, authenticated with check (true);
create policy "anyone reads rows" on public.survey_rows for select to anon, authenticated using (true);
create policy "anyone saves rows" on public.survey_rows for insert to anon, authenticated with check (true);
-- update·delete 정책 없음 = API 로는 못 고치고 못 지움
