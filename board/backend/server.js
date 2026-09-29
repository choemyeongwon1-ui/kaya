// 게시판 백엔드 서버 — Node 내장 모듈만 사용합니다 (npm install 불필요).
//
// API
//   GET    /api/posts       목록 (본문 제외)
//   GET    /api/posts/:id   한 건 조회
//   POST   /api/posts       작성
//   PUT    /api/posts/:id   수정
//   DELETE /api/posts/:id   삭제
// 그 밖의 주소는 ../frontend 폴더의 화면 파일을 그대로 보내줍니다.
//
// 저장은 src/db.js 가 담당합니다 (feature/infra-db-schema 브랜치).

const http = require('http');
const fs = require('fs');
const path = require('path');
const db = require('./src/db');

const PORT = Number(process.env.PORT) || 4000;
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const MAX_BODY_BYTES = 100 * 1024;

/* 1. 입력 검증 ------------------------------------------------------------ */

const LIMITS = { title: 100, author: 20, content: 5000 };
const LABELS = { title: '제목', author: '작성자', content: '본문' };

// 올바르면 { value }, 틀리면 { error } 를 돌려줍니다.
function validatePost(body) {
  if (!body || typeof body !== 'object') return { error: '요청 형식이 올바르지 않습니다.' };
  const value = {};
  for (const field of Object.keys(LIMITS)) {
    const text = typeof body[field] === 'string' ? body[field].trim() : '';
    if (!text) return { error: `${LABELS[field]}을(를) 입력해 주세요.` };
    if (text.length > LIMITS[field]) {
      return { error: `${LABELS[field]}은(는) ${LIMITS[field]}자 이하로 입력해 주세요.` };
    }
    value[field] = text;
  }
  return { value };
}

/* 2. 응답 도구 ------------------------------------------------------------ */

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('요청 내용이 너무 큽니다.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('JSON 형식이 올바르지 않습니다.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/* 3. 게시글 API ----------------------------------------------------------- */

async function handleApi(req, res, pathname) {
  const match = pathname.match(/^\/api\/posts(?:\/(\d+))?\/?$/);
  if (!match) return sendJson(res, 404, { error: '없는 API 주소입니다.' });
  const id = match[1] ? Number(match[1]) : null;

  if (id === null) {
    if (req.method === 'GET') {
      const summaries = db.list().map(({ content, ...rest }) => rest);
      return sendJson(res, 200, summaries);
    }
    if (req.method === 'POST') {
      const { value, error } = validatePost(await readJsonBody(req));
      if (error) return sendJson(res, 400, { error });
      return sendJson(res, 201, db.insert(value));
    }
  } else {
    if (req.method === 'GET') {
      const post = db.findById(id);
      return post ? sendJson(res, 200, post) : sendJson(res, 404, { error: '게시글을 찾을 수 없습니다.' });
    }
    if (req.method === 'PUT') {
      const { value, error } = validatePost(await readJsonBody(req));
      if (error) return sendJson(res, 400, { error });
      const post = db.update(id, value);
      return post ? sendJson(res, 200, post) : sendJson(res, 404, { error: '게시글을 찾을 수 없습니다.' });
    }
    if (req.method === 'DELETE') {
      return db.remove(id)
        ? sendJson(res, 200, { ok: true })
        : sendJson(res, 404, { error: '게시글을 찾을 수 없습니다.' });
    }
  }
  return sendJson(res, 405, { error: '지원하지 않는 요청 방식입니다.' });
}

/* 4. 화면 파일 제공 -------------------------------------------------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function serveStatic(res, pathname) {
  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const filePath = path.resolve(FRONTEND_DIR, relative);
  // ../ 로 frontend 폴더 밖을 읽지 못하게 막습니다.
  if (!filePath.startsWith(FRONTEND_DIR + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('파일을 찾을 수 없습니다.');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

/* 5. 서버 시작 ------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
    return serveStatic(res, pathname);
  } catch (err) {
    if (!err.status) console.error(err);
    return sendJson(res, err.status || 500, { error: err.status ? err.message : '서버 오류가 발생했습니다.' });
  }
});

server.listen(PORT, () => {
  console.log(`게시판 서버 실행 중 → http://localhost:${PORT}`);
});
