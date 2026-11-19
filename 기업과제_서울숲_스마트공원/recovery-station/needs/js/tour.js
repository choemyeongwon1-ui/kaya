// 코스 찾기(투어)
//  1) 서울 상공에서 서울숲으로 짧게 내려앉습니다(클릭 없이).
//  2) 목적·같이 온 사람·머물 시간을 고르면(이용자 별점 높은 곳을 미리 담을 수도 있음),
//     지금 내 위치에서 출발해 여러 곳을 잇는 코스를 한 번에 추천합니다. 가는 길의 정원은 사진과 함께 띄웁니다.
//  3) 내비게이션처럼 내 위치 점이 길을 따라가고, 지나온 길은 연해집니다.
//     공원 밖이거나 위치를 못 쓰면 같은 화면을 '미리보기'로 재생합니다.
//  4) 도착하면 그 자리에서 별점(+좋았던/아쉬운 점, 하고 싶은 말)을 받고, 바로 남은 코스를 고쳐 다음 곳으로 이어 갑니다.
// 장소 점수는 맞춤형 추천 화면과 같은 recommend()를 매 구간 출발점에서 다시 계산해 쓰고, 이용자 별점을 얹습니다.
import { loadData, buildModel } from './model.js';
import { seoulNow, fetchWeather, sampleWeather, annotate, applyScenario, kmaDays } from './weather.js';
import { NEEDS, COMPANY, STAYS, AFFINITY, AFFINITY_DEFAULT, REST_STD, PLACE_IDENTITY, IDENTITY_MEAN } from './config.js';
import { recommend, quietHours, josa, speedFor } from './recommend.js';
import { planRoute } from './route.js';
import { dijkstra } from './graph.js';
import { crowdScale } from './crowd.js';
import { loadNews, todayIso } from './news.js';
import { h, icon, fmtM, esc } from './ui.js';
import { faces, staticFace, upsertJourney, loadReviews, sendComfort } from './review.js';
import { fetchLiveCrowd, fmtPeople } from './live.js';
import { fetchPrograms, upcomingPrograms, pickPrograms, genericPlace } from './programs.js';

const L = window.L;
const root = document.getElementById('tour');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const T = ms => (reduce ? 0 : ms);
const store = { get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } } };
const desk = () => innerWidth >= 900;
const panelW = () => Math.min(440, innerWidth * .4) + 40;
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);

const COMPANY_ICON = { alone: 'leaf', couple: 'spark', friends: 'users', kids: 'home', elders: 'bench', pet: 'walk' };
const PARK_CENTER = [37.5444, 127.0374];
const PARK_INK = { park: '#0f241a', lawn: '#17402a', forest: '#123322', water: '#0f3147', building: '#1d2b25', path: '#a8f0c8' };
const MINT = '#5ef2a6';
const STOPS_BY_STAY = { 30: 2, 60: 3, 120: 4, 180: 5 };
const NEAR_START = 120;     // 내 위치가 길에서 이 거리(m) 안이면 내 위치에서 출발
const ARRIVE_M = 25;        // 목적지에서 이 거리 안이면 도착

const GOOD = [
  { key: 'quiet', label: '한산했어요' }, { key: 'view', label: '경치가 좋았어요' },
  { key: 'rest', label: '쉬기 좋았어요' }, { key: 'fun', label: '할 거리가 많았어요' },
];
const BAD = [
  { key: 'crowded', label: '붐볐어요', said: '붐볐다', bump: { crowd: 30 }, why: '더 한산한 곳' },
  { key: 'far', label: '멀었어요', said: '멀었다', bump: { walk: 30 }, why: '더 가까운 곳' },
  { key: 'boring', label: '볼 게 별로였어요', said: '볼 게 별로였다', away: 34, why: '분위기가 다른 곳' },
  { key: 'weather', label: '덥거나 추웠어요', said: '덥거나 추웠다', bump: { thermal: 30 }, why: '그늘·실내가 있는 곳' },
  // 쉴 곳·화장실은 서울숲 설문 IPA에서 '중점 개선'(박지영 2024 벤치 만족 2.53/중요 3.52 · 이주호 2023 편의시설) → 다른 태그보다 크게
  { key: 'facility', label: '쉴 곳·화장실 부족', said: '쉴 곳·화장실이 부족했다', bump: { toilet: 40 }, why: '쉴 곳·화장실이 가까운 곳' },
];
const TAG_LABEL = Object.fromEntries([...GOOD, ...BAD].map(x => [x.key, x.label]));
// 글로 쓴 의견에서 읽어 내는 낱말(간단한 규칙 · 서버가 생기면 문장 분석으로 바꿀 자리)
const CUES = [
  { re: /붐비|붐볐|복잡|사람.{0,8}많|북적|시끄|줄이? ?길/, label: '붐빔', bump: 'crowd' },
  { re: /멀|힘들|다리|지치|오르막|계단/, label: '거리·힘듦', bump: 'walk' },
  { re: /덥|더워|더웠|뜨거|햇빛|햇볕|그늘|춥|추워|추웠|바람/, label: '더위·추위', bump: 'thermal' },
  { re: /화장실|벤치|앉을|쉴 ?곳|의자/, label: '쉴 곳·화장실', bump: 'toilet' },
  { re: /조용|한적|한산/, label: '조용한 곳', bump: 'crowd' },
];
const FACE_WORD = { 5: '좋았어요', 3: '그저 그랬어요', 1: '별로였어요' };
// 기본 코스(팀이 정한 대표 코스 — 인기 순위가 아님)
const COURSES = [
  { id: 'eco', name: '호숫가 지나 사슴 보러', tag: '가족·연인', need: 'walk', company: 'couple', stay: 60, stops: ['mirror-pond', 'lake', 'deer'] },
  { id: 'bug', name: '나비·곤충 체험', tag: '아이와', need: 'learn', company: 'kids', stay: 120, stops: ['forest-play', 'butterfly', 'insect'] },
  { id: 'lawn', name: '잔디마당 피크닉', tag: '친구와', need: 'meet', company: 'friends', stay: 120, stops: ['family-lawn', 'stage', 'mirror-pond'] },
  { id: 'calm', name: '북쪽 습지 조용한 산책', tag: '혼자', need: 'rest', company: 'alone', stay: 60, stops: ['family-lawn', 'wetland', 'culture-ctr'] },
];
const POP_MIN = 4;
const GARDEN_NEAR = 80;

const st = { step: 0, need: null, company: null, stay: null, must: new Set(), startPick: 'auto' };
let app = null, map = null, layers = null, trip = null, nav = null;

// ── 틀 ──
const el = {
  map: h('div', { class: 'tr-map' }),
  shade: h('div', { class: 'tr-vignette', 'aria-hidden': 'true' }),
  intro: h('div', { class: 'tr-intro' }),
  toast: h('div', { class: 'tr-toast', role: 'status', 'aria-live': 'polite' }),
  panel: h('section', { class: 'tr-panel', 'aria-live': 'polite' }),
  top: h('header', { class: 'tr-top' }),
  locate: h('button', { type: 'button', class: 'tr-locate', 'aria-label': '내 위치로', onclick: () => centerMe() }, icon('target', 18)),
};
root.append(el.map, el.shade, el.top, el.toast, el.panel, el.locate, el.intro);

addEventListener('pointermove', e => {
  const t = e.target.closest?.('.tr-glow-on');
  if (!t) return;
  const r = t.getBoundingClientRect();
  t.style.setProperty('--mx', `${e.clientX - r.left}px`); t.style.setProperty('--my', `${e.clientY - r.top}px`);
}, { passive: true });

// ── 실시간 인구 배지(중계 서버가 있을 때만 보임) ──
let live = null;
const liveEl = h('button', { type: 'button', class: 'tr-live', hidden: true, 'aria-expanded': 'false', 'aria-label': '서울숲 실시간 붐빔 자세히', onclick: () => toggleLivePop() });
const livePop = h('div', { class: 'tr-livepop', hidden: true });
function paintLive() {
  if (!live) { liveEl.hidden = true; livePop.hidden = true; return; }
  liveEl.hidden = false;
  liveEl.className = `tr-live r${live.rank}`;
  liveEl.title = `${live.msg ?? ''}\n서울시 실시간 도시데이터(통신사 신호로 어림한 값) · ${live.time} 기준`;
  liveEl.replaceChildren(h('i'), h('span', null, '서울숲 지금'), h('b', null, live.level),
    live.min != null ? h('small', null, `${fmtPeople(live.min)}~${fmtPeople(live.max)}명 · ${String(live.time).slice(-5)}`) : null);
  if (!livePop.hidden) livePop.replaceChildren(liveCard());
  document.querySelectorAll('.tr-livecard-slot').forEach(s => s.replaceChildren(liveCard() ?? ''));
  paintHello();
}
function paintHello() { if (app) document.querySelectorAll('.tr-hello-slot').forEach(s => s.replaceChildren(helloCard())); }
async function refreshLive() { live = await fetchLiveCrowd(); paintLive(); }
function toggleLivePop(force) {
  const open = force ?? livePop.hidden;
  livePop.hidden = !open; liveEl.setAttribute('aria-expanded', String(open));
  if (open) livePop.replaceChildren(liveCard(), h('button', { type: 'button', class: 'tr-livepop-x', 'aria-label': '닫기', onclick: () => toggleLivePop(false) }, '×'));
}

addEventListener('pointerdown', e => { if (!livePop.hidden && !e.target.closest?.('.tr-live-wrap')) toggleLivePop(false); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !livePop.hidden) toggleLivePop(false); });

/** 서울숲 날씨: 지금 + 오늘·내일·모레·글피(기상청 단기예보). 시연 날씨일 땐 숨김 */
function weatherCard() {
  const w = app?.wx;
  if (!w?.kma || w.scenario) return null;
  const days = kmaDays(w.kma, app.now), h0 = w.hourly[0];
  if (!days.length) return null;
  const rainy = days.find(d => d.pop >= 60), windy = days.find(d => d.wind >= 9);
  const tip = rainy ? `${rainy.label} 비 소식 · 최대 ${rainy.pop}%${rainy.rain >= 1 ? ` · 약 ${rainy.rain}mm` : ''}`
    : windy ? `${windy.label} 바람이 강해요 · 최대 ${windy.wind}m/s` : '3일 동안 비 소식 없어요';
  const deg = v => v == null ? '–' : `${Math.round(v)}°`;
  // 미세먼지: 에어코리아 성동구 측정소 실측(지금) + 서울 예보 등급(오늘~모레). 두 등급 중 나쁜 쪽을 날짜 칸에 표시
  const air = w.air, an = air?.now, G = ['좋음', '보통', '나쁨', '매우나쁨'];
  const worse = (...gs) => gs.filter(g => G.includes(g)).sort((x, y) => G.indexOf(y) - G.indexOf(x))[0] ?? null;
  const dustOf = d => { const f = air?.forecast?.find(x => x.date === d.date); return f ? worse(f.pm10, f.pm25) : null; };
  const gcls = g => `g${G.indexOf(g) + 1}`;
  const airRow = an ? h('div', { class: 'tr-wx-air' },
    h('span', { class: gcls(an.pm10Label) }, '미세먼지 ', h('b', null, an.pm10Label ?? '–'), an.pm10 != null ? ` ${an.pm10}㎍` : ''),
    h('span', { class: gcls(an.pm25Label) }, '초미세먼지 ', h('b', null, an.pm25Label ?? '–'), an.pm25 != null ? ` ${an.pm25}㎍` : '')) : null;
  const dustBad = days.map(d => ({ d, g: dustOf(d) })).find(x => G.indexOf(x.g) >= 2);
  return h('section', { class: 'tr-wxcard', 'aria-label': '서울숲 날씨 3일' },
    h('div', { class: 'tr-wx-now' },
      h('small', null, '지금'), h('b', null, `${Math.round(h0.temp)}℃`),
      h0.feels != null && Math.abs(h0.feels - h0.temp) >= 1 ? h('span', null, `체감 ${Math.round(h0.feels)}℃`) : null,
      h('span', null, icon('drop', 11), `${h0.rh ?? '–'}%`), h('span', null, icon('wind', 11), `${h0.wind ?? '–'}m/s`)),
    airRow,
    h('div', { class: 'tr-wx-days' }, days.map(d => { const g = dustOf(d); return h('div', { class: `tr-wx-d${d.pop >= 60 ? ' wet' : ''}` },
      h('small', null, d.label), icon(d.kind, 20),
      h('b', null, deg(d.tmax), h('em', null, deg(d.tmin))),
      h('span', { class: 'pop' }, icon('rain', 10), `${d.pop}%`),
      h('span', null, icon('wind', 10), `${Math.round(d.wind)}m/s`),
      h('span', null, icon('drop', 10), `${d.rh}%`),
      air ? h('span', { class: `dust ${g ? gcls(g) : ''}`, title: g ? '미세먼지 예보(서울)' : '미세먼지 예보는 모레까지' }, g ? `먼지 ${g}` : '먼지 –') : null); })),
    h('p', { class: 'tr-wx-tip' }, dustBad ? `${dustBad.d.label} 미세먼지 ${dustBad.g} 예보 · 그날은 곤충식물원·나비정원 같은 실내도 생각해 보세요` : tip),
    h('p', { class: 'tr-lc-src' }, `기상청 단기예보 · ${String(w.kma.base).slice(11, 13)}시 발표${days.some(d => d.coarse) ? ' · 글피는 3시간 간격' : ''}`
      + (an ? ` · 미세먼지 에어코리아 ${air.station} 측정소 ${String(an.time).slice(11, 13)}시` : '')));
}
function paintWeather() { document.querySelectorAll('.tr-wxcard-slot').forEach(s => s.replaceChildren(weatherCard() ?? '')); paintHello(); }

