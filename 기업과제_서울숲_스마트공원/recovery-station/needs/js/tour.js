// 코스 찾기(투어)
//  1) 서울 상공에서 서울숲으로 짧게 내려앉습니다(클릭 없이).
//  2) 목적·같이 온 사람·머물 시간을 고르면(이용자 별점 높은 곳을 미리 담을 수도 있음),
//     지금 내 위치에서 출발해 여러 곳을 잇는 코스를 한 번에 추천합니다. 가는 길의 정원은 사진과 함께 띄웁니다.
//  3) 내비게이션처럼 내 위치 점이 길을 따라가고, 지나온 길은 연해집니다.
//     공원 밖이거나 위치를 못 쓰면 같은 화면을 '미리보기'로 재생합니다.
//  4) 도착하면 그 자리에서 별점(+좋았던/아쉬운 점, 하고 싶은 말)을 받고, 바로 남은 코스를 고쳐 다음 곳으로 이어 갑니다.
// 장소 점수는 맞춤형 추천 화면과 같은 recommend()를 매 구간 출발점에서 다시 계산해 쓰고, 이용자 별점을 얹습니다.
import { loadData, buildModel } from './model.js?v=2';   // ?v: model.js got places_extra
import { seoulNow, fetchWeather, sampleWeather, annotate, applyScenario, kmaDays } from './weather.js';
import { NEEDS, COMPANY, STAYS, AFFINITY, AFFINITY_DEFAULT, REST_STD, PLACE_IDENTITY, IDENTITY_MEAN, ACCESS_URL, SPEED, CALORIE } from './config.js?v=50'; // ?v: config.js got CALORIE — bust cached copies
import { recommend, quietHours, josa, speedFor } from './recommend.js';
import { planRoute } from './route.js';
import { dijkstra } from './graph.js';
import { crowdScale } from './crowd.js';
import { loadNews, todayIso } from './news.js';
import { h, icon, iconSvg, fmtM, esc } from './ui.js';
import { faces, staticFace, faceHtml, upsertJourney, loadReviews, sendComfort, sendCourse } from './review.js';
import { fetchLiveCrowd, fmtPeople } from './live.js';
import { fetchPrograms, upcomingPrograms, pickPrograms, genericPlace } from './programs.js';
import { mountTreeCam, clearTreePins } from './trees.js?v=13';   // 「이 나무 뭐지?」 카메라로 수종 알아보기
import { refreshFlow, drawFlow, clearFlow, soonBusy, surges, roadJam, recordAuto, autoCard } from './cityflow.js?v=22';   // 30분 뒤 예측(역 하차 급증·서울시 예측)

const L = window.L;
const root = document.getElementById('tour');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
// 「모바일로 보기」(../mobile.html)에서 돌아온 경우: 이미 본 '멀리서 날아 들어오는 장면'은 생략
const backFromMobile = window.top === window && /\/mobile\.html/.test(document.referrer);
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
  // 첫 화면 왼쪽: 지금 서울숲(혼잡·날씨·오는 길). 넓은 화면에서만
  side: h('aside', { class: 'tr-side', 'aria-label': '지금 서울숲', hidden: true }),
  top: h('header', { class: 'tr-top' }),
  locate: h('button', { type: 'button', class: 'tr-locate', 'aria-label': '내 위치로', onclick: () => centerMe() }, icon('target', 18)),
};
root.append(el.map, el.shade, el.top, el.toast, el.side, el.panel, el.locate, el.intro);

addEventListener('pointermove', e => {
  const t = e.target.closest?.('.tr-glow-on');
  if (!t) return;
  const r = t.getBoundingClientRect();
  t.style.setProperty('--mx', `${e.clientX - r.left}px`); t.style.setProperty('--my', `${e.clientY - r.top}px`);
}, { passive: true });

