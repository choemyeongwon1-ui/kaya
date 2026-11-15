// 맞춤 추천 화면의 시작점. 기존 대시보드(../)의 자료와 스타일을 그대로 씁니다.
import { loadData, buildModel } from './model.js';
import { seoulNow, fetchWeather, sampleWeather, applyScenario, annotate, SCENARIOS } from './weather.js';
import { createCitizen } from './citizen.js';
import { createAdmin } from './admin.js';
import { h, icon, segGroup } from './ui.js';

const SURVEY_KEY = 'sf-needs-survey', THEME_KEY = 'sf-theme';            // 테마는 기존 대시보드와 같은 이름으로 저장해 함께 바뀝니다
const TABS = [
  { key: 'citizen', icon: 'pin', label: '시민 화면', sub: '갈 곳 3곳 · 가는 길 · 산책 코스' },
  { key: 'admin', icon: 'layers', label: '관리자 화면', sub: '쉬기 어려운 곳 · 시설 배치 · AI' },
];
// 시연용 시각. 발표 때 '주말 낮에는 어떤가'를 보여 주려고 둡니다.
const TIMES = [
  { key: 'now', label: '지금' },
  { key: '3-10', label: '평일 오전 10시' }, { key: '3-14', label: '평일 오후 2시' }, { key: '5-19', label: '금요일 저녁 7시' },
  { key: '6-14', label: '토요일 오후 2시' }, { key: '0-16', label: '일요일 오후 4시' },
];
const store = { get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* 저장이 막힌 브라우저 */ } } };
const query = new URLSearchParams(location.search);

const app = {
  data: null, model: null, raw: null, wx: null, now: seoulNow(),
  scenario: SCENARIOS.some(s => s.key === query.get('s')) ? query.get('s') : 'live',
  time: TIMES.some(t => t.key === query.get('t')) ? query.get('t') : 'now',
  tab: location.hash === '#admin' ? 'admin' : 'citizen',
  theme: store.get(THEME_KEY, 'auto'),
  extra: (() => { try { const v = JSON.parse(store.get(SURVEY_KEY, '[]')); return Array.isArray(v) ? v.filter(p => p && typeof p.kind === 'string' && Number.isFinite(p.lat) && Number.isFinite(p.lon)) : []; } catch { return []; } })(),
  /** 현장 조사 시설을 바꾸면 모형을 다시 만들고 두 화면을 고칩니다 */
  setExtra(list) { app.extra = list; store.set(SURVEY_KEY, JSON.stringify(list)); app.model = buildModel(app.data, list); screens.citizen?.update(); screens.admin?.update(); },
};
const screens = { citizen: null, admin: null };
const root = document.getElementById('app');
const el = { bar: h('div'), pages: { citizen: h('div', { class: 'nd-page' }), admin: h('div', { class: 'nd-page' }) }, body: h('div'), foot: h('footer', { class: 'footer' }) };