// 붐빔 4단계와 '가늠' 기준
const LIVE_STEPS = ['여유', '보통', '약간 붐빔', '붐빔'];
const PARK_M2 = 490000;      // 서울숲 면적(주제서 기준 약 49만㎡). 서울시 '서울숲공원' 집계 구역과 꼭 같지는 않음(검증 필요)
const PITCH_M2 = 7140;       // 축구장 한 면(105×68m)
const hh = t => String(t ?? '').slice(11, 13);
/** 지금 서울숲: 붐빔 단계 · 인원 · 축구장 한 면당 몇 명 · 앞으로 몇 시간 */
function liveCard() {
  if (!live) return null;
  const fc = (live.forecast ?? []).filter(f => f.max != null).slice(0, 8);
  const top = Math.max(live.max ?? 0, ...fc.map(f => f.max)) || 1;
  const perPitch = v => Math.round(v / PARK_M2 * PITCH_M2);
  const day = fc.filter(f => +hh(f.time) >= 6 && +hh(f.time) < 22);      // 밤(22~6시)은 '한산한 때'로 권하지 않음
  const calm = day.length ? day.reduce((a, f) => (f.max < a.max ? f : a)) : null;
  const rankOf = lv => Math.max(0, LIVE_STEPS.indexOf(lv));
  return h('section', { class: `tr-livecard r${live.rank}`, 'aria-label': '서울숲 실시간 붐빔' },
    h('div', { class: 'tr-lc-head' },
      h('span', { class: 'tr-lc-dot' }), h('small', null, '지금 서울숲'), h('b', null, live.level),
      live.min != null ? h('strong', null, `${fmtPeople(live.min)}~${fmtPeople(live.max)}`, h('small', null, '명')) : null),
    h('div', { class: 'tr-lc-gauge', role: 'img', 'aria-label': `4단계 중 ${live.rank + 1}단계 ${live.level}` },
      LIVE_STEPS.map((s, i) => h('div', { class: i <= live.rank ? `on s${i}` : '' }, h('i'), h('span', null, s)))),
    live.min != null ? h('p', { class: 'tr-lc-feel' }, icon('users', 13), `축구장 한 면 넓이에 약 ${perPitch(live.min)}~${perPitch(live.max)}명꼴`) : null,
    fc.length ? h('div', { class: 'tr-lc-fc' },
      h('div', { class: 'tr-lc-bars' },
        h('div', { class: `now s${live.rank}`, style: `--h:${Math.max(8, 100 * (live.max ?? 0) / top)}%` }, h('i'), h('span', null, '지금')),
        fc.map(f => h('div', { class: `s${rankOf(f.level)}${f === calm ? ' calm' : ''}`, style: `--h:${Math.max(8, 100 * f.max / top)}%`, title: `${hh(f.time)}시 ${f.level} · ${fmtPeople(f.min)}~${fmtPeople(f.max)}명` }, h('i'), h('span', null, hh(f.time))))),
      calm && calm.max < (live.max ?? 0) ? h('small', null, `${hh(calm.time)}시쯤 가장 한산 · ${fmtPeople(calm.min)}~${fmtPeople(calm.max)}명`)
        : day.length ? h('small', null, '밤 10시 전엔 지금보다 한산한 때가 없어요') : h('small', null, '앞으로 몇 시간 예보예요')) : null,
    h('p', { class: 'tr-lc-src' }, `서울시 실시간 도시데이터 · 휴대폰 신호로 어림한 값 · ${String(live.time).slice(-5)} 기준`));
}

function renderTop() {
  el.top.replaceChildren(
    h('div', { class: 'tr-top-l' },
      h('a', { class: 'tr-brand', href: './' }, h('span', { class: 'tr-mark' }, icon('tree', 14)), h('b', null, '머무는 숲'), h('span', { class: 'tr-brand-sub' }, '코스 찾기')),
      h('div', { class: 'tr-live-wrap' }, liveEl, livePop)),
    h('div', { class: 'tr-top-r' },
      h('div', { class: 'tr-seg', role: 'group', 'aria-label': '지도 바탕' },
        h('button', { type: 'button', 'data-mode': 'sat', 'aria-pressed': 'true', onclick: () => setBase('sat') }, '위성'),
        h('button', { type: 'button', 'data-mode': 'map', 'aria-pressed': 'false', onclick: () => setBase('map') }, '지도')),
      h('a', { class: 'tr-link', href: './#citizen' }, '맞춤형 추천 화면', icon('route', 13))));
}

// ── 지도 ──
function makeMap() {
  map = L.map(el.map, { zoomControl: false, attributionControl: true, zoomSnap: 0, minZoom: 10, maxZoom: 19 });
  map.attributionControl.setPrefix(false);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 20, className: 'tr-base', attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 기여자 © <a href="https://carto.com/attributions">CARTO</a>' }).addTo(map);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, className: 'tr-sat', keepBuffer: 4, attribution: '위성 사진 © Esri, Maxar, Earthstar Geographics' }).addTo(map);
  map.setView(PARK_CENTER, 12.4);
  layers = {
    park: L.layerGroup().addTo(map), route: L.layerGroup().addTo(map), plan: L.layerGroup().addTo(map),
    garden: L.layerGroup().addTo(map), pins: L.layerGroup().addTo(map), me: L.layerGroup().addTo(map),
    gshot: L.layerGroup().addTo(map), shot: L.layerGroup().addTo(map), prog: L.layerGroup().addTo(map),
  };
}
let baseMode = store.get('sf-tour-base', 'sat') === 'map' ? 'map' : 'sat';
function setBase(mode) {
  baseMode = mode;
  try { localStorage.setItem('sf-tour-base', mode); } catch {}
  el.map.classList.toggle('tr-mapmode', mode === 'map');
  el.top.querySelectorAll('.tr-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
}
const flyBounds = (b, pad, sec = 1) => new Promise(res => {
  if (reduce) { map.fitBounds(b, pad); return res(); }
  map.once('moveend', () => res());
  map.flyToBounds(b, { ...pad, duration: sec, easeLinearity: .2 });
});
const padding = () => desk() ? { paddingTopLeft: [48, 96], paddingBottomRight: [panelW() + 24, 48] } : { paddingTopLeft: [28, 84], paddingBottomRight: [28, Math.round(innerHeight * .52)] };
function visiblePoint(lift = 0) {
  const s = map.getSize();
  return desk() ? L.point((s.x - panelW()) / 2, s.y / 2 + lift) : L.point(s.x / 2, s.y * .25 + lift * .7);
}
function flyToVisible(ll, zoom, sec = .8, lift = 0) {
  return new Promise(res => {
    const off = map.getSize().divideBy(2).subtract(visiblePoint(lift));
    const target = map.unproject(map.project(ll, zoom).add(off), zoom);
    if (reduce) { map.setView(target, zoom); return res(); }
    map.once('moveend', () => res());
    map.flyTo(target, zoom, { duration: sec, easeLinearity: .25 });
  });
}
function parkOutline() {
  const d = app.model.data, g = app.model.g;
  layers.park.clearLayers();
  const detail = L.layerGroup().addTo(layers.park);
  const off = { interactive: false };
  L.geoJSON(d.park, { ...off, style: { stroke: false, fillColor: PARK_INK.park, fillOpacity: 1, className: 'tr-fade' } }).addTo(detail);
  const feat = kind => ({ type: 'FeatureCollection', features: d.features.features.filter(f => f.properties.kind === kind) });
  for (const kind of ['lawn', 'forest', 'water', 'building'])
    L.geoJSON(feat(kind), { ...off, style: { stroke: false, fillColor: PARK_INK[kind], fillOpacity: 1, className: 'tr-fade' } }).addTo(detail);
  const segs = g.edges.filter(e => e.inPark).map(e => [[g.nodes[e.a][1], g.nodes[e.a][0]], [g.nodes[e.b][1], g.nodes[e.b][0]]]);
  L.polyline(segs, { ...off, color: PARK_INK.path, weight: 1.2, opacity: .22, className: 'tr-fade' }).addTo(detail);
  const edge = L.geoJSON(d.park, { ...off, style: { className: 'tr-park', color: MINT, weight: 1.6, fill: false, opacity: .85 } }).addTo(layers.park);
  edge.eachLayer(l => drawIn(l, 0, 1400));
}
function drawIn(layer, delay = 0, dur = 900) {
  const p = layer.getElement?.();
  if (!p || reduce || !p.getTotalLength) return;
  const len = p.getTotalLength();
  const keep = p.style.strokeDasharray;
  p.style.strokeDasharray = `${len}`; p.style.strokeDashoffset = `${len}`;
  const a = p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: dur, delay, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' });
  a.onfinish = () => { p.style.strokeDasharray = keep; p.style.strokeDashoffset = ''; a.cancel(); };
}

// ── 내 위치 ──
const me = { pos: null, err: null, watching: false };
let meMarker = null, meAcc = null;
const meIcon = cls => L.divIcon({ className: '', html: `<div class="tr-me ${cls}"><i></i><b></b></div>`, iconSize: [20, 20], iconAnchor: [10, 10] });
function watchMe() {
  if (me.watching) return;
  me.watching = true;
  if (!navigator.geolocation) { me.err = '이 기기에서는 위치를 쓸 수 없어서'; return; }
  navigator.geolocation.watchPosition(p => {
    me.pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy ?? 30, at: Date.now() };
    me.err = null;
    drawMe();
    nav?.onPos?.();
  }, e => { if (!me.pos) me.err = e.code === 1 ? '위치 권한이 꺼져 있어서' : '위치를 찾지 못해서'; }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
}
const waitMe = ms => new Promise(res => {
  if (me.pos || me.err) return res();
  const t0 = Date.now(), iv = setInterval(() => { if (me.pos || me.err || Date.now() - t0 > ms) { clearInterval(iv); res(); } }, 120);
});
function drawMe() {
  if (!me.pos || !layers) return;
  const ll = [me.pos.lat, me.pos.lon];
  if (!meMarker) {
    meAcc = L.circle(ll, { radius: Math.min(me.pos.acc, 80), interactive: false, className: 'tr-me-acc', stroke: false, fillColor: '#5aa9ff', fillOpacity: .12 }).addTo(layers.me);
    meMarker = L.marker(ll, { icon: meIcon(''), interactive: false, zIndexOffset: 1300 }).addTo(layers.me);
  } else { meMarker.setLatLng(ll); meAcc.setLatLng(ll).setRadius(Math.min(me.pos.acc, 80)); }
  el.locate.classList.add('on');
}
function centerMe() {
  if (me.pos) return flyToVisible([me.pos.lat, me.pos.lon], 17.2, .7);
  watchMe(); toast({ ico: 'target', small: '내 위치', title: me.err ? `${me.err} 위치를 쓸 수 없어요` : '위치를 찾는 중이에요' }, 2600);
}
/** 출발점: 내 위치가 공원(또는 그 앞길) 가까이면 내 위치, 아니면 가장 가까운 입구 */
function resolveStart() {
  const m = app.model, gates = m.gates;
  const gateOf = (g, note) => ({ node: g.node, off: g.off ?? 0, lat: g.lat, lon: g.lon, name: g.name, gate: g.id, note });
  if (st.startPick !== 'auto' && st.startPick !== 'me') return gateOf(m.hubById[st.startPick] ?? gates[0], null);
  if (me.pos) {
    const { lat, lon } = me.pos, here = L.latLng(lat, lon), s = m.snap(lon, lat);
    if (s && (m.inPark(lon, lat) || s.off <= NEAR_START)) return { node: s.node, off: s.off, lat, lon, name: '내 위치', mine: true };
    const near = gates.reduce((a, g) => here.distanceTo([g.lat, g.lon]) < here.distanceTo([a.lat, a.lon]) ? g : a);
    const d = here.distanceTo([near.lat, near.lon]);
    return gateOf(near, `지금 서울숲에서 ${d < 1000 ? `${Math.round(d)}m` : `${(d / 1000).toFixed(1)}km`} 떨어져 있어서 가장 가까운 입구에서 출발해요`);
  }
  return gateOf(gates[0], me.err ? `${me.err} 입구에서 출발해요` : '위치를 찾는 동안 입구에서 출발하는 코스로 보여 드려요');
}

// ── 패널 바꾸기 ──
let mountTok = 0;
async function mount(cls, nodes) {
  const tok = ++mountTok;
  if (el.panel.classList.contains('show') && el.panel.childElementCount && !reduce) {
    el.panel.classList.add('out');
    await sleep(150);
    if (tok !== mountTok) return false;
  }
  el.panel.className = `tr-panel show ${cls}`;
  el.panel.replaceChildren(...nodes.filter(Boolean));
  el.panel.scrollTop = 0;
  return true;
}
let toastTimer = 0;
function toast({ cls = '', img = null, ico = 'leaf', small, title, text }, ms = 4000) {
  el.toast.className = `tr-toast ${cls}`;
  el.toast.replaceChildren(h('div', { class: 'tr-toast-in' },
    img ? h('img', { src: img, alt: '' }) : h('span', { class: 'tr-toast-ico' }, icon(ico, 16)),
    h('div', null, small ? h('small', null, small) : null, h('b', null, title), text ? h('p', null, text) : null)));
  void el.toast.offsetWidth; el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms);
}

