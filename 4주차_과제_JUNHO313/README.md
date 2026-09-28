# Supabase — 표 하나로 시작하기 (evidence)

근거노트의 다섯 칸(항목·값·단위·출처·조회일)을 Supabase 표 `evidence` 의 다섯 열로 옮긴다.
초기 데이터는 3주차에 법령 API 로 직접 받은 **서울특별시 도시계획 조례 건폐율·용적률 16종 × 2 = 32행**.

## ⚠ 팀 DB 와의 관계 — 먼저 읽을 것

팀 Supabase 프로젝트 `kaya` 에는 최승하가 2026-09-28 에 `evidence` 표를 이미 만들어 두었다(커밋 0b45ea6).
그 정책은 **공개 키로 select·insert 허용, 수정·삭제 없음**이고, `dashboard/index_server.html` 의 근거노트 폼이 공개 키로 insert 한다.

이 폴더는 그와 다른 안(**읽기 공개 · 쓰기는 로그인한 팀원만**)이다. 따라서 팀 DB 에서는:

| 파일 | 팀 DB 에서 실행하면 |
|---|---|
| 01 | 표가 이미 있으므로 아무 일도 없음 (`if not exists`) |
| 02 | **팀 화면 폼의 저장이 막힘** — 팀이 로그인 방식으로 바꾸기로 합의한 뒤에만 실행 |
| 03 | T2(공개 키 쓰기 거절)가 현재 팀 정책에서는 성공으로 나옴 — 두 정책의 차이를 보여 주는 테스트 |
| 04 | 공유 표에 32행이 들어감 — 팀과 상의 후 |

혼자 실습할 때는 개인 Supabase 프로젝트를 따로 만들어 01→02→04→03 순서로 실행한다.

| 파일 | 단계 |
|---|---|
| `supabase/01_evidence_table.sql` | ② 표와 열 |
| `supabase/02_rls_policies.sql` | ③ RLS · 팀원 조건 · 읽기/쓰기 정책 |
| `supabase/03_policy_test.sql` | ③ 정책별 허용 여부 확인 (모두 rollback) |
| `supabase/04_seed_seoul.sql` | 초기 32행 — `make_seed.py` 가 3주차 CSV 에서 생성 |
| `.env.example` · `.gitignore` | ④ 환경변수 — 키 이름만 저장소에, 값은 `.env` 에 |
| `check_supabase.py` | ④ 코드에서 환경변수로 접속해 SELECT·INSERT 점검 |

## 열 설계

| 열 | 자료형 | 규칙 |
|---|---|---|
| id · created_at | bigint · timestamptz | 자동 |
| item | text | 항목 이름. `서울 제3종일반주거지역 용적률` |
| value | **numeric** | 숫자만. `'250% 이하'` 를 통째로 넣지 않음 → 정렬·계산 가능 |
| unit | text | `%`. 값이 있으면 단위 필수(check 제약) |
| source | text | 조문 번호 · 자치법규ID/MST · 시행일 |
| queried_on | **date** | 조회일. `where queried_on < '2026-09-01'` 로 오래된 근거 골라냄 |

## 따라 하기

### 1 프로젝트
1. supabase.com → New project. 팀 프로젝트 `kaya` 는 이미 있으므로(위 ⚠) 개인 실습용은 `kaya-junho313` 처럼 구분, Region 은 Seoul(ap-northeast-2).
2. Database Password 는 비밀번호 관리자에 보관 — 저장소·카톡·README 어디에도 적지 않는다.
3. Project Settings → Data API 에서 **Project URL** 확인.

### 2 표와 열
SQL Editor → `01_evidence_table.sql` 붙여 넣고 Run. Table Editor 에 `evidence` 와 다섯 열이 보이면 완료.

### 3 RLS 와 정책
1. `02_rls_policies.sql` 의 `team_members` INSERT 줄을 **팀원 이메일·이름**으로 고친 뒤 Run.
2. Authentication → Users 에서 팀원 계정을 만든다(이메일이 `team_members` 와 같아야 함).
3. `04_seed_seoul.sql` Run → 32행 입력.
4. `03_policy_test.sql` 을 블록별로 실행해 기대 결과 확인.

| 테스트 | 역할 | 기대 |
|---|---|---|
| T1 | 공개 키(anon) SELECT | 성공 · 32 |
| T2 | 공개 키 INSERT | 거절 42501 |
| T3 | 로그인했지만 팀원 아님 INSERT | 거절 42501 |
| T4 | 팀원 INSERT | 성공 |
| T5 | 값만 있고 단위 없음 | 거절 23514 |
| T6 | RLS 상태 | evidence 켜짐·정책 4 / team_members 켜짐·정책 0 |

> 읽기를 공개로 둔 이유: 근거노트는 누구나 출처를 따라가 확인할 수 있어야 하고, 이후 GitHub Pages 에서 공개 키만으로 읽어 오기 위함.
> 팀 안에서만 보려면 SELECT 정책을 `to authenticated using ((select public.is_team_member()))` 로 바꾼다.

### 4 환경변수
```
copy .env.example .env      # SUPABASE_URL · SUPABASE_PUBLISHABLE_KEY 채우기
python check_supabase.py
```
- 공개 키(`sb_publishable_…`)는 브라우저에 노출돼도 되는 키 — 권한은 위 RLS 가 막는다.
- **비밀 키(`sb_secret_…`)·service_role·DB 비밀번호는 `.env` 에도 넣지 않는다.** RLS 를 우회하므로 서버 밖으로 나오면 안 된다.
- 스크립트는 비밀 키가 들어 있으면 실행을 멈춘다.

## 다시 만들기
```
python make_seed.py        # 3주차 03_서울시_조례_21종표.csv → supabase/04_seed_seoul.sql
```
Windows 콘솔에서는 `PYTHONIOENCODING=utf-8`.

## 넣지 않은 것
- 슬라이드 예시 행(천안시 조례 제61조 제3종일반주거 300%)은 우리가 직접 조회한 원문이 없어 넣지 않았다. 조회 후 같은 형식으로 추가.
- 서울도심 상업지역 용적률 단서값(800·600·500·500)은 조례 항·호 번호를 확인하지 못해 보류.
