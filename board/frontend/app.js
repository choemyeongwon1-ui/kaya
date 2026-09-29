// 게시판 화면 동작
// 주소 뒤 # 부분으로 화면을 바꿉니다.
//   #/          목록
//   #/post/3    3번 글 보기
//   #/write     새 글 쓰기
//   #/edit/3    3번 글 수정

/* 1. 서버 통신 ----------------------------------------------------------- */

const api = {
  async request(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.');
    return data;
  },
  list: () => api.request('GET', '/api/posts'),
  get: (id) => api.request('GET', `/api/posts/${id}`),
  create: (post) => api.request('POST', '/api/posts', post),
  update: (id, post) => api.request('PUT', `/api/posts/${id}`, post),
  remove: (id) => api.request('DELETE', `/api/posts/${id}`),
};

/* 2. 공통 도구 ----------------------------------------------------------- */

const $ = (id) => document.getElementById(id);

function formatDate(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function showView(name) {
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${name}`; });
}

// 다음 화면으로 넘어간 뒤에도 보이도록, 알림은 화면 전환 후 한 번 보여줍니다.
let pendingNotice = '';
function showNotice(message) {
  $('notice').textContent = message;
  $('notice').hidden = !message;
}

/* 3. 목록 화면 ----------------------------------------------------------- */

async function renderList() {
  const posts = await api.list();
  const tbody = $('post-rows');
  tbody.replaceChildren();
  for (const post of posts) {
    const row = document.createElement('tr');
    const link = document.createElement('a');
    link.href = `#/post/${post.id}`;
    link.textContent = post.title;
    const cells = [String(post.id), link, post.author, formatDate(post.createdAt)];
    const classes = ['col-id', '', 'col-author', 'col-date'];
    cells.forEach((content, i) => {
      const td = document.createElement('td');
      if (classes[i]) td.className = classes[i];
      td.append(content);
      row.append(td);
    });
    tbody.append(row);
  }
  $('post-count').textContent = `(${posts.length})`;
  $('empty-message').hidden = posts.length > 0;
  showView('list');
}

/* 4. 상세 화면 ----------------------------------------------------------- */

async function renderDetail(id) {
  const post = await api.get(id);
  $('detail-title').textContent = post.title;
  $('detail-author').textContent = post.author;
  $('detail-date').textContent = post.updatedAt !== post.createdAt
    ? `${formatDate(post.createdAt)} (수정 ${formatDate(post.updatedAt)})`
    : formatDate(post.createdAt);
  $('detail-content').textContent = post.content; // textContent 라서 HTML이 실행되지 않음
  $('detail-edit').href = `#/edit/${post.id}`;
  $('detail-delete').onclick = async () => {
    if (!confirm('이 글을 삭제할까요? 되돌릴 수 없습니다.')) return;
    await api.remove(post.id);
    pendingNotice = '글을 삭제했습니다.';
    location.hash = '#/';
  };
  showView('detail');
}

/* 5. 작성·수정 화면 ------------------------------------------------------ */

async function renderForm(id) {
  const form = $('post-form');
  form.reset();
  $('form-error').hidden = true;

  if (id) {
    const post = await api.get(id);
    form.title.value = post.title;
    form.author.value = post.author;
    form.content.value = post.content;
    $('form-heading').textContent = '글 수정';
    $('form-cancel').href = `#/post/${id}`;
  } else {
    $('form-heading').textContent = '글쓰기';
    $('form-cancel').href = '#/';
  }

  form.onsubmit = async (event) => {
    event.preventDefault();
    const data = {
      title: form.title.value.trim(),
      author: form.author.value.trim(),
      content: form.content.value.trim(),
    };
    try {
      const saved = id ? await api.update(id, data) : await api.create(data);
      pendingNotice = id ? '글을 수정했습니다.' : '글을 등록했습니다.';
      location.hash = `#/post/${saved.id}`;
    } catch (err) {
      $('form-error').textContent = err.message;
      $('form-error').hidden = false;
    }
  };
  showView('form');
}

/* 6. 주소에 따라 화면 고르기 --------------------------------------------- */

async function route() {
  const hash = location.hash || '#/';
  showNotice(pendingNotice);
  pendingNotice = '';
  try {
    let m;
    if ((m = hash.match(/^#\/post\/(\d+)$/))) await renderDetail(Number(m[1]));
    else if ((m = hash.match(/^#\/edit\/(\d+)$/))) await renderForm(Number(m[1]));
    else if (hash === '#/write') await renderForm(null);
    else await renderList();
  } catch (err) {
    showNotice(err.message);
    if (hash !== '#/') await renderList().catch(() => showView('list'));
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
route();