// ── 실시간 인구 배지·카드(중계 서버가 있을 때만 보임) ──
// 서울시 실시간 도시데이터(citydata_ppltn)는 인원을 500명 단위 구간(MIN~MAX)으로만 주고 5분마다 바뀝니다.
// live      : 추천·안내 계산에 쓰는 값. 방금 받았고 기준 시각이 60분 이내일 때만 (못 받으면 null → 요일·시간대 추정으로 돌아감)
// liveShown : 카드에 보여 주는 마지막으로 받은 값. 늘 기준 시각과 '○분 전'을 같이 보여 줘서 옛 값을 지금 값처럼 보이지 않게 함
// 60분: 서울시 값은 정상일 때도 기준 시각이 실제보다 30분쯤 늦게 옴(2026-11-26 실측 '31분 전'). 그보다 훨씬 늦으면 '오래된 값'
const LIVE_EVERY = 5 * 60 * 1000, LIVE_STALE_MIN = 60;
// 박람회 정원 하나하나를 지도에 찍는 작은 분홍 꽃(꽃잎 5장 + 노란 꽃술)
const FLOWER_SVG = `<svg viewBox="-10 -10 20 20" aria-hidden="true"><g class="pt">${[0, 72, 144, 216, 288].map(a => `<ellipse cx="0" cy="-4.9" rx="3.5" ry="4.9" transform="rotate(${a})"/>`).join('')}</g><circle class="ct" r="2.5"/></svg>`;
let live = null, liveShown = null, livePrev = null;
const liveSt = { checkedAt: 0, okAt: 0, failed: false, next: 0, busy: false, flash: false };
const kstDate = t => { const d = t ? new Date(`${String(t).replace(' ', 'T')}:00+09:00`) : null; return d && !isNaN(d) ? d : null; };   // PPLTN_TIME 'YYYY-MM-DD HH:MM'(한국 시각)
const liveAgeMin = () => { const d = kstDate(liveShown?.time); return d ? Math.max(0, Math.floor((Date.now() - d) / 60000)) : null; };
const agoText = m => m == null ? '' : m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''} 전` : `${Math.floor(m / 1440)}일 전`;
const hmOf = ms => { const d = new Date(ms); return `${d.getHours()}시 ${String(d.getMinutes()).padStart(2, '0')}분`; };
const hhmm = t => String(t ?? '').slice(11, 16);
const cdText = () => { const s = Math.max(0, Math.ceil((liveSt.next - Date.now()) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const midOf = v => (v && v.min != null && v.max != null ? (v.min + v.max) / 2 : null);
const liveOld = () => liveSt.failed || (liveAgeMin() ?? 0) > LIVE_STALE_MIN;
const liveEl = h('button', { type: 'button', class: 'tr-live', hidden: true, 'aria-expanded': 'false', 'aria-label': '서울숲 실시간 붐빔 자세히', onclick: () => toggleLivePop() });
const livePop = h('div', { class: 'tr-livepop', hidden: true });
function paintLive() {
  const v = liveShown;
  if (!v) { liveEl.hidden = true; livePop.hidden = true; }
  else {
    liveEl.hidden = false;
    liveEl.className = `tr-live r${v.rank}${liveOld() ? ' old' : ''}`;
    liveEl.title = `${v.msg ?? ''}\n서울시 실시간 도시데이터(통신사 신호로 어림한 값) · ${v.time} 기준${liveSt.failed ? ` · 연결 실패(마지막 확인 ${hmOf(liveSt.okAt)})` : ''}`;
    liveEl.replaceChildren(h('i'), h('span', null, '서울숲 지금'), h('b', null, v.level),
      v.min != null ? h('small', null, `${fmtPeople(v.min)}~${fmtPeople(v.max)}명 · ${hhmm(v.time)}`) : null);
  }
  if (!livePop.hidden) livePop.replaceChildren(liveCard());
  document.querySelectorAll('.tr-livetop-slot').forEach(s => s.replaceChildren(liveCard('top') ?? ''));
  document.querySelectorAll('.tr-livecard-slot').forEach(s => s.replaceChildren(liveCard('rest') ?? ''));
  paintHello();
}
function paintHello() {
  if (!app) return;
  document.querySelectorAll('.tr-status-slot').forEach(s => s.replaceChildren(statusBar() ?? ''));
  document.querySelectorAll('.tr-access-slot').forEach(s => s.replaceChildren(accessBar() ?? ''));
  accessPins();
  document.querySelectorAll('.tr-quick-slot').forEach(s => s.replaceChildren(quickBlock()));
}
async function refreshLive() {
  if (liveSt.busy) return;
  liveSt.busy = true; liveSt.next = Date.now() + LIVE_EVERY;
  const d = await fetchLiveCrowd();
  liveSt.busy = false; liveSt.checkedAt = Date.now();
  if (d) {
    liveSt.flash = !liveShown || liveShown.time !== d.time || liveShown.min !== d.min || liveShown.level !== d.level;
    if (liveShown && liveShown.time !== d.time) livePrev = liveShown;   // 늘었는지 줄었는지 견줄 직전 값
    liveShown = d; liveSt.okAt = Date.now(); liveSt.failed = false;
  } else liveSt.failed = true;
  live = liveShown && !liveOld() ? liveShown : null;
  paintLive(); liveSt.flash = false;
}
// 1초마다: 카운트다운·'○분 전' 글자만 바꾸고, 다음 확인 시각이 지났으면 다시 불러옴(휴대폰이 잠들어 타이머가 밀려도 깨면 따라잡음)
function liveTick() {
  if (!document.hidden && liveSt.next && Date.now() >= liveSt.next) refreshLive();
  const cd = cdText(), ago = agoText(liveAgeMin());
  document.querySelectorAll('.tr-lc-cd').forEach(e => { if (e.textContent !== cd) e.textContent = cd; });
  document.querySelectorAll('.tr-lc-ago').forEach(e => { if (e.textContent !== ago) e.textContent = ago; });
}
// 화면을 껐다 켜거나 다른 탭에서 돌아오면 바로 새로 불러옴
const wakeLive = () => { if (!document.hidden && Date.now() - liveSt.checkedAt > 10000) { liveTick(); refreshLive(); } };
document.addEventListener('visibilitychange', wakeLive);
addEventListener('focus', wakeLive);
addEventListener('pageshow', e => { if (e.persisted) wakeLive(); });
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
/** 지금 서울숲: 붐빔 단계 · 인원 · 축구장 한 면당 몇 명 · 앞으로 몇 시간
 *  part: 'top' = 첫 화면 맨 위에 늘 보이는 부분(단계·인원·막대) / 'rest' = 「자세히」 안 나머지 / 없으면 전부 */
function liveCard(part) {
  const live = liveShown;   // 카드는 마지막으로 받은 값을 기준 시각과 함께 보여 줌(바깥 live는 추천 계산용)
  const top_ = part !== 'rest', rest = part !== 'top';
  if (!live) {   // 한 번도 못 받았으면: 예비 값 없이 '연결 실패'만
    return liveSt.failed && top_ ? h('section', { class: `tr-livecard fail old${part ? ` ${part}` : ''}`, 'aria-label': '서울숲 실시간 붐빔' },
      h('div', { class: 'tr-lc-head' }, h('span', { class: 'tr-lc-dot' }), h('small', null, '지금 서울숲'), h('b', null, '연결 실패')),
      h('p', { class: 'tr-lc-meta' }, h('span', { class: 'bad' }, '서울시 실시간 인구를 받지 못했어요'), h('span', null, '다시 시도까지 ', h('span', { class: 'tr-lc-cd' }, cdText())))) : null;
  }
  const fc = (live.forecast ?? []).filter(f => f.max != null).slice(0, 8);
  const top = Math.max(live.max ?? 0, ...fc.map(f => f.max)) || 1;
  const perPitch = v => Math.round(v / PARK_M2 * PITCH_M2);
  const day = fc.filter(f => +hh(f.time) >= 6 && +hh(f.time) < 22);      // 밤(22~6시)은 '한산한 때'로 권하지 않음
  const calm = day.length ? day.reduce((a, f) => (f.max < a.max ? f : a)) : null;
  const rankOf = lv => Math.max(0, LIVE_STEPS.indexOf(lv));
  // 큰 숫자: 500명 단위 구간의 가운데 값(추정). 정확한 인원이 아님
  const mid = midOf(live), pm = midOf(livePrev);
  const trend = mid != null && pm != null ? Math.sign(mid - pm) : null;
  // 1시간 뒤: 같은 응답의 FCST_PPLTN(서울시 12시간 예측) 중 기준 시각 + 1시간에 가장 가까운 것
  const t0 = kstDate(live.time);
  const f1 = t0 ? (live.forecast ?? []).map(f => ({ ...f, dt: (kstDate(f.time) - t0) / 60000 })).filter(f => f.min != null && f.dt >= 30)
    .sort((a, b) => Math.abs(a.dt - 60) - Math.abs(b.dt - 60))[0] : null;
  const f1d = f1 ? Math.sign(midOf(f1) - (mid ?? midOf(f1))) : 0;
  const old = liveOld(), age = liveAgeMin();
  return h('section', { class: `tr-livecard r${live.rank}${part ? ` ${part}` : ''}${old ? ' old' : ''}${liveSt.flash && top_ ? ' flash' : ''}`, 'aria-label': '서울숲 실시간 붐빔' },
    top_ && h('div', { class: 'tr-lc-head' },
      h('span', { class: 'tr-lc-dot' }), h('small', null, '지금 서울숲'), h('b', null, live.level),
      mid != null ? h('strong', null, `약 ${fmtPeople(mid)}`, h('small', null, '명')) : null),
    top_ && mid != null && h('div', { class: 'tr-lc-est' },
      trend != null ? h('span', { class: `tr-lc-trend ${trend > 0 ? 'up' : trend < 0 ? 'down' : 'same'}`, title: `직전 ${hhmm(livePrev.time)} 기준 ${fmtPeople(livePrev.min)}~${fmtPeople(livePrev.max)}명` },
        trend > 0 ? '▲ 늘었어요' : trend < 0 ? '▼ 줄었어요' : '= 그대로', h('small', null, ` 직전 ${hhmm(livePrev.time)}보다`)) : h('span'),
      h('small', null, `${fmtPeople(live.min)}~${fmtPeople(live.max)}명 구간의 가운데 값(추정)`)),
    top_ && h('div', { class: 'tr-lc-gauge', role: 'img', 'aria-label': `4단계 중 ${live.rank + 1}단계 ${live.level}` },
      LIVE_STEPS.map((s, i) => h('div', { class: i <= live.rank ? `on s${i}` : '' }, h('i'), h('span', null, s)))),
    top_ && live.msg ? h('p', { class: 'tr-lc-msg', title: live.msg }, live.msg) : null,
    top_ && f1 ? h('p', { class: 'tr-lc-next' }, `${f1.dt <= 90 ? `1시간 뒤(${+hh(f1.time)}시)` : `${+hh(f1.time)}시`} ${f1d > 0 ? '↗' : f1d < 0 ? '↘' : '→'} `,
      h('b', null, `${fmtPeople(f1.min)}~${fmtPeople(f1.max)}명`), f1.level ? ` · ${f1.level}` : '', h('small', null, '서울시 예측')) : null,
    top_ && (sb => sb ? h('p', { class: `tr-lc-soon${sb.hot ? ' hot' : ''}` }, h('b', null, sb.head), sb.text, h('small', null, sb.src)) : null)(soonBusy(live)),
    top_ && h('p', { class: 'tr-lc-meta' },
      liveSt.failed ? h('span', { class: 'bad' }, `연결 실패 · 마지막 확인 ${hmOf(liveSt.okAt)}`) : null,
      h('span', null, `기준 ${hhmm(live.time)} · `, h('span', { class: 'tr-lc-ago' }, agoText(age)), !liveSt.failed && old ? ' (오래된 값)' : ''),
      h('span', null, liveSt.failed ? '다시 시도까지 ' : '다음 확인까지 ', h('span', { class: 'tr-lc-cd' }, cdText()))),
    rest && live.min != null ? h('p', { class: 'tr-lc-feel' }, icon('users', 13), `축구장 한 면 넓이에 약 ${perPitch(live.min)}~${perPitch(live.max)}명꼴`) : null,
    rest && fc.length ? h('div', { class: 'tr-lc-fc' },
      h('div', { class: 'tr-lc-bars' },
        h('div', { class: `now s${live.rank}`, style: `--h:${Math.max(8, 100 * (live.max ?? 0) / top)}%` }, h('i'), h('span', null, '지금')),
        fc.map(f => h('div', { class: `s${rankOf(f.level)}${f === calm ? ' calm' : ''}`, style: `--h:${Math.max(8, 100 * f.max / top)}%`, title: `${hh(f.time)}시 ${f.level} · ${fmtPeople(f.min)}~${fmtPeople(f.max)}명` }, h('i'), h('span', null, hh(f.time))))),
      calm && calm.max < (live.max ?? 0) ? h('small', null, `${hh(calm.time)}시쯤 가장 한산 · ${fmtPeople(calm.min)}~${fmtPeople(calm.max)}명`)
        : day.length ? h('small', null, '밤 10시 전엔 지금보다 한산한 때가 없어요') : h('small', null, '앞으로 몇 시간 예보예요')) : null,
    rest && h('p', { class: 'tr-lc-src' }, `서울시 실시간 도시데이터 · 휴대폰 신호로 어림한 값 · ${String(live.time).slice(-5)} 기준`));
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
      h('a', { class: 'tr-link tr-back', href: '../index.html?cover=0#home', 'aria-label': '서울숲, 머무는 숲으로 돌아가기' }, h('span', { 'aria-hidden': 'true' }, '←'), '돌아가기')));
}

// ── 지도 ──
// Satellite photo that matches the current season. Esri's latest imagery of
// Seoul Forest is a winter (leaf-off) capture, so spring/summer/autumn use
// older World Imagery Wayback releases whose Seoul Forest tile was shot in that
// season (picked by eye, 2026-11-25). ?season=spring|summer|autumn|winter overrides.
const WAYBACK = 'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/';
const SEASON_IMAGERY = {
  // spring/summer: from z18 up these releases fall back to a leaf-off photo, so cap native zoom at 17.
  spring: { label: '봄', url: WAYBACK + '5314/{z}/{y}/{x}', native: 17 },   // release 2022-05-18, fresh light green
  summer: { label: '여름', url: WAYBACK + '15045/{z}/{y}/{x}', native: 17 }, // release 2020-04-29, deep summer green
  autumn: { label: '가을', url: WAYBACK + '25285/{z}/{y}/{x}', native: 19 }, // release 2025-05-29, autumn foliage
  winter: { label: '겨울', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', native: 19 },
};
function seasonImagery() {
  const q = new URLSearchParams(location.search).get('season');
  if (SEASON_IMAGERY[q]) return SEASON_IMAGERY[q];
  const m = new Date().getMonth() + 1;
  return SEASON_IMAGERY[m < 3 || m === 12 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn'];
}

function makeMap() {
  map = L.map(el.map, { zoomControl: false, attributionControl: true, zoomSnap: 0, minZoom: 10, maxZoom: 19 });
  map.attributionControl.setPrefix(false);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 20, className: 'tr-base', attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 기여자 © <a href="https://carto.com/attributions">CARTO</a>' }).addTo(map);
  const sat = seasonImagery();
  L.tileLayer(sat.url, { maxZoom: 19, maxNativeZoom: sat.native, className: 'tr-sat', keepBuffer: 4, attribution: `위성 사진(${sat.label}) © Esri, Maxar, Earthstar Geographics` }).addTo(map);
  // 모바일 화면에서 돌아온 경우: 지난번 공원 화면 자리에서 바로 시작(위성 사진도 받아 둔 것 그대로) → 멀리서 다시 불러오지 않음
  let back = null; try { back = backFromMobile && JSON.parse(sessionStorage.getItem('sf-tour-view') || 'null'); } catch {}
  if (back?.c) map.setView(back.c, back.z, { animate: false }); else map.setView(PARK_CENTER, 12.4);
  layers = {
    park: L.layerGroup().addTo(map), route: L.layerGroup().addTo(map), plan: L.layerGroup().addTo(map),
    garden: L.layerGroup().addTo(map), pins: L.layerGroup().addTo(map), me: L.layerGroup().addTo(map),
    gshot: L.layerGroup().addTo(map), shot: L.layerGroup().addTo(map), prog: L.layerGroup().addTo(map),
    flow: L.layerGroup().addTo(map), access: L.layerGroup().addTo(map),
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
  if (cls !== 'tr-s-step' || st.step !== 1) el.side.hidden = true;
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
// 첫 화면은 서울숲 둘레를 조금 넓혀 서울숲역·뚝섬역까지 보이게
const cityBounds = () => app.model.parkBounds.pad(.3);
async function arrive() {
  if (!backFromMobile) el.intro.classList.add('hide');
  const { center, zoom } = map._getBoundsCenterZoom(cityBounds(), padding());
  await new Promise(res => {
    if (reduce || backFromMobile) { map.setView(center, zoom, { animate: false }); return res(); }
    map.once('moveend', res);
    map.flyTo(center, zoom, { duration: 1.5, easeLinearity: .12 });
  });
  try { sessionStorage.setItem('sf-tour-view', JSON.stringify({ c: [center.lat, center.lng], z: zoom })); } catch {}
  parkOutline();
  el.map.classList.add('tr-arrived'); el.top.classList.add('tr-arrived'); el.locate.classList.add('show'); setBase(baseMode);
  if (backFromMobile) setTimeout(() => el.intro.classList.add('hide'), 400);   // 공원 자리 지도가 깔린 뒤 걷어 냄
  setTimeout(() => el.intro.remove(), backFromMobile ? 1200 : 600);
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
    const a = agg[s.id] ??= { sum: 0, count: 0, tags: {}, comments: [], seed: 0, rsum: 0 };
    a.sum += s.rating; a.count++; if (s.rating >= 4) a.good = (a.good ?? 0) + 1; if (j.seed) a.seed++; else a.rsum += s.rating;
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
const ratingsCount = () => Object.values(ratings()).reduce((a, r) => a + (r.count ?? 0), 0);
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
 * 지금 상황(첫 화면에서 씀)
 *  - hot: 체감 31℃ 이상 낮 → 성수 거리보다 시원한 숲(조현민·권태경 2022 실측)
 *  - busy: 실시간 '약간 붐빔' 이상 또는 주말 12~17시(조현민·권태경 2025)
 *  - workNeed: 평일 17~21시, 지금 갈 곳이 있는 활동(쉬기 → 걷기 → 그 밖 순) → 퇴근길 30분 코스
 */
function situation() {
  const w = app.wx, h0 = w?.hourly?.[0] ?? {}, n = app.now, weekday = n.dow >= 1 && n.dow <= 5;
  const hot = (h0.feels ?? h0.temp ?? 0) >= 31 && h0.day !== false;
  const busy = (live?.rank ?? 0) >= 2 || (!weekday && n.hour >= 12 && n.hour < 17);
  const g0 = app.model.gates?.[0];
  const workNeed = weekday && n.hour >= 17 && n.hour < 21 && g0
    ? ['rest', 'walk', ...NEEDS.map(x => x.key)].find(k => recommend(app.model, w, n, { need: k, stay: 30, company: 'alone', startNode: g0.node, startOff: g0.off ?? 0 }).fit !== 'none') : null;
  return { hot, busy, weekday, workNeed };
}

/**
 * 첫 화면 맨 위 한 줄: 기온 · 미세먼지 · 붐빔. 누르면 자세한 붐빔·날씨 카드가 펼쳐짐
 * 평소엔 한 줄만, 더위·미세먼지 나쁨·붐빔일 때만 색 띠와 한 문장으로 커짐(위험할 때만 눈에 띄게)
 */
/** 자동 판단 기록: 날씨·붐빔·지하철·도로가 기준을 넘거나 내려올 때마다, 시스템이 바꾼 안내를 숫자와 함께 한 줄씩.
 *  처음 열면 지금 판단을 모두 한 번 적음. 기준값(체감 31℃ 등)은 주제서 예시·잠정 규칙(검증 필요) */
function autoBlock() {
  if (!app) return null;
  const w = app.wx, h0 = w?.hourly?.[0], an = w?.air?.now, sit = situation(), rn = rainNow();
  const dust = an ? [an.pm10Label, an.pm25Label].filter(g => DUST_G.includes(g)).sort((a, b) => DUST_G.indexOf(b) - DUST_G.indexOf(a))[0] ?? null : null;
  const feels = h0 ? Math.round(h0.feels ?? h0.temp) : null, jam = roadJam();
  const rules = [];
  if (feels != null) rules.push({ key: 'hot', on: !!sit.hot, onText: `체감온도 ${feels}℃ → 그늘·물가 코스로 자동 전환`, offText: `체감온도 ${feels}℃ → 평소 코스` });
  if (access?.rain) rules.push({ key: 'rain', on: !!rn, onText: `비 ${rn?.mm60 ?? ''}mm → 물가 길 빼고 실내 안내`, offText: '비 없음 → 야외 코스 그대로' });
  if (dust) rules.push({ key: 'dust', on: DUST_G.indexOf(dust) >= 2, onText: `미세먼지 ${dust} → 실내 장소 함께 안내`, offText: `미세먼지 ${dust} → 야외 활동 괜찮음` });
  if (liveShown) rules.push({ key: 'busy', on: !!sit.busy, onText: `서울숲 「${liveShown.level}」 → 덜 붐비는 곳으로 분산`, offText: `서울숲 「${liveShown.level}」 → 분산 안 함` });
  for (const g of surges()) rules.push({ key: `surge_${g.name}`, on: g.hit, onText: `${g.name}역 10분간 ${Math.round(g.off10)}명 내림(평소의 ${(g.off10 / Math.max(g.before, 1)).toFixed(1)}배) → 혼잡 경보`, offText: `${g.name}역 10분간 ${Math.round(g.off10)}명 내림 → 평소 수준` });
  if (jam != null) rules.push({ key: 'jam', on: jam >= .3, onText: `주변 도로 ${Math.round(jam * 100)}% 막힘 → 지하철 권장`, offText: `주변 도로 ${Math.round(jam * 100)}% 막힘 → 차량 안내 없음` });
  return rules.length ? autoCard(recordAuto(rules)) : null;
}
let statusOpen = false;
const DUST_G = ['좋음', '보통', '나쁨', '매우나쁨'];
function statusBar() {
  const w = app?.wx, h0 = w?.hourly?.[0], an = w?.air?.now;
  const dust = an ? [an.pm10Label, an.pm25Label].filter(g => DUST_G.includes(g)).sort((a, b) => DUST_G.indexOf(b) - DUST_G.indexOf(a))[0] ?? null : null;
  const sit = situation();
  const alert0 = access?.alerts?.[0];
  const rn = rainNow(), surge = subSurge();
  const warn = alert0 ? { cls: 'hot', text: `재난문자 · ${alert0.text}`, src: '서울시 실시간 도시데이터(서울숲공원)' }
    : rn ? { cls: rn.heavy ? 'hot' : 'dust', text: `비가 오고 있어요(최근 1시간 ${rn.mm60}mm). ${rn.heavy ? '중랑천·한강 쪽 물가 산책로는 피하세요.' : '물가 산책로는 미끄러울 수 있어요.'} 곤충식물원·나비정원 같은 실내도 있어요.`, src: `서울시 강우량 정보(${access.rain.name}, ${hm(access.rain.time)})` }
    : sit.hot ? { cls: 'hot', text: '더운 날이에요. 서울숲 안은 바깥 거리보다 5.5~7.4℃ 낮았어요. 그늘과 물가 위주로 골라 드려요.', src: '2022년 7월 서울숲 실측(조현민·권태경 2022)' }
    : DUST_G.indexOf(dust) >= 2 ? { cls: 'dust', text: `미세먼지 ${dust}이에요. 곤충식물원·나비정원 같은 실내도 생각해 보세요.`, src: `에어코리아 ${w.air.station} 측정소` }
    : sit.busy ? { cls: 'busy', text: `${sit.weekday ? '지금 사람이 몰려 있어요' : '주말 오후엔 사람이 몰려요'}. 붐비는 곳은 피해서 골라 드려요.`, src: '서울숲 보행 계수: 토요일 오후 2시가 가장 붐빔(조현민·권태경 2025)' }
    : surge ? { cls: 'busy', text: `서울숲역에서 사람이 많이 내리고 있어요(최근 10분 ${surge.text}명). 10~20분 뒤 붐빌 수 있어요(짐작).`, src: '서울시 실시간 도시데이터 · 지하철 승하차 인원' }
    : null;
  const chips = [];
  if (h0) chips.push(h('span', { class: 'tmp' }, h('b', null, `${Math.round(h0.temp)}°`), h0.feels != null && Math.abs(h0.feels - h0.temp) >= 1 ? ` 체감 ${Math.round(h0.feels)}°` : ''));
  if (dust) chips.push(h('span', { class: `g${DUST_G.indexOf(dust) + 1}` }, '미세먼지 ', h('b', null, dust)));
  if (!chips.length && !warn) return null;
  // 「지금 공원에 있는 사람·비·중랑천·성수동 거리 센서」 카드(envCard)는 2026-11-26 사용자 요청으로 뺌
  const lc = liveCard('rest'), wc = weatherCard(), canOpen = !!(lc || wc);
  const more = canOpen ? h('div', { class: 'tr-status-more', hidden: !statusOpen }, h('div', { class: 'tr-livecard-slot' }, lc ?? ''), h('div', { class: 'tr-wxcard-slot' }, wc ?? '')) : null;
  const label = () => statusOpen ? '접기' : '자세히';
  const line = h(canOpen ? 'button' : 'div', { type: canOpen ? 'button' : null, class: 'tr-status-line', 'aria-expanded': canOpen ? String(statusOpen) : null,
    onclick: canOpen ? e => { statusOpen = !statusOpen; more.hidden = !statusOpen; e.currentTarget.setAttribute('aria-expanded', String(statusOpen)); e.currentTarget.querySelector('.tr-status-tog').textContent = label(); } : null },
    h('small', null, '지금'), h('div', { class: 'tr-status-chips' }, chips), canOpen ? h('span', { class: 'tr-status-tog' }, label()) : null);
  return h('section', { class: `tr-status${warn ? ` warn ${warn.cls}` : ''}` }, line,
    warn ? h('p', { class: 'tr-status-warn' }, warn.text, h('small', null, warn.src)) : null, more);
}

// ── 오는 길·나가는 길 실시간: 주차장 · 지하철 · 따릉이 · 도로 · 전기차 충전 (proxy/seoul-parking) ──
let access = null, accessOpen = false;
async function refreshAccess() {
  try { const d = await (await fetch(ACCESS_URL, { cache: 'no-cache' })).json(); access = d?.error ? null : d; } catch { access = null; }
  if (app) paintHello();
}
const kst = s => s ? new Date(String(s).replace(' ', 'T') + '+09:00') : null;
// 서울시 열차 도착 문구를 쉬운 말로(진입 → 들어오는 중 등)
const TRAIN_WORD = { '진입': '들어오는 중', '도착': '도착', '출발': '막 출발', '전역도착': '앞 역 도착', '전역출발': '앞 역 출발', '전역진입': '앞 역 들어오는 중', '운행중': '오는 중' };
const trainMsg = t => t.sec > 0 ? `약 ${Math.max(1, Math.round(t.sec / 60))}분 후` : TRAIN_WORD[String(t.msg ?? '').replace(/\s/g, '')] ?? (t.msg ?? '');
const hm = s => String(s ?? '').slice(11, 16);
/** 공원 출입구 중 가장 가까운 곳까지 직선거리(m) */
function gateDist(lat, lon) {
  const gs = app?.model?.gates ?? [];
  if (lat == null || lon == null || !gs.length) return null;
  return Math.min(...gs.map(g => Math.hypot((lat - g.lat) * 110900, (lon - g.lon) * 88200)));
}
const mid = r => r ? (r[0] + r[1]) / 2 : null;
/** 주소에서 '성수동2가'처럼 동·가 이름만 / 같은 주소가 두 번 붙어 오는 경우 하나만 */
const lotDong = a => String(a ?? '').match(/(\S+(?:동|가))(?=\s|$)/)?.[1] ?? '성동구';
const oneAddr = a => { const t = String(a ?? '').trim(), n = t.length / 2; return t && Number.isInteger(n) && t.slice(0, n) === t.slice(n) ? t.slice(0, n) : t; };
/** 버스 도착 문구 → 분('곧 도착'=0, '3분12초후[2번째 전]'=3). 운행종료·출발대기 등은 null */
const busMin = s => { s = String(s ?? ''); if (/곧 도착/.test(s)) return 0; const m = s.match(/(\d+)분/); return m ? +m[1] : /(\d+)초후/.test(s) ? 0 : null; };
const rngTxt = r => r ? (r[0] === r[1] ? `${r[0]}` : `${r[0]}~${r[1]}`) : '';
/** 비: 뚝섬 빗물펌프장 최근 1시간 강우(30분보다 오래된 값은 안 씀). 10mm/h 이상이면 '강한 비'(기상청 '강한 비' 표현 기준을 빌린 잠정값) */
function rainNow() {
  const r = access?.rain, d = kst(r?.time);
  if (!r || !d || Date.now() - d.getTime() > 30 * 60e3) return null;
  if (!((r.mm10 ?? 0) > 0 || (r.mm60 ?? 0) >= 1)) return null;
  return { mm60: r.mm60 ?? 0, heavy: (r.mm60 ?? 0) >= 10 };
}
/** 곧 붐빔 신호: 최근 10분 하차가 그 앞 20분의 10분 평균보다 1.5배 넘고 80명 이상(잠정 규칙, 검증 필요) */
function subSurge() {
  const f = access?.subFlow;
  if (!f?.off10 || !f?.off30) return null;
  const now10 = mid(f.off10), before = (mid(f.off30) - now10) / 2;
  return now10 >= 80 && now10 >= 1.5 * Math.max(before, 1) ? { text: rngTxt(f.off10) } : null;
}
/** 「지금」 자세히 안: 지금 공원에 있는 연령대 · 비 · 중랑천 물 · 성수동 거리 센서(하루 늦음) */
function envCard() {
  const a = access;
  if (!a) return null;
  const rows = [];
  const ag = (a.ages?.rates ?? []).filter(x => x.pct != null);
  if (ag.length) {
    const top = [...ag].sort((x, y) => y.pct - x.pct).slice(0, 2).map(x => `${x.age ? `${x.age}대` : '10살 아래'} ${Math.round(x.pct)}%`);
    const kid = ag.find(x => x.age === 0), old = ag.filter(x => x.age >= 60).reduce((s, x) => s + x.pct, 0);
    rows.push(h('div', { class: 'tr-env-row' }, icon('users', 14), h('div', null,
      h('b', null, '지금 공원에 있는 사람'),
      h('div', { class: 'tr-env-bars', role: 'img', 'aria-label': ag.map(x => `${x.age}대 ${x.pct}%`).join(', ') },
        ag.map(x => h('i', { style: `--h:${Math.max(4, x.pct * 3)}%`, title: `${x.age ? `${x.age}대` : '0~9세'} ${x.pct}%` }, h('span', null, x.age ? x.age : '0')))),
      h('small', null, `${top.join(' · ')}${kid ? ` · 10살 아래 ${Math.round(kid.pct)}%` : ''} · 60세 이상 ${Math.round(old)}%`))));
  }
  if (a.rain) rows.push(h('div', { class: 'tr-env-row' }, icon('rain', 14), h('div', null, h('b', null, '비'),
    h('small', null, (a.rain.mm60 ?? 0) > 0 ? `최근 1시간 ${a.rain.mm60}mm · ${hm(a.rain.time)} 기준` : `안 와요 · ${hm(a.rain.time)} 기준`))));
  if (a.river?.level != null) {
    const depth = a.river.bed != null ? Math.max(0, a.river.level - a.river.bed) : null;
    rows.push(h('div', { class: 'tr-env-row' }, icon('water', 14), h('div', null, h('b', null, `중랑천 물 (${a.river.name})`),
      h('small', null, `${depth != null ? `물 깊이 약 ${depth.toFixed(1)}m` : `수위 ${a.river.level}m`} · ${hm(a.river.time)} 기준${a.river.control && a.river.level >= a.river.control ? ' · 통제 수위 넘음' : ''}`))));
  }
  if (a.sdot?.temp != null) rows.push(h('div', { class: 'tr-env-row' }, icon('target', 14), h('div', null, h('b', null, '성수동 거리 센서'),
    h('small', null, `${a.sdot.time.slice(5, 10).replace('-', '/')} ${a.sdot.time.slice(11)} 실측 · ${a.sdot.temp}℃ · 습도 ${Math.round(a.sdot.hum)}%${a.sdot.noise != null ? ` · 소음 ${Math.round(a.sdot.noise)}dB` : ''}`),
    h('small', { class: 'dim' }, `센서 ${a.sdot.sensors}곳 평균 · 자료가 하루쯤 늦게 공개돼요`))));
  if (!rows.length) return null;
  return h('section', { class: 'tr-env', 'aria-label': '주변 환경' }, rows,
    h('p', { class: 'tr-lc-src' }, '서울시 실시간 도시데이터 · 서울시 강우량·하천수위 정보 · S-DoT 도시데이터 센서'));
}
function accessBar() {
  const a = access;
  if (!a) return null;
  const P = a.parking ?? {}, near = P.near ?? [], liveLots = P.live ?? [];
  const st0 = (a.subway ?? []).find(s => /서울숲/.test(s.name)) ?? a.subway?.[0];
  const t0 = st0?.trains?.[0];
  const bikes = (a.bike ?? []).reduce((s, b) => s + (b.bikes ?? 0), 0);
  const chips = [
    near.length || liveLots.length ? h('span', null, icon('parking', 13), `주차 ${near.length + liveLots.length}곳`) : null,
    t0 ? h('span', null, icon('train', 13), `${st0.name}역 ${t0.to}행 ${trainMsg(t0)}`) : null,
    a.bike?.length ? h('span', null, icon('bike', 13), `따릉이 ${bikes}대`) : null,
  ].filter(Boolean);
  if (!chips.length) return null;
  const sit = situation();
  const groups = accessGroups(a);
  // 펼치면 글 목록 대신 지도에 아이콘을 띄우고, 여기엔 종류별 켜고 끄기 + 꼭 알아야 할 한두 줄만
  const legend = h('div', { class: 'tr-acc-legend', role: 'group', 'aria-label': '지도에 보일 것' },
    groups.map(g => h('button', { type: 'button', class: `tr-acc-tg ${g.key}`, 'aria-pressed': String(showing(g.key)),
      onclick: e => { accessShow[g.key] = !showing(g.key); e.currentTarget.setAttribute('aria-pressed', String(accessShow[g.key])); accessPins(); } },
      h('i', null, icon(g.icon, 13)), g.label, h('b', null, g.count))));
  const more = h('div', { class: 'tr-acc-more', hidden: !accessOpen },
    legend,
    h('div', { class: 'tr-acc-key' },
      near.length ? h('span', null, h('i', { class: 'off' }, 'P'), '남은 자리 모름') : null,
      liveLots.length ? h('span', null, h('i', { class: 'on' }, 'P'), '남은 자리 실시간') : null,
      h('span', null, '아이콘을 누르면 자세히')),
    liveLots.length ? h('div', { class: 'tr-acc-far' }, h('small', null, '남은 자리가 보이는 주차장 (조금 멀어요)'),
      h('div', null, liveLots.filter(l => l.lat != null).map(l => {
        const odd = l.capacity != null && l.free >= l.capacity;
        const nm = l.name === '이름 없는 주차장' ? `${lotDong(l.address)} 주차장` : l.name.replace(/\s*공영주차장$/, ' 공영');
        return h('button', { type: 'button', onclick: () => focusAccess(l.lat, l.lon) },
          h('i', null, 'P'), nm, h('b', null, `${l.free}면`), l.km != null ? h('span', null, `${l.km}km`) : null);
      }))) : null,
    sit.busy ? h('p', { class: 'tr-acc-note warn' }, '지금 공원이 붐벼서 주차장도 찼을 수 있어요(붐빔 정도로 짐작). 서울숲역이 가까워요.') : null,
    a.subFlow?.off10 ? h('p', { class: `tr-acc-line${subSurge() ? ' warn' : ''}` }, icon('train', 13), `서울숲역 최근 10분 ${rngTxt(a.subFlow.off10)}명 내림${subSurge() ? ' · 평소보다 많아요' : ''}`) : null,
    a.road ? h('p', { class: 'tr-acc-line' }, icon('car', 13), `주변 도로 ${a.road.idx} · 평균 ${a.road.speed}km/h`) : null,
    ...(a.accidents ?? []).map(x => h('p', { class: 'tr-acc-note warn' }, `${x.type ?? '통제'} · ${x.info ?? ''}`)),
    h('p', { class: 'tr-lc-src' }, `서울시 실시간 도시데이터(서울숲공원)${liveLots.length ? ' · 한국교통안전공단 주차정보' : ''} · 5분마다 갱신`));
  const label = () => accessOpen ? '지도 닫기' : '지도로 보기';
  const line = h('button', { type: 'button', class: 'tr-status-line', 'aria-expanded': String(accessOpen),
    onclick: e => { accessOpen = !accessOpen; more.hidden = !accessOpen; e.currentTarget.setAttribute('aria-expanded', String(accessOpen)); e.currentTarget.querySelector('.tr-status-tog').textContent = label(); accessPins(true); } },
    h('small', null, '오는 길'), h('div', { class: 'tr-status-chips tr-acc-chips' }, chips), h('span', { class: 'tr-status-tog' }, label()));
  return h('section', { class: 'tr-status tr-access' }, line, more);
}

// ── 오는 길 지도 핀 ──
// 버스는 도착 시간이 있을 때만 처음부터 켬(정류장 위치만으론 지도를 어지럽힘). null = 아직 사용자가 안 건드림
let accessShow = { park: true, sub: true, bus: null, event: true, bike: true, ev: true };
const showing = k => accessShow[k] ?? (k === 'bus' ? !!access?.bus?.some(b => b.arrivals?.length) : true);
const fresh6h = s => { const d = kst(s); return !!d && Date.now() - d.getTime() < 6 * 3600e3; };
/** 같은 자리에 겹친 충전소(층별·업체별로 따로 오는 경우)를 하나로 */
function mergeChargers(list) {
  const m = new Map();
  for (const c of list ?? []) {
    if (c.lat == null || c.lon == null) continue;
    const k = `${c.lat.toFixed(4)},${c.lon.toFixed(4)}`, o = m.get(k);
    if (!o) { m.set(k, { ...c, names: [c.name], fresh: fresh6h(c.time) }); continue; }
    o.total += c.total; o.names.push(c.name);
    if (fresh6h(c.time)) { o.free = (o.fresh ? o.free : 0) + c.free; o.fresh = true; }
  }
  return [...m.values()];
}
/** 길 건너편처럼 90m 안에 붙은 정류장은 핀 하나로(도착 목록은 합치고 같은 노선·방면은 하나만) */
function mergeStops(list) {
  const out = [];
  for (const b of list ?? []) {
    if (b.lat == null || b.lon == null) continue;
    const o = out.find(x => Math.hypot((x.lat - b.lat) * 110900, (x.lon - b.lon) * 88200) < 90);
    if (!o) { out.push({ ...b, arrivals: b.arrivals ? [...b.arrivals] : null }); continue; }
    if (o.name !== b.name) o.name = `${o.name} · ${b.name}`;
    o.ars = `${o.ars}, ${b.ars}`;
    if (b.arrivals) o.arrivals = [...(o.arrivals ?? []), ...b.arrivals.filter(x => !(o.arrivals ?? []).some(y => y.route === x.route && y.dir === x.dir))];
  }
  return out;
}
function accessGroups(a) {
  const P = a.parking ?? {};
  const subs = (a.subway ?? []).filter(s => s.lat != null);
  return [
    { key: 'park', icon: 'parking', label: '주차', count: (P.near?.length ?? 0) + (P.live?.length ?? 0) },
    { key: 'sub', icon: 'train', label: '지하철', count: subs.length },
    { key: 'bus', icon: 'bus', label: '버스', count: mergeStops(a.bus).length },
    { key: 'event', icon: 'spark', label: '행사', count: (a.events ?? []).filter(e => e.lat != null).length },
    { key: 'bike', icon: 'bike', label: '따릉이', count: (a.bike ?? []).reduce((s, b) => s + (b.bikes ?? 0), 0) },
    { key: 'ev', icon: 'bolt', label: '충전', count: mergeChargers(a.charger).filter(c => c.fresh).length },
  ].filter(g => g.count);
}
function accessPins(fly = false) {
  if (!layers?.access) return;
  layers.access.clearLayers();
  const a = access, on = !!a && accessOpen && st.step === 1 && !trip;
  // 휴대폰에선 지도를 보도록 아래 시트를 낮추고, 오는 길 칸이 시트 맨 위에 오게
  const wasMap = el.panel.classList.contains('accmap');
  el.panel.classList.toggle('accmap', on);
  if (on && !wasMap && !desk()) { const sec = el.panel.querySelector('.tr-access'); if (sec) el.panel.scrollTop = sec.offsetTop - 12; }
  if (st.step === 1 && !trip) drawFlow(layers.flow, L, PARK_CENTER, app.model.gates); else clearFlow(layers.flow);
  if (!on) { if (fly && app?.model?.parkBounds) flyBounds(cityBounds(), padding(), .8); return; }
  const pts = [];
  const rate = l => l.rate ? `${l.rateMin}분 ${Number(l.rate).toLocaleString()}원` : l.paid === false ? '무료' : null;
  const add = (lat, lon, cls, inner, pop, z = 0) => {
    if (lat == null || lon == null) return;
    L.marker([lat, lon], { icon: L.divIcon({ className: 'tr-apin-wrap', html: `<div class="tr-apin ${cls}">${inner}</div>`, iconSize: [0, 0] }), zIndexOffset: z, riseOnHover: true })
      .bindPopup(`<div class="tr-apop-in">${pop}</div>`, { className: 'tr-apop', closeButton: false, offset: [0, -12], maxWidth: 240, autoPanPaddingTopLeft: [20, 90], autoPanPaddingBottomRight: [20, desk() ? 40 : Math.round(innerHeight * .5)] })
      .addTo(layers.access);
    pts.push([lat, lon]);
  };
  const row = (k, v) => v ? `<div class="r"><span>${esc(k)}</span><b>${esc(v)}</b></div>` : '';
  const head = (ico, t, sub) => `<div class="h">${iconSvg(ico, 14)}<b>${esc(t)}</b></div>${sub ? `<small>${esc(sub)}</small>` : ''}`;
  const P = a.parking ?? {};
  if (showing('park')) for (const l of [...(P.near ?? []), ...(P.live ?? [])]) {
    const live = l.live && l.free != null, d = gateDist(l.lat, l.lon);
    const odd = live && l.capacity != null && l.free >= l.capacity;   // 남은 자리 = 전체면 기계 값이 멈췄을 수 있음
    const name = l.name === '이름 없는 주차장' ? `${l.agent ?? ''} 주차장 (${lotDong(l.address)})`.trim() : l.name;
    const tag = live ? `${l.free}면 남음` : l.capacity != null ? `${l.capacity.toLocaleString()}면` : '';
    add(l.lat, l.lon, `p ${live ? 'on' : 'off'}`, `<i>P</i>${tag ? `<span>${esc(tag)}</span>` : ''}`,
      head('parking', name, oneAddr(l.address)) +
      row('남은 자리', live ? `${l.free}면${l.time ? ` (${hm(l.time)} 기준)` : ''}` : '실시간 정보 없음') +
      (odd ? '<small class="warn">남은 자리가 전체와 같게 나와요. 실제와 다를 수 있으니 확인해 보세요</small>' : '') +
      row('전체', l.capacity != null ? `${l.capacity.toLocaleString()}면` : null) + row('요금', rate(l)) +
      row('공원 입구까지', d != null ? `약 ${fmtM(Math.round(d / 10) * 10)}` : null), live ? 30 : 20);
  }
  if (showing('sub')) for (const s of a.subway ?? []) {
    const ts = (s.trains ?? []).slice(0, 4);
    const f = /서울숲/.test(s.name) ? a.subFlow : null, sg = f ? subSurge() : null;
    add(s.lat, s.lon, 'sub', `<i>${iconSvg('train', 12)}</i><span>${esc(s.name)}역</span>`,
      head('train', `${s.name}역`, s.line) + (ts.length ? ts.map(t => row(`${t.to}행`, trainMsg(t))).join('') : '<small>도착 정보가 아직 없어요</small>') +
      (f?.off10 ? row('최근 10분 내린 사람', `${rngTxt(f.off10)}명`) + row('최근 30분 내린 사람', f.off30 ? `${rngTxt(f.off30)}명` : null) +
        (sg ? '<small class="warn">평소보다 많이 내리고 있어요. 10~20분 뒤 공원이 붐빌 수 있어요(짐작)</small>' : '') : ''), 40);
  }
  if (showing('bus')) for (const b of mergeStops(a.bus)) {
    const arr = (b.arrivals ?? []).map(x => ({ ...x, m1: busMin(x.msg1), m2: busMin(x.msg2) })).sort((x, y) => (x.m1 ?? 999) - (y.m1 ?? 999));
    const soon = arr.find(x => x.m1 != null);
    add(b.lat, b.lon, 'bus', `<i>${iconSvg('bus', 12)}</i>${soon ? `<span>${soon.m1 === 0 ? '곧' : `${soon.m1}분`}</span>` : ''}`,
      head('bus', b.name, `정류장 번호 ${b.ars}`) +
      (arr.length ? arr.slice(0, 6).map(x => row(`${x.route}번${x.dir ? ` (${x.dir} 방면)` : ''}`,
        x.m1 == null ? (x.msg1 ?? '') : `${x.m1 === 0 ? '곧 도착' : `${x.m1}분 후`}${x.m2 != null ? ` · 다음 ${x.m2}분` : ''}`)).join('')
        : b.arrivals ? '<small>지금 오는 버스가 없어요</small>' : '<small>버스 도착 시간은 준비 중이에요</small>'), 15);
  }
  if (showing('event')) for (const e of a.events ?? []) {
    add(e.lat, e.lon, 'event', `<i>${iconSvg('spark', 12)}</i><span>행사</span>`,
      head('spark', e.name, e.place) + row('기간', e.period) + row('요금', e.free == null ? null : e.free ? '무료' : '유료'), 35);
  }
  if (showing('bike')) for (const b of a.bike ?? []) {
    const n = b.bikes ?? null;
    add(b.lat, b.lon, `bike${n === 0 ? ' zero' : ''}`, `<i>${iconSvg('bike', 12)}</i><span>${n ?? '–'}</span>`,
      head('bike', b.name, '따릉이 대여소') + row('빌릴 수 있는 자전거', n != null ? `${n}대` : '정보 없음') + row('거치대', b.racks ? `${b.racks}개` : null), 10);
  }
  // 상태가 6시간 넘게 멈춘 충전소는 지도에서 뺌(고장 난 핀처럼 보이고, 오래된 값은 길잡이가 못 됨)
  if (showing('ev')) for (const c of mergeChargers(a.charger).filter(c => c.fresh)) {
    add(c.lat, c.lon, `ev${c.fresh ? '' : ' old'}`, `<i>${iconSvg('bolt', 12)}</i><span>${c.fresh ? `${c.free}/${c.total}` : '–'}</span>`,
      head('bolt', c.names[0] + (c.names.length > 1 ? ` 외 ${c.names.length - 1}곳` : ''), c.address) +
      row('지금 쓸 수 있는 충전기', c.fresh ? `${c.free}대 / 전체 ${c.total}대` : '상태 정보가 오래돼 알 수 없어요') +
      row('급속', c.fast ? `${c.fast}대` : null) + row('이용 시간', c.hours), 0);
  }
  const pad = desk() ? padding() : { paddingTopLeft: [36, 96], paddingBottomRight: [36, Math.round(innerHeight * .38) + 90] };
  map.off('zoomend moveend', declutterSoon); map.on('zoomend moveend', declutterSoon);
  // 1km 넘게 떨어진 곳(멀리 있는 실시간 공영주차장 등)까지 다 담으면 공원 둘레 핀이 뭉치므로, 화면은 가까운 핀에 맞춤
  const nearPts = pts.filter(([la, lo]) => Math.hypot((la - PARK_CENTER[0]) * 110900, (lo - PARK_CENTER[1]) * 88200) < 1000);
  if (fly && pts.length) flyBounds(L.latLngBounds(nearPts.length ? nearPts : pts), { ...pad, maxZoom: 16 }, .8).then(declutterSoon);
  else declutterSoon();
}
/** 패널에서 고른 핀으로 지도를 옮기고 말풍선 열기 */
async function focusAccess(lat, lon) {
  const m = layers.access.getLayers().find(x => { const ll = x.getLatLng(); return Math.abs(ll.lat - lat) < 1e-6 && Math.abs(ll.lng - lon) < 1e-6; });
  await flyToVisible(L.latLng(lat, lon), Math.max(map.getZoom(), 15.5), .7);
  m?.openPopup();
}
// 지도가 움직이는 중(확대 애니메이션)엔 위치가 틀리게 재지므로, 다 멈춘 뒤 한 번만
let declutterT = 0;
function declutterSoon() { clearTimeout(declutterT); declutterT = setTimeout(() => requestAnimationFrame(declutterAccess), 120); }
/** 붙어 있는 핀끼리 글자가 겹치지 않게 위아래로 살짝 비켜 놓기(중요한 것 먼저: 지하철 > 주차 > 따릉이 > 충전) */
function declutterAccess() {
  const ms = layers?.access?.getLayers() ?? [];
  if (!ms.length) return;
  const placed = [], hit = (a, b) => a.left < b.right + 3 && b.left < a.right + 3 && a.top < b.bottom + 3 && b.top < a.bottom + 3;
  ms.sort((a, b) => (b.options.zIndexOffset ?? 0) - (a.options.zIndexOffset ?? 0)).forEach(m => {
    const pin = m.getElement()?.firstElementChild;
    if (!pin) return;
    pin.style.marginTop = '0px'; pin.style.marginLeft = '0px'; pin.classList.remove('mini');
    // 화면 좌표는 지도 계산으로(애니메이션 중 CSS 변형에 흔들리지 않게)
    const c = map.latLngToContainerPoint(m.getLatLng());
    const fit = () => {
      const w = pin.offsetWidth, ht = pin.offsetHeight, sy = ht + 3, sx = w / 2 + 4;
      const r = { left: c.x - w / 2, right: c.x + w / 2, top: c.y - ht / 2, bottom: c.y + ht / 2 };
      for (const [dx, dy] of [[0, 0], [0, sy], [0, -sy], [sx, 0], [-sx, 0], [sx, sy], [-sx, sy], [sx, -sy], [-sx, -sy], [0, 2 * sy], [0, -2 * sy], [2 * sx, 0], [-2 * sx, 0]]) {
        const box = { left: r.left + dx, right: r.right + dx, top: r.top + dy, bottom: r.bottom + dy };
        if (!placed.some(p => hit(p, box))) return { dx, dy, box };
      }
      return null;
    };
    // 자리가 없으면 숫자를 숨기고 아이콘만(눌러서 자세히 보기는 그대로), 그래도 없으면 제자리에 겹쳐 둠
    let f = fit();
    if (!f) { pin.classList.add('mini'); f = fit(); }
    if (!f) { const w = pin.offsetWidth, ht = pin.offsetHeight; f = { dx: 0, dy: 0, box: { left: c.x - w / 2, right: c.x + w / 2, top: c.y - ht / 2, bottom: c.y + ht / 2 } }; }
    pin.style.marginTop = `${f.dy}px`; pin.style.marginLeft = `${f.dx}px`;
    const pp = m.getPopup(); if (pp) pp.options.offset = L.point(f.dx, f.dy - 12);
    placed.push(f.box);
  });
}

let sideDesk = null;
// 창 너비가 넓은↔좁은 화면을 넘나들면 첫 화면을 다시 그려 카드 자리를 맞춤
addEventListener('resize', () => { if (st.step === 1 && el.panel.classList.contains('tr-s-step') && sideDesk !== null && desk() !== sideDesk) go(1); });
function go(step) {
  st.step = step;
  const s = STEPS[step];
  const picked = [st.need && NEEDS.find(n => n.key === st.need)?.label, step > 2 && st.company && COMPANY.find(c => c.key === st.company)?.label].filter(Boolean);
  setFocus(false);
  // 첫 단계: 질문을 맨 위에. 지금 서울숲 카드는 넓은 화면이면 왼쪽 패널, 좁으면 질문·선택지 아래
  const live = step === 1 ? [
    h('div', { class: 'tr-livetop-slot' }, liveCard('top') ?? ''),
    h('div', { class: 'tr-status-slot' }, statusBar() ?? ''),
    h('div', { class: 'tr-access-slot' }, accessBar() ?? ''),
  ] : [];
  const side = step === 1 && desk();
  sideDesk = desk();
  if (side) { el.side.replaceChildren(...live); el.side.hidden = false; } else el.side.hidden = true;
  mount('tr-s-step', [
    step === 1 ? null : h('div', { class: 'tr-panel-head' },
      h('div', { class: 'tr-stepno' }, h('b', null, `0${step}`), h('span', null, '/ 03')),
      step > 1 ? h('button', { type: 'button', class: 'tr-back', onclick: () => go(step - 1) }, '이전') : null),
    h('div', { class: 'tr-dots', 'aria-label': `${step}/3단계` }, [1, 2, 3].map(i => h('i', { class: i < step ? 'done' : i === step ? 'on' : '' }))),
    h('h2', { class: 'tr-q' }, s.q),
    picked.length ? h('div', { class: 'tr-picked' }, picked.map(p => h('span', null, p))) : null,
    h('div', { class: `tr-opts${step === 1 ? ' c3' : ''}` }, s.opts().map((o, i) => h('button', { type: 'button', class: 'tr-opt tr-glow-on', style: `--i:${i}`, onclick: ev => choose(s.key, o.key, ev.currentTarget) },
      h('span', { class: 'tr-opt-ico' }, icon(o.icon, 18)), h('b', null, o.label), o.desc ? h('small', null, o.desc) : null))),
    ...(side ? [] : live),
    step === 1 ? h('div', { class: 'tr-quick-slot' }, quickBlock()) : null,
    step === 1 ? h('div', { class: 'tr-prog-slot' }, programBlock() ?? '') : null,  ]);
  if (step !== 1 && accessOpen) accessOpen = false;
  if (layers) accessPins();
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
/** 걸어서 쓴 칼로리(kcal, 어림값). config.js CALORIE 참고 */
const kcalOf = (meters, speed = SPEED.normal) => Math.round((CALORIE.met[speed] ?? CALORIE.met[SPEED.normal]) * CALORIE.kg * meters / speed / 60);
const legsKcal = legs => sum(legs, s => kcalOf(s.meters, s.rec?.speed));
const KCAL_NOTE = `몸무게 ${CALORIE.kg}kg 기준 어림값이에요`;
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
  const r = { meters, minutes: Math.max(1, Math.round(meters / speed)), kcal: kcalOf(meters, speed) };
  courseLen.set(c.id, r);
  return r;
}
/** 고르기 어렵다면: 지금 상황 맞춤 코스(퇴근길 30분) + 추천 코스. 처음엔 2개만, 나머지는 '더 보기' */
let quickMore = false;
function quickBlock() {
  const sit = situation(), list = popularCourses();
  const rows = [];
  if (sit.workNeed) rows.push(h('button', { type: 'button', class: 'tr-course tr-quick-now tr-glow-on', onclick: () => { watchMe(); Object.assign(st, { need: sit.workNeed, company: 'alone', stay: 30 }); begin(); } },
    h('div', { class: 'tr-course-img' }, icon('walk', 20)),
    h('div', { class: 'tr-course-body' }, h('b', null, '퇴근길, 숲으로 30분'),
      h('small', { class: 'tr-course-chain' }, `혼자 ${sit.workNeed === 'rest' ? '조용히 쉬는' : sit.workNeed === 'walk' ? '가볍게 걷는' : '머무는'} 코스 · 지금 맞춤`))));
  const shown = quickMore ? Infinity : Math.max(1, 2 - rows.length);
  list.forEach((c, i) => {
    const s = courseStats(c), ph = c.stops.map(id => photoOf(id)).find(Boolean);
    rows.push(h('button', { type: 'button', class: 'tr-course tr-glow-on', hidden: i >= shown, style: `--i:${i}`, onclick: () => { watchMe(); Object.assign(st, { need: c.need, company: c.company, stay: c.stay }); begin(c); } },
      h('div', { class: 'tr-course-img' }, ph ? h('img', { src: ph.src, alt: '', loading: 'lazy' }) : icon('route', 20)),
      h('div', { class: 'tr-course-body' },
        h('b', null, c.name),
        h('small', { class: 'tr-course-chain' }, `${c.stops.length}곳 · ${s.minutes}분 · 약 ${s.kcal}kcal`))));
  });
  const rest = list.length - shown;
  return h('section', { class: 'tr-pop tr-quick' },
    h('div', { class: 'tr-sec-head' }, h('b', null, '고르기 어렵다면, 바로 출발')),
    h('div', { class: 'tr-pop-list' }, rows),
    rest > 0 ? h('button', { type: 'button', class: 'tr-more', onclick: e => { quickMore = true; e.currentTarget.closest('.tr-quick').querySelectorAll('.tr-course[hidden]').forEach(b => { b.hidden = false; }); e.currentTarget.remove(); } }, `추천 코스 ${rest}개 더 보기`) : null);
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
  // 지도의 프로그램 장소 점(주황 동그라미)은 무엇인지 알기 어려워 뺌 — 오른쪽 목록만 보여 줌 (2026-11-25)
  if (!list.length) return null;
  // 첫 화면을 가볍게: 가장 가까운 1개만 보이고 나머지·설명은 '더 보기'
  const note = h('p', { class: 'tr-pop-note', hidden: true }, `서울시 공공서비스예약 · ${String(app.programs.checked ?? '').slice(5, 16) || '저장본'} 기준. 누르면 예약 화면으로 가요. 지도의 노란 점이 열리는 곳이에요.`);
  const rows = list.map((x, i) => { const r = progRow(x, i, { canAdd: true }); if (i > 0) r.hidden = true; return r; });
  return h('section', { class: 'tr-pop tr-progs' },
    h('div', { class: 'tr-sec-head' }, h('b', null, '이번 주 서울숲 프로그램'), h('span', null, '공공서비스예약')),
    h('div', { class: 'tr-prog-list' }, rows), note,
    h('button', { type: 'button', class: 'tr-more', onclick: e => { rows.forEach(r => { r.hidden = false; }); note.hidden = false; e.currentTarget.remove(); } },
      list.length > 1 ? `프로그램 ${list.length - 1}개 더 보기` : '자세히'));
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
  // 더한 장소(places_extra.json)는 표에 없어 장소에 붙은 aff 값을 씀
  const va = AFF_KEYS.map(k => AFFINITY[a.id]?.[k] ?? a.aff?.[k] ?? AFFINITY_DEFAULT), vb = AFF_KEYS.map(k => AFFINITY[b.id]?.[k] ?? b.aff?.[k] ?? AFFINITY_DEFAULT);
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
    if (prev) s -= 16 * sim(prev, r.place);                     // 방금 본 곳과 비슷한 곳은 덜 (8→16)
    // 가까운 곳부터: 걷는 시간 점수를 더 크게 보고(약 8%→25%), 지금 자리에서 10분 넘게 걸리는 곳은 1분마다 3점 뺌
    s += 20 * (r.parts.walk ?? 0);
    if (r.walkMin != null && r.walkMin > 10) s -= 3 * (r.walkMin - 10);
    if (fb.identity && PLACE_IDENTITY[r.place.id] != null) s += (PLACE_IDENTITY[r.place.id] - IDENTITY_MEAN) * 10;   // −9~+7점
    // 별점 가산은 실제 이용자 평가만(시연용 가상 평가는 화면 표시용 — 점수에 넣으면 특정 장소만 계속 뽑힘)
    const rt = rtOf(r.place.id), real = rt ? rt.count - rt.seed : 0;
    if (real >= 3) s += (rt.rsum / real - 3.6) * 10;
    if (must?.has(r.place.id)) s += 45;
    return { r, s };
  }).sort((a, b) => b.s - a.s);
}
/** 1등만 고르면 늘 같은 코스가 나옴 → 1등과 VARY점 안쪽인 후보들 중에서 점수가 높을수록 잘 뽑히게 무작위로 하나 (담은 곳은 그대로 우선) */
const VARY = 10;
function pickNear(list) {
  if (!list.length) return null;
  const top = list[0].s, near = list.filter(x => x.s >= top - VARY && x.s > 0);
  if (near.length < 2) return list[0].r;
  const w = near.map(x => 1 + (x.s - (top - VARY)) / VARY);   // 1등 2배, 경계선 1배
  let t = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < near.length; i++) if ((t -= w[i]) <= 0) return near[i].r;
  return near[0].r;
}
function planFrom(from, count, seen0, queue = [], mustIds = []) {
  const seen = new Set(seen0), picks = [], q = [...queue], must = new Set(mustIds.filter(id => !seen.has(id)));
  let f = from, prev = null;
  for (let i = 0; i < count; i++) {
    const rec = recommend(app.model, app.wx, app.now, { need: st.need, stay: st.stay, company: st.company, slow: false, startNode: f.node, startOff: f.off ?? 0 });
    let r = null;
    while (q.length && !r) { const id = q.shift(), x = rec.all.find(y => y.place.id === id); if (x && x.tier < 9 && !seen.has(id)) r = x; }
    if (!r && must.size && count - i <= must.size) r = rec.all.find(x => must.has(x.place.id)) ?? null;      // 남은 자리 = 담은 곳 수면 반드시
    r ??= pickNear(ranked(rec, seen, prev, must));
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
  const cmp = { main: sh(route?.main), base: sh(route?.base), sunMode, prefs,
    unpaved: [route?.main?.unpaved ?? 0, route?.base?.unpaved ?? 0], biz: [route?.main?.bizLen ?? 0, route?.base?.bizLen ?? 0],   // [고른 길, 가장 짧은 길] m
    dist: [route?.main?.meters ?? 0, route?.base?.meters ?? 0], stairs: [route?.main?.stairs ?? 0, route?.base?.stairs ?? 0] };
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
  // 박람회 정원: 배치도로 어림한 자리(lat/lon)가 있으면 정원 하나하나를 지도 점으로, 없는 것만 지점 묶음으로 남김
  const own = Object.values(app.expo ?? {}).filter(x => x.remains !== '철거' && Number.isFinite(x.lat) && Number.isFinite(x.lon))
    .map(x => ({ ...x, pos: [x.lat, x.lon], expo: true, season: true, spot: app.model.hubById[x.place]?.name ?? null }));
  const placed = new Set(own.map(x => x.id));
  const rest = items.map(g => g.gardens ? { ...g, gardens: g.gardens.filter(id => !placed.has(id)) } : g).filter(g => !g.gardens || g.gardens.length);
  return [...fresh, ...rest.filter(g => app.model.hubById[g.place]), ...own];
}
function gardensNear(coords, destId) {
  const out = [];
  for (const g of gardenList()) {
    const hub = g.pos ? { id: g.id, lat: g.pos[0], lon: g.pos[1], name: g.spot ?? g.name } : app.model.hubById[g.place], ll = L.latLng(hub.lat, hub.lon);
    let best = Infinity, at = 0;
    coords.forEach((c, i) => { const d = ll.distanceTo(c); if (d < best) { best = d; at = i; } });
    const dest = !g.pos && g.place === destId;
    if (best <= GARDEN_NEAR || dest) out.push({ ...g, hub, at, dest });
  }
  return out;
}
// 정원 사진: 정원마다 붙인 사진(photos.json gardens). 여러 정원 묶음은 그중 첫 정원 사진, 그 밖엔 정원 항목의 photo 키
const gardenImg = g => {
  const F = app.photos?.files, G = app.photos?.gardens ?? {};
  const k = G[g.id] ?? (g.gardens ? g.gardens.map(id => G[id]).find(Boolean) : null) ?? g.photo;
  return k ? F?.[k] ?? null : null;
};
/** 사진 출처 한 줄(찍은 사람 · 라이선스) */
const creditLine = ph => `<small>${esc(ph.credit)} · ${esc(ph.license)}</small>`;
/** 박람회 정원 묶음(한 지점에 여러 개) → 정원 하나하나. 그 밖의 정원은 그대로 */
function gardenUnits(gs) {
  const out = [];
  for (const g of [...gs].sort((a, b) => (a.dest - b.dest) || (a.at - b.at))) {
    const ids = g.gardens ?? null;
    if (!ids) { out.push({ ...g, spot: g.spot ?? g.hub?.name }); continue; }
    for (const id of ids) { const x = app.expo?.[id]; if (x) out.push({ ...x, hub: g.hub, at: g.at, dest: g.dest, season: true, expo: true, spot: g.hub?.name }); }
  }
  return out;
}
const REMAIN = { '남음': '박람회 뒤에도 남음', '모름': '남아 있는지 확인 필요' };
/** 걷는 동안 패널: 가는 길에 볼 정원 하나하나 (지점마다 3개까지 보이고 나머지는 '더 보기') */
function gardenStrip(s) {
  const units = gardenUnits(s.gardens ?? []);
  if (!units.length) return null;
  const list = h('ol', { class: 'tr-gl' }), perSpot = {};
  const card = u => h('li', null, h('button', { type: 'button', class: 'tr-gl-card', onclick: () => gardenShot(u) },
    (ph => ph ? h('img', { class: 'tr-gl-img', src: ph.src, alt: '', loading: 'lazy' }) : h('span', { class: 'tr-gl-ico' }, icon('leaf', 14)))(app.photos?.gardens?.[u.id] ? gardenImg(u) : null),
    h('div', null,
      h('small', null, [u.dest ? '도착하는 곳' : u.spot ? `${u.spot} 근처` : '가는 길', u.expo ? `정원박람회 ${u.kind}` : null].filter(Boolean).join(' · ')),
      h('b', null, u.name),
      u.text ? h('p', null, u.text) : null,
      (u.maker || u.plants?.length) ? h('p', { class: 'tr-gl-sub' }, [u.maker ? `만든 이 ${u.maker}` : null, u.plants?.length ? `식물 ${u.plants.slice(0, 3).join(', ')}` : null].filter(Boolean).join(' · ')) : null)));
  const hidden = [];
  for (const u of units) {
    const k = u.hub?.id ?? u.id; perSpot[k] = (perSpot[k] ?? 0) + 1;
    const li = card(u);
    if (perSpot[k] > 3) { li.hidden = true; hidden.push(li); }
    list.append(li);
  }
  const more = hidden.length ? h('button', { type: 'button', class: 'tr-gl-more', onclick: e => { hidden.forEach(li => { li.hidden = false; }); e.currentTarget.remove(); } }, `정원 ${hidden.length}곳 더 보기`) : null;
  return h('section', { class: 'tr-gls' }, h('div', { class: 'tr-gls-head' }, icon('leaf', 13), h('b', null, `가는 길에 볼 정원 ${units.length}곳`), h('small', null, '눌러서 지도에서 보기')), list, more);
}

async function begin(course = null, avoid = []) {
  flushCourse();
  layers.route.clearLayers(); layers.plan.clearLayers(); layers.pins.clearLayers(); layers.garden.clearLayers(); layers.shot.clearLayers(); layers.gshot.clearLayers(); layers.prog.clearLayers(); layers.access.clearLayers();
  accessOpen = false;
  clearTreePins();
  trip = { id: Date.now().toString(36), stops: [], idx: 0, course: course?.name ?? null, courseObj: course, fb: { liked: [], disliked: [], bump: {} } };
  mount('tr-s-loading', [h('div', { class: 'tr-loading' },
    h('div', { class: 'tr-pulse' }, h('i'), h('i'), h('i')),
    h('b', null, course ? `‘${course.name}’ 코스를 준비하고 있어요` : '지금 내 위치에서 코스를 짜고 있어요'),
    h('ul', { class: 'tr-ticks' }, ['내 위치', '실시간 날씨·붐빔', '이용자 평가', '가는 길의 정원'].map((t, i) => h('li', { style: `--i:${i}` }, h('span', null, icon('check', 11)), t))),
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
  const tag = s.rating != null ? `<u class="tr-pin-face">${faceHtml(s.rating, 15)}</u>` : '';
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
      L.marker([g.hub.lat, g.hub.lon], { icon: L.divIcon({ className: '', html: g.pos ? `<div class="tr-flower mini" title="${esc(g.name)}" style="--d:${(reveal ? i * 200 + 400 : 0)}ms">${FLOWER_SVG}</div>` : `<div class="tr-flower${g.season ? '' : ' off'}" style="--d:${(reveal ? i * 200 + 400 : 0)}ms">${icon('leaf', 13).outerHTML}<em>${esc(g.gardens ? `정원 ${g.gardens.length}곳` : g.name)}${g.season ? '' : ` · ${g.next}월`}</em></div>`, iconSize: g.pos ? [18, 18] : [26, 26], iconAnchor: g.pos ? [9, 9] : [13, 13] }), zIndexOffset: g.pos ? 590 : 600 })
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
    h('div', { class: 'tr-stats four' },
      h('div', null, h('b', null, walk, h('small', null, '분')), h('span', null, '걷기')),
      h('div', null, h('b', null, ...meterParts(sum(legs, s => s.meters))), h('span', null, '거리')),
      h('div', { title: KCAL_NOTE }, h('b', null, legsKcal(legs), h('small', null, 'kcal')), h('span', null, '쓰는 칼로리')),
      h('div', null, h('b', null, total, h('small', null, '분')), h('span', null, '머무는 시간 포함'))),
    h('p', { class: 'tr-kcal-note' }, `칼로리는 ${KCAL_NOTE}`),
    planNotes(legs),
    criteriaBox(legs),
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
/**
 * '이 코스를 고른 기준' — 추천의 기준·이 코스의 실제 수치·쓴 자료(기준 시각)·근거를 펼쳐 보는 상자.
 * 객관성: 측정·공식 기준·연구에서 온 값과 팀이 정한 값(가정)을 나눠 적고, 숨기지 않음
 */
const CRIT_LABEL = { need: '하고 싶은 일과 맞는지', company: '같이 온 사람에게 맞는지', stay: '머물 수 있는 시간', crowd: '붐비지 않는지', thermal: '덥거나 춥지 않은지', toilet: '화장실까지 거리', walk: '걷는 거리', thermalBump: '', crowdBump: '' };
const EVIDENCE = [
  ['더위', '체감 31℃ 주의 · 33℃ 경고', '33℃는 기상청 폭염주의보 기준(일 최고 체감온도 33℃ 이상이 2일 이상 예상). 31℃는 주제서 예시값', 'offmix'],
  ['미세먼지', '초미세 36·76㎍/㎥, 미세 81·151㎍/㎥', '환경부 대기질 예보 등급 「나쁨」·「매우 나쁨」 경계', 'official'],
  ['붐빔', '서울숲 실시간 인구 · 요일·시간대 추정', '서울시 실시간 도시데이터(서울숲공원). 못 받으면 서울숲 보행 계수(조현민·권태경 2025)로 추정', 'measured'],
  ['그늘 길', '나무 그늘 비율이 높은 길을 먼저', '녹지 그늘이 걷는 길 온도를 낮춤(Lee & Park 2020, Patel 2026). 그늘 비율은 팀 20m 격자', 'study'],
  ['물가', '33℃ 이상인 10~16시에만 물가 가점', '서울숲 실측: 33℃ 넘는 날 물가가 공원 밖보다 시원(조현민·권태경 2022)', 'measured'],
  ['서울숲다움', '「볼 게 별로」면 서울숲다운 곳을 앞으로', '서울숲 18개 공간 540명 설문(임승빈 외 2012)', 'study'],
  ['붐빔에 예민한 곳', '사슴우리·습지는 붐빌 때 더 감점', '서울숲 블로그 990건 분석(주연이·정진우 2026). 감점 크기는 팀이 정한 값', 'mixed'],
  ['쉴 곳 간격', '어르신과 함께면 100m마다', '고령자는 좌석 밀도가 가장 시급(Lin 외 2024). 100m는 팀이 정한 값', 'mixed'],
  ['아쉬움 판단', '보통·별로면 남은 코스를 다시 짬', '서울숲 리뷰에서 3점 이하는 대부분 부정 내용(이주경·손용훈 2021)', 'study'],
  ['길과 포장·상가', '보행망·흙길 여부·상가 위치', 'OpenStreetMap(포장 정보는 공원 안 길의 약 26%만 있음)', 'measured'],
  ['점수 비중', '하고 싶은 일 35 · 머물 시간 20 · 같이 온 사람 15 · 붐빔 12 · 더위추위 10 · 걷는 거리 8 · 화장실 5', '팀이 정한 값. 현장 설문이 끝나면 바꿈', 'team'],
];
const EV_TAG = { official: ['공식 기준', 'ok'], measured: ['측정 자료', 'ok'], study: ['연구 근거', 'ok'], mixed: ['연구 + 팀 값', 'mid'], offmix: ['공식 기준 + 예시값', 'mid'], team: ['팀이 정한 값', 'mid'] };
function criteriaBox(legs) {
  if (!legs.length) return null;
  const rec = legs[0].rec, w = { ...(rec?.weights ?? {}) };
  for (const [k, v] of Object.entries(trip.fb.bump)) if (w[k] != null) w[k] += v;
  const wsum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  const weights = Object.entries(w).filter(([k, v]) => CRIT_LABEL[k] && v > 0).sort((a, b) => b[1] - a[1]);
  const tot = k => legs.reduce((a, s) => [a[0] + (s.cmp?.[k]?.[0] ?? 0), a[1] + (s.cmp?.[k]?.[1] ?? 0)], [0, 0]);
  const [dm, db] = tot('dist'), [sm, sb] = tot('stairs'), [um] = tot('unpaved'), [bm] = tot('biz');
  const agg = legs.reduce((a, s) => { const c = s.cmp?.main; if (c) { a.m += c.m; a.k += c.k; } return a; }, { m: 0, k: 0 });
  const shade = agg.k > 50 ? Math.round(100 * agg.m / agg.k) : null;
  const ratings = ratingsCount();
  const row = (k, v) => h('div', { class: 'tr-crit-row' }, h('span', null, k), h('b', null, v));
  return h('details', { class: 'tr-crit' },
    h('summary', null, icon('info', 13), '이 코스를 고른 기준', h('small', null, '수치·자료·근거')),
    h('div', { class: 'tr-crit-in' },
      h('h4', null, '1. 장소: 7가지를 점수로 따져 높은 곳부터'),
      h('div', { class: 'tr-crit-w' }, weights.map(([k, v]) => h('div', null, h('span', null, CRIT_LABEL[k]), h('i', { style: `width:${Math.round(v / wsum * 100 * 2.2)}%` }), h('b', null, `${Math.round(v / wsum * 100)}%`)))),
      h('p', { class: 'tr-crit-note' }, `같이 온 사람에 따라 비중이 달라져요(예: 아이와 → 화장실·걷는 거리 ↑). 남겨 주신 의견도 바로 더해요.${ratings ? ` 이용자 평가 ${ratings}건도 반영해요${hasSeed() ? '(시연용 가상 평가 포함)' : ''}.` : ''}`),
      h('ul', { class: 'tr-crit-stops' }, legs.map((s, i) => { const r = s.r.reasons;
        return h('li', null, h('b', null, `${i + 1}. ${s.r.place.name}`),
          h('span', null, [s.r.match[0], `붐빔 ${r.crowd.value}(${r.crowd.note.split(' · ')[0]})`, `화장실 ${r.toilet.value}`, `머물기 ${r.stay.value}`].filter(Boolean).join(' · '))); })),
      h('h4', null, '2. 길: 가장 짧은 길에서 출발해 조건만큼만 돌아가기'),
      row('걷는 거리', `${fmtM(dm)} (가장 짧은 길 ${fmtM(db)}${dm - db >= 20 ? `, +${Math.round((dm / Math.max(1, db) - 1) * 100)}%` : ''})`),
      shade != null ? row('그늘진 길', `${shade}%`) : null,
      row('계단', sm ? `${sm}곳${sb > sm ? ` (가장 짧은 길 ${sb}곳)` : ''}` : sb ? `없음 (가장 짧은 길엔 ${sb}곳)` : '없음'),
      um ? row('흙길·자갈길', fmtM(um)) : null,
      bm ? row('상가 맞닿은 길', fmtM(bm)) : null,
      h('p', { class: 'tr-crit-note' }, '그늘·한산함 때문에 돌아가는 건 가장 짧은 길의 1.2배까지, 쉴 곳을 들르는 건 1.35배까지만 허용해요. 들르는 순서는 가능한 순서를 모두 비교해 가장 덜 걷는 순서예요.'),
      h('h4', null, '3. 쓴 자료'),
      row('붐빔', live?.time ? `서울시 실시간 도시데이터 · ${live.time} 기준` : '요일·시간대 추정(서울숲 보행 계수)'),
      row('날씨', app.wx?.source ?? '–'),
      row('길·상가', 'OpenStreetMap · 팀 20m 격자(그늘)'),
      h('h4', null, '4. 기준값과 근거'),
      h('table', { class: 'tr-crit-ev' }, h('tbody', null, EVIDENCE.map(([k, v, src, kind]) => h('tr', null,
        h('th', null, k), h('td', null, h('div', null, v), h('small', null, src)), h('td', null, h('em', { class: EV_TAG[kind][1] }, EV_TAG[kind][0])))))),
      h('p', { class: 'tr-crit-note' }, '「팀이 정한 값」은 아직 측정 근거가 없는 값이라, 현장 설문과 이용자 평가가 쌓이면 바꿔요. 논문 목록은 README에 있어요.')));
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
  // 포장 상태·상권 인접(OSM surface · 상점 밀도, needs/tools/edge_extras.py): 가장 짧은 길보다 실제로 덜 지날 때만 알림
  const tot = k => legs.reduce((a, s) => [a[0] + (s.cmp?.[k]?.[0] ?? 0), a[1] + (s.cmp?.[k]?.[1] ?? 0)], [0, 0]);
  const [un, unB] = tot('unpaved'), [bz, bzB] = tot('biz');
  if (legs.some(s => s.cmp?.prefs?.nostairs) && unB - un >= 30) notes.push(['walk', `흙길·자갈길을 피해 포장길로 · 비포장 ${unB}m → ${un}m`]);
  if (legs.some(s => s.cmp?.prefs?.quiet) && bzB - bz >= 30) notes.push(['users', `성수동 상가 쪽 번잡한 길을 피했어요 · ${bzB}m → ${bz}m`]);
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
  document.body.classList.add('tr-walking');   // 「이 나무 뭐지?」는 걷기 시작하면 보임
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
  const u = gardenUnits([g]);
  toast({ cls: 'garden', img: ph?.src, small: g.gardens ? `가는 길 정원 · 이 근처 ${u.length}곳` : g.season ? '가는 길에 정원이 있어요' : `${g.next}월에 볼 수 있는 정원`,
    title: g.gardens ? u.slice(0, 2).map(x => x.name).join(' · ') : g.name, text: g.gardens ? u[0]?.text : null }, 4200);
}
function gardenShot(g, auto = false) {
  layers.gshot.clearLayers();
  const ph = gardenImg(g);
  // 사진 출처는 화면에 쓰지 않고 마우스를 올리면 보이게(라이선스 표시는 유지)
  const img = ph ? `<img src="${esc(ph.src)}" alt="${esc(ph.caption ?? g.name)}" title="${esc(`${ph.credit ?? ''} · ${ph.license ?? ''}`)}">` : `<div class="tr-gshot-none">${icon('leaf', 30).outerHTML}<span>${esc(g.name)}</span></div>`;
  const tag = g.pos ? `정원박람회 ${g.kind ?? ''}`.trim() : g.season ? (g.fresh ? '새 소식' : '지금 볼 수 있어요') : `${g.next}월에 피어요`;
  const m = L.marker([g.hub.lat, g.hub.lon], { icon: L.divIcon({ className: '', html: `<div class="tr-gshot${g.season ? '' : ' off'}">${img}<div class="tr-gshot-cap"><em>${esc(tag)}</em><b>${esc(g.name)}</b><p>${esc(g.text?.length > 60 ? `${g.text.slice(0, 60)}…` : g.text ?? '')}</p></div></div>`, iconSize: [230, 0], iconAnchor: [115, 26] }), interactive: false, zIndexOffset: 1100 }).addTo(layers.gshot);
  if (!auto) flyToVisible([g.hub.lat, g.hub.lon], 17.3, .8, desk() ? 120 : 130);
  setTimeout(() => { const n = m.getElement()?.firstChild; if (n) { n.classList.add('bye'); setTimeout(() => layers.gshot.removeLayer(m), 500); } }, auto ? 4200 : 7000);
  layers.garden.eachLayer(x => { const n = x.getElement?.()?.firstChild; if (n && x.getLatLng().equals([g.hub.lat, g.hub.lon])) { n.classList.remove('ping'); void n.offsetWidth; n.classList.add('ping'); } });
}

async function showShot(s, i) {
  const p = s.r.place, ph = photoOf(p.id);
  layers.shot.clearLayers();
  await flyToVisible([p.lat, p.lon], 17.8, .75, desk() ? 110 : 120);
  const img = ph ? `<img src="${esc(ph.src)}" alt="${esc(ph.caption)}">` : `<div class="tr-shot-none">${icon(p.type === 'indoor' ? 'home' : 'tree', 28).outerHTML}</div>`;
  const credit = ph ? creditLine(ph) : '';
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
    gardenStrip(s),
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
  // 표정을 골라야 다음으로 넘어갈 수 있음(평가 데이터 확보). 고르기 전에는 버튼을 잠가 둠
  const label = h('span', null, '표정을 골라 주세요');
  const next = h('button', { type: 'button', class: 'tr-cta', disabled: true, onclick: () => { if (val) advance(s, val, [...tags], note.value.trim()); } }, label, h('span', { class: 'tr-cta-arrow' }, '→'));
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
    next.disabled = false; next.classList.add('tr-glow-on');
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
  // 지도: 걸은 길 전체를 조용히 보여 줌(예전엔 점선이 길을 따라 흘러 '다시 재생'처럼 보여서 뺌)
  const all = trip.stops.flatMap(s => s.coords);
  if (all.length) flyBounds(L.latLngBounds(all), { ...padding(), maxZoom: 16.6 }, .6);
  const walkMin = sum(trip.stops, s => s.walkMin), meters = sum(trip.stops, s => s.meters);
  const q = quietHours(app.wx, app.now), best = q.best[0];
  const span = b => `${b.tomorrow ? '내일 ' : ''}${b.from}~${b.to === 0 ? 24 : b.to}시`;
  const later = q.now?.good ? 'now' : best ? span(best) : null;
  endInfo = { walkMin, meters, places: done.length || trip.stops.length, later: best ? span(best) : null };
  endInfo.receipt = saveReceipt(walkMin, meters);
  setFocus(trip.stops.length > 0);
  // 마무리 흐름: 오늘 걸은 곳 → 코스 전체 한 번 묻기 → 나가는 길 안내(주 버튼) → 작별 화면. '다음에 올 때' 코스는 보조
  const flow = trip.stops.length ? courseAsk(walkMin, meters) : null;
  const next = h('div'), exit = trip.stops.length ? exitBox() : null;
  const paintNext = () => next.replaceChildren(nextBox(later) ?? '');
  if (flow) flow.onChange = paintNext;
  endNodes = [
    h('div', { class: 'tr-panel-head' }, h('div', { class: 'tr-picked' }, labels().map(p => h('span', null, p)))),
    h('h2', { class: 'tr-q' }, '오늘 산책, 여기까지예요'),
    trip.stops.length ? h('div', { class: 'tr-stats four' },
      h('div', null, h('b', null, countUp(walkMin), h('small', null, '분')), h('span', null, '걸은 시간')),
      h('div', null, h('b', null, ...meterParts(meters)), h('span', null, '걸은 거리')),
      h('div', { title: KCAL_NOTE }, h('b', null, countUp(legsKcal(trip.stops)), h('small', null, 'kcal')), h('span', null, '쓴 칼로리')),
      h('div', null, h('b', null, done.length ? countUp(done.filter(s => s.rating >= 4).length) : '–', h('small', null, done.length ? `/${done.length}곳` : '')), h('span', null, '좋았던 곳'))) : null,
    done.length ? h('ol', { class: 'tr-journey' }, done.map((s, i) => h('li', { class: s.rating <= 2 ? 'low' : '', style: `--i:${i}` },
      h('span', { class: 'tr-num' }, trip.stops.indexOf(s) + 1),
      h('div', null,
        h('b', null, s.r.place.name),
        (s.tags ?? []).length ? h('div', { class: 'tr-jtags' }, s.tags.map(t => h('span', { class: BAD.some(b => b.key === t) ? 'bad' : '' }, TAG_LABEL[t]))) : null,
        s.comment ? h('q', null, s.comment) : null,
        s.why ? h('small', null, s.why) : null),
      h('div', { class: 'tr-journey-r' }, staticFace(s.rating, 22))))) : null,
    flow?.el,
    exit ?? h('button', { type: 'button', class: 'tr-cta tr-glow-on', onclick: goodbye }, '산책 마치기', h('span', { class: 'tr-cta-arrow' }, '→')),
    next,
    h('div', { class: 'tr-end-links' },
      h('button', { type: 'button', class: 'tr-textbtn', onclick: restart }, '다른 코스 고르기'),
      endInfo.receipt ? h('a', { class: 'tr-textbtn', href: receiptHref(), target: inFrame ? '_top' : null, onclick: flushCourse }, '영수증으로 남기기') : null,
      h('a', { class: 'tr-textbtn', href: `./?need=${st.need}&company=${st.company}&stay=${st.stay}#citizen` }, '자세히 보기')),
    h('p', { class: 'tr-foot' }, `붐빔은 요일·시간대 추정값, 날씨는 ${app.wx.live ? '실시간 예보' : '표본 날씨'}예요.${hasSeed() ? ' 좋아요 비율에 시연용 가상 평가 포함.' : ''} 사진: 위키미디어 공용`),
  ];
  mount('tr-s-result', endNodes);
  setTimeout(paintNext, 60);   // 다음 코스 계산은 화면이 뜬 뒤에
}
let endNodes = null, endInfo = null;

