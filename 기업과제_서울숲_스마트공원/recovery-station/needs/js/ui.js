// 화면을 만드는 작은 도구들 (빌드 없이 쓰는 순수 자바스크립트)

/** 요소 만들기: h('div', {class: 'card', onclick: fn, 'aria-pressed': true}, 자식…) */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected' || k === 'open') el[k] = v;
    else el.setAttribute(k, v === true ? 'true' : String(v));
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  tree: '<path d="M12 3l6 8h-3l4 6H5l4-6H6zM12 17v4"/>',
  home: '<path d="M4 11l8-7 8 7M6 10v10h12V10M10 20v-6h4v6"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14zM5 19l7-7"/>',
  walk: '<circle cx="13" cy="4.5" r="1.5"/><path d="M9 21l2-6-2-3 1-4 4 1 2 3 3 1M11 15l3 2 1 4"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16v4M17 18h4"/>',
  run: '<circle cx="15" cy="4.5" r="1.5"/><path d="M7 21l3-5M10 16l-1-5 4-2 3 4 3 1M13 9l-4 1-2 3"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 5v16M8 7h7"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5c2.8.3 5 2.6 5 5.5"/>',
  pin: '<path d="M12 21s-6-5.7-6-10.5a6 6 0 1 1 12 0C18 15.3 12 21 12 21z"/><circle cx="12" cy="10.5" r="2"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  toilet: '<circle cx="12" cy="5" r="2"/><path d="M8 21l1.5-8h5L16 21M9 10h6"/>',
  bench: '<path d="M4 11h16M5 11V7h14v4M6 11v7M18 11v7M4 15h16"/>',
  crowd: '<circle cx="7" cy="9" r="2.3"/><circle cx="17" cy="9" r="2.3"/><circle cx="12" cy="14" r="2.3"/><path d="M3 19c.5-2 2-3 4-3M21 19c-.5-2-2-3-4-3"/>',
  route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6a4 4 0 0 0 0-8h-4a3 3 0 0 1 0-6h6"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13"/>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 4l9 16H3zM12 10v4M12 17h.01"/>',
  shade: '<path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9zM12 12v7a2 2 0 0 0 4 0"/>',
  water: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  stairs: '<path d="M4 20h4v-4h4v-4h4V8h4"/>',
  quiet: '<path d="M4 9v6h4l5 4V5L8 9zM17 9l4 6M21 9l-4 6"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  layers: '<path d="M12 4l9 5-9 5-9-5zM3 14l9 5 9-5"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 9.6 4.2 4.2 0 0 0 7 18z"/>',
  cloudsun: '<path d="M8 6.5A3.5 3.5 0 0 1 14.3 8M8 2.5v1M3.5 7h1M4.8 3.8l.7.7"/><path d="M8 19h9a3.5 3.5 0 0 0 .4-6.98A5 5 0 0 0 8 12.3 3.4 3.4 0 0 0 8 19z"/>',
  rain: '<path d="M7 14h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 5.6 4.2 4.2 0 0 0 7 14zM8 17l-1 3M12 17l-1 3M16 17l-1 3"/>',
  snow: '<path d="M7 14h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 5.6 4.2 4.2 0 0 0 7 14zM8 18h.01M12 20h.01M16 18h.01M10 21h.01M14 21h.01"/>',
  wind: '<path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h7"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  parking: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10 16V8h3a2.5 2.5 0 0 1 0 5h-3"/>',
  car: '<path d="M5 16V12l2-5h10l2 5v4M5 16h14M5 16v2M19 16v2M5 12h14"/><circle cx="8" cy="14" r=".6"/><circle cx="16" cy="14" r=".6"/>',
  train: '<rect x="6" y="3" width="12" height="13" rx="3"/><path d="M6 10h12M9 20l1.5-4M15 20l-1.5-4M9.5 13h.01M14.5 13h.01"/>',
  bike: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7M10 9l2 7h-6M14 6h2"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  bus: '<path d="M3 16V7a2 2 0 0 1 2-2h11l5 5v6z"/><path d="M3 10.5h18M8.5 5v5.5M13.5 5v5.5"/><circle cx="7" cy="17" r="1.8"/><circle cx="17" cy="17" r="1.8"/>',
};
export function icon(name, size = 18) {
  const span = document.createElement('span');
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
  return span.firstChild;
}
export const iconSvg = (name, size = 14) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;

/** 지도 말풍선처럼 HTML로 들어가는 자리에 넣을 글자를 안전하게 바꿉니다(이름은 OpenStreetMap 등 바깥 자료에서 옵니다) */
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtM = m => m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`;
export const pct = v => `${Math.round(v * 100)}%`;

/** CSS 변수 값 읽기 (지도 색은 캔버스에 그리므로 실제 색 값이 필요합니다) */
export const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** 파일로 내려받기 */
export function download(name, text, type = 'application/json') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** 아주 작은 마크다운: '## 제목', '- 항목', '1) 항목', '**강조**'만 다룹니다. HTML은 넣지 않습니다. */
export function md(text) {
  const frag = document.createDocumentFragment();
  const inline = (el, s) => {
    s.split(/(\*\*[^*]+\*\*)/).forEach(part => {
      if (/^\*\*[^*]+\*\*$/.test(part)) el.append(h('b', null, part.slice(2, -2))); else if (part) el.append(part);
    });
    return el;
  };
  let list = null;
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const head = line.match(/^#{1,4}\s+(.*)$/), item = line.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/);
    if (head) { list = null; frag.append(inline(h('h4', null), head[1])); }
    else if (item) { if (!list) { list = h('ul', null); frag.append(list); } list.append(inline(h('li', null), item[1])); }
    else if (line.trim()) { list = null; frag.append(inline(h('p', null), line)); }
    else list = null;
  }
  return frag;
}

/** 하나 고르기(칩) */
export function chipGroup(options, value, onPick, label) {
  return h('div', { class: 'chips', role: 'group', 'aria-label': label },
    options.map(o => h('button', { type: 'button', class: 'chip', 'aria-pressed': o.key === value, onclick: () => onPick(o.key) }, o.icon ? icon(o.icon, 15) : null, o.label)));
}
/** 하나 고르기(이어 붙인 단추) */
export function segGroup(options, value, onPick, label) {
  return h('div', { class: 'seg', role: 'group', 'aria-label': label },
    options.map(o => h('button', { type: 'button', 'aria-pressed': o.key === value, title: o.desc ?? null, onclick: () => onPick(o.key) }, o.label)));
}
export function card(title, sub, body, right = null, cls = '') {
  return h('section', { class: `card ${cls}` },
    title ? h('div', { class: 'card-head' }, h('div', null, h('h3', { class: 'card-title' }, title), sub ? h('div', { class: 'card-sub' }, sub) : null), right) : null,
    h('div', { class: 'card-body' }, body));
}
