// 이용자 화면 「도시 흐름」: 성수에서 서울숲으로 들어오는 사람·차의 흐름
//  ① 오는 길 지도: 주변 도로 막힘(색) + 역별 내린 사람(화살표 굵기)
//  ② 곧 붐벼요: 서울시 혼잡 예측 + 역 하차 급증
//  ③ 오늘 알아서 바꾼 것: 날씨·붐빔에 따라 화면이 스스로 바꾼 안내를 시간순으로
// 자료: 서울시 실시간 도시데이터(중계 서버 proxy/seoul-flow). 서울숲역·뚝섬역은 실측, 성수역은
// 서울시가 '성수카페거리'로 뚝섬역과 묶어 주므로 뚝섬역을 뺀 추정값.
import { h } from './ui.js';

const FLOW_URL = 'https://krseuiwyftqbbdsbvycq.supabase.co/functions/v1/seoul-flow';
const LV = ['여유', '보통', '약간 붐빔', '붐빔'];
const ROAD_C = { '원활': '#6af5b0', '서행': '#ffc978', '정체': '#ff7a66' };
// 하차 급증: 최근 10분 ≥ 80명이면서 그 앞 20분의 10분 평균의 1.5배 이상(잠정 규칙, 검증 필요)
const SURGE_MIN = 80, SURGE_X = 1.5;
const LOG_KEY = 'sf-tour-autolog-v2';

let flow = null;
export const getFlow = () => flow;
export async function refreshFlow() {
  try {
    const c = new AbortController(), t = setTimeout(() => c.abort(), 12000);
    const d = await (await fetch(FLOW_URL, { signal: c.signal, cache: 'no-cache' })).json();
    clearTimeout(t);
    flow = d?.error ? flow : d;
  } catch { /* 못 받으면 지난 값 유지 */ }
  return flow;
}

const mid = r => (r ? (r[0] + r[1]) / 2 : null);
const lineNm = l => (/^\d+$/.test(String(l)) ? `${l}호선` : String(l ?? ''));
const hm = t => { const m = String(t ?? '').match(/(\d{1,2}):(\d{2})/); return m ? `${+m[1]}:${m[2]}` : ''; };

/** 역별 최근 10분·30분 내린 사람(가운데 값). 여러 역이 묶인 장소는 이미 아는 역을 빼서 남은 한 역을 추정 */
export function stationFlows() {
  const by = {}, subs = flow?.subways ?? [];
  for (const a of subs.filter(a => a.stations.length === 1)) {
    const s = a.stations[0];
    by[s.name] = { name: s.name, line: lineNm(s.line), lat: s.lat, lon: s.lon, off10: mid(a.off10), off30: mid(a.off30), on10: mid(a.on10), off5: mid(a.off5), offDay: mid(a.offDay), est: false };
  }
  for (const a of subs.filter(a => a.stations.length > 1)) {
    const unknown = a.stations.filter(s => !by[s.name]);
    if (unknown.length !== 1) continue;
    let o10 = mid(a.off10), o30 = mid(a.off30), n10 = mid(a.on10), o5 = mid(a.off5), od = mid(a.offDay);
    a.stations.filter(s => by[s.name]).forEach(s => { o10 -= by[s.name].off10; o30 -= by[s.name].off30; if (n10 != null && by[s.name].on10 != null) n10 -= by[s.name].on10; if (o5 != null && by[s.name].off5 != null) o5 -= by[s.name].off5; if (od != null && by[s.name].offDay != null) od -= by[s.name].offDay; });
    const s = unknown[0];
    if (o10 > 0) by[s.name] = { name: s.name, line: lineNm(s.line), lat: s.lat, lon: s.lon, off10: o10, off30: Math.max(o30, o10), on10: n10 != null && n10 > 0 ? n10 : null, off5: o5 != null && o5 >= 0 ? o5 : null, offDay: od != null && od > 0 ? od : null, est: true };
  }
  return Object.values(by).filter(s => s.lat != null && s.off10 != null);
}
/** 서울숲에 바로 붙은 역(실측값)만 급증 판단. 성수역은 추정값이라 안내에 안 씀 */
export function surges() {
  return stationFlows().filter(s => !s.est).map(s => {
    const before = (s.off30 - s.off10) / 2;
    return { ...s, before, hit: s.off10 >= SURGE_MIN && before > 0 && s.off10 >= before * SURGE_X };
  });
}
export const roadJam = () => {
  const r = flow?.roads ?? [];
  return r.length ? r.filter(x => x.idx === '정체').length / r.length : null;
};

