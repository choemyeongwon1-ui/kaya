// 「이 나무 뭐지?」 — 궁금한 나무의 잎·꽃에 카메라를 비추면 수종을 저절로 알려 줍니다.
// - 사진은 기기에서 1280px로 줄여 중계 서버(proxy/plant-id)로 보내고, 서버가 Pl@ntNet AI(무료 하루 500회)에 물어봅니다.
//   API 키는 Supabase 비밀값 PLANTNET_API_KEY에만 있습니다. 사진은 어디에도 저장하지 않고, 위치는 보내지 않습니다.
// - 학명 → 국명, 서울숲 수종 정보(그루 수·키·반려견 주의·대략 위치)는 data/trees.json
//   (서울시 푸른도시국·서울기록원 「시민의 숲을 기록하다, 서울숲」 2020 전시, 서울시 「내 손안에 서울」 기사)
import { h, icon } from './ui.js';

export const PLANT_ID_URL = 'https://krseuiwyftqbbdsbvycq.supabase.co/functions/v1/plant-id';
const ORGANS = [
  { key: 'leaf', label: '잎', hint: '잎 한 장을 화면 가득' },
  { key: 'flower', label: '꽃', hint: '꽃 한 송이를 가까이' },
  { key: 'fruit', label: '열매', hint: '열매를 가까이' },
  { key: 'bark', label: '줄기', hint: '나무껍질을 가까이' },
];
const SURE = 0.2;   // 이보다 낮으면 '확실하지 않아요'

document.head.append(h('link', { rel: 'stylesheet', href: new URL('../trees.css?v=9', import.meta.url).href }));
let data = null;
const ready = fetch(new URL('../data/trees.json', import.meta.url), { cache: 'no-cache' })
  .then(r => (r.ok ? r.json() : null)).then(d => { data = d; return d; }).catch(() => null);

let layer = null;
export function clearTreePins() { layer?.clearLayers(); }

// ── 학명 → 국명 ──
const base = s => String(s ?? '').replace(/\s+(var|subsp|f)\.\s.*$/, '').trim();
function koName(d, r) {
  const s = base(r.sci);
  if (d?.sci[s]) return { name: d.sci[s], exact: true };
  const two = s.split(' ').slice(0, 2).join(' ');
  if (d?.sci[two]) return { name: d.sci[two], exact: true };
  const ko = r.common.find(c => /[가-힣]/.test(c));          // Pl@ntNet이 한국어 이름을 줄 때
  if (ko) return { name: ko, exact: true };
  if (d?.genus[r.genus]) return { name: d.genus[r.genus], exact: false };
  return { name: r.common[0] ?? s, exact: false };
}

// ── 서울숲 정보 ──
function forestFacts(d, name) {
  if (!d) return [];
  const out = [];
  const rank = Object.entries(d.count).sort((a, b) => b[1] - a[1]).findIndex(([n]) => n === name);
  if (rank >= 0) out.push(['layers', `서울숲에 가장 많이 심은 나무 ${rank + 1}위 · ${d.count[name].toLocaleString()}그루 (2020)`]);
  if (d.height[name]) out.push(['tree', `서울숲에서 가장 키 큰 나무 중 하나 · ${d.height[name]}m`]);
  const season = (d.month[seoulMonth()] ?? []).find(([n]) => n === name)?.[1];
  if (season) out.push(['leaf', `지금(${seoulMonth()}월) 볼거리 · ${season}`, 'now']);
  for (const g of d.groups) if (g.list.includes(name)) out.push(g.warn ? ['alert', `${g.label} · 열매·잎을 먹지 않게 해 주세요`, 'warn'] : ['check', g.label]);
  return out;
}
const seoulMonth = () => new Date(Date.now() + 9 * 3600e3).getUTCMonth() + 1;

// ── 사진 줄이기 ──
async function shrink(file, max = 1280) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return new Promise(res => c.toBlob(res, 'image/jpeg', .85));
}

async function identify(blob, organ) {
  const fd = new FormData();
  fd.append('image', blob, 'photo.jpg');
  fd.append('organ', organ);
  const r = await fetch(PLANT_ID_URL, { method: 'POST', body: fd });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error ?? `HTTP ${r.status}`), { status: r.status, detail: d.error });
  return d;
}