// ── 마무리 4. 나가는 길 안내: 노란 길을 그리고 '다 나왔어요'를 누르면 작별 화면 ──
function exitWalk(ex) {
  ex.show();
  const { last, kiosk, meters, min, wc } = ex;
  mount('tr-s-exit', [
    h('div', { class: 'tr-panel-head' }, h('div', { class: 'tr-stepno' }, h('b', null, '영수증 기계로')),
      h('button', { type: 'button', class: 'tr-back', onclick: () => { layers.route.eachLayer(l => { if (l.options?.className === 'tr-exit-line') layers.route.removeLayer(l); }); mount('tr-s-result', endNodes); } }, '다른 기계 고르기')),
    h('h2', { class: 'tr-q' }, kiosk.at),
    h('p', { class: 'tr-exit-lead' }, `지도의 노란 길을 따라 걸어서 ${min}분(${fmtM(meters)})이에요.`),
    h('p', { class: 'tr-exit-wc' }, '🧾', ' 기계에서 오늘 산책 영수증을 뽑으면 근처 카페 할인 쿠폰이 같이 나와요.'),
    Number.isFinite(wc) && wc < 300 ? h('p', { class: 'tr-exit-wc' }, icon('pin', 12), `가까운 화장실 · ${fmtM(Math.round(wc))}`) : null,
    h('button', { type: 'button', class: 'tr-cta tr-glow-on', onclick: goodbye }, '영수증 받았어요', h('span', { class: 'tr-cta-arrow' }, '→')),
  ]);
}