/** 30분 뒤 예측(늘 보임): 서울숲역·뚝섬역 하차 급증이면 '붐빌 수 있어요', 서울시 예측이 3시간 안에 오르면 그 시각,
 *  둘 다 아니면 '지금처럼'. 역 하차 → 공원 도착까지 20~30분으로 봄(잠정, 검증 필요) */
export function soonBusy(live) {
  const sg = surges(), hits = sg.filter(s => s.hit);
  const subTxt = sg.length ? sg.map(s => `${s.name}역 ${Math.round(s.off10)}명`).join(' · ') + ' (10분간 내림)' : '';
  if (hits.length) return { hot: true, head: '30분 뒤 서울숲이 붐빌 수 있어요', text: `${hits.map(s => `${s.name}역`).join('·')}에서 평소보다 사람이 많이 내리고 있어요`, src: `${subTxt} · 서울시 실시간 도시데이터` };
  if (!live?.level) return sg.length ? { hot: false, head: '30분 뒤에도 지금과 비슷해요', text: '역에서 내리는 사람이 평소 수준이에요', src: subTxt } : null;
  const cur = LV.indexOf(live.level);
  const up = (live.forecast ?? []).slice(0, 3).find(f => LV.indexOf(f.level) > cur);
  if (up) return { hot: true, head: `${+String(up.time).slice(11, 13)}시쯤 서울숲이 붐빌 수 있어요`, text: `「${live.level}」 → 「${up.level}」`, src: `서울시 혼잡 예측${subTxt ? ` · ${subTxt}` : ''}` };
  return { hot: false, head: `30분 뒤에도 「${live.level}」일 거예요`, text: sg.length ? '역에서 내리는 사람이 평소 수준이에요' : '서울시 예측에서도 더 붐비지 않아요', src: `${subTxt ? `${subTxt} · ` : ''}서울시 실시간 도시데이터` };
}

/* ---------- ① 성수 → 서울숲 흐름 ----------
 * 지도: 주변 도로 소통(가는 선, 막힌 곳만 은은히 빛남) + 역 → 가까운 공원 입구로 휘어 들어가는 흐름선
 *       (굵기 = 최근 10분 내린 사람, 안쪽에 빛이 천천히 흐름, 끝에 얇은 화살촉)
 * 왼쪽 위 상자: 범례 + 역별 숫자 + 막힘 비율 */
const M_LAT = 110900, M_LON = 88200;
const distM = (a, b) => Math.hypot((a[0] - b[0]) * M_LAT, (a[1] - b[1]) * M_LON);
function nearGate(p, gates, center) {
  const gs = (gates ?? []).filter(g => g.lat != null).map(g => [g.lat, g.lon]);
  return gs.length ? gs.reduce((a, g) => (distM(p, g) < distM(p, a) ? g : a)) : center;
}
/** 역 → 입구 부드러운 곡선(2차 베지어) */
function curve(a, b, bend = .22) {
  const dx = (b[1] - a[1]) * M_LON, dy = (b[0] - a[0]) * M_LAT;
  const c = [(a[0] + b[0]) / 2 + dx * bend / M_LAT, (a[1] + b[1]) / 2 - dy * bend / M_LON];
  return Array.from({ length: 33 }, (_, i) => { const t = i / 32, u = 1 - t; return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]; });
}