const dark = () => app.theme === 'dark' || (app.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
function applyTheme() {
  if (app.theme === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', app.theme);
  store.set(THEME_KEY, app.theme);
}

function renderShell() {
  const themeBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': dark() ? '라이트 모드' : '다크 모드', onclick: () => { app.theme = dark() ? 'light' : 'dark'; applyTheme(); renderShell(); screens.citizen?.theme(); screens.admin?.theme(); } }, icon(dark() ? 'sun' : 'moon', 16));
  const top = h('header', { class: 'topbar' }, h('div', { class: 'topbar-inner' },
    h('a', { class: 'brand', href: '../#home', style: { textDecoration: 'none', color: 'inherit' } },
      h('div', { class: 'brand-mark' }, (() => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.innerHTML = '<path d="M12 2.5 19 13h-3.6l4.6 7.5H4L8.6 13H5z"/>'; return s; })()),
      h('div', null, h('div', { class: 'brand-title' }, '서울숲, 머무는 숲'), h('div', { class: 'brand-sub' }, '성수에서 사지 않아도 머물 수 있는 단 하나의 숲'))),
    h('nav', { class: 'tabs goals-nav', 'aria-label': '목표 선택' },
      h('a', { class: 'tab', href: '../#home' }, '소개'),
      h('a', { class: 'tab goal-tab g1', href: '../#citizen' }, h('span', { class: 'tab-n' }, '1'), '지금 머물기 좋은 곳'),
      h('a', { class: 'tab goal-tab g2', href: '../#expert' }, h('span', { class: 'tab-n' }, '2'), '머물 땅을 넓히다'),
      h('a', { class: 'tab goal-tab g3', href: './', 'aria-current': 'page', 'aria-selected': 'true' }, h('span', { class: 'tab-n' }, '3'), '나에게 맞는 곳')),
    h('div', { class: 'spacer' }), h('div', { class: 'meta-bar' }, themeBtn)));
  const when = app.now.date.toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const live = app.scenario === 'live' && app.time === 'now';
  const goal = h('section', { class: 'goalbar g3' },
    h('div', { class: 'goalbar-top' }, h('div', { class: 'goalbar-id' }, h('span', { class: 'goalbar-n' }, '목표 3'), h('h1', null, '나에게 맞는 자리와 길을 찾다'),
      h('p', null, '하고 싶은 일·머물 시간·같이 온 사람에 맞춰 갈 곳과 산책길을 골라 주고, 쉬기 어려운 곳은 관리자가 고칠 수 있게 알려 줍니다.'))),
    h('div', { class: 'goalbar-bottom' },
      h('nav', { class: 'subtabs', role: 'tablist', 'aria-label': '세부 화면' }, TABS.map(t => h('button', { type: 'button', role: 'tab', class: 'subtab', 'aria-selected': app.tab === t.key, onclick: () => go(t.key) }, icon(t.icon, 16), h('b', null, t.label), h('span', null, t.sub)))),
      app.wx ? h('div', { class: 'goalbar-weather' },
        h('span', { class: 'chip-live' }, h('span', { class: `dot${live && app.wx.live ? '' : ' off'}` }), live ? when : '시연 중'),
        h('select', { class: 'nd-select nd-time', 'aria-label': '시각 (시연)', onchange: ev => { app.time = ev.target.value; refresh(); } }, TIMES.map(t => h('option', { value: t.key, selected: t.key === app.time }, t.label))),
        segGroup(SCENARIOS, app.scenario, v => { app.scenario = v; refresh(); }, '날씨 상황 (시연)')) : null));
  el.bar.replaceChildren(top, h('main', { class: 'shell' }, goal, el.body, el.foot));
  const nav = top.querySelector('.goals-nav');                  // 좁은 화면에서는 탭 줄이 옆으로 밀리므로 지금 탭이 보이게 합니다
  if (nav.scrollWidth > nav.clientWidth) nav.scrollLeft = nav.scrollWidth;
  el.foot.replaceChildren(
    h('span', null, '서울숲, 머무는 숲 · 맞춤 추천 화면 · 2026-2 AI-CCS 주제 01 · 상명대 그린스마트시티학과 · 자문 ㈜한국종합기술'),
    h('span', null, `데이터: ${app.wx ? app.wx.source : 'Open-Meteo'} · OpenStreetMap · 팀 20m 격자 분석(Landsat 8 · Sentinel-2)${app.data ? ` · 레이어 생성 ${app.data.meta.built}` : ''}`));
}

/** 시각·날씨를 다시 맞추고 화면을 고칩니다 */
function refresh() {
  const real = seoulNow();
  if (app.time === 'now') {
    app.now = real;
    app.wx = annotate(applyScenario(app.raw, app.scenario), app.now);
  } else {
    const [dow, hour] = app.time.split('-').map(Number), date = new Date(real.date);
    date.setDate(date.getDate() + ((dow - real.dow + 7) % 7)); date.setHours(hour, 0, 0, 0);
    app.now = { date, dow, hour, minute: 0, month: date.getMonth() + 1 };
    // 고른 시각의 실제 예보는 없으므로 표본 날씨(맑고 선선한 날)를 씁니다
    app.wx = annotate(applyScenario({ ...sampleWeather(undefined, hour), source: '시연 시각 · 표본 날씨' }, app.scenario), app.now);
  }
  renderShell();
  screens[app.tab]?.update();
}

function go(tab) {
  app.tab = tab;
  history.replaceState(null, '', `${location.pathname}${location.search}#${tab}`);
  for (const k of Object.keys(el.pages)) el.pages[k].hidden = k !== tab;
  renderShell();
  screens[tab].show();
  window.scrollTo({ top: 0 });
}

async function boot() {
  applyTheme();
  document.documentElement.dataset.goal = '3';
  root.replaceChildren(el.bar);
  el.body.replaceChildren(h('div', { class: 'skeleton' }, '서울숲 데이터를 불러오는 중…'));
  renderShell();
  const loadJson = path => fetch(new URL(path, location.href), { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
  try {
    const [data, raw] = await Promise.all([loadData(loadJson), fetchWeather().catch(() => sampleWeather())]);
    app.data = data; app.raw = raw; app.model = buildModel(data, app.extra);
  } catch (err) {
    el.body.replaceChildren(h('div', { class: 'skeleton' }, h('div', { style: { textAlign: 'center' } },
      h('div', { style: { fontWeight: 700, color: 'var(--ink)' } }, '데이터를 불러오지 못했습니다'), h('div', { class: 'small', style: { margin: '6px 0 12px' } }, err.message),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: boot }, '다시 시도'))));
    return;
  }
  el.pages.citizen.replaceChildren(); el.pages.admin.replaceChildren();
  el.body.replaceChildren(el.pages.citizen, el.pages.admin);
  screens.citizen = createCitizen(el.pages.citizen, app);
  screens.admin = createAdmin(el.pages.admin, app);
  refresh();
  go(app.tab);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (app.theme === 'auto') { renderShell(); screens.citizen.theme(); screens.admin.theme(); } });
  window.addEventListener('hashchange', () => { const t = location.hash === '#admin' ? 'admin' : 'citizen'; if (t !== app.tab) go(t); });
  // 10분마다 시각을, 30분마다 예보를 새로 맞춥니다(화면이 보일 때만)
  let ticks = 0;
  setInterval(async () => {
    if (document.hidden || app.time !== 'now') return;
    if (++ticks % 3 === 0) { try { app.raw = await fetchWeather(); } catch { /* 앞서 받은 예보를 계속 씁니다 */ } }
    refresh();
  }, 600000);
  window.__needs = { app, screens };          // 점검용
}
boot();
