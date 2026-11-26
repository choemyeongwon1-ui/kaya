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

/* ---------- ① 성수 → 서울숲 흐름: 지도 왼쪽 위 상자 하나 ----------
 * 지도 위엔 아무것도 그리지 않고(2026-11-26 사용자 요청), 숫자만 상자로.
 * 역에서 내린 사람(최근 10분) + 주변 도로 상태 비율(서울시 도로 소통 구간 수 기준) */
let box = null;
function showBox(map, on) {
  if (!map) return;
  if (!box) { box = document.createElement('div'); box.className = 'tr-flow-card'; map.getContainer().appendChild(box); }
  box.hidden = !on;
  if (!on) return;
  const sf = stationFlows().sort((a, b) => b.off10 - a.off10);
  const hit = Object.fromEntries(surges().filter(g => g.hit).map(g => [g.name, g.off10 / Math.max(g.before, 1)]));
  const roads = flow?.roads ?? [], n = roads.length;
  const pct = k => (n ? Math.round(100 * roads.filter(r => r.idx === k).length / n) : 0);
  const t = String(flow?.roadAvg?.time ?? flow?.park?.time ?? '').slice(11, 16);
  box.innerHTML = `<b>성수 → 서울숲 흐름</b><small>지하철·도로로 서울숲에 들어오는 흐름${t ? ` · ${t} 기준` : ''}</small>`
    + (sf.length ? `<div class="h"><i class="arr"></i>역에서 내린 사람 (최근 10분)</div>`
      + `<div class="n">${sf.map(s => `${s.name}역 <b>${s.est ? '약 ' : ''}${Math.round(s.off10)}</b>${hit[s.name] ? `<em class="up"> ↑평소의 ${hit[s.name].toFixed(1)}배</em>` : ''}`).join(' · ')}명</div>`
      + (sf.some(s => s.est) ? '<div class="n dim">(성수역은 추정)</div>' : '') : '')
    + (n ? `<div class="h">주변 도로</div><div class="k"><span><i style="background:${ROAD_C['원활']}"></i>잘 뚫림 ${pct('원활')}%</span><span><i style="background:${ROAD_C['서행']}"></i>느림 ${pct('서행')}%</span><span><i style="background:${ROAD_C['정체']}"></i>막힘 ${pct('정체')}%</span></div>` : '');
}
export function clearFlow(layer) { layer.clearLayers(); showBox(layer._map, false); }
export function drawFlow(layer) { layer.clearLayers(); showBox(layer._map, !!flow); }

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
.tr-flow-card{position:absolute;z-index:500;left:16px;top:72px;max-width:300px;padding:12px 14px;border-radius:16px;background:rgba(7,13,10,.85);border:1px solid rgba(255,255,255,.1);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:#f1f7f3;font-size:12px;line-height:1.5;pointer-events:none}
.tr-flow-card>b{display:block;font-size:14px}.tr-flow-card>small{display:block;font-size:10.5px;opacity:.55;margin-bottom:8px}
.tr-flow-card .h{display:flex;align-items:center;gap:6px;margin-top:6px;font-size:11px;opacity:.7}
.tr-flow-card .n{margin-top:1px}.tr-flow-card .n b{color:#6af5b0;font-size:14px}.tr-flow-card .n.dim{opacity:.55;font-size:11px}.tr-flow-card .n em.up{font-style:normal;color:#ffc978;font-size:11px}
.tr-flow-card .k{display:flex;flex-wrap:wrap;gap:3px 12px;margin-top:2px}.tr-flow-card .k i{display:inline-block;width:14px;height:4px;border-radius:2px;margin-right:6px;vertical-align:middle}
.tr-flow-card i.arr{display:inline-block;width:16px;height:8px;background:#6af5b0;clip-path:polygon(0 25%,65% 25%,65% 0,100% 50%,65% 100%,65% 75%,0 75%)}
@media(max-width:899px){.tr-flow-card{top:62px;left:10px;max-width:210px;padding:9px 11px;font-size:10.5px}.tr-flow-card>small{display:none}.tr-flow-card .n b{font-size:12px}}
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
