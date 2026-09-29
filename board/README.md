# kaya 팀 게시판

글 목록 · 읽기 · 쓰기 · 수정 · 삭제를 지원하는 간단한 게시판입니다.

## 실행

Node.js 18 이상만 있으면 됩니다. 설치할 패키지는 없습니다.

```bash
cd board/backend
npm start
```

브라우저에서 `http://localhost:4000` 을 엽니다.

> GitHub Pages·Vercel(정적 배포)에서는 서버가 없으므로 게시판이 동작하지 않습니다. 로컬에서 실행하세요.

## 폴더 구조와 담당 브랜치

| 파일 | 역할 | 브랜치 |
|---|---|---|
| `backend/src/db.js` | 게시글 저장 (JSON 파일) | `feature/infra-db-schema` |
| `backend/server.js` | API 서버 | `feature/be-post-crud` |
| `frontend/index.html`, `frontend/app.js` | 화면 동작 | `feature/fe-post-list` |
| `frontend/style.css` | 디자인 | `feature/design-layout` |

네 브랜치를 모두 `develop` 에 합쳐야 전체가 동작합니다.

## API

| 요청 | 설명 |
|---|---|
| `GET /api/posts` | 목록 (본문 제외, 최신순) |
| `GET /api/posts/:id` | 한 건 조회 |
| `POST /api/posts` | 작성 — `{ title, author, content }` |
| `PUT /api/posts/:id` | 수정 — `{ title, author, content }` |
| `DELETE /api/posts/:id` | 삭제 |

입력 제한: 제목 100자, 작성자 20자, 본문 5000자. 빈칸은 허용하지 않습니다.