// ── 마무리 5. 작별 화면: 코스 평가를 보내고, 다음에 오기 좋은 때를 알려 주고 끝 ──
function goodbye() {
  flushCourse();
  const info = endInfo ?? { walkMin: 0, places: 0, later: null };
  layers.route.clearLayers(); layers.plan.clearLayers(); layers.pins.clearLayers(); layers.garden.clearLayers(); layers.shot.clearLayers(); layers.gshot.clearLayers();
  setFocus(false);
  flyBounds(cityBounds(), padding(), 1.2);
  trip = null; hud = null; document.body.classList.remove('tr-walking');
  Object.assign(st, { need: null, company: null, stay: null, startPick: 'auto' });
  st.must.clear();
  mount('tr-s-bye', [
    h('div', { class: 'tr-bye' },
      h('span', { class: 'tr-bye-ico' }, icon('tree', 26)),
      h('h2', null, '오늘도 잘 쉬다 가요'),
      info.places ? h('p', null, `서울숲에서 ${info.places}곳, ${Math.round(info.walkMin)}분을 걸었어요.`) : null,
      info.later ? h('p', { class: 'tr-bye-later' }, icon('clock', 13), `다음에 오기 좋은 때 · ${info.later}`) : null,
      h('small', null, '남겨 주신 표정은 이름·위치 없이 공원 길과 쉼터를 고치는 데 써요.')),
    info.receipt ? h('a', { class: 'tr-cta tr-glow-on tr-bye-rc', href: receiptHref(), target: inFrame ? '_top' : null },
      h('span', { class: 'tr-bye-rc-t' }, h('b', null, '오늘 산책, 영수증으로 받기'), h('small', null, '걸은 길이 찍힌 한 장 · 방명록에도 남길 수 있어요')),
      h('span', { class: 'tr-cta-arrow' }, '→')) : null,
    h('button', { type: 'button', class: 'tr-ghost tr-bye-home', onclick: restart }, '처음 화면으로'),
  ]);
}

