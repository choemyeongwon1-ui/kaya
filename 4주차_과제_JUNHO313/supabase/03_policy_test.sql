-- ③ 정책별 접근 허용 여부 확인 — SQL Editor 에서 블록 하나씩 선택해 실행 (Ctrl+Enter)
-- 모든 블록은 rollback 으로 끝나므로 표에 흔적이 남지 않는다.
-- 'set local role' 로 공개 키(anon) / 로그인 사용자(authenticated) 를 흉내 낸다.

-- [T1] 공개 키로 읽기 → 성공, 행 수가 나와야 함
begin;
  set local role anon;
  select count(*) as anon_select_rows from public.evidence;
rollback;

-- [T2] 공개 키로 쓰기 → 실패해야 함
--      기대: ERROR 42501 new row violates row-level security policy for table "evidence"
begin;
  set local role anon;
  insert into public.evidence (item, value, unit, source, queried_on)
  values ('[테스트] anon 쓰기', 1, '%', '테스트', current_date);
rollback;

-- [T3] 로그인했지만 팀원이 아닌 사용자 쓰기 → 실패해야 함 (42501)
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"role":"authenticated","email":"stranger@example.com"}';
  insert into public.evidence (item, value, unit, source, queried_on)
  values ('[테스트] 비팀원 쓰기', 1, '%', '테스트', current_date);
rollback;

-- [T4] 팀원 쓰기 → 성공, 방금 넣은 행이 돌아와야 함 (이메일을 team_members 에 넣은 값으로)
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"role":"authenticated","email":"zuno10429@gmail.com"}';
  insert into public.evidence (item, value, unit, source, queried_on)
  values ('[테스트] 팀원 쓰기', 1, '%', '테스트', current_date)
  returning id, item, created_at;
rollback;

-- [T5] 값·단위 분리 규칙 → 실패해야 함 (23514 check constraint "evidence_value_needs_unit")
begin;
  insert into public.evidence (item, value, source, queried_on)
  values ('[테스트] 단위 없음', 300, '테스트', current_date);
rollback;

-- [T6] RLS 가 켜져 있는지, 정책이 몇 개인지
select c.relname as 표, c.relrowsecurity as rls_켜짐,
       (select count(*) from pg_policies p where p.tablename = c.relname and p.schemaname = 'public') as 정책수
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('evidence', 'team_members');
-- 기대: evidence true 4 / team_members true 0