let box = null;
const nf = x => Math.round(x).toLocaleString();
/** 역의 '평소 대비': 최근 10분 하차 ÷ 그 앞 20분의 10분당 평균 */
function vsUsual(s) {
  const before = (s.off30 - s.off10) / 2;
  if (!(before > 0)) return null;
  const x = s.off10 / before, g = surges().find(q => q.name === s.name);
  return { x, before, cls: g?.hit ? 'hot' : x >= 1.2 ? 'up' : x <= .8 ? 'down' : 'flat', text: g?.hit ? `평소의 ${x.toFixed(1)}배` : x >= 1.2 ? '늘고 있어요' : x <= .8 ? '줄고 있어요' : '평소 수준' };
}
function showBox(map, on) {
  if (!map) return;
  if (!box) { box = document.createElement('div'); box.className = 'tr-flow-card'; map.getContainer().appendChild(box); }
  box.hidden = !on;
  if (!on) return;
  const sf = stationFlows().sort((a, b) => b.off10 - a.off10), max = Math.max(1, ...sf.map(s => Math.max(s.off10, (s.off30 - s.off10) / 2)));
  const t = String(flow?.park?.time ?? '').slice(11, 16);
  box.innerHTML = `<b>성수 → 서울숲 흐름</b><small>지하철역에서 내린 사람${t ? ` · ${t} 기준` : ''}</small>`
    + sf.map(s => {
      const u = vsUsual(s), before = u ? u.before : null;
      return `<div class="sr${s.est ? ' est' : ''}">`
        + `<div class="sr-h"><span>${s.name}역<em>${s.line}</em></span><b>${s.est ? '약 ' : ''}${nf(s.off10)}<small>명</small></b></div>`
        + `<div class="sr-bar"><i class="pre" style="width:${before != null ? Math.max(4, 100 * before / max) : 0}%"></i><i class="now" style="width:${Math.max(4, 100 * s.off10 / max)}%"></i></div>`
        + `<div class="sr-f"><span>최근 10분${s.off5 != null ? ` · 5분 ${nf(s.off5)}명` : ''}${s.offDay ? ` · 오늘 ${nf(s.offDay)}명` : ''}</span>${u ? `<em class="${u.cls}">${u.text}</em>` : ''}</div></div>`;
    }).join('')
    + `<div class="lg"><span><i class="now"></i>최근 10분</span><span><i class="pre"></i>그 전 10분 평균</span></div>`
    + (sf.some(s => s.est) ? '<div class="n dim">성수역은 성수카페거리 묶음에서 뚝섬역을 뺀 추정</div>' : '');
}
// 주변 장소 표시 위치(대략, 라벨용 — 서울시 장소 경계의 정확한 중심 아님, 검증 필요)
const NEAR_POS = { '성수카페거리': [37.5446, 127.0559], '뚝섬한강공원': [37.5296, 127.0673] };
const LV_C = { '여유': '#6af5b0', '보통': '#f5d58a', '약간 붐빔': '#ffb35c', '붐빔': '#ff7a66' };
function levelPill(L, layer, ll, name, level, people, big) {
  const c = LV_C[level] ?? '#aaa';
  L.marker(ll, { interactive: false, zIndexOffset: big ? 900 : 500, icon: L.divIcon({ className: 'tr-fl-wrap', iconSize: [0, 0],
    html: `<div class="tr-fl-lv${big ? ' big' : ''}" style="--c:${c}"><i></i><span>${name}</span><b>${level}</b>${people ? `<small>${people}</small>` : ''}</div>` }) }).addTo(layer);
}
export function clearFlow(layer) { layer.clearLayers(); showBox(layer._map, false); }
export function drawFlow(layer, L, center, gates) {
  layer.clearLayers();
  showBox(layer._map, !!flow);
  if (!flow) return;
  const off = { interactive: false };
  // 붐빔 단계: 서울숲 + 주변 장소
  const pk = flow.park;
  if (pk?.level) levelPill(L, layer, center, '서울숲', pk.level, '', true);
  for (const a of flow.near ?? []) if (NEAR_POS[a.name] && a.level) levelPill(L, layer, NEAR_POS[a.name], a.name, a.level, '', false);
  // 역: 내린 사람이 많을수록 크게 퍼지는 빛 + 숫자 이름표
  // 추정값(성수역)은 빼고, 이름표는 역 이름 + 인원만
  const sf = stationFlows().filter(s => !s.est), max = Math.max(1, ...sf.map(s => s.off10));
  for (const s of sf) {
    const k = s.off10 / max, size = Math.round(40 + 56 * k), u = vsUsual(s), hot = u?.cls === 'hot';
    const tag = `<div class="tr-fl-tag${s.lon - center[1] > .008 ? ' left' : ''}" style="--o:${Math.round(size * .32) + 8}px">`
      + `<span>${s.name}역</span><b>${nf(s.off10)}<small>명</small></b></div>`;
    L.marker([s.lat, s.lon], { ...off, zIndexOffset: 700, icon: L.divIcon({ className: 'tr-fl-wrap', iconSize: [0, 0],
      html: `<div class="tr-fl-bc${hot ? ' hot' : ''}${s.est ? ' est' : ''}" style="--z:${size}px;--d:${(3.4 - 1.4 * k).toFixed(2)}s"><i class="glow"></i><i class="sonar"></i><i class="sonar"></i><i class="sonar"></i><i class="core"></i></div>${tag}` }) }).addTo(layer);
  }
}