// ── 마무리 6. 숲 영수증(../../영수증.html)으로 이어 주기 ──
// 오늘 걸은 기록을 이 기기(localStorage)에만 잠깐 두고, 영수증 페이지가 읽어서 내 영수증·지도에 찍습니다. 서버로 보내지 않음.
const RECEIPT_KEY = 'sf-receipt';
const inFrame = (() => { try { return window.top !== window.self; } catch { return true; } })();   // 모바일 화면(mobile.html) 폰 틀 안이면 틀 밖으로 열기
const receiptHref = () => `../../영수증.html?from=${inFrame ? 'mobile' : 'tour'}`;
const WHO_OF = { alone: '혼자', couple: '연인', friends: '친구', kids: '가족', elders: '어르신과', pet: '반려견과' };
function saveReceipt(walkMin, meters) {
  if (!trip?.stops.length) return false;
  const h0 = app.wx.hourly[0] ?? {};
  const sky = h0.pty === 3 ? '눈' : h0.pty > 0 ? '비' : (h0.sky ?? 1) >= 4 ? '흐림' : h0.sky === 3 ? '구름' : '맑음';
  const short = n => n.replace(/\(.*?\)/g, '').split('·')[0].trim();
  const best = rated().filter(s => s.rating >= 4).sort((a, b) => b.rating - a.rating)[0];
  const t0 = parseInt(trip.id, 36);
  const path = trip.stops.flatMap(s => s.coords).filter((c, i, a) => i % 2 === 0 || i === a.length - 1).map(([la, lo]) => [+la.toFixed(5), +lo.toFixed(5)]);
  const data = {
    at: Date.now(), gate: trip.start?.name ?? null, wx: Number.isFinite(h0.temp) ? `${sky} ${Math.round(h0.temp)}℃` : null,
    who: WHO_OF[st.company] ?? null, best: best ? short(best.r.place.name) : null,
    walkMin: Math.round(walkMin), meters: Math.round(meters),
    stay: Math.max(Math.round(walkMin), Math.round((Date.now() - t0) / 60000)),
    shade: Math.round(sum(trip.stops, s => s.cmp?.main?.m ?? 0)),
    stops: trip.stops.map(s => ({ t: short(s.r.place.name), lat: s.r.place.lat, lon: s.r.place.lon, min: s.walkMin, rating: s.rating })),
    path,
  };
  try { localStorage.setItem(RECEIPT_KEY, JSON.stringify(data)); return true; } catch { return false; }
}