// ── 화면 ──
let sheet = null, ctx = null, stream = null;
function stopCam() { stream?.getTracks().forEach(t => t.stop()); stream = null; }
function close() { stopCam(); sheet?.remove(); sheet = null; }
// 카메라를 비추기만 하면 저절로 이름이 뜨는 화면(폰·PC 공통). 카메라 API가 없는 브라우저만 사진 고르기로
const canLive = () => !!navigator.mediaDevices?.getUserMedia && isSecureContext;
function open(content) {
  close();
  sheet = h('div', { class: 'tc-dim', onclick: e => { if (e.target === e.currentTarget) close(); } },
    h('div', { class: 'tc-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': '이 나무 뭐지?' },
      h('button', { type: 'button', class: 'tc-x', 'aria-label': '닫기', onclick: close }, '×'),
      content));
  document.body.append(sheet);
  addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); removeEventListener('keydown', esc); } });
}

/** 1. 카메라 비추기(실시간) — 안 되면 사진 고르기 */
function startScreen() { canLive() ? liveScreen() : pickScreen(); }
function pickScreen() {
  const pickers = ORGANS.map(o => {
    const inp = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: e => { const f = e.currentTarget.files?.[0]; if (f) run(f, o.key); } });
    return h('label', { class: 'tc-organ' }, inp, h('b', null, o.label), h('small', null, o.hint));
  });
  const album = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: e => { const f = e.currentTarget.files?.[0]; if (f) run(f, 'auto'); } });
  open([
    h('div', { class: 'tc-head' }, h('span', { class: 'tc-ico' }, icon('leaf', 18)), h('div', null, h('b', null, '이 나무 뭐지?'), h('small', null, '무엇을 찍을지 고르면 카메라가 열려요'))),
    h('div', { class: 'tc-organs' }, pickers),
    h('label', { class: 'tc-album' }, album, '앨범에서 사진 고르기'),
    h('p', { class: 'tc-foot' }, 'Pl@ntNet AI가 알려 줘요 · 사진은 저장하지 않고 위치도 보내지 않아요'),
  ]);
}

/** 1-b. 실시간: 카메라를 나무에 비추면 화면이 멈춰 있을 때 저절로 알아보고 이름을 화면 위에 띄움
 *  - 버튼 없음. 카메라가 흔들리는 동안은 안 보냄, 같은 장면은 다시 안 보냄(무료 횟수 아끼기)
 *  - 한 번 열 때 최대 LIVE_MAX번까지 → 넘으면 화면을 눌러 이어 하기 */
