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
const LOG_KEY = 'sf-tour-autolog-v1';

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
    by[s.name] = { name: s.name, line: lineNm(s.line), lat: s.lat, lon: s.lon, off10: mid(a.off10), off30: mid(a.off30), est: false };
  }
  for (const a of subs.filter(a => a.stations.length > 1)) {
    const unknown = a.stations.filter(s => !by[s.name]);
    if (unknown.length !== 1) continue;
    let o10 = mid(a.off10), o30 = mid(a.off30);
    a.stations.filter(s => by[s.name]).forEach(s => { o10 -= by[s.name].off10; o30 -= by[s.name].off30; });
    const s = unknown[0];
    if (o10 > 0) by[s.name] = { name: s.name, line: lineNm(s.line), lat: s.lat, lon: s.lon, off10: o10, off30: Math.max(o30, o10), est: true };
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

/** 곧 붐벼요: 역 급증(10~20분 뒤) 또는 서울시 예측이 3시간 안에 지금보다 한 단계 이상 오름 */
export function soonBusy(live) {
  const hits = surges().filter(s => s.hit);
  if (hits.length) return { when: '10~20분 뒤', text: `${hits.map(s => `${s.name}역`).join('·')}에서 사람이 많이 내리고 있어요`, src: '지하철 내린 사람 · 짐작' };
  if (!live?.level) return null;
  const cur = LV.indexOf(live.level);
  const up = (live.forecast ?? []).slice(0, 3).find(f => LV.indexOf(f.level) > cur);
  if (up) return { when: `${+String(up.time).slice(11, 13)}시쯤`, text: `「${up.level}」으로 바뀔 거예요`, src: '서울시 예측' };
  return null;
}

/* ---------- ① 오는 길 지도 위 흐름 ---------- */
export function drawFlow(layer, L, center) {
  layer.clearLayers();
  if (!flow) return;
  const off = { interactive: false };
  for (const r of flow.roads ?? []) {
    if (r.path.length < 2) continue;
    L.polyline(r.path, { ...off, color: ROAD_C[r.idx] ?? '#999', weight: r.idx === '정체' ? 4 : 3, opacity: r.idx === '원활' ? .45 : .85, lineCap: 'round', className: 'tr-flow-road' }).addTo(layer);
  }
  for (const s of stationFlows()) {
    // 역에서 공원 쪽으로 짧은 화살표(굵을수록 많이 내림). 추정값은 점선
    const dLat = center[0] - s.lat, dLon = center[1] - s.lon, len = Math.hypot(dLat * 110900, dLon * 88200) || 1;
    const k = Math.min(1, 260 / len), tip = [s.lat + dLat * k, s.lon + dLon * k];
    const w = Math.max(3, Math.min(14, s.off10 / 25));
    L.polyline([[s.lat, s.lon], tip], { ...off, color: '#6af5b0', weight: w, opacity: s.est ? .5 : .85, dashArray: s.est ? '8 6' : null, lineCap: 'round', className: 'tr-flow-arrow' }).addTo(layer);
    const ang = Math.atan2(-(tip[0] - s.lat) * 110900, (tip[1] - s.lon) * 88200) * 180 / Math.PI;
    L.marker(tip, { ...off, icon: L.divIcon({ className: 'tr-flow-head-wrap', html: `<i class="tr-flow-head" style="transform:rotate(${ang}deg)"></i>`, iconSize: [0, 0] }) }).addTo(layer);
    // 이름표는 화살표 가운데(역 자리엔 '오는 길' 지하철 핀이 이미 있음)
    L.marker([(s.lat + tip[0]) / 2, (s.lon + tip[1]) / 2], { ...off, icon: L.divIcon({ className: 'tr-flow-lab-wrap', html: `<div class="tr-flow-lab${s.est ? ' est' : ''}">${s.name}역 <b>${s.est ? '약 ' : ''}${Math.round(s.off10)}명</b><small>10분간 내림${s.est ? '·추정' : ''}</small></div>`, iconSize: [0, 0] }) }).addTo(layer);
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
/** rules: [{ key, on, onText, offText }] — 켜지고 꺼질 때만 한 줄씩 남김(처음 열었을 땐 켜진 것만) */
export function recordAuto(rules) {
  const lg = loadLog(), d = new Date(), t = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  let changed = false;
  for (const r of rules) {
    const prev = lg.last[r.key];
    if (prev === r.on) continue;
    lg.last[r.key] = r.on; changed = true;
    if (prev === undefined && !r.on) continue;
    lg.items.unshift({ t, on: r.on, text: r.on ? r.onText : r.offText });
  }
  if (changed) { lg.items = lg.items.slice(0, 30); try { localStorage.setItem(LOG_KEY, JSON.stringify(lg)); } catch {} }
  return lg.items;
}
export function autoCard(items) {
  return h('section', { class: 'tr-auto', 'aria-label': '오늘 알아서 바꾼 것' },
    h('b', { class: 'tr-auto-h' }, '오늘 알아서 바꾼 것'),
    items.length ? h('ol', null, items.slice(0, 8).map(i => h('li', { class: i.on ? 'on' : '' }, h('time', null, i.t), h('span', null, i.text))))
      : h('p', null, '아직 없어요. 날씨도 붐빔도 괜찮아서 평소대로 골라 드려요.'),
    h('p', { class: 'tr-lc-src' }, '날씨·붐빔·지하철이 기준을 넘으면 화면이 스스로 안내를 바꿔요 · 이 기기에만 저장'));
}

/* ---------- 스타일 ---------- */
const css = `
.tr-flow-head{display:block;width:0;height:0;margin:-7px 0 0 -2px;border-left:12px solid #6af5b0;border-top:7px solid transparent;border-bottom:7px solid transparent;transform-origin:2px 7px;filter:drop-shadow(0 0 3px rgba(0,0,0,.6))}
.tr-flow-lab{position:absolute;transform:translate(-50%,calc(-100% - 10px));white-space:nowrap;font-size:11px;font-weight:600;color:#fff;background:rgba(7,13,10,.85);border:1px solid rgba(106,245,176,.5);border-radius:9px;padding:3px 7px;text-align:center;pointer-events:none}
.tr-flow-lab b{color:#6af5b0;margin-left:2px}.tr-flow-lab small{display:block;font-size:9.5px;font-weight:500;opacity:.65}
.tr-flow-lab.est{border-style:dashed;border-color:rgba(255,255,255,.3)}.tr-flow-lab.est b{color:#cfe}
.tr-flow-key{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:11px;opacity:.85;margin:8px 0 2px}
.tr-flow-key i{display:inline-block;width:14px;height:4px;border-radius:2px;margin-right:5px;vertical-align:middle}
.tr-flow-key i.arr{height:7px;background:#6af5b0;clip-path:polygon(0 25%,65% 25%,65% 0,100% 50%,65% 100%,65% 75%,0 75%)}
.tr-flow-key p{flex-basis:100%;margin:4px 0 0}
.tr-lc-soon{margin:8px 0 0;padding:8px 10px;border-radius:10px;background:rgba(255,201,120,.12);border:1px solid rgba(255,201,120,.45);font-size:12.5px;line-height:1.45}
.tr-lc-soon b{color:#ffc978;margin-right:4px}.tr-lc-soon small{display:block;font-size:10.5px;opacity:.6}
.tr-auto{margin-top:12px;padding:12px 12px 8px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)}
.tr-auto-h{display:block;font-size:13px;margin-bottom:6px}
.tr-auto ol{list-style:none;margin:0;padding:0}
.tr-auto li{display:grid;grid-template-columns:42px 1fr;gap:6px;padding:6px 0;border-top:1px solid rgba(255,255,255,.07);font-size:12.5px;line-height:1.45;opacity:.7}
.tr-auto li.on{opacity:1}.tr-auto li time{font-size:11.5px;opacity:.6;padding-top:1px}
.tr-auto>p{font-size:12px;opacity:.7;margin:2px 0 6px}
`;
const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