// ── 마무리 1. 코스 전체 한 번 묻기(이어지는 흐름) ──
const FLOW_GOOD = [{ key: 'smooth', label: '동선이 자연스러웠어요' }, { key: 'varied', label: '볼거리가 다양했어요' }, { key: 'rested', label: '쉬며 걷기 좋았어요' }];
const FLOW_BAD = [{ key: 'backtrack', label: '되돌아가는 길이 많았어요' }, { key: 'norest', label: '중간에 쉴 곳이 없었어요' }, { key: 'samey', label: '비슷한 곳만 이어졌어요' }, { key: 'long', label: '너무 길었어요' }, { key: 'short', label: '너무 짧았어요' }];
let pendingCourse = null;   // 표정을 누른 뒤 까닭을 고를 시간을 주고 보냄. 화면을 떠나면 바로 보냄
function flushCourse() { if (!pendingCourse) return; clearTimeout(pendingCourse.timer); pendingCourse.send(); pendingCourse = null; }
function courseAsk(walkMin, meters) {
  const api = { face: null, tags: new Set(), onChange: null };
  const id = trip.id, stops = trip.stops.map(s => s.r.place.id), h0 = app.wx.hourly[0];
  const data = () => ({ face: api.face, reasons: [...api.tags], stops, course: trip?.courseObj?.id ?? null, need: st.need, company: st.company, stay: st.stay,
    minutes: Math.round(walkMin), meters: Math.round(meters), feels: h0?.feels, pm25: h0?.pm25, crowd: live?.rank });
  const arm = () => {
    if (app.wx.scenario || !api.face) return;   // 시연 날씨면 보내지 않음
    clearTimeout(pendingCourse?.timer);
    pendingCourse = { send: () => sendCourse(data(), id), timer: setTimeout(flushCourse, 6000) };
  };
  const word = h('span', { class: 'rv-word' }, '표정을 눌러 주세요'), chips = h('div', { class: 'tr-flow-chips' });
  // 보상: 어떤 표정이든 똑같이 줌(좋은 답만 유도하지 않도록). 공원 곳곳 영수증 기계에서 영수증을 뽑으면 주변 카페 할인 쿠폰이 함께 나옴
  const gift = h('div', { class: 'tr-gift' }, h('b', null, '🎁 카페 쿠폰'), h('span', null, '표정을 남기면 영수증과 함께 근처 카페 할인 쿠폰이 나와요. 어떤 표정이든 괜찮아요.'));
  const giftDone = () => { if (gift.classList.contains('on')) return; gift.classList.add('on'); gift.replaceChildren(h('b', null, '🎁 쿠폰 준비 완료'), h('span', null, '지도에 🧾로 표시된 영수증 기계 어디서든 받아 가세요.')); };
  const paintChips = good => chips.replaceChildren(h('div', { class: 'rv-chips' }, (good ? FLOW_GOOD : FLOW_BAD).map((x, i) => h('button', { type: 'button', class: `rv-chip ${good ? 'good' : 'bad'}`, style: `--i:${i}`, 'aria-pressed': 'false', onclick: e => {
    const b = e.currentTarget, on = !api.tags.has(x.key);
    on ? api.tags.add(x.key) : api.tags.delete(x.key);
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    arm(); api.onChange?.();
  } }, x.label))));
  const pick = faces(v => {
    const flip = !api.face || (api.face >= 4) !== (v >= 4);
    api.face = v;
    word.textContent = { 5: '좋았어요', 3: '그저 그랬어요', 1: '별로였어요' }[v]; word.classList.add('on'); word.dataset.f = v >= 4 ? 'good' : v === 3 ? 'mid' : 'bad';
    if (flip) { api.tags.clear(); paintChips(v >= 4); }
    giftDone(); arm(); api.onChange?.();
  }, '오늘 코스 흐름');
  api.el = h('section', { class: 'tr-rate tr-flow' },
    h('div', { class: 'tr-rate-h' }, h('b', null, stops.length > 1 ? '오늘 코스, 이어지는 흐름은 어땠어요?' : '오늘 산책, 어땠어요?'), word), gift, pick, chips,
    h('small', { class: 'tr-rate-why' }, '알려 주시면 다음 코스에 바로 반영하고, 공원 길·쉼터를 고치는 데 써요'));
  courseFb = api;
  return api;
}
let courseFb = null;