const LIVE_EVERY = 2500, LIVE_MAX = 20, STILL = 14, NEW_SCENE = 22;
async function liveScreen() {
  const video = h('video', { class: 'tc-live', autoplay: true, playsinline: true, muted: true });
  const tag = h('div', { class: 'tc-tag' });
  const msg = h('p', { class: 'tc-msg' }, '카메라를 켜는 중… 브라우저가 물으면 「허용」을 눌러 주세요.');
  const more = h('div', { class: 'tc-livemore' });
  const album = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: e => { const f = e.currentTarget.files?.[0]; if (f) run(f, 'auto'); } });
  open([
    h('div', { class: 'tc-head' }, h('span', { class: 'tc-ico' }, icon('leaf', 18)),
      h('div', null, h('b', null, '이 나무 뭐지?'), h('small', null, '잎이나 꽃에 카메라를 비추면 저절로 알려 줘요'))),
    h('div', { class: 'tc-cam' }, video, h('i', { class: 'tc-frame' }), tag),
    msg, more,
    h('label', { class: 'tc-album' }, album, '앨범에서 사진 고르기'),
    h('p', { class: 'tc-foot' }, 'Pl@ntNet AI가 알려 줘요 · 사진은 저장하지 않고 위치도 보내지 않아요'),
  ]);
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
    if (!sheet?.contains(video)) return stopCam();          // 켜지는 사이 창을 닫음
    video.srcObject = stream;
    await video.play().catch(() => {});
  } catch (err) {
    msg.textContent = err.name === 'NotAllowedError' ? '카메라 사용이 막혀 있어요. 주소창 왼쪽 자물쇠에서 카메라를 「허용」으로 바꿔 주세요.'
      : '카메라를 켤 수 없어요. 앨범에서 사진을 골라 주세요.';
    return;
  }
  msg.textContent = '잎 하나를 네모 안에 가득 채우고 잠깐 멈춰 주세요.';
  const d = await ready;
  let prev = null, sent = null, busy = false, used = 0, stopped = false;
  const small = document.createElement('canvas'); small.width = 32; small.height = 24;
  const sg = small.getContext('2d', { willReadFrequently: true });
  const thumb = () => { sg.drawImage(video, 0, 0, 32, 24); const p = sg.getImageData(0, 0, 32, 24).data, g = new Uint8Array(768); for (let i = 0; i < 768; i++) g[i] = (p[i * 4] + p[i * 4 + 1] + p[i * 4 + 2]) / 3; return g; };
  const diff = (a, b) => { let s = 0; for (let i = 0; i < 768; i++) s += Math.abs(a[i] - b[i]); return s / 768; };
  const pause = text => {
    stopped = true;
    more.replaceChildren(h('button', { type: 'button', class: 'tc-again', onclick: () => { used = 0; stopped = false; more.replaceChildren(); } }, icon('leaf', 14), text));
  };
  const tick = async () => {
    if (!sheet?.contains(video)) return clearInterval(timer);   // 창 닫힘
    if (busy || stopped || video.readyState < 2) return;
    const g = thumb(), moving = prev && diff(g, prev) > STILL; prev = g;
    if (moving) { if (!tag.textContent) msg.textContent = '조금만 멈춰 주세요…'; return; }
    if (sent && diff(g, sent) < NEW_SCENE) return;              // 방금 알아본 장면 그대로
    if (used >= LIVE_MAX) return pause('계속 알아보기');
    busy = true; sent = g; used++;
    tag.classList.add('wait');
    try {
      const c = document.createElement('canvas'), k = Math.min(1, 1024 / Math.max(video.videoWidth, video.videoHeight));
      c.width = Math.round(video.videoWidth * k); c.height = Math.round(video.videoHeight * k);
      c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .85));
      const res = await identify(blob, 'auto');
      const top = res.results?.[0];
      if (!sheet?.contains(video)) return;
      if (!top || top.score < .08) { tag.textContent = ''; msg.textContent = '나무를 찾는 중… 잎이나 꽃 하나에 더 가까이 대 주세요.'; more.replaceChildren(); return; }
      const ko = koName(d, top), pct = Math.round(top.score * 100);
      tag.replaceChildren(h('small', null, top.score >= SURE ? '이 나무는' : '아마도'), h('b', null, ko.name), h('span', null, `${pct}%`));
      navigator.vibrate?.(30);
      msg.textContent = top.score >= SURE ? '다른 나무로 카메라를 옮기면 다시 알려 줘요.' : '더 가까이, 밝은 곳에서 비추면 더 정확해져요.';
      more.replaceChildren(h('button', { type: 'button', class: 'tc-detail', onclick: () => { stopCam(); const box = h('div', { class: 'tc-result' }); open([box]); box.replaceChildren(...result(d, res, 'auto').filter(Boolean)); } }, icon('tree', 13), `${ko.name} 자세히`));
    } catch (err) {
      if (err.status === 429) pause('잠시 뒤 다시 알아보기');
      else if (/not set/.test(err.detail ?? '')) stopped = true;   // 키 설정 전: 안내 문구 그대로 두고 조용히 멈춤
      else msg.textContent = '인터넷 연결이 약해요. 계속 시도하고 있어요…';
    } finally { busy = false; tag.classList.remove('wait'); }
  };
  const timer = setInterval(tick, LIVE_EVERY);
}

/** 2. 알아보는 중 → 결과 */
async function run(file, organ) {
  const url = URL.createObjectURL(file);
  const shot = h('img', { class: 'tc-shot', src: url, alt: '찍은 사진' });
  const box = h('div', { class: 'tc-result' }, h('div', { class: 'tc-wait' }, h('i'), '어떤 나무인지 알아보는 중…'));
  open([shot, box]);
  try {
    const [blob, d] = await Promise.all([shrink(file), ready]);
    const res = await identify(blob, organ);
    box.replaceChildren(...result(d, res, organ).filter(Boolean));
  } catch (err) {
    const msg = err.status === 429 ? '오늘 알아볼 수 있는 횟수를 다 썼어요. 내일 다시 해 주세요.'
      : '지금은 알아볼 수 없어요. 인터넷 연결을 확인하고 다시 해 주세요.';
    box.replaceChildren(h('p', { class: 'tc-msg' }, msg), againBtn());
  }
}
const againBtn = () => h('button', { type: 'button', class: 'tc-again', onclick: startScreen }, icon('leaf', 14), '다시 찍기');