// ── 1. 처음 화면 ──
function renderIntro(err) {
  el.intro.replaceChildren(h('div', { class: 'tr-intro-in' },
    h('div', { class: 'tr-eyebrow' }, h('i'), 'SEOUL FOREST'),
    h('h1', null, err ? '데이터를 불러오지 못했어요' : h('span', null, '오늘, 서울숲 어디로 걸을까요?')),
    err ? h('p', null, err) : h('div', { class: 'tr-intro-bar' }, h('i')),
    err ? h('button', { type: 'button', class: 'tr-cta', onclick: () => location.reload() }, '다시 시도') : null));
}
async function arrive() {
  el.intro.classList.add('hide');
  const { center, zoom } = map._getBoundsCenterZoom(app.model.parkBounds, padding());
  await new Promise(res => {
    if (reduce) { map.setView(center, zoom); return res(); }
    map.once('moveend', res);
    map.flyTo(center, zoom, { duration: 1.5, easeLinearity: .12 });
  });
  parkOutline();
  el.map.classList.add('tr-arrived'); el.top.classList.add('tr-arrived'); el.locate.classList.add('show'); setBase(baseMode);
  setTimeout(() => el.intro.remove(), 600);
  go(1);
}

// ── 이용자 별점(이 기기의 평가 + 시연용 가상 평가) ──
let RT = null;
const allReviews = () => [...(app.seed?.journeys ?? []), ...loadReviews()];
function ratings() {
  if (RT) return RT;
  const agg = {};
  for (const j of allReviews()) for (const s of j.stops ?? []) {
    if (s.rating == null) continue;
    const a = agg[s.id] ??= { sum: 0, count: 0, tags: {}, comments: [], seed: 0 };
    a.sum += s.rating; a.count++; if (s.rating >= 4) a.good = (a.good ?? 0) + 1; if (j.seed) a.seed++;
    for (const t of s.tags ?? []) a.tags[t] = (a.tags[t] ?? 0) + 1;
    if (s.comment) a.comments.push({ text: s.comment, rating: s.rating, at: j.at, mine: !j.seed });
  }
  for (const a of Object.values(agg)) {
    a.avg = a.sum / a.count;
    a.top = Object.entries(a.tags).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k]) => k);
    a.quote = a.comments.filter(c => c.rating >= 4).sort((x, y) => (y.mine - x.mine) || (y.at > x.at ? 1 : -1))[0]?.text ?? null;
  }
  return (RT = agg);
}
const rtOf = id => ratings()[id] ?? null;
const hasSeed = () => (app.seed?.journeys ?? []).length > 0;

// ── 2. 단계별 고르기 ──
const STEPS = [
  null,
  { key: 'need', q: '무엇을 하고 싶나요?', opts: () => NEEDS.map(n => ({ key: n.key, label: n.label, icon: n.icon })) },
  { key: 'company', q: '누구와 왔나요?', opts: () => COMPANY.map(c => ({ key: c.key, label: c.label.replace(/과$|와$/, ''), icon: COMPANY_ICON[c.key] })) },
  { key: 'stay', q: '얼마나 머물까요?', opts: () => STAYS.map(s => ({ key: s.key, label: s.label, icon: 'clock', desc: `${STOPS_BY_STAY[s.key] ?? 3}곳` })) },
];
const hubName = id => app.model.hubById[id]?.name ?? id;

/**
 * 첫 화면 한 줄: '왜 서울숲인가'(팀 논리)를 지금 상황에 맞는 이유 하나로 보여 줌
 *  - 더운 낮: 성수 거리보다 시원한 숲(조현민·권태경 2022 실측)
 *  - 평일 17~21시: 일터에서 걸어 닿는 숲 → 혼자 쉬는 30분 코스 바로 출발
 *  - 붐빌 때(실시간 '약간 붐빔' 이상 또는 주말 12~17시): 한산한 길·때 안내(조현민·권태경 2025)
 *  - 그 밖: 성수 한가운데 쉬어 가는 숲 + 물·숲·습지·실내 정원 선택지(무료라는 말은 노골적이라 쓰지 않음)
 */
function helloCard() {
  const w = app.wx, h0 = w?.hourly?.[0] ?? {}, n = app.now, weekday = n.dow >= 1 && n.dow <= 5;
  const hot = (h0.feels ?? h0.temp ?? 0) >= 31 && h0.day !== false;
  const busy = (live?.rank ?? 0) >= 2 || (!weekday && n.hour >= 12 && n.hour < 17);
  const card = (cls, ico, title, text, src, action) => h('section', { class: `tr-hello ${cls}` },
    h('span', { class: 'tr-hello-ico' }, icon(ico, 16)),
    h('div', null, h('b', null, title), h('p', null, text), src ? h('small', null, src) : null, action ?? null));
  if (hot) return card('hot', 'leaf', '더운 날, 성수 거리보다 시원한 숲',
    '기온이 33℃를 넘던 때 서울숲 안은 공원 밖 거리보다 5.5~7.4℃ 낮았어요. 그늘과 물가 위주로 골라 드려요.',
    '2022년 7월 서울숲 실측(조현민·권태경 2022)');
  // 퇴근길 30분: 지금 갈 곳이 있는 활동(쉬기 → 걷기 → 그 밖 순)을 골라 바로 출발. 추운 저녁처럼 쉴 곳이 없으면 걷기로
  const g0 = app.model.gates?.[0];
  const workNeed = weekday && n.hour >= 17 && n.hour < 21 && g0
    ? ['rest', 'walk', ...NEEDS.map(x => x.key)].find(k => recommend(app.model, w, n, { need: k, stay: 30, company: 'alone', startNode: g0.node, startOff: g0.off ?? 0 }).fit !== 'none') : null;
  if (workNeed) return card('work', 'walk', '퇴근길, 숲으로 30분',
    `성수에서 걸어서 닿는 숲이에요. 혼자 ${workNeed === 'rest' ? '조용히 쉬는' : workNeed === 'walk' ? '가볍게 걷는' : '머무는'} 30분 코스를 바로 짜 드려요.`, null,
    h('button', { type: 'button', class: 'tr-hello-go tr-glow-on', onclick: () => { watchMe(); Object.assign(st, { need: workNeed, company: 'alone', stay: 30 }); begin(); } }, '30분 코스로 바로 출발', h('span', { class: 'tr-cta-arrow' }, '→')));
  if (busy) return card('busy', 'users', weekday ? '지금 사람이 몰려 있어요' : '주말 오후엔 사람이 몰려요',
    '붐비는 곳은 피해서, 한산한 길과 덜 붐비는 때를 함께 알려 드려요.',
    '서울숲 보행 계수: 토요일 오후 2시가 한 주 중 가장 붐빔(조현민·권태경 2025)');
  return card('free', 'bench', '성수 한가운데, 잠깐 쉬어 가는 숲',
    '물가·숲·습지·실내 정원 가운데, 오늘 날씨와 붐빔에 맞는 곳을 골라 드려요.', null);
}

function go(step) {
  st.step = step;
  const s = STEPS[step];
  const picked = [st.need && NEEDS.find(n => n.key === st.need)?.label, step > 2 && st.company && COMPANY.find(c => c.key === st.company)?.label].filter(Boolean);
  setFocus(false);
  mount('tr-s-step', [
    h('div', { class: 'tr-panel-head' },
      h('div', { class: 'tr-stepno' }, h('b', null, `0${step}`), h('span', null, '/ 03')),
      step > 1 ? h('button', { type: 'button', class: 'tr-back', onclick: () => go(step - 1) }, '이전') : null),
    h('div', { class: 'tr-dots', 'aria-label': `${step}/3단계` }, [1, 2, 3].map(i => h('i', { class: i < step ? 'done' : i === step ? 'on' : '' }))),
    step === 1 ? h('div', { class: 'tr-hello-slot' }, helloCard()) : null,
    step === 1 ? h('div', { class: 'tr-livecard-slot' }, liveCard() ?? '') : null,
    step === 1 ? h('div', { class: 'tr-wxcard-slot' }, weatherCard() ?? '') : null,
    h('h2', { class: 'tr-q' }, s.q),
    picked.length ? h('div', { class: 'tr-picked' }, picked.map(p => h('span', null, p))) : null,
    h('div', { class: 'tr-opts' }, s.opts().map((o, i) => h('button', { type: 'button', class: 'tr-opt tr-glow-on', style: `--i:${i}`, onclick: ev => choose(s.key, o.key, ev.currentTarget) },
      h('span', { class: 'tr-opt-ico' }, icon(o.icon, 18)), h('b', null, o.label), o.desc ? h('small', null, o.desc) : null))),
    step === 1 ? popularBlock() : null,
    step === 1 ? h('div', { class: 'tr-prog-slot' }, programBlock() ?? '') : null,
  ]);
}
async function choose(key, value, btn) {
  watchMe();          // 첫 선택 때 위치를 물어봅니다(코스를 짤 때쯤 준비되도록)
  st[key] = value;
  btn.classList.add('chosen');
  await sleep(T(220));
  if (st.step < 3) go(st.step + 1);
  else begin();
}