// ── 마무리 2. 다음엔 이런 코스(좋았던 곳과 코스 평가를 반영) ──
function nextBox(later) {
  if (!trip || !st.need || !st.company || !st.stay) return null;
  const fb = courseFb, tags = fb?.tags ?? new Set();
  const seen = trip.stops.map(s => s.r.place.id);
  let n = STOPS_BY_STAY[st.stay] ?? 3;
  if (tags.has('long')) n = Math.max(2, n - 1);
  if (tags.has('short')) n += 1;
  // 코스 평가를 다음 계산에 얹음: 쉴 곳 없음 → 쉼터·화장실 가까운 길, 비슷한 곳만 → 서울숲다운 곳(장소정체성)을 앞으로
  const keep = { ...trip.fb.bump }, keepId = trip.fb.identity;
  if (tags.has('norest')) trip.fb.bump.toilet = (trip.fb.bump.toilet ?? 0) + 40;
  if (tags.has('samey')) trip.fb.identity = true;
  let legs = [];
  try { legs = planFrom(trip.start, n, seen, [], []); } catch { legs = []; }
  trip.fb.bump = keep; trip.fb.identity = keepId;
  if (legs.length < 2) return h('div', { class: 'tr-next' }, h('b', null, '다음엔'), h('p', null, '오늘 거의 다 둘러보셨어요. 다른 날 다른 시간에 오면 또 달라요.'),
    later && later !== 'now' ? h('small', null, icon('clock', 12), `오기 좋은 때 · ${later}`) : null);
  const liked = trip.stops.filter(s => s.rating >= 4).map(s => s.r.place.name);
  // 보조 상자: 오늘 끝난 뒤 '다음에 올 때' 참고용. 바로 걷고 싶은 사람만 작은 버튼으로
  const why = tags.has('backtrack') ? '가장 덜 걷는 순서로 이었어요'
    : tags.has('norest') ? '쉼터·화장실이 가까운 길로 골랐어요'
    : tags.has('samey') ? '오늘과 다른 분위기의 서울숲다운 곳으로 골랐어요'
    : tags.has('long') ? '오늘보다 짧게 골랐어요' : tags.has('short') ? '오늘보다 한 곳 더 넣었어요'
    : liked.length ? `${liked[0]}${josa(liked[0], '이', '가')} 좋았다면, 비슷한 결의 안 가 본 곳이에요` : '오늘 안 가 본 곳으로 골랐어요';
  const minutes = sum(legs, s => s.walkMin) + dwell() * legs.length;
  const ids = legs.map(s => s.r.place.id);
  return h('div', { class: 'tr-next sub' },
    h('b', null, '다음에 올 때는'),
    h('div', { class: 'tr-next-path' }, legs.map((s, i) => [i ? h('i', null, '→') : null, h('span', null, s.r.place.name)]).flat().filter(Boolean)),
    h('p', null, `${why} · 약 ${minutes}분`),
    later && later !== 'now' ? h('small', null, icon('clock', 12), `오기 좋은 때 · ${later}`) : null,
    h('button', { type: 'button', class: 'tr-textbtn', onclick: () => { flushCourse(); st.must.clear(); st.startPick = 'auto'; begin({ id: null, name: '오늘에 이어 걷는 코스', stops: ids }); } },
      later === 'now' ? '지금 한산하고 날씨도 좋아요 · 이어서 더 걷기 ›' : '아직 더 걷고 싶다면 · 이어서 걷기 ›'));
}