function result(d, res, organ) {
  const rs = res.results ?? [];
  if (!rs.length) return [h('p', { class: 'tc-msg' }, '식물을 찾지 못했어요. 잎이나 꽃 하나를 화면 가득, 밝은 곳에서 찍어 주세요.'), againBtn()];
  const top = rs[0], ko = koName(d, top), pct = Math.round(top.score * 100), sure = top.score >= SURE;
  const facts = ko.exact ? forestFacts(d, ko.name) : [];
  const spots = ko.exact && d ? d.spots.filter(s => s.trees.includes(ko.name)) : [];
  const others = rs.slice(1).filter(r => r.score >= .05).map(r => `${koName(d, r).name} ${Math.round(r.score * 100)}%`);
  return [
    h('small', { class: 'tc-kicker' }, sure ? '이 나무는' : '확실하지 않지만, 아마도'),
    h('b', { class: 'tc-name' }, ko.name),
    h('i', { class: 'tc-sci' }, top.sci),
    h('div', { class: 'tc-bar', role: 'img', 'aria-label': `맞을 확률 ${pct}%` }, h('i', { style: `width:${Math.max(4, pct)}%` }), h('span', null, `맞을 확률 ${pct}%`)),
    !sure ? h('p', { class: 'tc-msg' }, `${organ === 'leaf' ? '잎 한 장을' : organ === 'flower' ? '꽃 한 송이를' : '한 부분을'} 더 가까이, 밝은 곳에서 찍으면 더 정확해져요.`) : null,
    others.length ? h('p', { class: 'tc-other' }, `다른 후보 · ${others.join(' · ')}`) : null,
    facts.length ? h('div', { class: 'tc-forest' }, h('small', null, '서울숲에서는'),
      h('ul', null, facts.map(([ic, t, cls]) => h('li', { class: cls ?? null }, icon(ic, 13), t)))) : null,
    spots.length ? h('div', { class: 'tc-spots' }, spots.map(s => h('div', null, icon('pin', 13), h('span', null, h('b', null, s.name), ` · ${s.where}`),
      s.near && ctx ? h('button', { type: 'button', onclick: () => { close(); showSpot(s); } }, '지도') : null))) : null,
    againBtn(),
    h('p', { class: 'tc-foot' }, `Pl@ntNet AI 판별${res.remaining != null ? ` · 오늘 남은 횟수 ${res.remaining}` : ''} · 서울숲 정보: ${d?.source ?? ''}`),
  ];
}

/** 지도에 '이 근처' 표시 */
function spotAt(s) {
  const pts = (s.near ?? []).map(id => ctx?.hubs()[id]).filter(Boolean);
  return pts.length ? [pts.reduce((a, p) => a + p.lat, 0) / pts.length, pts.reduce((a, p) => a + p.lon, 0) / pts.length] : null;
}
function showSpot(s) {
  const at = spotAt(s);
  if (!at) return;
  layer ??= ctx.L.layerGroup().addTo(ctx.map);
  layer.clearLayers();
  ctx.L.circleMarker(at, { radius: 22, color: '#ffd76a', weight: 1.5, fillColor: '#ffd76a', fillOpacity: .14, dashArray: '3 4' }).addTo(layer);
  ctx.L.marker(at, { icon: ctx.L.divIcon({ className: '', html: `<div class="tc-pin">${s.trees.join('·')}</div>`, iconSize: null }) })
    .bindTooltip(`<b>${s.name}</b><br>${s.where}<br><small>대략 위치예요</small>`, { direction: 'top', offset: [0, -14], className: 'tr-prog-tt' }).addTo(layer);
  ctx.fly(at);
}

/** 지도 위 「이 나무 뭐지?」 버튼. c = { map, L, hubs: () => hubById, fly(latlng) } */
export function mountTreeCam(c) {
  ctx = c;
  if (document.querySelector('.tc-btn')) return;
  document.body.append(h('button', { type: 'button', class: 'tc-btn', onclick: startScreen, 'aria-label': '이 나무 뭐지? 사진으로 나무 이름 알아보기' },
    camIcon(), h('span', null, '이 나무 뭐지?')));
}
function camIcon() {
  const s = document.createElement('span');
  s.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
  return s.firstChild;
}