function popularCourses() {
  const known = new Map(COURSES.map(c => [c.stops.join('>'), { ...c, count: 0, sum: 0 }]));
  for (const j of allReviews()) {
    const ss = (j.stops ?? []).filter(s => s.rating != null);
    if (ss.length < 2) continue;
    const avg = ss.reduce((a, s) => a + s.rating, 0) / ss.length, key = ss.map(s => s.id).join('>');
    if (!known.has(key)) {
      if (avg < POP_MIN) continue;
      known.set(key, { id: `u-${key}`, name: `${hubName(ss[0].id)}에서 ${hubName(ss[ss.length - 1].id)}까지`, tag: COMPANY.find(c => c.key === j.company)?.label.replace(/과$|와$/, '') ?? '', need: j.need, company: j.company, stay: j.stay, stops: ss.map(s => s.id), count: 0, sum: 0, user: true });
    }
    const c = known.get(key); c.count++; c.sum += avg;
  }
  return [...known.values()].filter(c => c.stops.every(id => app.model.hubById[id])).map(c => ({ ...c, avg: c.count ? c.sum / c.count : null }))
    .sort((a, b) => b.count - a.count || (b.avg ?? 0) - (a.avg ?? 0)).slice(0, 4);
}
const courseLen = new Map();
function courseStats(c) {
  if (courseLen.has(c.id)) return courseLen.get(c.id);
  const m = app.model, g = m.gates[0], speed = speedFor(c.company);
  const env = { scale: crowdScale(app.now.dow, app.now.hour), sunMode: 'none', floodPenalty: null };
  let from = g, meters = 0;
  for (const id of c.stops) {
    const p = m.hubById[id]; if (!p) continue;
    meters += (planRoute(m, from.node, p.node, {}, env, speed)?.main?.meters ?? 0) + Math.round((from.off ?? 0) + p.off);
    from = p;
  }
  const r = { meters, minutes: Math.max(1, Math.round(meters / speed)) };
  courseLen.set(c.id, r);
  return r;
}
function popularBlock() {
  const list = popularCourses();
  return h('section', { class: 'tr-pop' },
    h('div', { class: 'tr-sec-head' }, h('b', null, '또는, 추천 코스로 바로 출발')),
    h('div', { class: 'tr-pop-list' }, list.map((c, i) => {
      const s = courseStats(c), ph = c.stops.map(id => photoOf(id)).find(Boolean);
      return h('button', { type: 'button', class: 'tr-course tr-glow-on', style: `--i:${i}`, onclick: () => { watchMe(); Object.assign(st, { need: c.need, company: c.company, stay: c.stay }); begin(c); } },
        h('div', { class: 'tr-course-img' }, ph ? h('img', { src: ph.src, alt: '', loading: 'lazy' }) : icon('route', 20)),
        h('div', { class: 'tr-course-body' },
          h('b', null, c.name),
          h('small', { class: 'tr-course-chain' }, `${c.stops.length}곳 · ${s.minutes}분`)));
    })));
}

// ── 서울숲 프로그램(공공서비스예약) ──
const progPlace = s => String(s ?? '').replace(/^서울숲\s*>\s*/, '').replace(/^서울숲\s+/, '') || '서울숲';
const progHubs = () => Object.values(app.model.hubById ?? {});
const progList = (days = 14) => app.programs ? upcomingPrograms(app.programs, app.now.date, days, progHubs()) : [];
/** 프로그램 한 줄: 누르면 예약 화면. 열리는 곳이 앱 거점이면 '코스에 넣기'(담은 곳은 코스에 꼭 들어감) */
function progRow(x, i = 0, { canAdd = false } = {}) {
  const p = x.p, tag = x.who === 'group' ? '단체' : x.open ? '예약' : x.soon ? '곧 접수' : x.full ? '마감' : p.status;
  const tgt = p.target?.match(/\(([^)]*)\)?/)?.[1] ?? p.target;      // '가족(7세 이상 어린이와 보호자)' → 괄호 안
  const hubLabel = x.hub ? hubName(x.hub) : null;
  const meta = [progPlace(p.place) + (hubLabel && !progPlace(p.place).includes(hubLabel.split(/[·(]/)[0]) ? ` (${hubLabel} 쪽)` : ''), tgt, p.fee].filter(Boolean).join(' · ');
  const body = [h('span', { class: 'tr-prog-when' }, x.nextLabel), h('div', { class: 'tr-prog-body' }, h('b', null, x.title), h('small', null, meta)), h('span', { class: `tr-prog-tag ${x.open && x.who !== 'group' ? 'open' : ''}` }, tag)];
  const main = p.url ? h('a', { class: 'tr-prog-main', href: p.url, target: '_blank', rel: 'noopener', title: '서울시 공공서비스예약에서 보기' }, ...body) : h('div', { class: 'tr-prog-main' }, ...body);
  const add = canAdd && x.hub && x.who !== 'group' ? h('button', { type: 'button', class: `tr-prog-add${st.must.has(x.hub) ? ' on' : ''}`, 'aria-pressed': String(st.must.has(x.hub)),
    onclick: e => { const on = !st.must.has(x.hub); on ? st.must.add(x.hub) : st.must.delete(x.hub); e.currentTarget.classList.toggle('on', on); e.currentTarget.setAttribute('aria-pressed', String(on)); e.currentTarget.textContent = on ? `✓ ${hubLabel} 코스에 넣음` : `+ ${hubLabel} 코스에 넣기`; } },
    st.must.has(x.hub) ? `✓ ${hubLabel} 코스에 넣음` : `+ ${hubLabel} 코스에 넣기`) : null;
  return h('div', { class: 'tr-pgm', style: `--i:${i}`, 'data-lat': p.lat ?? '', 'data-lon': p.lon ?? '' }, main, add);
}
/** 첫 화면: 앞으로 2주 안의 서울숲 프로그램(날짜 순, 최대 4개) + 지도에 열리는 곳 표시 */
function programBlock() {
  const list = progList().slice(0, 4);
  paintProgramPins(list);
  if (!list.length) return null;
  return h('section', { class: 'tr-pop tr-progs' },
    h('div', { class: 'tr-sec-head' }, h('b', null, '이번 주 서울숲 프로그램'), h('span', null, '공공서비스예약')),
    h('div', { class: 'tr-prog-list' }, list.map((x, i) => progRow(x, i, { canAdd: true }))),
    h('p', { class: 'tr-pop-note' }, `서울시 공공서비스예약 · ${String(app.programs.checked ?? '').slice(5, 16) || '저장본'} 기준. 누르면 예약 화면으로 가요. 지도의 노란 점이 열리는 곳이에요.`));
}
/** 지도에 프로그램 장소 점(같은 자리는 하나로). 코스를 짜면 지움 */
function paintProgramPins(list) {
  layers.prog.clearLayers();
  const at = new Map();
  for (const x of list) if (x.p.lat && x.p.lon && !genericPlace(x.p)) { const k = `${x.p.lat.toFixed(4)},${x.p.lon.toFixed(4)}`; (at.get(k) ?? at.set(k, []).get(k)).push(x); }
  for (const xs of at.values()) {
    const p = xs[0].p, tip = `<b>${esc(progPlace(p.place))}</b><br>${xs.map(x => `${esc(x.nextLabel)} ${esc(x.title)}`).join('<br>')}`;
    L.circleMarker([p.lat, p.lon], { radius: 6, color: '#ffc164', weight: 2, fillColor: '#ffc164', fillOpacity: .35, className: 'tr-prog-pin' })
      .bindTooltip(tip, { direction: 'top', offset: [0, -6], className: 'tr-prog-tt' }).addTo(layers.prog);
  }
}
function paintPrograms() { if (st.step === 1 && !trip) document.querySelectorAll('.tr-prog-slot').forEach(s => s.replaceChildren(programBlock() ?? '')); }
/** 코스 화면 한 줄: 같이 온 사람에게 맞는 가까운 프로그램 하나. 그 장소가 코스에 있으면 알려 줌 */
function programTip() {
  if (!app.programs) return null;
  const x = pickPrograms(progList(7), st.company, st.need, 1)[0];
  if (!x || x.full) return null;
  const who = st.company === 'kids' ? '아이와 함께라면' : st.company === 'elders' ? '어르신과 함께라면' : '함께 해 볼 만한';
  const onRoute = x.hub && trip?.stops?.some(s => s.r.place.id === x.hub);
  return h('div', { class: 'tr-prog-tip' }, h('small', null, `${who} · 서울숲 프로그램${onRoute ? ` · 코스의 ${hubName(x.hub)}에서 열려요` : ''}`), progRow(x));
}

// ── 3. 코스 짜기 ──
const dwell = () => Math.max(8, Math.round(st.stay * .6 / (STOPS_BY_STAY[st.stay] ?? 3)));
const labels = () => [NEEDS.find(n => n.key === st.need)?.label, COMPANY.find(c => c.key === st.company)?.label, STAYS.find(s => s.key === st.stay)?.label].filter(Boolean);
const asFrom = p => ({ node: p.node, off: p.off ?? 0, lat: p.lat, lon: p.lon, name: p.name });
const visited = () => trip.stops.slice(0, trip.idx);
const ahead = () => trip.stops.slice(trip.idx);
const rated = () => visited().filter(s => s.rating != null);
const usedMin = () => visited().reduce((a, s) => a + s.walkMin + dwell(), 0);

const AFF_KEYS = NEEDS.map(n => n.key);
function sim(a, b) {
  const va = AFF_KEYS.map(k => AFFINITY[a.id]?.[k] ?? AFFINITY_DEFAULT), vb = AFF_KEYS.map(k => AFFINITY[b.id]?.[k] ?? AFFINITY_DEFAULT);
  const dot = va.reduce((s, x, i) => s + x * vb[i], 0), na = Math.hypot(...va), nb = Math.hypot(...vb);
  const cos = na && nb ? dot / (na * nb) : 0;
  return .7 * Math.max(0, Math.min(1, (cos - .6) / .4)) + .3 * (a.type === b.type ? 1 : 0);
}
/** 후보 점수: 추천 점수 + 지금까지의 의견 + 이용자 별점 + 담은 곳 */
function ranked(rec, seen, prev, must) {
  const fb = trip.fb, w = { ...rec.weights };
  for (const [k, v] of Object.entries(fb.bump)) w[k] = (w[k] ?? 0) + v;
  const wsum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  return rec.all.filter(r => r.tier < 9 && !seen.has(r.place.id)).map(r => {
    let s = Object.keys(w).reduce((a, k) => a + w[k] * (r.parts[k] ?? 0), 0) / wsum * 100 - 25 * Math.min(r.tier, 3);
    if (fb.liked.length) s += 18 * Math.max(...fb.liked.map(p => sim(p, r.place)));
    if (fb.disliked.length) s -= Math.max(...fb.disliked.map(d => d.k * sim(d.place, r.place)));
    if (prev) s -= 8 * sim(prev, r.place);
    if (fb.identity && PLACE_IDENTITY[r.place.id] != null) s += (PLACE_IDENTITY[r.place.id] - IDENTITY_MEAN) * 10;   // −9~+7점
    const rt = rtOf(r.place.id);
    if (rt && rt.count >= 3) s += (rt.avg - 3.6) * 10;
    if (must?.has(r.place.id)) s += 45;
    return { r, s };
  }).sort((a, b) => b.s - a.s);
}
function planFrom(from, count, seen0, queue = [], mustIds = []) {
  const seen = new Set(seen0), picks = [], q = [...queue], must = new Set(mustIds.filter(id => !seen.has(id)));
  let f = from, prev = null;
  for (let i = 0; i < count; i++) {
    const rec = recommend(app.model, app.wx, app.now, { need: st.need, stay: st.stay, company: st.company, slow: false, startNode: f.node, startOff: f.off ?? 0 });
    let r = null;
    while (q.length && !r) { const id = q.shift(), x = rec.all.find(y => y.place.id === id); if (x && x.tier < 9 && !seen.has(id)) r = x; }
    if (!r && must.size && count - i <= must.size) r = rec.all.find(x => must.has(x.place.id)) ?? null;      // 남은 자리 = 담은 곳 수면 반드시
    r ??= ranked(rec, seen, prev, must)[0]?.r;
    if (!r) break;
    picks.push({ r, rec });
    seen.add(r.place.id); must.delete(r.place.id); prev = r.place; f = asFrom(r.place);
  }
  // 정해 둔 코스(queue)는 순서를 지키고, 그 밖에는 고른 장소들을 가장 덜 걷는 순서로 다시 놓습니다
  const ordered = queue.length ? picks : shortestOrder(from, picks);
  const out = [];
  f = from;
  for (const { r, rec } of ordered) { out.push(makeLeg(f, r, rec)); f = asFrom(r.place); }
  return out;
}
/** 출발점에서 시작해 모든 장소를 한 번씩 들르는 가장 짧은 순서(장소 7곳 이하는 전부 따져 봄, 그 이상은 가까운 곳부터) */
function shortestOrder(from, picks) {
  if (picks.length < 2) return picks;
  const g = app.model.g, bf = st.company === 'kids' || st.company === 'elders';
  const nodes = [from.node, ...picks.map(p => p.r.place.node)];
  const D = nodes.map(n => dijkstra(g, [n], e => e.len, { barrierFree: bf }).plen);
  const d = (i, j) => { const v = D[i][nodes[j]]; return Number.isFinite(v) ? v : 1e7; };
  const idx = picks.map((_, i) => i + 1);
  let best = null, bestLen = Infinity;
  if (idx.length <= 7) {
    const perm = (rest, path, len) => {
      if (len >= bestLen) return;
      if (!rest.length) { bestLen = len; best = path; return; }
      for (let k = 0; k < rest.length; k++) perm([...rest.slice(0, k), ...rest.slice(k + 1)], [...path, rest[k]], len + d(path[path.length - 1] ?? 0, rest[k]));
    };
    perm(idx, [], 0);
  } else {
    best = []; let cur = 0, rest = [...idx];
    while (rest.length) { rest.sort((a, b) => d(cur, a) - d(cur, b)); cur = rest.shift(); best.push(cur); }
  }
  return best.map(i => picks[i - 1]);
}
function makeLeg(from, r, rec) {
  const m = app.model, now = app.now, fb = trip.fb;
  const sunMode = !rec.mode.day ? 'none' : rec.mode.key === 'cool' || rec.mode.key === 'cold' ? 'sun' : 'shade';
  const env = { scale: crowdScale(now.dow, now.hour), sunMode, floodPenalty: null };
  // 실시간으로 '약간 붐빔' 이상이면 누구와 왔든 한산한 길을 고릅니다(Lin 2023: 혼잡 인지 → 공간 분산)
  // 그늘 길: 더운 날 + 자외선 높은 날(Patel 2026 CoolPath · Lee & Park 2020 녹지 냉각)
  // 쉼터 간격: 어르신 동행은 100m(팀 기준 REST_STD.care · 좌석 밀도가 1순위라는 Lin 2024 Kano-IPA가 방향 근거)
  const elders = st.company === 'elders';
  const prefs = { shade: rec.mode.key === 'hot' || (rec.mode.key === 'mild' && rec.mode.uvHigh) || !!fb.bump.thermal, rest: elders || !!fb.bump.toilet, restGap: elders ? REST_STD.care.seat : null, nostairs: st.company === 'kids' || elders, quiet: st.company === 'alone' || st.company === 'pet' || !!fb.bump.crowd || (live?.rank ?? 0) >= 2 };
  const route = planRoute(m, from.node, r.place.node, prefs, env, rec.speed);
  const coords = [[from.lat, from.lon], ...(route?.main?.coords ?? []), [r.place.lat, r.place.lon]];
  const meters = (route?.main?.meters ?? 0) + Math.round((from.off ?? 0) + r.place.off);
  // 가장 짧은 길과 견줄 값(햇볕 정보가 있는 구간 기준, 그늘 m)
  const sh = x => x && x.shade != null ? { m: x.shade * x.sunKnown, k: x.sunKnown, len: x.meters } : null;
  const cmp = { main: sh(route?.main), base: sh(route?.base), sunMode, prefs };
  return { r, rec, coords, meters, cmp, walkMin: Math.max(1, Math.round(meters / rec.speed)), gardens: gardensNear(coords, r.place.id), rating: null };
}
/** 머물 시간을 넘지 않게 뒤에서부터 덜어 냅니다(담은 곳은 남기고, 빠진 자리 다음 구간은 다시 이어 그림) */
function fitTime(legs, left) {
  let out = [...legs], cut = 0;
  while (out.length > 1 && sum(out, s => s.walkMin + dwell()) > left + 8) {
    let k = out.length - 1;
    while (k > 0 && st.must.has(out[k].r.place.id)) k--;
    if (k === 0 && st.must.has(out[0].r.place.id)) break;
    out.splice(k, 1); cut++;
    if (k < out.length) {      // 가운데가 빠졌으면 앞 장소에서 다음 장소로 길을 다시 잇습니다
      const from = k ? asFrom(out[k - 1].r.place) : trip.from;
      out[k] = { ...makeLeg(from, out[k].r, out[k].rec), why: out[k].why };
    }
  }
  if (out.length === 1 && left < 8) { out.pop(); cut++; }
  return { legs: out, cut };
}