// ── 마무리 3. 나가는 길: 마지막 곳에서 가장 가까운 영수증 기계(출구 2곳 + 공원 곳곳) ──
// 영수증 기계 배치(팀 제안): 두 출입구 + 공원 곳곳 12대. 영수증을 뽑으면 주변 카페 할인 쿠폰이 함께 나옴
// 가장 가까운 기계로 안내하되, 지도에 모두 띄우고 목록·지도에서 다른 기계를 골라 갈 수 있게 함
const KIOSKS = [
  { id: 'gate-station', at: '서울숲역 방면 입구' },
  { id: 'gate-north', at: '성수동 방면 북측 입구' },
  { id: 'family-lawn', at: '가족마당' },
  { id: 'stage', at: '야외무대' },
  { id: 'lake', at: '서울숲호수' },
  { id: 'skate-park', at: '스케이트파크' },
  { id: 'insect', at: '곤충식물원 앞' },
  { id: 'deer', at: '사슴우리' },
  { id: 'wind-hill', at: '바람의 언덕' },
  { id: 'wetland', at: '습지생태원' },
  { id: 'water-museum', at: '수도박물관' },
  { id: 'hangang-observatory', at: '한강 전망대' },
];
const kioskHubs = () => KIOSKS.map(k => ({ ...k, hub: app.model.hubById[k.id] })).filter(k => k.hub);
function drawKiosks(list, pick, go) {
  layers.route.eachLayer(l => { if (l.options?.kiosk) layers.route.removeLayer(l); });
  for (const o of list) {
    const on = pick === o.k.id;
    const mk = L.marker([o.k.hub.lat, o.k.hub.lon], { kiosk: true, interactive: true, keyboard: false, zIndexOffset: on ? 900 : 400, title: `영수증 기계 · ${o.k.at}`,
      icon: L.divIcon({ className: 'tr-kiosk-pin', html: `<div class="tr-kiosk${on ? ' on' : ''}"><span>🧾</span><b>${on ? `${o === list[0] ? '가장 가까운 기계' : o.k.at} · ${o.min}분` : `${o.min}분`}</b></div>`, iconSize: [0, 0] }) });
    mk.on('click', () => go(o));
    mk.addTo(layers.route);
  }
}
function exitBox() {
  const m = app.model, last = trip.stops[trip.stops.length - 1]?.r.place;
  if (!last) return null;
  const speed = trip.stops[trip.stops.length - 1].rec?.speed ?? speedFor(st.company);
  const env = { scale: crowdScale(app.now.dow, app.now.hour), sunMode: 'none', floodPenalty: null };
  const opts = kioskHubs().map(k => ({ k, route: k.hub.node === last.node ? { main: { meters: 0, coords: [] } } : planRoute(m, last.node, k.hub.node, { nostairs: st.company === 'kids' || st.company === 'elders' }, env, speed) }))
    .filter(x => x.route?.main)
    .map(x => { const meters = Math.round(x.route.main.meters + (last.off ?? 0) + (x.k.hub.off ?? 0)); return { ...x, meters, min: Math.max(1, Math.round(meters / speed)) }; })
    .sort((a, b) => a.meters - b.meters);
  const best = opts[0];
  if (!best) return null;
  const wc = m.dToilet?.[last.node];
  const exOf = o => ({
    last, kiosk: o.k, meters: o.meters, min: o.min, wc,
    show: () => {
      layers.route.eachLayer(l => { if (l.options?.className === 'tr-exit-line') layers.route.removeLayer(l); });
      const coords = [[last.lat, last.lon], ...o.route.main.coords, [o.k.hub.lat, o.k.hub.lon]];
      L.polyline(coords, { interactive: false, className: 'tr-exit-line', color: '#ffd27a', weight: 4, opacity: .9, dashArray: '2 8', lineCap: 'round' }).addTo(layers.route);
      drawKiosks(opts, o.k.id, go);
      flyBounds(L.latLngBounds(coords), { ...padding(), maxZoom: 17.4 }, .8);
    },
  });
  const go = o => exitWalk(exOf(o));
  // 산책 끝 화면: 기계 전부와 오늘 걸은 길이 한눈에 들어오게
  setTimeout(() => {
    drawKiosks(opts, best.k.id, go);
    const pts = [...opts.map(o => [o.k.hub.lat, o.k.hub.lon]), ...trip.stops.flatMap(s => s.coords)];
    flyBounds(L.latLngBounds(pts), { ...padding(), maxZoom: 16.6 }, .8);
  }, 700);
  return h('div', { class: 'tr-exit main' },
    h('div', { class: 'tr-exit-row' },
      h('span', { class: 'tr-exit-ico' }, '🧾'),
      h('div', null, h('b', null, `가장 가까운 영수증 기계 · ${best.k.at}`), h('p', null, `걸어서 ${best.min}분(${fmtM(best.meters)}) · 공원 곳곳 ${opts.length}곳 어디서든 뽑을 수 있어요`))),
    h('button', { type: 'button', class: 'tr-cta tr-glow-on', onclick: () => go(best) }, '가장 가까운 기계로 길 안내', h('span', { class: 'tr-cta-arrow' }, '→')),
    h('details', { class: 'tr-kiosk-list' },
      h('summary', null, '다른 기계로 가기'),
      h('div', { class: 'tr-kiosk-chips' }, opts.slice(1).map(o => h('button', { type: 'button', class: 'rv-chip', onclick: () => go(o) }, `${o.k.at} · ${o.min}분`)))),
    h('button', { type: 'button', class: 'tr-textbtn', onclick: goodbye }, '안내 없이 산책 마치기'));
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

/** 마친 뒤 '다른 곳으로 한 바퀴 더': 고른 조건(활동·동행·시간)은 그대로, 방금 들른 곳은 빼고 새 코스를 바로 짬. 조건이 없으면 처음부터 */
function newCourse() {
  if (!st.need || !st.company || !st.stay) return restart();
  const seen = (trip?.stops ?? []).map(s => s.r.place.id);
  st.must.clear(); st.startPick = 'auto';
  begin(null, seen);
}
function restart() {
  flushCourse();
  layers.route.clearLayers(); layers.plan.clearLayers(); layers.pins.clearLayers(); layers.garden.clearLayers(); layers.shot.clearLayers(); layers.gshot.clearLayers(); layers.prog.clearLayers();
  trip = null; hud = null; document.body.classList.remove('tr-walking');
  Object.assign(st, { need: null, company: null, stay: null, startPick: 'auto' });
  st.must.clear();
  flyBounds(cityBounds(), padding(), 1);
  go(1);
}

// ── 시작 ──
async function boot() {
  renderTop(); makeMap(); renderIntro();
  mountTreeCam({ map, L, hubs: () => app?.model?.hubById ?? {}, fly: ll => flyToVisible(ll, 17, .7) });
  if (backFromMobile) el.intro.classList.add('tr-quiet');   // 글자 없이 어두운 화면만 덮어 둠: 멀리 있는 처음 지도가 비치지 않게
  addEventListener('pagehide', flushCourse);   // 마침 화면에서 창을 닫아도 코스 평가는 보냄
  refreshLive(); setInterval(liveTick, 1000);      // 서울시 자료가 5분마다 바뀜: 5분마다 다시 불러오고 카운트다운 표시
  refreshAccess(); setInterval(refreshAccess, 5 * 60 * 1000);
  const flowTick = () => refreshFlow().then(() => { if (app) { paintLive(); accessPins(); } });
  flowTick(); setInterval(flowTick, 5 * 60 * 1000);
  const t0 = performance.now();
  const loadJson = path => fetch(new URL(path, location.href), { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
  try {
    const wxLive = fetchWeather().catch(() => null);
    const [data, raw, photos, gardens, seed, expo] = await Promise.all([loadData(loadJson), Promise.race([wxLive, sleep(1500).then(() => null)]),
      loadJson('./data/photos.json').catch(() => null), loadJson('./data/gardens.json').catch(() => null), loadJson('./data/ratings_seed.json').catch(() => null),
      loadJson('./data/expo_gardens.json').catch(() => null)]);
    const now = seoulNow();
    const model = buildModel(data, []);
    model.parkBounds = L.geoJSON(data.park).getBounds();
    if (seed?.journeys) seed.journeys.forEach(j => { j.seed = true; });
    // 시연용: tour.html?wx=heat|dust|rain|cold 이면 그 날씨로 고정
    const demo = ['heat', 'dust', 'rain', 'cold'].find(k => k === new URLSearchParams(location.search).get('wx'));
    const wxOf = w => annotate(demo ? applyScenario(w, demo) : w, now);
    app = { data, model, now, wx: wxOf(raw ?? sampleWeather()), photos, gardens, seed, news: loadNews(store),
      expo: Object.fromEntries((expo?.items ?? []).map(x => [x.id, x])) };
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