export function flowLegend() {
  if (!flow) return null;
  const jam = roadJam();
  return h('div', { class: 'tr-flow-key' },
    h('span', null, h('i', { style: `background:${ROAD_C['원활']}` }), '잘 뚫림'),
    h('span', null, h('i', { style: `background:${ROAD_C['서행']}` }), '느림'),
    h('span', null, h('i', { style: `background:${ROAD_C['정체']}` }), '막힘'),
    h('span', null, h('i', { class: 'arr' }), '역에서 내린 사람'),
    jam != null && jam >= .3 ? h('p', { class: 'tr-acc-note warn' }, `주변 길의 ${Math.round(jam * 100)}%가 막혀요. 지하철로 오는 게 빨라요.`) : null);
}

/* ---------- ③ 오늘 알아서 바꾼 것 ---------- */
function loadLog() {
  try { const v = JSON.parse(localStorage.getItem(LOG_KEY) || 'null'); if (v?.day === new Date().toDateString()) return v; } catch {}
  return { day: new Date().toDateString(), last: {}, items: [] };
}
/** rules: [{ key, on, onText, offText }] — 처음 열면 지금 판단을 모두 한 줄씩, 그 뒤엔 켜지고 꺼질 때만 */
export function recordAuto(rules) {
  const lg = loadLog(), d = new Date(), t = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  let changed = false;
  for (const r of rules) {
    const prev = lg.last[r.key];
    if (prev === r.on) continue;
    lg.last[r.key] = r.on; changed = true;
    lg.items.unshift({ t, on: r.on, text: r.on ? r.onText : r.offText });
  }
  if (changed) { lg.items = lg.items.slice(0, 30); try { localStorage.setItem(LOG_KEY, JSON.stringify(lg)); } catch {} }
  return lg.items;
}
let autoMore = false;
export function autoCard(items) {
  const list = h('ol', null, items.slice(0, autoMore ? 30 : 4).map(i => h('li', { class: i.on ? 'on' : '' }, h('time', null, i.t), h('span', null, i.text))));
  return h('section', { class: 'tr-auto', 'aria-label': '자동 판단 기록' },
    h('div', { class: 'tr-auto-h' }, h('i'), h('b', null, '자동 판단 기록'), h('small', null, '도시 데이터를 보고 시스템이 스스로 바꾼 것')),
    list,
    items.length > 4 ? h('button', { type: 'button', class: 'tr-auto-more', onclick: e => { autoMore = !autoMore; e.currentTarget.closest('.tr-auto').replaceWith(autoCard(items)); } }, autoMore ? '접기' : `지난 기록 ${items.length - 4}개 더 보기`) : null,
    h('p', { class: 'tr-lc-src' }, '5분마다 날씨·붐빔·지하철·도로를 확인 · 기준(체감 31℃ 등)은 잠정 · 이 기기에만 저장'));
}

