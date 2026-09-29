// 게시판 저장소 — 게시글을 JSON 파일 하나(data/posts.json)에 저장합니다.
// 실제 DB로 바꿀 때는 이 파일의 함수 5개(list·findById·insert·update·remove)만 고치면 됩니다.
//
// 게시글 한 건의 구조
//   id        : 숫자, 1부터 자동 증가
//   title     : 제목
//   author    : 작성자
//   content   : 본문
//   createdAt : 작성 시각 (ISO 문자열)
//   updatedAt : 마지막 수정 시각 (ISO 문자열)

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'posts.json');

function readAll() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

// 임시 파일에 먼저 쓰고 이름을 바꿔서, 저장 중에 꺼져도 파일이 깨지지 않게 합니다.
function writeAll(posts) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(posts, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

// 최신 글이 위로 오도록 id 내림차순
function list() {
  return readAll().sort((a, b) => b.id - a.id);
}

function findById(id) {
  return readAll().find((p) => p.id === id) || null;
}

function insert({ title, author, content }) {
  const posts = readAll();
  const now = new Date().toISOString();
  const post = {
    id: posts.reduce((max, p) => Math.max(max, p.id), 0) + 1,
    title,
    author,
    content,
    createdAt: now,
    updatedAt: now,
  };
  posts.push(post);
  writeAll(posts);
  return post;
}

function update(id, { title, author, content }) {
  const posts = readAll();
  const post = posts.find((p) => p.id === id);
  if (!post) return null;
  Object.assign(post, { title, author, content, updatedAt: new Date().toISOString() });
  writeAll(posts);
  return post;
}

function remove(id) {
  const posts = readAll();
  const next = posts.filter((p) => p.id !== id);
  if (next.length === posts.length) return false;
  writeAll(next);
  return true;
}

module.exports = { list, findById, insert, update, remove };
