-- ③ RLS 와 정책 — 01 다음에 실행
-- 원칙: 근거는 누구나 읽을 수 있고(SELECT 공개), 쓰기는 팀원만(INSERT·UPDATE·DELETE).
-- 팀원 조건 = 로그인한 사용자의 이메일이 team_members 표에 있을 것.

-- 1) 팀원 명단 ------------------------------------------------------------
create table if not exists public.team_members (
  email   text primary key,
  name    text not null,
  github  text
);

alter table public.team_members enable row level security;
-- team_members 에는 정책을 만들지 않는다 → API(공개 키)로는 명단을 읽을 수도 고칠 수도 없음.
-- 명단은 대시보드(Table Editor / SQL Editor)에서만 관리.

-- ▼ 팀원 이메일·이름으로 바꿔서 실행 (Supabase Auth 에 가입한 이메일과 같아야 함)
insert into public.team_members (email, name, github) values
  ('zuno10429@gmail.com', '본인 이름', 'JUNHO313')
  -- , ('팀원2@example.com', '팀원2 이름', 'choemyeongwon1-ui')
on conflict (email) do nothing;

-- 2) 팀원 판정 함수 --------------------------------------------------------
-- security definer: 정책 안에서 team_members 를 읽어야 하는데, 위에서 API 읽기를 막아 두었으므로
-- 함수 소유자 권한으로만 조회한다. search_path 를 비워 스키마 바꿔치기를 막는다.
create or replace function public.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

revoke all on function public.is_team_member() from public;
grant execute on function public.is_team_member() to anon, authenticated;

-- 3) evidence 에 RLS 켜기 ---------------------------------------------------
alter table public.evidence enable row level security;

drop policy if exists "evidence 읽기 — 모두" on public.evidence;
create policy "evidence 읽기 — 모두"
  on public.evidence for select
  to anon, authenticated
  using (true);

drop policy if exists "evidence 쓰기 — 팀원" on public.evidence;
create policy "evidence 쓰기 — 팀원"
  on public.evidence for insert
  to authenticated
  with check ((select public.is_team_member()));

drop policy if exists "evidence 고치기 — 팀원" on public.evidence;
create policy "evidence 고치기 — 팀원"
  on public.evidence for update
  to authenticated
  using ((select public.is_team_member()))
  with check ((select public.is_team_member()));

drop policy if exists "evidence 지우기 — 팀원" on public.evidence;
create policy "evidence 지우기 — 팀원"
  on public.evidence for delete
  to authenticated
  using ((select public.is_team_member()));