/* ---------- 스타일 ---------- */
const css = `
.tr-flow-card{position:absolute;z-index:500;left:16px;top:72px;max-width:270px;padding:12px 14px;border-radius:16px;background:rgba(7,13,10,.84);border:1px solid rgba(255,255,255,.1);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);color:#f1f7f3;font-size:11.5px;line-height:1.5;pointer-events:none;box-shadow:0 10px 30px rgba(0,0,0,.35)}
.tr-flow-card>b{display:block;font-size:14px}.tr-flow-card>small{display:block;font-size:10.5px;opacity:.55;margin-bottom:8px}
.tr-flow-card .k{display:flex;flex-wrap:wrap;gap:3px 12px;margin-top:4px}.tr-flow-card .k i{display:inline-block;width:14px;height:4px;border-radius:2px;margin-right:6px;vertical-align:middle}
.tr-flow-card .k i.arr{width:16px;height:8px;background:#6af5b0;clip-path:polygon(0 25%,65% 25%,65% 0,100% 50%,65% 100%,65% 75%,0 75%)}
.tr-flow-card .n{margin-top:7px}.tr-flow-card .n b{color:#6af5b0}.tr-flow-card .n em{display:block;font-style:normal;opacity:.55}
@media(max-width:899px){.tr-flow-card{top:62px;left:10px;max-width:210px;padding:9px 11px;font-size:10.5px}.tr-flow-card>small{display:none}}
.tr-flow-card .h{display:flex;align-items:center;gap:6px;margin-top:6px;font-size:11px;opacity:.7}
.tr-flow-card .n.dim{opacity:.55;font-size:11px;margin-top:0}.tr-flow-card .n em.up{display:inline;font-style:normal;color:#ffc978;font-size:11px;opacity:1}
.tr-flow-card i.arr{display:inline-block;width:16px;height:8px;background:#6af5b0;clip-path:polygon(0 25%,65% 25%,65% 0,100% 50%,65% 100%,65% 75%,0 75%)}
.tr-flow-card .st{display:grid;grid-template-columns:1fr 52px 52px;align-items:baseline;gap:6px;padding:3px 0}
.tr-flow-card .st+.st{border-top:1px solid rgba(255,255,255,.06)}
.tr-flow-card .st span{font-size:12px}.tr-flow-card .st span i.up{display:block;font-style:normal;font-size:10px;color:#ffb35c}
.tr-flow-card .st span.lg{font-size:10px;opacity:.6;display:flex;align-items:center;gap:4px}.tr-flow-card .st span.lg i{display:inline-block;width:12px;height:3px;border-radius:2px;margin-left:4px}.tr-flow-card .st span.lg i.o{background:#6af5b0}.tr-flow-card .st span.lg i.n{background:#9fc8ff}
.tr-flow-card .st em{font-style:normal;font-size:10px;opacity:.55;text-align:right}
.tr-flow-card .st b{text-align:right;font-size:14px;font-weight:750}.tr-flow-card .st b.off{color:#6af5b0}.tr-flow-card .st b.on{color:#9fc8ff}
.tr-flow-card .st.est b{opacity:.7}
.tr-fl-tag small{font-size:11px;font-weight:700;color:#9fc8ff}
.tr-fl-bc{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none}
.tr-fl-bc svg{position:absolute;left:calc(var(--z) / -2);top:calc(var(--z) / -2);overflow:visible;filter:drop-shadow(0 0 6px rgba(0,0,0,.6))}
.tr-fl-bc .trk{fill:rgba(7,13,10,.55);stroke:rgba(255,255,255,.14);stroke-width:5}
.tr-fl-bc .arc{fill:none;stroke-width:5;stroke-linecap:round}.tr-fl-bc .arc.off{stroke:#6af5b0;filter:drop-shadow(0 0 4px rgba(106,245,176,.8))}.tr-fl-bc .arc.on{stroke:#9fc8ff;filter:drop-shadow(0 0 4px rgba(159,200,255,.7))}
.tr-fl-bc .spin{fill:none;stroke:rgba(236,255,245,.35);stroke-width:1.2;stroke-dasharray:2 5;transform-origin:0 0;animation:trBcSpin 14s linear infinite}
.tr-fl-bc .core{fill:#ecfff5;filter:drop-shadow(0 0 5px #6af5b0) drop-shadow(0 0 10px rgba(106,245,176,.6))}
.tr-fl-bc .sonar{position:absolute;left:calc(var(--z) / -2);top:calc(var(--z) / -2);width:var(--z);height:var(--z);border-radius:50%;border:1px solid rgba(106,245,176,.7);opacity:0;animation:trBcSonar var(--d) cubic-bezier(.2,.6,.3,1) infinite}
.tr-fl-bc .sonar+.sonar{animation-delay:calc(var(--d) / 2)}
.tr-fl-bc.hot .sonar{border-color:rgba(255,179,92,.9)}.tr-fl-bc.hot .core{fill:#fff1dc;filter:drop-shadow(0 0 6px #ffb35c) drop-shadow(0 0 12px rgba(255,179,92,.7))}
.tr-fl-bc.est .trk{stroke-dasharray:3 4}.tr-fl-bc.est .arc{opacity:.6}.tr-fl-bc.est .sonar{display:none}
@keyframes trBcSpin{to{transform:rotate(360deg)}}@keyframes trBcSonar{0%{opacity:.8;transform:scale(.9)}100%{opacity:0;transform:scale(2)}}
.tr-fl-wrap .tr-fl-tag{transform:translate(var(--o,10px),-50%)}.tr-fl-wrap .tr-fl-tag.left{transform:translate(calc(-100% - var(--o,10px)),-50%)}
@media(prefers-reduced-motion:reduce){.tr-fl-bc .spin,.tr-fl-bc .sonar{animation:none}}
.tr-flow-card{min-width:250px}
.tr-flow-card .sr{padding:7px 0 6px}.tr-flow-card .sr+.sr{border-top:1px solid rgba(255,255,255,.07)}
.tr-flow-card .sr-h{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.tr-flow-card .sr-h span{font-size:12.5px;font-weight:650}.tr-flow-card .sr-h span em{font-style:normal;font-size:10px;font-weight:500;opacity:.5;margin-left:5px}
.tr-flow-card .sr-h b{font-size:18px;font-weight:800;color:#6af5b0;letter-spacing:-.02em;line-height:1}.tr-flow-card .sr-h b small{font-size:11px;font-weight:600;opacity:.7;margin-left:1px}
.tr-flow-card .sr-bar{position:relative;height:5px;margin:6px 0 4px;border-radius:3px;background:rgba(255,255,255,.06)}
.tr-flow-card .sr-bar i{position:absolute;left:0;top:0;height:100%;border-radius:3px}.tr-flow-card .sr-bar i.pre{background:rgba(255,255,255,.22)}
.tr-flow-card .sr-bar i.now{background:linear-gradient(90deg,rgba(106,245,176,.4),#6af5b0);box-shadow:0 0 8px rgba(106,245,176,.5);height:3px;top:1px}
.tr-flow-card .sr-f{display:flex;justify-content:space-between;gap:8px;font-size:10.5px}.tr-flow-card .sr-f span{opacity:.55}
.tr-flow-card .sr-f em,.tr-fl-tag em{font-style:normal;font-weight:700;font-size:10.5px}
.tr-flow-card em.hot,.tr-fl-tag em.hot{color:#ffb35c}.tr-flow-card em.up,.tr-fl-tag em.up{color:#f5d58a}.tr-flow-card em.flat,.tr-fl-tag em.flat{color:rgba(241,247,243,.6)}.tr-flow-card em.down,.tr-fl-tag em.down{color:#9fc8ff}
.tr-flow-card .sr.est .sr-h b{color:#d9efe3}.tr-flow-card .sr.est .sr-bar i.now{background:rgba(217,239,227,.6);box-shadow:none}
.tr-flow-card .lg{display:flex;gap:12px;margin-top:6px;font-size:10px;opacity:.55}.tr-flow-card .lg i{display:inline-block;width:12px;height:3px;border-radius:2px;margin-right:5px;vertical-align:middle}.tr-flow-card .lg i.now{background:#6af5b0}.tr-flow-card .lg i.pre{background:rgba(255,255,255,.35)}
.tr-fl-bc .glow{position:absolute;left:calc(var(--z) / -2);top:calc(var(--z) / -2);width:var(--z);height:var(--z);border-radius:50%;background:radial-gradient(circle,rgba(106,245,176,.45) 0,rgba(106,245,176,.12) 40%,rgba(106,245,176,0) 70%);animation:trBcBreath var(--d) ease-in-out infinite}
.tr-fl-bc .core{position:absolute;left:-6px;top:-6px;width:12px;height:12px;border-radius:50%;background:#ecfff5;box-shadow:0 0 0 3px rgba(7,13,10,.7),0 0 10px #6af5b0,0 0 20px rgba(106,245,176,.6)}
.tr-fl-bc .sonar+.sonar+.sonar{animation-delay:calc(var(--d) * 2 / 3)}.tr-fl-bc .sonar+.sonar{animation-delay:calc(var(--d) / 3)}
.tr-fl-bc.hot .glow{background:radial-gradient(circle,rgba(255,179,92,.5) 0,rgba(255,179,92,.14) 40%,rgba(255,179,92,0) 70%)}.tr-fl-bc.hot .core{background:#fff1dc;box-shadow:0 0 0 3px rgba(7,13,10,.7),0 0 10px #ffb35c,0 0 22px rgba(255,179,92,.7)}
.tr-fl-bc.est .glow{opacity:.5;animation:none}.tr-fl-bc.est .core{background:#d9efe3;box-shadow:0 0 0 3px rgba(7,13,10,.7)}
@keyframes trBcBreath{50%{transform:scale(1.12);opacity:.75}}
.tr-fl-tag b small{font-size:10.5px;font-weight:600;color:rgba(241,247,243,.6);margin-left:2px}
@media(prefers-reduced-motion:reduce){.tr-fl-bc .glow{animation:none}}
.tr-fl-crowd{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none}
.tr-fl-crowd i{position:absolute;left:calc(var(--s) / -2);top:calc(var(--s) / -2);width:var(--s);height:var(--s);border-radius:50%;border:2.5px solid rgba(106,245,176,.95);background:radial-gradient(circle,rgba(106,245,176,.35),rgba(106,245,176,0) 72%);box-shadow:0 0 12px rgba(106,245,176,.5);opacity:0;transform:scale(.2);animation:trFlRip var(--d) ease-out infinite}
.tr-fl-crowd i:nth-child(2){animation-delay:calc(var(--d) / 3)}.tr-fl-crowd i:nth-child(3){animation-delay:calc(var(--d) * 2 / 3)}
.tr-fl-crowd.hot i{border-color:rgba(255,179,92,.9);background:radial-gradient(circle,rgba(255,179,92,.3),rgba(255,179,92,0) 70%)}
.tr-fl-crowd.est i{border-style:dashed;border-color:rgba(236,255,245,.4)}
@keyframes trFlRip{0%{opacity:1;transform:scale(.15)}100%{opacity:0;transform:scale(1)}}
.tr-fl-tag em{font-style:normal;font-size:10.5px;font-weight:700;color:#ffb35c}
@media(prefers-reduced-motion:reduce){.tr-fl-crowd i{animation:none;opacity:.5;transform:none}}
.tr-fl-jam{filter:drop-shadow(0 0 3px rgba(255,122,102,.75))}
.tr-fl-core{filter:drop-shadow(0 0 5px rgba(106,245,176,.55))}
.tr-fl-run{animation:trFlRun 2.2s linear infinite}@keyframes trFlRun{to{stroke-dashoffset:-36}}
.tr-fl-tip{position:absolute;width:22px;height:22px;overflow:visible;pointer-events:none}.tr-fl-tip path{fill:none;stroke:#ecfff5;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 3px #6af5b0)}
.tr-fl-st{position:absolute;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:#07100c;border:2px solid #ecfff5;box-shadow:0 0 0 0 rgba(106,245,176,.6);animation:trFlPulse 2.4s ease-out infinite}
.tr-fl-st.est{border-color:rgba(236,255,245,.6);animation:none}@keyframes trFlPulse{70%{box-shadow:0 0 0 10px rgba(106,245,176,0)}100%{box-shadow:0 0 0 0 rgba(106,245,176,0)}}
.tr-fl-tag{position:absolute;transform:translate(10px,-50%);display:flex;align-items:baseline;gap:6px;white-space:nowrap;padding:4px 10px 4px 9px;border-radius:999px;background:rgba(7,13,10,.78);border:1px solid rgba(106,245,176,.35);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);pointer-events:none}
.tr-fl-tag span{font-size:11px;color:rgba(241,247,243,.75)}.tr-fl-tag b{font-size:13px;font-weight:750;color:#6af5b0;letter-spacing:-.01em}
.tr-fl-lv{position:absolute;transform:translate(-50%,-50%);display:flex;align-items:center;gap:6px;white-space:nowrap;padding:5px 11px 5px 9px;border-radius:999px;background:rgba(7,13,10,.8);border:1px solid color-mix(in srgb,var(--c) 55%,transparent);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);box-shadow:0 6px 18px rgba(0,0,0,.35);pointer-events:none}
.tr-fl-lv i{width:8px;height:8px;border-radius:50%;background:var(--c);box-shadow:0 0 8px var(--c)}
.tr-fl-lv span{font-size:11px;color:rgba(241,247,243,.75)}.tr-fl-lv b{font-size:12.5px;font-weight:750;color:var(--c)}.tr-fl-lv small{font-size:10.5px;color:rgba(241,247,243,.6)}
.tr-fl-lv:not(.big){transform:translate(calc(-100% + 12px),-210%)}
.tr-fl-lv.big{padding:7px 14px 7px 11px}.tr-fl-lv.big span{font-size:13px;font-weight:700;color:#fff}.tr-fl-lv.big b{font-size:15px}.tr-fl-lv.big i{width:10px;height:10px;animation:trFlPulse 2.4s ease-out infinite}
.tr-fl-tag.left{transform:translate(calc(-100% - 10px),-50%)}
.tr-fl-tag.est{border-style:dashed;border-color:rgba(255,255,255,.25)}.tr-fl-tag.est b{color:#d9efe3}
@media(prefers-reduced-motion:reduce){.tr-fl-run,.tr-fl-st{animation:none}}
.tr-flow-head{display:block;width:0;height:0;margin:-7px 0 0 -2px;border-left:12px solid #6af5b0;border-top:7px solid transparent;border-bottom:7px solid transparent;transform-origin:2px 7px;filter:drop-shadow(0 0 3px rgba(0,0,0,.6))}
.tr-flow-lab{position:absolute;transform:translate(-50%,calc(-100% - 10px));white-space:nowrap;font-size:11px;font-weight:600;color:#fff;background:rgba(7,13,10,.85);border:1px solid rgba(106,245,176,.5);border-radius:9px;padding:3px 7px;text-align:center;pointer-events:none}
.tr-flow-lab b{color:#6af5b0;margin-left:2px}.tr-flow-lab small{display:block;font-size:9.5px;font-weight:500;opacity:.65}
.tr-flow-lab.est{border-style:dashed;border-color:rgba(255,255,255,.3)}.tr-flow-lab.est b{color:#cfe}
.tr-flow-key{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:11px;opacity:.85;margin:8px 0 2px}
.tr-flow-key i{display:inline-block;width:14px;height:4px;border-radius:2px;margin-right:5px;vertical-align:middle}
.tr-flow-key i.arr{height:7px;background:#6af5b0;clip-path:polygon(0 25%,65% 25%,65% 0,100% 50%,65% 100%,65% 75%,0 75%)}
.tr-flow-key p{flex-basis:100%;margin:4px 0 0}
.tr-lc-soon{margin:8px 0 0;padding:8px 10px;border-radius:10px;background:rgba(106,245,176,.07);border:1px solid rgba(106,245,176,.25);font-size:12px;line-height:1.45}
.tr-lc-soon b{display:block;font-size:13.5px;color:#6af5b0}.tr-lc-soon small{display:block;font-size:10.5px;opacity:.6}
.tr-lc-soon.hot{background:rgba(255,201,120,.12);border-color:rgba(255,201,120,.5)}.tr-lc-soon.hot b{color:#ffc978}
.tr-auto{margin:10px 0 0;padding:12px 12px 8px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)}
.tr-auto-h{display:flex;align-items:baseline;gap:7px;margin-bottom:6px;flex-wrap:wrap}.tr-auto-h b{font-size:13px}.tr-auto-h small{font-size:10.5px;opacity:.55}
.tr-auto-h i{width:7px;height:7px;border-radius:50%;background:#6af5b0;box-shadow:0 0 8px #6af5b0;align-self:center;animation:trAutoP 2s infinite}
@keyframes trAutoP{50%{opacity:.35}}
.tr-auto-more{border:0;background:none;color:inherit;opacity:.6;font-size:11.5px;padding:4px 0;cursor:pointer;text-decoration:underline}
.tr-auto ol{list-style:none;margin:0;padding:0}
.tr-auto li{display:grid;grid-template-columns:42px 1fr;gap:6px;padding:6px 0;border-top:1px solid rgba(255,255,255,.07);font-size:12.5px;line-height:1.45;opacity:.7}
.tr-auto li.on{opacity:1}.tr-auto li time{font-size:11.5px;opacity:.6;padding-top:1px}
.tr-auto>p{font-size:12px;opacity:.7;margin:2px 0 6px}
`;
const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