// ── 정원 ──
function gardenList() {
  const month = app.now.month, today = todayIso(app.now.date);
  const inSeason = g => g.months === 'all' || (Array.isArray(g.months) && g.months.includes(month));
  const fresh = (app.news ?? []).filter(n => n.kind === 'garden' && n.place && (!n.from || n.from <= today) && (!n.to || today <= n.to))
    .map(n => ({ id: n.id, name: n.title, place: n.place, text: n.text, fresh: true, season: true }));
  const items = (app.gardens?.items ?? []).filter(g => g.place).map(g => ({ ...g, season: inSeason(g), next: Array.isArray(g.months) ? (g.months.find(m => m > month) ?? g.months[0]) : null }));
  return [...fresh, ...items].filter(g => app.model.hubById[g.place]);
}
function gardensNear(coords, destId) {
  const out = [];
  for (const g of gardenList()) {
    const hub = app.model.hubById[g.place], ll = L.latLng(hub.lat, hub.lon);
    let best = Infinity, at = 0;
    coords.forEach((c, i) => { const d = ll.distanceTo(c); if (d < best) { best = d; at = i; } });
    if (best <= GARDEN_NEAR || g.place === destId) out.push({ ...g, hub, at, dest: g.place === destId });
  }
  return out;
}
const gardenImg = g => (g.photo ? app.photos?.files?.[g.photo] : null);

async function begin(course = null, avoid = []) {
  layers.route.clearLayers(); layers.plan.clearLayers(); layers.pins.clearLayers(); layers.garden.clearLayers(); layers.shot.clearLayers(); layers.gshot.clearLayers(); layers.prog.clearLayers();
  trip = { id: Date.now().toString(36), stops: [], idx: 0, course: course?.name ?? null, courseObj: course, fb: { liked: [], disliked: [], bump: {} } };
  mount('tr-s-loading', [h('div', { class: 'tr-loading' },
    h('div', { class: 'tr-pulse' }, h('i'), h('i'), h('i')),
    h('b', null, course ? `‘${course.name}’ 코스를 준비하고 있어요` : '지금 내 위치에서 코스를 짜고 있어요'),
    h('ul', { class: 'tr-ticks' }, ['내 위치', '실시간 날씨·붐빔', '이용자 별점', '가는 길의 정원'].map((t, i) => h('li', { style: `--i:${i}` }, h('span', null, icon('check', 11)), t))),
    h('div', { class: 'tr-skel' }, h('i'), h('i'), h('i')))]);
  const t0 = performance.now();
  if (st.startPick === 'auto' || st.startPick === 'me') await waitMe(2500);
  trip.start = resolveStart();
  trip.from = trip.start;
  const n = course ? course.stops.length : Math.max(STOPS_BY_STAY[st.stay] ?? 3, st.must.size);
  let legs = planFrom(trip.start, n, avoid, course?.stops ?? [], [...st.must]);
  if (legs.length < 2 && avoid.length) legs = planFrom(trip.start, n, [], [], [...st.must]);
  legs = fitTime(legs, st.stay).legs;
  await sleep(Math.max(0, T(900) - (performance.now() - t0)));
  if (!legs.length) return renderNone();
  trip.stops = legs;
  setFocus(true);
  drawStart();
  flyBounds(L.latLngBounds(legs.flatMap(s => s.coords)), { ...padding(), maxZoom: 17 }, 1);
  await sleep(T(400));
  drawCourse({ reveal: true });
  renderPlan();
}
/** 갈 곳이 없을 때: 까닭을 한 줄로, 지금 되는 다른 선택을 버튼으로 */
const NONE_WHY = {
  cold: f => `체감 ${Math.round(f)}℃라 밖에 오래 머물기엔 추워요`,
  hours: () => '지금 문을 연 실내 시설이 없어요',
  night: () => '밤이라 야외 자리는 안내하지 않아요',
  weather: () => '날씨가 좋지 않아 야외는 쉬는 게 좋아요',
  flood: () => '큰비로 물이 차는 구역이 있어요',
  crowd: () => '지금은 어디나 붐벼요',
  need: () => '지금 이 목적에 맞는 자리가 없어요',
};
function renderNone() {
  setFocus(false);
  const m = app.model, s = trip.start, h0 = app.wx.hourly[0];
  const run = need => recommend(m, app.wx, app.now, { need, stay: st.stay, company: st.company, slow: false, startNode: s.node, startOff: s.off ?? 0 });
  const rec = run(st.need);
  // 이 목적에 맞는 자리들이 왜 안 되는지(‘목적에 안 맞음’은 다른 까닭이 있으면 뺌)
  const whys = [...new Set(rec.all.filter(r => r.aff >= .4 && r.miss && r.miss !== 'need').map(r => r.miss))];
  const lines = (whys.length ? whys : [rec.mainWhy ?? 'need']).slice(0, 2).map(k => (NONE_WHY[k] ?? NONE_WHY.need)(h0?.feels ?? 0));
  const alts = NEEDS.filter(n => n.key !== st.need && run(n.key).all.some(r => r.tier < 9));
  const q = quietHours(app.wx, app.now), best = q.best[0];
  mount('tr-s-result', [
    tripHead(),
    h('h2', { class: 'tr-q' }, '지금은 갈 만한 곳이 없어요'),
    h('ul', { class: 'tr-none-why' }, lines.map(t => h('li', null, t))),
    alts.length ? h('div', { class: 'tr-sec-head' }, h('b', null, '이건 지금 할 수 있어요')) : null,
    alts.length ? h('div', { class: 'tr-opts' }, alts.map((n, i) => h('button', { type: 'button', class: 'tr-opt tr-glow-on', style: `--i:${i}`, onclick: () => { st.need = n.key; begin(); } },
      h('span', { class: 'tr-opt-ico' }, icon(n.icon, 18)), h('b', null, n.label)))) : null,
    best ? h('div', { class: 'tr-quiet' }, icon('clock', 15), h('span', null, `오기 좋은 때 · ${best.tomorrow ? '내일 ' : ''}${best.from}~${best.to === 0 ? 24 : best.to}시`)) : null,
  ]);
}

/** 코스를 보여 줄 때 공원 바깥을 어둡게 눌러 서울숲만 또렷하게 */
let maskLayer = null;
function setFocus(on) {
  if (!map || !app) return;
  if (!maskLayer) {
    if (!map.getPane('tr-mask')) { const p = map.createPane('tr-mask'); p.style.zIndex = 350; p.style.pointerEvents = 'none'; }
    const holes = [];
    const add = geom => {
      if (!geom) return;
      if (geom.type === 'Polygon') holes.push(geom.coordinates[0].map(([x, y]) => [y, x]));
      else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(pg => holes.push(pg[0].map(([x, y]) => [y, x])));
      else if (geom.type === 'Feature') add(geom.geometry);
      else if (geom.type === 'FeatureCollection') geom.features.forEach(add);
    };
    add(app.model.data.park);
    const world = [[-85, -180], [-85, 180], [85, 180], [85, -180]];
    maskLayer = L.polygon([world, ...holes], { pane: 'tr-mask', interactive: false, stroke: false, fillColor: '#020805', fillOpacity: .78, className: 'tr-mask' }).addTo(map);
  }
  el.map.classList.toggle('tr-focus', on);
}

function drawStart() {
  const s = trip.start;
  if (s.mine) return;       // 내 위치 점이 곧 출발점
  L.marker([s.lat, s.lon], { icon: L.divIcon({ className: '', html: `<div class="tr-start"><i></i><em>출발 · ${esc(s.name)}</em></div>`, iconSize: [14, 14], iconAnchor: [7, 7] }), interactive: false }).addTo(layers.route);
}

// ── 지도에 코스 ──
function pinIcon(s, i, extra = '') {
  const state = i < trip.idx ? (s.rating != null ? 'done' : 'passed') : i === trip.idx ? 'next' : 'up';
  const low = s.rating != null && s.rating <= 2 ? ' low' : '';
  const tag = s.rating != null ? `<u>${s.rating >= 4 ? '좋아요' : s.rating === 3 ? '보통' : '별로'}</u>` : '';
  return L.divIcon({ className: '', html: `<div class="tr-pin ${state}${low} ${extra}" style="--d:${i * 110}ms"><span>${i + 1}</span><em>${esc(s.r.place.name)}${tag}</em></div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
}
function drawCourse({ reveal = false, changed = new Set() } = {}) {
  layers.plan.clearLayers(); layers.pins.clearLayers(); layers.garden.clearLayers();
  const shown = new Set();
  trip.stops.forEach((s, i) => {
    if (i >= trip.idx && !s.walking && !s.walked) {
      const glow = L.polyline(s.coords, { interactive: false, className: 'tr-plan-glow', color: MINT, weight: 10, opacity: i === trip.idx ? .2 : .1, lineCap: 'round', lineJoin: 'round' }).addTo(layers.plan);
      const dash = L.polyline(s.coords, { interactive: false, className: `tr-plan${i === trip.idx ? ' next' : ''}`, color: '#d8ffea', weight: i === trip.idx ? 2.6 : 2, opacity: i === trip.idx ? .95 : .55, dashArray: '1 9', lineCap: 'round' }).addTo(layers.plan);
      if (reveal) { drawIn(glow, i * 200, 500); dash.getElement()?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: i * 200 + 300, fill: 'backwards' }); }
    }
    L.marker([s.r.place.lat, s.r.place.lon], { icon: pinIcon(s, i, changed.has(s.r.place.id) ? 'changed' : ''), zIndexOffset: 800 - i }).addTo(layers.pins).on('click', () => showShot(s, i));
    if (i >= trip.idx) for (const g of s.gardens) {
      if (shown.has(g.id)) continue; shown.add(g.id);
      L.marker([g.hub.lat, g.hub.lon], { icon: L.divIcon({ className: '', html: `<div class="tr-flower${g.season ? '' : ' off'}" style="--d:${(reveal ? i * 200 + 400 : 0)}ms">${icon('leaf', 13).outerHTML}<em>${esc(g.name)}${g.season ? '' : ` · ${g.next}월`}</em></div>`, iconSize: [26, 26], iconAnchor: [13, 13] }), zIndexOffset: 600 })
        .addTo(layers.garden).on('click', () => gardenShot(g));
    }
  });
}

// ── 패널: 추천 코스 ──
function photoOf(id) {
  const P = app.photos, key = P?.places?.[id];
  return key ? P.files[key] : null;
}
function tripHead() {
  return h('div', { class: 'tr-panel-head' }, h('div', { class: 'tr-picked' }, labels().map(p => h('span', null, p))), h('button', { type: 'button', class: 'tr-back', onclick: restart }, '처음부터'));
}
function startRow() {
  const s = trip.start, gates = app.model.gates;
  const opts = [{ key: 'me', label: '내 위치', on: !!s.mine, dis: !me.pos }, ...gates.map(g => ({ key: g.id, label: g.name.replace(/ 입구$/, ''), on: s.gate === g.id }))];
  const box = h('div', { class: 'tr-start-opts', role: 'group', 'aria-label': '출발지 바꾸기', hidden: true }, opts.map(o => h('button', { type: 'button', class: o.on ? 'on' : '', disabled: o.dis, title: o.dis ? '위치를 쓸 수 없어요' : null, onclick: () => { st.startPick = o.key; begin(trip.courseObj); } }, o.key === 'me' ? icon('target', 11) : null, o.label)));
  return h('div', { class: 'tr-startrow' },
    h('div', { class: 'tr-start-h' }, h('span', { class: `tr-start-ico${s.mine ? ' me' : ''}` }, icon(s.mine ? 'target' : 'pin', 13)),
      h('div', null, h('small', null, '출발'), h('b', null, s.name)),
      h('button', { type: 'button', class: 'tr-mini', onclick: () => { box.hidden = !box.hidden; } }, '바꾸기')),
    box);
}
function renderPlan() {
  const legs = trip.stops, walk = sum(legs, s => s.walkMin), total = walk + dwell() * legs.length;
  mount('tr-s-result', [
    tripHead(),
    h('h2', { class: 'tr-q' }, trip.course ? trip.course : `${legs.length}곳을 걷는 코스`),
    h('div', { class: 'tr-stats' },
      h('div', null, h('b', null, walk, h('small', null, '분')), h('span', null, '걷기')),
      h('div', null, h('b', null, ...meterParts(sum(legs, s => s.meters))), h('span', null, '거리')),
      h('div', null, h('b', null, total, h('small', null, '분')), h('span', null, '머무는 시간 포함'))),
    planNotes(legs),
    startRow(),
    h('ol', { class: 'tr-tl' }, legs.map((s, i) => tlItem(s, i))),
    // 컨셉: 한 곳씩 들러 보고 → 좋으면 그대로, 별로면 바로 다른 곳으로
    h('div', { class: 'tr-howto' }, h('b', null, '한 곳씩 들러 보고, 표정 하나만 눌러 주세요'),
      h('div', { class: 'tr-howto-row' },
        h('span', null, staticFace(5, 22), h('em', null, '좋으면 그대로')),
        h('span', null, staticFace(1, 22), h('em', null, '별로면 바로 다른 곳으로')))),
    h('div', { class: 'tr-actions' },
      h('button', { type: 'button', class: 'tr-cta tr-glow-on', onclick: startLeg }, '출발', h('span', { class: 'tr-cta-arrow' }, '→')),
      h('button', { type: 'button', class: 'tr-ghost', onclick: () => begin(null, legs.map(s => s.r.place.id).filter(id => !st.must.has(id))) }, '다른 코스')),
    programTip(),
  ]);
}
/** 이 코스를 왜 이렇게 짰는지 — 많아야 두 줄. 근거 논문은 README '근거 논문' */
function planNotes(legs) {
  const mode = legs[0]?.rec?.mode, notes = [];
  // 미세먼지 나쁨(PM2.5 ≥36·PM10 ≥81 = 환경부 '나쁨' 등급). Shin 2022: 경보 때 야외 방문↓·실내 시설 방문↑ → 실내 위주 안내
  if (mode?.key === 'dust') notes.push(['alert', '미세먼지 나쁨 · 실내 시설 위주로 골랐어요']);
  // 그늘/볕: 가장 짧은 길과 견줌(Patel 2026 CoolPath)
  const agg = k => legs.reduce((a, s) => { const c = s.cmp?.[k]; if (c) { a.m += c.m; a.k += c.k; a.len += c.len; } return a; }, { m: 0, k: 0, len: 0 });
  const M = agg('main'), B = agg('base');
  if (M.k > 50 && B.k > 50 && legs.some(s => s.cmp?.prefs?.shade || s.cmp?.sunMode === 'sun')) {
    const sun = legs[0].cmp.sunMode === 'sun';
    const pm = Math.round(100 * M.m / M.k), pb = Math.round(100 * B.m / B.k);
    const v = sun ? 100 - pm : pm, gain = sun ? pb - pm : pm - pb, extra = Math.max(0, Math.round(M.len - B.len));
    if (gain >= 3) notes.push([sun ? 'sun' : 'tree', `${sun ? '볕 드는' : '그늘진'} 길 ${v}% · 가장 짧은 길보다 +${gain}%p${extra >= 20 ? ` (${extra}m 더)` : ''}`]);
    else if (!sun && v >= 50) notes.push(['tree', `그늘진 길 ${v}%`]);
  }
  // 붐빔: 한산한 길(공간) + 덜 붐비는 때(시간) — Lin 2023 혼잡 대응
  // 붐빔·동선은 서울숲의 오래된 약점: 2007 설문에서 '동선 및 밀도' 요인이 12개 공원 중 최저(주신하 2008, 서울숲 n=48)
  if ((live?.rank ?? 0) >= 2 || legs.some(s => s.cmp?.prefs?.quiet && s.r.reasons?.crowd?.tone === 'bad')) {
    const best = quietHours(app.wx, app.now).best[0];
    notes.push(['users', `${live?.level ? `지금 ${live.level} · ` : ''}한산한 길로 골랐어요${best ? ` · 덜 붐비는 때 ${best.tomorrow ? '내일 ' : ''}${best.from}~${best.to === 0 ? 24 : best.to}시` : ''}`]);
  }
  if (legs.some(s => s.cmp?.prefs?.restGap)) notes.push(['bench', '어르신과 함께 · 100m마다 쉴 곳이 있게 이었어요']);
  // 자전거와 길을 같이 씀: 서울숲엔 자전거 전용길이 없고 자전거를 포장길로 안내하지만 실제론 섞여 다님(송민아·윤희재 2023)
  // 공원 산책로도 「보행안전 및 편의증진에 관한 법률」의 '보행자길'(§2 1호 마목)이고, 그 길에서 차마는 보행자를 방해하면 안 되며 걸음 속도로 다녀야 함(§22①③),
  // 노인·어린이가 차별 없이 안전하게 다니도록 할 의무(§4②) → 아이·어르신 동행 때 안내
  if (st.company === 'kids' || st.company === 'elders') notes.push(['alert', '자전거 전용길이 없어요 · 포장길에선 자전거를 살펴 주세요']);
  // 도시공원법 제49조: 반려동물 배설물 방치 금지(①4), 조례로 정한 공원은 목줄 없이 입장 금지(②2)
  if (st.company === 'pet') notes.push(['alert', '반려견은 목줄을 하고, 배설물은 꼭 치워 주세요']);
  return notes.length ? h('ul', { class: 'tr-notes' }, notes.slice(0, 3).map(([ic, t]) => h('li', null, icon(ic, 13), h('span', null, t)))) : null;
}
function tlItem(s, i, opt = {}) {
  const p = s.r, ph = photoOf(p.place.id);
  return h('li', { class: `tr-tl-i${opt.cls ? ` ${opt.cls}` : ''}`, style: `--i:${i}` },
    h('span', { class: 'tr-tl-dot' }, i + 1),
    h('button', { type: 'button', class: 'tr-tl-card tr-glow-on', onclick: () => showShot(s, i) },
      ph ? h('img', { src: ph.src, alt: '', loading: 'lazy' }) : h('span', { class: 'tr-tl-noimg' }, icon(p.place.type === 'indoor' ? 'home' : 'tree', 16)),
      h('div', null,
        h('b', null, p.place.name, opt.badge ? h('em', null, opt.badge) : null),
        h('div', { class: 'tr-tl-meta' },
          h('span', null, icon('walk', 11), `${s.walkMin}분`),
          h('span', { class: `t-${p.reasons.crowd.tone}` }, p.reasons.crowd.value)))));
}
const meterParts = m => m >= 1000 ? [(m / 1000).toFixed(1), h('small', null, 'km')] : [Math.round(m), h('small', null, 'm')];

// ── 4. 내비게이션: 내 위치 점이 길을 따라가고, 지나온 길은 연해집니다 ──
let earlyFinish = false;
const finishLeg = () => { if (nav) nav.finish(); else earlyFinish = true; };
async function startLeg() {
  const s = trip.stops[trip.idx];
  if (!s) return renderEnd();
  layers.shot.clearLayers(); layers.gshot.clearLayers();
  s.walking = true;
  for (const v of visited()) v.layer?.eachLayer(l => l.setStyle?.({ opacity: l.options.className === 'tr-passed' ? .22 : .12 }));
  drawCourse();
  const live = !!me.pos && Date.now() - me.pos.at < 90000 && L.latLng(me.pos.lat, me.pos.lon).distanceTo(s.coords[0]) < NEAR_START + 30;
  earlyFinish = false;
  renderGoing(s, live);
  await flyBounds(L.latLngBounds(s.coords), { ...padding(), maxZoom: 17.4 }, .8);
  s.layer = L.layerGroup().addTo(layers.route);
  nav = makeNav(s, live);
  if (earlyFinish) nav.finish();   // 지도가 움직이는 사이에 '도착' 단추를 눌렀으면 바로 도착
  await nav.done;
  nav = null;
  s.walking = false; s.walked = true;
  drawCourse();
  await showShot(s, trip.idx);
  renderArrived(s);
}
/** 점 p를 경로 위에 내렸을 때 출발점에서 얼마나 왔는지(m)와 경로에서 떨어진 거리 */
function project(coords, cum, p) {
  const k = Math.cos(p[0] * Math.PI / 180) * 111320, M = 110540;
  let best = { d: 0, off: Infinity };
  for (let i = 1; i < coords.length; i++) {
    const ax = coords[i - 1][1] * k, ay = coords[i - 1][0] * M, bx = coords[i][1] * k, by = coords[i][0] * M, px = p[1] * k, py = p[0] * M;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const off = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (off < best.off) best = { d: cum[i - 1] + t * (cum[i] - cum[i - 1]), off };
  }
  return best;
}
function makeNav(s, live) {
  const coords = s.coords, cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + map.distance(coords[i - 1], coords[i]));
  const total = cum[cum.length - 1] || 1;
  const passed = L.polyline([coords[0]], { interactive: false, className: 'tr-passed', color: '#a9c4b6', weight: 4, opacity: .38, lineCap: 'round', lineJoin: 'round' }).addTo(s.layer);
  const glow = L.polyline(coords, { interactive: false, className: 'tr-glow', color: MINT, weight: 14, opacity: .22, lineCap: 'round', lineJoin: 'round' }).addTo(s.layer);
  const line = L.polyline(coords, { interactive: false, className: 'tr-line', color: '#c8ffe0', weight: 4.4, opacity: 1, lineCap: 'round', lineJoin: 'round' }).addTo(s.layer);
  drawIn(glow, 0, 520); drawIn(line, 0, 520);
  const dot = live ? null : L.marker(coords[0], { icon: meIcon('sim'), interactive: false, zIndexOffset: 1300 }).addTo(s.layer);
  const pending = s.gardens.filter(g => !g.dest).map(g => ({ ...g, d: cum[g.at] })).sort((a, b) => a.d - b.d);
  let resolve, finished = false, last = 0, raf = 0;
  const done = new Promise(r => { resolve = r; });
  const set = d => {
    if (finished) return;
    d = Math.max(last, Math.min(total, d)); last = d;
    let j = 1; while (j < cum.length - 1 && cum[j] < d) j++;
    const a = coords[j - 1], b = coords[j], f = cum[j] === cum[j - 1] ? 1 : (d - cum[j - 1]) / (cum[j] - cum[j - 1]);
    const tip = [a[0] + (b[0] - a[0]) * Math.min(1, f), a[1] + (b[1] - a[1]) * Math.min(1, f)];
    passed.setLatLngs([...coords.slice(0, j), tip]);
    const rest = [tip, ...coords.slice(j)];
    line.setLatLngs(rest); glow.setLatLngs(rest);
    dot?.setLatLng(tip);
    while (pending.length && d >= pending[0].d - 60) gardenPass(pending.shift());
    navHud(total - d, s);
    if (d >= total - .5) { finished = true; cancelAnimationFrame(raf); dot?.remove(); resolve(); }
  };
  const api = { done, live, finish: () => set(total) };
  if (live) {
    api.onPos = () => {
      const p = [me.pos.lat, me.pos.lon];
      if (L.latLng(p).distanceTo(coords[coords.length - 1]) < ARRIVE_M) return set(total);
      const pr = project(coords, cum, p);
      if (pr.off < 60) set(pr.d);
    };
    api.onPos();
  } else {
    // 미리보기(공원 밖·위치 없음): 점이 길을 따라 걷는 재생은 느리고 쓸모가 없어서 뺌.
    // 길만 그려 두고, 이용자가 '도착 화면 보기'를 누르면 바로 도착으로 넘어감(지나는 정원 알림은 생략)
    dot?.remove();
    api.finish = () => { pending.length = 0; set(total); };
  }
  return api;
}
let hud = null;
function navHud(rem, s) {
  if (!hud) return;
  hud.dist.textContent = rem >= 1000 ? `${(rem / 1000).toFixed(1)}km` : `${Math.max(0, Math.round(rem / 5) * 5)}m`;
  hud.min.textContent = `약 ${Math.max(1, Math.round(rem / s.rec.speed))}분`;
  hud.bar.style.transform = `scaleX(${1 - rem / Math.max(1, s.meters)})`;
}
/** 정원 가까이를 지날 때: 지도 위에 사진 카드 + 알림 */
function gardenPass(g) {
  gardenShot(g, true);
  const ph = gardenImg(g);
  toast({ cls: 'garden', img: ph?.src, small: g.season ? '가는 길에 정원이 있어요' : `${g.next}월에 볼 수 있는 정원`, title: g.name }, 3600);
}
function gardenShot(g, auto = false) {
  layers.gshot.clearLayers();
  const ph = gardenImg(g);
  const img = ph ? `<img src="${esc(ph.src)}" alt="${esc(ph.caption ?? g.name)}">` : `<div class="tr-gshot-none">${icon('leaf', 30).outerHTML}<span>${esc(g.name)}</span></div>`;
  const tag = g.season ? (g.fresh ? '새 소식' : '지금 볼 수 있어요') : `${g.next}월에 피어요`;
  const credit = ph ? `<small>${esc(ph.credit)} · ${esc(ph.license)}</small>` : '';
  const m = L.marker([g.hub.lat, g.hub.lon], { icon: L.divIcon({ className: '', html: `<div class="tr-gshot${g.season ? '' : ' off'}">${img}<div class="tr-gshot-cap"><em>${esc(tag)}</em><b>${esc(g.name)}</b><p>${esc(g.text?.length > 60 ? `${g.text.slice(0, 60)}…` : g.text ?? '')}</p></div>${credit}</div>`, iconSize: [230, 0], iconAnchor: [115, 26] }), interactive: false, zIndexOffset: 1100 }).addTo(layers.gshot);
  if (!auto) flyToVisible([g.hub.lat, g.hub.lon], 17.3, .8, desk() ? 120 : 130);
  setTimeout(() => { const n = m.getElement()?.firstChild; if (n) { n.classList.add('bye'); setTimeout(() => layers.gshot.removeLayer(m), 500); } }, auto ? 4200 : 7000);
  layers.garden.eachLayer(x => { const n = x.getElement?.()?.firstChild; if (n && x.getLatLng().equals([g.hub.lat, g.hub.lon])) { n.classList.remove('ping'); void n.offsetWidth; n.classList.add('ping'); } });
}

async function showShot(s, i) {
  const p = s.r.place, ph = photoOf(p.id);
  layers.shot.clearLayers();
  await flyToVisible([p.lat, p.lon], 17.8, .75, desk() ? 110 : 120);
  const img = ph ? `<img src="${esc(ph.src)}" alt="${esc(ph.caption)}">` : `<div class="tr-shot-none">${icon(p.type === 'indoor' ? 'home' : 'tree', 28).outerHTML}</div>`;
  const credit = ph ? `<small>${esc(ph.credit)} · ${esc(ph.license)}</small>` : '';
  L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', html: `<div class="tr-shot">${img}<div class="tr-shot-cap"><span>${i + 1}</span><b>${esc(p.name)}</b></div>${credit}</div>`, iconSize: [240, 0], iconAnchor: [120, 30] }), interactive: false, zIndexOffset: 1000 }).addTo(layers.shot);
  await sleep(T(300));
}

function progress() {
  return h('div', { class: 'tr-prog', 'aria-label': `${trip.idx + 1}/${trip.stops.length}번째 장소` },
    trip.stops.map((s, i) => h('i', { class: i < trip.idx ? (s.rating != null && s.rating <= 2 ? 'done low' : 'done') : i === trip.idx ? 'on' : '' })));
}
function renderGoing(s, live) {
  const p = s.r;
  const dist = h('b', null, fmtM(s.meters)), min = h('span', null, `약 ${s.walkMin}분`), bar = h('i');
  hud = { dist, min, bar };
  mount('tr-s-result', [
    tripHead(), progress(),
    h('div', { class: 'tr-navcard' },
      h('div', { class: 'tr-nav-top' }, h('span', { class: `tr-nav-mode${live ? ' live' : ''}` }, h('i'), live ? '실시간 내 위치' : '미리보기'), h('small', null, `${trip.idx + 1} / ${trip.stops.length}`)),
      h('div', { class: 'tr-nav-main' }, dist, h('div', null, h('strong', null, p.place.name), min)),
      h('div', { class: 'tr-nav-bar' }, bar)),
    s.why ? h('div', { class: 'tr-why-next' }, icon('spark', 13), s.why) : null,
    live ? null : h('small', { class: 'tr-rate-why' }, '지도의 이 길로 가요. 공원에서 걸으면 내 위치를 따라 저절로 도착 화면이 떠요'),
    h('div', { class: 'tr-actions' }, live
      ? h('button', { type: 'button', class: 'tr-ghost', onclick: finishLeg }, '도착했어요')
      : h('button', { type: 'button', class: 'tr-cta tr-glow-on', onclick: finishLeg }, '도착 화면 보기', h('span', { class: 'tr-cta-arrow' }, '→'))),
  ]);
}

// ── 5. 도착: 그 자리에서 별점 → 바로 다음 곳 ──
function renderArrived(s) {
  hud = null;
  const p = s.r.place, last = trip.idx === trip.stops.length - 1;
  let val = 0, timer = 0, noteOpen = false;
  const tags = new Set();
  const word = h('span', { class: 'rv-word' }, '표정을 눌러 주세요');
  const tagBox = h('div', { class: 'tr-tagbox' });
  const note = h('textarea', { class: 'tr-text', rows: 3, maxlength: 300, placeholder: '예) 그늘이 부족했어요, 벤치가 더 있으면 좋겠어요', 'aria-label': '하고 싶은 말' });
  const count = h('small', { class: 'tr-count' }, '0 / 300');
  const cue = h('div', { class: 'tr-cue' });
  const noteWrap = h('label', { class: 'tr-textwrap' }, note, h('div', { class: 'tr-textfoot' }, cue, count));
  const noteBox = h('div', { class: 'tr-notebox' }, noteWrap);
  const label = h('span', null, last ? '평가 없이 마치기' : '평가 없이 다음 곳');
  const next = h('button', { type: 'button', class: 'tr-cta tr-glow-on', onclick: () => advance(s, val, [...tags], note.value.trim()) }, label, h('span', { class: 'tr-cta-arrow' }, '→'));
  const stop = () => { clearTimeout(timer); next.classList.remove('counting'); };
  const countdown = ms => {
    stop();
    if (noteOpen) return;
    void next.offsetWidth; next.style.setProperty('--t', `${ms}ms`); next.classList.add('counting');
    timer = setTimeout(() => next.click(), ms);
  };
  note.addEventListener('focus', stop);
  note.addEventListener('input', () => {
    count.textContent = `${note.value.length} / 300`;
    const found = readCues(note.value);
    cue.replaceChildren(...(found.length ? [h('span', null, icon('spark', 11), '의견에서 읽었어요'), ...found.map(c => h('b', null, c.label))] : []));
  });
  const more = h('button', { type: 'button', class: 'tr-more', onclick: () => { noteOpen = !noteOpen; noteBox.classList.toggle('open', noteOpen); more.classList.toggle('on', noteOpen); stop(); if (noteOpen) setTimeout(() => note.focus(), 250); } }, icon('chat', 13), '의견 더 남기기');
  const paintTags = v => {
    const good = v >= 4, list = good ? GOOD : BAD;
    tags.clear();
    tagBox.replaceChildren(h('div', { class: 'rv-chips' }, list.map((x, i) => h('button', { type: 'button', class: `rv-chip ${good ? 'good' : 'bad'}`, style: `--i:${i}`, 'aria-pressed': 'false', onclick: e => {
      const b = e.currentTarget, on = !tags.has(x.key);
      on ? tags.add(x.key) : tags.delete(x.key);
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
      countdown(1800);
    } }, x.label))));
  };
  // 표정 하나만 누르면 끝(1초 평가). 😊·😐는 잠깐 뒤 저절로 다음 곳, 😞는 까닭(붐빔·더위·쉴 곳…)을 고를 때까지 기다림
  const pick = faces(v => {
    const flip = !val || (val >= 4) !== (v >= 4);
    val = v;
    word.textContent = FACE_WORD[v]; word.classList.add('on'); word.dataset.f = v >= 4 ? 'good' : v === 3 ? 'mid' : 'bad';
    if (flip) paintTags(v);
    form.classList.add('open');
    label.textContent = last ? '보내고 마치기' : '보내고 다음 곳으로';
    if (v >= 4) countdown(2200); else if (v === 3) countdown(3500); else stop();
  }, `${p.name} 쾌적함`);
  const form = h('div', { class: 'tr-form' }, h('div', { class: 'tr-form-in' }, tagBox, h('div', { class: 'tr-form-row' }, more), noteBox));
  const rt = rtOf(p.id);
  mount('tr-s-result tr-s-ask', [
    tripHead(), progress(),
    h('h2', { class: 'tr-q' }, p.name, rt && rt.count >= 2 ? h('small', { class: 'tr-q-sub' }, `좋아요 ${Math.round((rt.good ?? 0) / rt.count * 100)}%`) : null),
    h('div', { class: 'tr-rate' }, h('div', { class: 'tr-rate-h' }, h('b', null, '이 자리, 쾌적한가요?'), word), pick,
      h('small', { class: 'tr-rate-why' }, '좋으면 그대로 가고, 별로면 남은 코스를 바로 바꿔요'),
      h('small', { class: 'tr-rate-why anon' }, '표정은 이름·위치 없이 공원 개선 통계에만 쓰여요'), form),
    h('div', { class: 'tr-actions' }, next, h('button', { type: 'button', class: 'tr-ghost small', onclick: () => { stop(); advance(s, 0, [], '', true); } }, '건너뛰기')),
    h('button', { type: 'button', class: 'tr-endlink', onclick: () => {
      stop();
      if (val) Object.assign(s, { rating: val, tags: [...tags], comment: note.value.trim() });
      s.done = true; trip.idx++;
      if (val) { save(); if (!app.wx.scenario) { const h0 = app.wx.hourly[0]; sendComfort({ place: p.id, face: val, reasons: [...tags], feels: h0?.feels, pm25: h0?.pm25, crowd: live?.rank, company: st.company }); } }
      renderEnd();
    } }, '여기서 산책 마치기'),
  ]);
}
const readCues = text => { const seen = new Set(); return CUES.filter(c => c.re.test(text ?? '') && !seen.has(c.label) && seen.add(c.label)); };

function save() {
  const h0 = app.wx.hourly[0];
  upsertJourney({
    id: trip.id, at: new Date().toISOString(), need: st.need, company: st.company, stay: st.stay, gate: trip.start.name, course: trip.course,
    feels: h0?.feels ?? null, minutes: sum(visited(), s => s.walkMin), meters: sum(visited(), s => s.meters),
    stops: rated().map(s => ({ id: s.r.place.id, rating: s.rating, reason: (s.tags ?? []).find(t => BAD.some(b => b.key === t)) ?? null, tags: s.tags ?? [], comment: s.comment || null, why: s.why ?? null })),
    skipped: visited().filter(s => s.skipped).map(s => s.r.place.id),
  });
  RT = null;
}

/** 의견을 얹어 남은 코스를 고치고, 바뀐 점은 알림으로 짧게 알린 뒤 바로 다음 곳으로 */
async function advance(s, v, tags, comment, skipped = false) {
  if (s.done) return;
  s.done = true;
  const p = s.r.place, fb = trip.fb;
  const bad = BAD.filter(b => tags.includes(b.key)), cues = readCues(comment);
  if (v) Object.assign(s, { rating: v, tags, comment });
  if (skipped) { s.skipped = true; fb.disliked.push({ place: p, k: 22 }); }
  if (v >= 4) fb.liked.push(p);
  for (const b of bad) for (const [k, n] of Object.entries(b.bump ?? {})) fb.bump[k] = (fb.bump[k] ?? 0) + n;
  for (const c of cues) fb.bump[c.bump] = (fb.bump[c.bump] ?? 0) + 20;
  if (bad.some(b => b.key === 'boring')) fb.identity = true;   // '볼 게 별로' → 서울숲다운 곳(장소정체성 높은 곳)을 조금 앞으로
  if (v && (v <= 2 || bad.some(b => b.away))) fb.disliked.push({ place: p, k: bad.find(b => b.away)?.away ?? 22 });
  else if (v === 3) fb.disliked.push({ place: p, k: 12 });   // 3점은 약하게 멀리
  trip.from = asFrom(p); trip.idx++;
  save();
  if (v && !skipped && !app.wx.scenario) {   // 시연 날씨일 땐 보내지 않음
    const h0 = app.wx.hourly[0];
    sendComfort({ place: p.id, face: v, reasons: tags, feels: h0?.feels, pm25: h0?.pm25, crowd: live?.rank, company: st.company });
  }
  const old = ahead();
  if (!old.length) return renderEnd();
  // 별 3개 이하는 아쉬움 신호로 봅니다(이주경·손용훈 2021: 서울숲 리뷰 중 3점 이하는 대부분 부정 내용)
  const replan = skipped || (v && v <= 3) || cues.length > 0;
  const seen = trip.stops.slice(0, trip.idx).map(x => x.r.place.id);
  let next = replan ? planFrom(trip.from, old.length, seen, [], [...st.must]) : old;
  if (!next.length) next = old;
  const fit = fitTime(next, st.stay - usedMin());
  next = fit.legs;
  const changed = [];
  next.forEach((n, i) => { if (old[i]?.r.place.id !== n.r.place.id) changed.push({ from: old[i]?.r.place.name, to: n.r.place.name, n: trip.idx + i + 1, id: n.r.place.id }); });
  const why = skipped ? '방금 곳과 다른 분위기로 골랐어요'
    : bad.length ? `${bad[0].said}고 하셔서 ${bad[0].why}${josa(bad[0].why, '으로', '로')} 골랐어요`
    : cues.length ? `남겨 주신 의견(${cues.map(c => c.label).join('·')})을 반영했어요`
    : v && v <= 3 ? '아쉬웠다고 하셔서 다른 느낌의 곳으로 골랐어요'
    : v >= 4 ? `${p.name}${josa(p.name, '이', '가')} 좋았다고 하셔서 비슷한 느낌으로 이어 가요` : null;
  if (next[0]) next[0].why = changed.length || v >= 4 || skipped ? why : null;
  trip.stops = [...trip.stops.slice(0, trip.idx), ...next];
  if (!next.length) return renderEnd();
  if (changed.length) toast({ cls: 'fb', ico: 'route', small: '의견 반영 · 남은 코스를 바꿨어요', title: changed.map(c => `${c.n}번 ${c.from ?? ''} → ${c.to}`).join(', '), text: fit.cut ? `시간이 빠듯해서 마지막 ${fit.cut}곳은 뺐어요.` : why }, 4600);
  else if (v) toast({ cls: 'fb ok', ico: 'check', small: `${FACE_WORD[v] ?? ''} · 고마워요`, title: replan ? '다시 따져 봤는데 지금 코스가 가장 잘 맞아요' : v >= 4 ? '좋았다니 다행이에요! 그대로 이어 가요' : '의견 고마워요. 그대로 이어 가요', text: fit.cut ? `시간이 빠듯해서 마지막 ${fit.cut}곳은 뺐어요.` : null }, 3000);
  drawCourse({ changed: new Set(changed.map(c => c.id)) });
  startLeg();
}

// ── 6. 오늘의 산책 ──
function renderEnd() {
  if (!trip) return restart();
  hud = null;
  layers.plan.clearLayers(); layers.shot.clearLayers(); layers.gshot.clearLayers();
  trip.stops = visited();
  trip.idx = trip.stops.length;
  drawCourse();
  layers.garden.clearLayers();
  for (const s of trip.stops) s.layer?.eachLayer(l => l.setStyle?.({ opacity: l.options.className === 'tr-glow' ? .18 : 1 }));
  const done = rated();
  if (done.length) save();
  const all = trip.stops.flatMap(s => s.coords);
  if (all.length) {
    flyBounds(L.latLngBounds(all), { ...padding(), maxZoom: 17 }, 1);
    L.polyline(all, { interactive: false, className: 'tr-ants', color: '#c8ffe0', weight: 2.4, opacity: .8, dashArray: '1 9', lineCap: 'round' }).addTo(layers.route);
  }
  const walkMin = sum(trip.stops, s => s.walkMin), meters = sum(trip.stops, s => s.meters);
  const q = quietHours(app.wx, app.now), best = q.best[0];
  const span = b => `${b.tomorrow ? '내일 ' : ''}${b.from}~${b.to === 0 ? 24 : b.to}시`;
  setFocus(trip.stops.length > 0);
  mount('tr-s-result', [
    tripHead(),
    h('h2', { class: 'tr-q' }, done.length ? `${done.length}곳을 걸었어요` : '산책을 마쳤어요'),
    trip.stops.length ? h('div', { class: 'tr-stats' },
      h('div', null, h('b', null, countUp(walkMin), h('small', null, '분')), h('span', null, '걸은 시간')),
      h('div', null, h('b', null, ...meterParts(meters)), h('span', null, '걸은 거리')),
      h('div', null, h('b', null, done.length ? countUp(done.filter(s => s.rating >= 4).length) : '–', h('small', null, done.length ? `/${done.length}곳` : '')), h('span', null, '좋았던 곳'))) : null,
    done.length ? h('ol', { class: 'tr-journey' }, done.map((s, i) => h('li', { class: s.rating <= 2 ? 'low' : '', style: `--i:${i}` },
      h('span', { class: 'tr-num' }, trip.stops.indexOf(s) + 1),
      h('div', null,
        h('b', null, s.r.place.name),
        (s.tags ?? []).length ? h('div', { class: 'tr-jtags' }, s.tags.map(t => h('span', { class: BAD.some(b => b.key === t) ? 'bad' : '' }, TAG_LABEL[t]))) : null,
        s.comment ? h('q', null, s.comment) : null,
        s.why ? h('small', null, s.why) : null),
      h('div', { class: 'tr-journey-r' }, staticFace(s.rating, 22))))) : null,
    q.now?.good || best ? h('div', { class: `tr-quiet${q.now?.good ? ' good' : ''}` }, icon('clock', 15), h('span', null, q.now?.good ? '지금이 한산하고 날씨 좋은 때예요' : `다음에 오기 좋은 때 · ${span(best)}`)) : null,
    h('div', { class: 'tr-actions' },
      h('button', { type: 'button', class: 'tr-cta tr-glow-on', onclick: restart }, '새 코스 찾기', h('span', { class: 'tr-cta-arrow' }, '→')),
      h('a', { class: 'tr-ghost', href: `./?need=${st.need}&company=${st.company}&stay=${st.stay}#citizen` }, '자세히 보기')),
    h('p', { class: 'tr-foot' }, `붐빔은 요일·시간대 추정값, 날씨는 ${app.wx.live ? '실시간 예보' : '표본 날씨'}예요.${hasSeed() ? ' 좋아요 비율에 시연용 가상 평가 포함.' : ''} 사진: 위키미디어 공용`),
  ]);
}
function countUp(v, digits = 0) {
  const n = h('span', { class: 'tr-countup' }, (0).toFixed(digits));
  if (v == null) { n.textContent = '–'; return n; }
  if (reduce) { n.textContent = v.toFixed(digits); return n; }
  const t0 = performance.now() + 250, dur = 900;
  const f = t => { const k = Math.max(0, Math.min(1, (t - t0) / dur)), e = 1 - Math.pow(1 - k, 3); n.textContent = (v * e).toFixed(digits); if (k < 1) requestAnimationFrame(f); };
  requestAnimationFrame(f);
  return n;
}

function restart() {
  layers.route.clearLayers(); layers.plan.clearLayers(); layers.pins.clearLayers(); layers.garden.clearLayers(); layers.shot.clearLayers(); layers.gshot.clearLayers();
  trip = null; hud = null;
  Object.assign(st, { need: null, company: null, stay: null, startPick: 'auto' });
  st.must.clear();
  flyBounds(app.model.parkBounds, padding(), 1);
  go(1);
}

// ── 시작 ──
async function boot() {
  renderTop(); makeMap(); renderIntro();
  refreshLive(); setInterval(refreshLive, 5 * 60 * 1000);      // 서울시 자료가 5분마다 바뀜
  const t0 = performance.now();
  const loadJson = path => fetch(new URL(path, location.href), { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
  try {
    const wxLive = fetchWeather().catch(() => null);
    const [data, raw, photos, gardens, seed] = await Promise.all([loadData(loadJson), Promise.race([wxLive, sleep(1500).then(() => null)]),
      loadJson('./data/photos.json').catch(() => null), loadJson('./data/gardens.json').catch(() => null), loadJson('./data/ratings_seed.json').catch(() => null)]);
    const now = seoulNow();
    const model = buildModel(data, []);
    model.parkBounds = L.geoJSON(data.park).getBounds();
    if (seed?.journeys) seed.journeys.forEach(j => { j.seed = true; });
    // 시연용: tour.html?wx=heat|dust|rain|cold 이면 그 날씨로 고정
    const demo = ['heat', 'dust', 'rain', 'cold'].find(k => k === new URLSearchParams(location.search).get('wx'));
    const wxOf = w => annotate(demo ? applyScenario(w, demo) : w, now);
    app = { data, model, now, wx: wxOf(raw ?? sampleWeather()), photos, gardens, seed, news: loadNews(store) };
    if (!raw) wxLive.then(w => { if (w) { app.wx = wxOf(w); paintWeather(); } });
    // 서울숲 프로그램: 실시간(중계 서버) → 못 받으면 저장본(data/programs.json)
    fetchPrograms().then(d => d ?? loadJson('./data/programs.json').catch(() => null)).then(d => { if (d?.items?.length) { app.programs = d; paintPrograms(); } });
  } catch (err) {
    renderIntro(err.message);
    return;
  }
  // 이미 위치 권한을 준 기기면 바로 내 위치를 띄웁니다(묻는 창은 띄우지 않음)
  navigator.permissions?.query({ name: 'geolocation' }).then(p => { if (p.state === 'granted') watchMe(); }).catch(() => {});
  await sleep(Math.max(0, T(700) - (performance.now() - t0)));
  window.__tour = { app, st, me, get trip() { return trip; }, get nav() { return nav; }, begin, startLeg, advance };      // 점검용
  arrive();
}
boot();
