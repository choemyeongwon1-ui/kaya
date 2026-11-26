// 디지털트윈 개선 시뮬레이션 (관리자용) — [만족도] 화면(ops/index.html)의 「디지털트윈에서 개선안 만들기」로 들어온다.
// 모형: 공원 자료(features·network·팀 20m 격자)로 그린 설계 평면도 바닥 + city3d 흰색 매스 건물 + 수관비율로 심은 나무. three.js r170(vendor, MIT)
// 최선안: 거점 둘레(envScore와 같은 80m) 20m 칸마다 시설 6종을 후보로 두고, 주변 환경 점수를 가장 많이 올리는 것을 하나씩 더한다(탐욕법).
// 점수: analysis/02_vulnerability.py와 같은 식으로 칸 점수를 다시 셈 → index.html의 sat·envScore(80m)로 거점 예측 만족도(predict 콜백)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const D = '../data/';
const CSV = '../../output/seoulforest_vulnerability_grid.csv';   // 02_vulnerability.py 원본 산출(소수 3자리, team.json과 같은 칸 순서)
const LA = -2.755, LB = 2.434, RA = 32.1, RB = 444.5, EA = 39.3, EB = 508.1;   // 02_vulnerability.py 표준화 범위(5~95 백분위)
const WT = { heat: .35, crowd: .15, access: .25, air: .25 };
const K_TREE = -0.839, K_PAVE = 1.345;   // 팀 Landsat 회귀: LST편차 ~ 수관비율 + 포장비율 (수면 제외, R² 0.21)
const CELL_M2 = 400, CANOPY_M2 = 64, TOILET_M = 250, DECK_R = 25, DECK_K = .88;   // 수관 64㎡·화장실 250m·데크 25m/×0.88은 가정값
const SUN = { doy: 213, lat: 37.544, lon: 127.043, tz: 9 };    // 8월 1일
const OPT_HRS = [10, 12, 14, 16], MAX_ITEMS = 6, MIN_GAIN = .2, ENV_R = 80;   // 최선안: 10~16시 평균 그늘 · 최대 6개 · 0.2점 미만이면 멈춤(가정)

const FAC = {
  bench: { g: 'score', label: '벤치', rest: 1 },
  pergola: { g: 'score', label: '파고라', rest: 1, roof: { hx: 2.5, hy: 2.5, h: 2.7 } },
  canopy: { g: 'score', label: '그늘막', rest: 1, roof: { hx: 2, hy: 2, h: 3 } },
  tree: { g: 'score', label: '그늘 나무' },
  lawn: { g: 'score', label: '잔디마당' },
  deck: { g: 'score', label: '데크 산책로' },
  toilet: { g: 'count', label: '화장실' },
  garden: { g: 'none', label: '정원·화단' }, photo: { g: 'none', label: '포토존' }, play: { g: 'none', label: '놀이터' }
};
const BAD = { weather: '덥거나 추웠어요', crowded: '붐볐어요', far: '멀었어요', boring: '볼 게 별로였어요', facility: '쉴 곳·화장실 부족' };
const REC = { weather: ['canopy', 'pergola', 'tree'], crowded: ['deck', 'bench'], far: ['bench', 'toilet'], boring: ['garden', 'photo', 'play'], facility: ['bench', 'toilet'] };

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const J = u => fetch(u, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });
const TX = u => fetch(u, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.text(); });
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const hm = v => { const a = Math.floor(v), m = Math.round((v - a) * 60); return String(a).padStart(2, '0') + ':' + String(m).padStart(2, '0'); };
const f1 = v => (v >= 0 ? '+' : '') + v.toFixed(1);
const DIR8 = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
const POP = new Uint8Array(65536); for (let i = 1; i < 65536; i++) POP[i] = POP[i >> 1] + (i & 1);

// 해 위치: 적위·균시차(NOAA 일반식) → 고도·방위각(도, 북에서 시계 방향)
export function sunPos(hour, s = SUN) {
  const g = 2 * Math.PI / 365 * (s.doy - 1 + (hour - 12) / 24);
  const eq = 229.18 * (.000075 + .001868 * Math.cos(g) - .032077 * Math.sin(g) - .014615 * Math.cos(2 * g) - .040849 * Math.sin(2 * g));
  const de = .006918 - .399912 * Math.cos(g) + .070257 * Math.sin(g) - .006758 * Math.cos(2 * g) + .000907 * Math.sin(2 * g) - .002697 * Math.cos(3 * g) + .00148 * Math.sin(3 * g);
  const tst = hour * 60 + eq + 4 * s.lon - 60 * s.tz, ha = (tst / 4 - 180) * Math.PI / 180, la = s.lat * Math.PI / 180;
  const cz = Math.sin(la) * Math.sin(de) + Math.cos(la) * Math.cos(de) * Math.cos(ha), zen = Math.acos(Math.max(-1, Math.min(1, cz)));
  const az = (Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(la) - Math.tan(de) * Math.cos(la)) * 180 / Math.PI + 180) % 360;
  return { alt: 90 - zen * 180 / Math.PI, az };
}
function sunDir(hour) { const p = sunPos(hour), a = p.alt * Math.PI / 180, z = p.az * Math.PI / 180; return { x: Math.sin(z) * Math.cos(a), y: Math.cos(z) * Math.cos(a), z: Math.sin(a), alt: p.alt, az: p.az }; }

const RAMP = [[15, [47, 158, 107]], [30, [150, 205, 92]], [39.7, [242, 211, 91]], [49.1, [245, 150, 74]], [55.8, [229, 72, 77]], [66, [170, 30, 58]]];
function ramp(v) {
  if (v <= RAMP[0][0]) return RAMP[0][1];
  for (let i = 1; i < RAMP.length; i++) if (v <= RAMP[i][0]) { const t = (v - RAMP[i - 1][0]) / (RAMP[i][0] - RAMP[i - 1][0]), a = RAMP[i - 1][1], b = RAMP[i][1]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  return RAMP[RAMP.length - 1][1];
}
const pctColor = p => p >= 85 ? 0x2fbf7f : p >= 75 ? 0xe8b93a : 0xf07a3a;
const pctCss = p => p >= 85 ? '#6af5b0' : p >= 75 ? '#f5d58a' : '#ff9d5c';

async function loadRatings() {
  let live = null;
  try { const m = await import('../needs/js/review.js'); live = await m.fetchComfort(90); } catch (e) { live = null; }
  if (live && live.places && Object.keys(live.places).length) return { places: live.places, demo: false, check: live.check || null, n: live.total ? live.total.n : null, since: live.since };
  const seed = await J('../needs/data/ratings_seed.json').catch(() => null), places = {};
  (seed && seed.journeys || []).forEach(j => (j.stops || []).forEach(s => {
    const p = places[s.id] || (places[s.id] = { n: 0, good: 0, mid: 0, bad: 0, reasons: {} });
    p.n++; if (s.rating >= 4) p.good++; else if (s.rating >= 3) p.mid++; else p.bad++;
    (s.tags || []).forEach(t => { p.reasons[t] = (p.reasons[t] || 0) + 1; });
  }));
  return { places, demo: true };
}
const satPct = p => p && p.n ? (p.good * 100 + p.mid * 50) / p.n : null;

// ---------- 근거 확인: 방문객 아쉬움이 실제 상황(평가 당시 실시간 도시데이터)과 맞는지 ----------
const NOW_URL = 'https://krseuiwyftqbbdsbvycq.supabase.co/functions/v1/seoul-now';   // proxy/seoul-now · OA-21285 서울숲공원
// 한쪽 Fisher 정확검정: 조건 안(a 아쉬움, b 아님) vs 밖(c, d) — 조건 안에서 아쉬움 비율이 더 높을 확률
function fisherGreater(a, b, c, d) {
  const n = a + b + c + d, r1 = a + b, c1 = a + c, LF = [0]; for (let i = 1; i <= n; i++) LF[i] = LF[i - 1] + Math.log(i);
  const pr = x => Math.exp(LF[r1] + LF[n - r1] + LF[c1] + LF[n - c1] - LF[n] - LF[x] - LF[r1 - x] - LF[c1 - x] - LF[n - r1 - c1 + x]);
  let p = 0; for (let x = a; x <= Math.min(r1, c1); x++) p += pr(x); return Math.min(1, p);
}
// 조건 정의: 붐빔 = 실시간 혼잡 '보통' 이상(0 여유·1 보통·2 약간 붐빔·3 붐빔) · 날씨 = 체감 30℃ 이상 또는 −5℃ 미만(5℃ 구간, 가정)
const COND = {
  crowded: { tag: 'crowded', src: 'crowd', inside: k => k >= 1, inLabel: '혼잡 보통 이상', outLabel: '여유' },
  weather: { tag: 'weather', src: 'feels', inside: k => k >= 30 || k <= -10, inLabel: '체감 30℃↑·−5℃↓', outLabel: '그 밖' }
};
function crossTab(chk, key) {
  const c = COND[key], bins = chk && chk[c.src] || {}; let a = 0, b = 0, cc = 0, d = 0;
  Object.keys(bins).forEach(k => { const v = bins[k], t = v[c.tag] || 0; if (c.inside(+k)) { a += t; b += v.n - t; } else { cc += t; d += v.n - t; } });
  return { a, b, c: cc, d, nIn: a + b, nOut: cc + d, tags: a + cc };
}
function verdict(t) {
  const rIn = t.nIn ? t.a / t.nIn : 0, rOut = t.nOut ? t.c / t.nOut : 0, p = t.nIn && t.nOut ? fisherGreater(t.a, t.b, t.c, t.d) : 1;
  let v = 'none';
  if (!t.tags) v = 'zero'; else if (t.nIn < 5) v = 'few'; else if (rIn >= 2 * rOut && p < .1) v = 'yes'; else if (rIn > rOut) v = 'lean'; else v = 'no';
  return Object.assign({}, t, { rIn, rOut, p, v });
}
const VTXT = { yes: '실제 상황과 맞음', lean: '경향은 있으나 아직 약함', no: '실제 상황과 안 맞음', few: '그런 상황의 평가가 아직 적음', zero: '이런 아쉬움이 아직 없음', none: '검증 자료 없음' };
function topBad(p) { if (!p) return null; let b = null; Object.keys(BAD).forEach(k => { const v = (p.reasons || {})[k] || 0; if (v && (!b || v > b[1])) b = [k, v]; }); return b; }
function parseCSV(txt) {
  const L = txt.replace(/^﻿/, '').trim().split(/\r?\n/), H = L[0].split(','), col = ['lst_anom', 'tree', 'built', 'd_rest', 'd_ent'].map(k => H.indexOf(k));
  if (col.some(c => c < 0)) throw new Error('CSV 열 없음');
  return L.slice(1).map(r => { const v = r.split(','); return col.map(c => +v[c]); });
}
function inPoly(x, y, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
function crownGeo() {
  const parts = [[0, 0, 0, 1], [.55, -.1, .2, .72], [-.5, -.05, -.3, .75], [.15, .35, -.45, .68], [-.2, .3, .5, .66]], pos = [], nor = [];
  parts.forEach(([x, y, z, r]) => { const g = new THREE.IcosahedronGeometry(r, 0).toNonIndexed(); const p = g.attributes.position.array, n = g.attributes.normal.array; for (let i = 0; i < p.length; i += 3) { pos.push(p[i] + x, p[i + 1] + y, p[i + 2] + z); nor.push(n[i], n[i + 1], n[i + 2]); } g.dispose(); });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return g;
}
// 나무 한 그루 = 수관(5덩이) + 줄기를 한 모양으로(정점 색: 수관 흰색 × 그루별 초록, 줄기는 곱해도 갈색이 되게)
function treeGeo(crown) {
  const g0 = new THREE.Color().setHSL(.275, .43, .39), br = new THREE.Color(0x6b5442), tc = [br.r / g0.r, br.g / g0.g, br.b / g0.b], pos = [], nor = [], col = [];
  const cp = crown.attributes.position.array, cn = crown.attributes.normal.array;
  for (let i = 0; i < cp.length; i += 3) { pos.push(cp[i] * 3, cp[i + 1] * 2.7 + 5.2, cp[i + 2] * 3); nor.push(cn[i], cn[i + 1], cn[i + 2]); col.push(1, 1, 1); }
  const tk = new THREE.CylinderGeometry(.2, .3, 1, 6).toNonIndexed(), tp = tk.attributes.position.array, tn = tk.attributes.normal.array;
  for (let i = 0; i < tp.length; i += 3) { pos.push(tp[i], tp[i + 1] * 2.6 + 1.3, tp[i + 2]); nor.push(tn[i], tn[i + 1], tn[i + 2]); col.push(tc[0], tc[1], tc[2]); }
  tk.dispose(); const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return g;
}
function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(.5, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export async function openTwin(o) {
  const xy = o.xy, low = !!o.low;
  if (!document.getElementById('twCss')) { const l = document.createElement('link'); l.id = 'twCss'; l.rel = 'stylesheet'; l.href = './sim3d.css?v=7'; document.head.appendChild(l); }
  const root = document.createElement('div'); root.className = 'tw'; root.innerHTML = '<div class="tw-load"><i></i><span>디지털트윈을 불러오는 중…</span></div>'; document.body.appendChild(root);

  // ---------- 자료 ----------
  const [team, csvTxt, eng, feats0, net, NOW, rat, city] = await Promise.all([
    J(D + 'team.json'), TX(CSV), J(D + 'grid.geojson'), J(D + 'features.geojson').catch(() => null), J(D + 'network.json').catch(() => null),
    Promise.race([J(NOW_URL), new Promise(r => setTimeout(() => r(null), 8000))]).catch(() => null), loadRatings(), o.city ? Promise.resolve(o.city) : J(D + 'city3d.json').catch(() => null)]).catch(e => { root.remove(); throw e; });
  const nowOk = NOW && !NOW.error ? NOW : null;
  // 공원 전체 검증(아쉬움 × 평가 당시 실제 상황) — 장소별 건수는 적어서 판단은 공원 전체로, 장소별은 '어디서'만
  const EV = {}; Object.keys(COND).forEach(k => { EV[k] = rat.check ? verdict(crossTab(rat.check.total, k)) : { v: 'none' }; });
  const FORCE = { crowded: ['deck', 'bench'], weather: ['canopy', 'pergola', 'tree'] };
  function hubEv(id) {
    const p = P[id] || {}, rs = p.reasons || {};
    return Object.keys(COND).filter(k => rs[k]).map(k => { const t = rat.check && rat.check.places[id] ? crossTab(rat.check.places[id], k) : null; return { key: k, n: rs[k], inCond: t ? t.a : null, park: EV[k] }; });
  }
  const pc = v => Math.round(v * 100) + '%', pTxt = p => p < .001 ? 'p<0.001' : 'p=' + p.toFixed(3);
  function evLine(k) {
    const e = EV[k], c = COND[k];
    if (e.v === 'none') return '검증 자료 없음(시연용 가상 평가)';
    if (e.v === 'zero') return '「' + BAD[k] + '」 0건 · ' + c.inLabel + ' 때 평가 ' + e.nIn + '건 → ' + (k === 'weather' ? '더위는 여름 자료가 쌓여야 판단' : '판단할 것 없음');
    return c.inLabel + ' 때 ' + e.a + '/' + e.nIn + '(' + pc(e.rIn) + ') vs ' + c.outLabel + ' ' + e.c + '/' + e.nOut + '(' + pc(e.rOut) + ') · ' + pTxt(e.p);
  }
  // 지금 서울숲(OA-21285)으로 오늘 할 일
  function opsRecs() {
    const out = []; if (!nowOk) return out;
    const crowdHubs = hubs.filter(h => ((P[h.id] || {}).reasons || {}).crowded).sort((a, b) => P[b.id].reasons.crowded - P[a.id].reasons.crowded).slice(0, 3).map(h => h.name);
    const fc = (nowOk.crowd && nowOk.crowd.forecast || []).filter(f => f.rank != null), peak = fc.reduce((m, f) => !m || f.rank > m.rank || (f.rank === m.rank && (f.max || 0) > (m.max || 0)) ? f : m, null);
    if (peak && peak.rank >= 1) out.push(peak.time.slice(11, 13) + '시 「' + peak.level + '」 예상(' + (peak.min || 0).toLocaleString() + '~' + (peak.max || 0).toLocaleString() + '명) → ' + (EV.crowded.v === 'yes' && crowdHubs.length ? '붐빔 불만이 실제 혼잡과 맞으니 ' + crowdHubs.join('·') + '에 그 전부터 우회 안내·분산 배치' : '거점별 분산 안내 준비'));
    else if (peak) out.push('12시간 안 「여유」만 예상(최대 ' + (peak.max || 0).toLocaleString() + '명) → 오늘은 혼잡 대응보다 시설 점검·프로그램 운영에 집중');
    const w = nowOk.weather || {}, f = w.feels != null ? w.feels : w.temp;
    if (f != null && f >= 31) out.push('체감 ' + f + '℃ → 그늘 거점 안내·그늘막 먼저 펼치기(체감 31℃ 기준: 주제서 예시)');
    if (f != null && f <= -5) out.push('체감 ' + f + '℃ → 실내 대체시설(곤충식물원·나비정원)과 실내 쉼터 안내');
    if (w.uv != null && w.uv >= 6) out.push('자외선 ' + (w.uvText || w.uv) + ' → 그늘 동선 안내');
    if (w.pm25 != null && w.pm25 >= 36) out.push('초미세먼지 ' + w.pm25 + '㎍/㎥(' + (w.pm25Text || '') + ') → 실내 대체시설 안내·야외 프로그램 줄이기(36 기준: 주제서 예시)');
    (nowOk.events || []).slice(0, 2).forEach(e => out.push('행사 「' + e.name + '」 ' + (e.period || '') + ' → 행사 시간 앞뒤로 입구·화장실 혼잡 대비'));
    return out;
  }
  function liveHTML() {
    if (!nowOk) return '<div class="tw-live"><h3>지금 서울숲</h3><p class="tw-note">실시간 도시데이터를 받지 못했어요.</p></div>';
    const w = nowOk.weather || {}, c = nowOk.crowd || {}, f = w.feels != null ? w.feels : null;
    return '<div class="tw-live"><h3>지금 서울숲 <small>서울시 실시간 도시데이터(OA-21285) · ' + esc((w.time || c.time || '').slice(5)) + '</small></h3>' +
      '<div class="tw-lg"><span>기온<b>' + (w.temp != null ? w.temp + '℃' : '—') + '</b>' + (f != null ? '<i>체감 ' + f + '℃</i>' : '') + '</span><span>초미세먼지<b>' + (w.pm25 != null ? w.pm25 : '—') + '</b><i>' + esc(w.pm25Text || '') + '</i></span>' +
      '<span>혼잡<b>' + esc(c.level || '—') + '</b><i>' + (c.min != null ? c.min.toLocaleString() + '~' + c.max.toLocaleString() + '명' : '') + '</i></span><span>행사<b>' + (nowOk.events || []).length + '건</b><i>주변</i></span></div>' +
      '<h4>방문객 아쉬움, 데이터와 맞나요?</h4><ul class="tw-ev">' + Object.keys(COND).map(k => '<li class="v-' + EV[k].v + '"><b>「' + BAD[k] + '」 · ' + VTXT[EV[k].v] + '</b><small>' + esc(evLine(k)) + '</small></li>').join('') + '</ul>' +
      (opsRecs().length ? '<h4>오늘 운영 추천</h4><ul class="tw-ops">' + opsRecs().map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') + '</div>';
  }
  const feats = team.grid.features, rows = parseCSV(csvTxt), N = feats.length;
  if (rows.length !== N) { root.remove(); throw new Error('칸 수가 다름(team ' + N + ' / csv ' + rows.length + ')'); }
  const Q = [], CX = new Float64Array(N), CY = new Float64Array(N), A = new Float64Array(N), TR = new Float64Array(N), B = new Float64Array(N), R = new Float64Array(N), EN = new Float64Array(N),
    CR = new Float64Array(N), AIR = new Float64Array(N), S0 = new Float64Array(N), F0 = new Float64Array(N), DT = new Float64Array(N);
  feats.forEach((f, i) => {
    const c = f.geometry.coordinates[0].slice(0, 4).map(q => xy(q[0], q[1])); Q.push(c);
    CX[i] = (c[0][0] + c[1][0] + c[2][0] + c[3][0]) / 4; CY[i] = (c[0][1] + c[1][1] + c[2][1] + c[3][1]) / 4;
    const p = f.properties, r = rows[i];
    A[i] = r[0]; TR[i] = clamp01(r[1]); B[i] = clamp01(r[2]); R[i] = r[3]; EN[i] = clamp01((r[4] - EA) / (EB - EA)) * 100; CR[i] = p.crowd; AIR[i] = p.air; S0[i] = p.score;
  });
  function formula(i, a, sh, dr, cr) {
    const heat = .6 * clamp01((a - LA) / (LB - LA)) * 100 + .4 * (1 - clamp01(sh)) * 100, acc = .65 * clamp01((dr - RA) / (RB - RA)) * 100 + .35 * EN[i];
    return WT.heat * heat + WT.crowd * cr + WT.access * acc + WT.air * AIR[i];
  }
  let errMax = 0, errN = 0;
  for (let i = 0; i < N; i++) { F0[i] = formula(i, A[i], TR[i], R[i], CR[i]); const e = Math.abs(F0[i] - S0[i]); if (e > errMax) errMax = e; if (e > .02) errN++; }
  console.info('[디지털트윈] 칸 점수 재현(02_vulnerability.py 식 vs team.json score): 최대 오차 ' + errMax.toFixed(4) + ' · 0.02 넘는 칸 ' + errN + ' / ' + N + (errN ? ' ← 확인 필요' : ' · 통과'));
  const E = eng.features.map(f => { const z = f.geometry.coordinates[0].slice(0, -1); let lo = 0, la = 0; z.forEach(q => { lo += q[0]; la += q[1]; }); const p = xy(lo / z.length, la / z.length); return [p[0], p[1], f.properties.dToilet]; });
  for (let i = 0; i < N; i++) { let bd = 1e18, v = 0; for (const e of E) { const d = (e[0] - CX[i]) ** 2 + (e[1] - CY[i]) ** 2; if (d < bd) { bd = d; v = e[2]; } } DT[i] = v; }
  const toiletOut0 = DT.reduce((s, v) => s + (v > TOILET_M ? 1 : 0), 0);
  const hubs = o.hubs.map(h => ({ id: h.id, name: h.name, zone: h.zone, x: h.x, y: h.y }));
  const P = rat.places;

  // 바닥 자료: 숲·잔디·물·건물 면, 산책로, 물(도시)
  const pairs = (a, s) => { const out = []; for (let i = s; i + 1 < a.length; i += 2) out.push([a[i], a[i + 1]]); return out; };
  const FE = (feats0 && feats0.features || []).map(f => ({ k: f.properties.kind, ring: f.geometry.coordinates[0].map(q => xy(q[0], q[1])) }));
  const CWATER = (city && city.water || []).map(w => Array.isArray(w[0]) ? w : pairs(w, 0)).filter(p => p.length > 2);
  const NX = net ? net.nodes.map(q => xy(q[0], q[1])) : [], NE = net ? net.edges.filter(e => NX[e[0]] && NX[e[1]]) : [];
  const BLOCK = FE.filter(f => f.k === 'building' || f.k === 'water').map(f => f.ring).concat(CWATER);
  const blocked = new Uint8Array(N); for (let i = 0; i < N; i++) blocked[i] = BLOCK.some(r => inPoly(CX[i], CY[i], r)) ? 1 : 0;

  let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9; (o.rings || []).forEach(r => r.forEach(q => { bx0 = Math.min(bx0, q[0]); bx1 = Math.max(bx1, q[0]); by0 = Math.min(by0, q[1]); by1 = Math.max(by1, q[1]); }));
  if (bx0 > bx1) for (let i = 0; i < N; i++) { bx0 = Math.min(bx0, CX[i]); bx1 = Math.max(bx1, CX[i]); by0 = Math.min(by0, CY[i]); by1 = Math.max(by1, CY[i]); }

  // ---------- 렌더러 · 장면 (가볍게: 후처리 없음, 그림자는 보는 곳 둘레만) ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, low ? 1 : 1.5));
  renderer.setScissorTest(true);   // 한 프레임에 왼쪽(지금)·오른쪽(개선 후)을 시저로 나눠 그림
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1;
  const cvs = renderer.domElement; cvs.className = 'tw-cv'; root.prepend(cvs);
  const scene = new THREE.Scene(), SKY = 0xe6ecee; scene.background = new THREE.Color(SKY); scene.fog = new THREE.Fog(SKY, 1600, 5200);
  // 레이어: 0 = 공통 장면, 1 = 개선안(시설·잔디·테두리 빛), 2 = 지금 해, 3 = 개선 후 해
  const camera = new THREE.PerspectiveCamera(38, 1, 2, 9000); camera.layers.enable(1); camera.layers.enable(3);   // 개선 후(오른쪽) — OrbitControls가 움직이는 카메라
  const camL = new THREE.PerspectiveCamera(38, 1, 2, 9000); camL.layers.set(0); camL.layers.enable(2);            // 지금(왼쪽) — 그릴 때 위치·각도를 복사
  const disp = [], add = d => { disp.push(d); return d; };
  const std = (c, ex) => add(new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .85, metalness: 0 }, ex || {})));
  scene.add(new THREE.HemisphereLight(0xf4f8ff, 0x8d9b7c, 1.25));
  const SM = (low || o.mobile) ? 1024 : 2048, SPAN = 300;
  function mkSun(layer) {
    const l = new THREE.DirectionalLight(0xfff3df, 2.3); l.castShadow = true; l.shadow.mapSize.set(SM, SM);
    const c = l.shadow.camera; c.left = c.bottom = -SPAN; c.right = c.top = SPAN; c.near = 10; c.far = 2400; c.updateProjectionMatrix();
    l.shadow.bias = -.0004; l.shadow.normalBias = .4; l.layers.set(layer); scene.add(l); scene.add(l.target); return l;
  }
  // 해를 둘로: 지금 해는 새 시설을 못 보고(그림자 없음), 개선 후 해만 새 시설 그림자(새 그늘)를 드리움. 그림자 지도는 각자 따로 두고 바뀔 때만 다시 그림
  const sunL = mkSun(2), sun = mkSun(3); sun.shadow.camera.layers.enable(1);

  // 바닥: 공원 평면도(캔버스 한 장, 약 0.3m/px) — 땅 모양을 자료로 그림
  const MG = 120, gx0 = bx0 - MG, gx1 = bx1 + MG, gy0 = by0 - MG, gy1 = by1 + MG, GW = gx1 - gx0, GH = gy1 - gy0;
  const TS = low ? 2048 : 3072, cw = GW >= GH ? TS : Math.round(TS * GW / GH), ch = GW >= GH ? Math.round(TS * GH / GW) : TS, K = cw / GW;
  function planTex() {
    const c = document.createElement('canvas'); c.width = cw; c.height = ch; const x = c.getContext('2d');
    const px = p => [(p[0] - gx0) * K, (gy1 - p[1]) * K], path = ring => { ring.forEach((q, k) => { const p = px(q); k ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); }); x.closePath(); };
    const fillRing = (ring, col) => { x.beginPath(); path(ring); x.fillStyle = col; x.fill(); };
    x.fillStyle = '#dcd8cf'; x.fillRect(0, 0, cw, ch);
    x.save(); x.beginPath(); (o.rings || []).forEach(path); x.clip();
    x.fillStyle = '#a9c688'; x.fillRect(0, 0, cw, ch);
    let s = 9; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < cw * ch / 900; k++) { x.fillStyle = rnd() > .5 ? 'rgba(70,110,50,.07)' : 'rgba(220,240,180,.08)'; const r = (1 + rnd() * 3) * K; x.fillRect(rnd() * cw, rnd() * ch, r, r); }
    FE.filter(f => f.k === 'forest').forEach(f => fillRing(f.ring, '#8eb06f'));
    FE.filter(f => f.k === 'lawn').forEach(f => fillRing(f.ring, '#b9d897'));
    // 포장: 칸 포장비율을 부드럽게 번진 판으로(광장·마당 모양)
    {   // 작은 캔버스(1px = 2m)에 칸을 그린 뒤 한 번만 부드럽게 늘려 붙임 — 칸마다 필터를 걸면 수십 초 걸림
      const sc = 2, pc = document.createElement('canvas'); pc.width = Math.ceil(GW / sc); pc.height = Math.ceil(GH / sc); const y = pc.getContext('2d');
      for (let i = 0; i < N; i++) if (B[i] > .2) { y.globalAlpha = Math.min(1, B[i] * 1.1); y.fillStyle = '#e7e1d3'; y.beginPath(); Q[i].forEach((p, k) => { const a = (CX[i] + (p[0] - CX[i]) * 1.15 - gx0) / sc, b = (gy1 - (CY[i] + (p[1] - CY[i]) * 1.15)) / sc; k ? y.lineTo(a, b) : y.moveTo(a, b); }); y.closePath(); y.fill(); }
      x.save(); x.filter = 'blur(' + Math.round(4 * K) + 'px)'; x.imageSmoothingEnabled = true; x.drawImage(pc, 0, 0, cw, ch); x.restore();
    }
    // 산책로: 테두리 + 길
    x.lineCap = x.lineJoin = 'round';
    [[4.4, '#c8bb9c'], [3.2, '#efe7d3']].forEach(([w, col]) => { x.strokeStyle = col; x.lineWidth = w * K; x.beginPath(); NE.forEach(e => { const a = px(NX[e[0]]), b = px(NX[e[1]]); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); }); x.stroke(); });
    FE.filter(f => f.k === 'building').forEach(f => fillRing(f.ring, '#cfcac0'));
    x.restore();
    x.strokeStyle = '#7d9b63'; x.lineWidth = 2 * K; x.beginPath(); (o.rings || []).forEach(path); x.stroke();
    FE.filter(f => f.k === 'water').concat(CWATER.map(r => ({ ring: r }))).forEach(f => fillRing(f.ring, '#7fb0c8'));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return add(t);
  }
  const layer = (mesh, ord) => { mesh.renderOrder = ord; mesh.material.depthWrite = false; mesh.receiveShadow = true; scene.add(mesh); return mesh; };
  const outer = layer(new THREE.Mesh(add(new THREE.PlaneGeometry(20000, 20000)), std(0xdcd8cf, { roughness: 1 })), -3); outer.rotation.x = -Math.PI / 2; outer.position.set((gx0 + gx1) / 2, 0, -(gy0 + gy1) / 2);
  const ground = layer(new THREE.Mesh(add(new THREE.PlaneGeometry(GW, GH)), std(0xffffff, { map: planTex(), roughness: 1 })), -2); ground.rotation.x = -Math.PI / 2; ground.position.set(gx0 + GW / 2, 0, -(gy0 + GH / 2));
  const waterMat = std(0x6aa3c0, { roughness: .12, metalness: .05 });
  FE.filter(f => f.k === 'water').map(f => f.ring).concat(CWATER).forEach(r => { const m = layer(new THREE.Mesh(add(new THREE.ShapeGeometry(new THREE.Shape(r.map(p => new THREE.Vector2(p[0], p[1]))))), waterMat), -1); m.rotation.x = -Math.PI / 2; });

  // 건물: 흰색 매스 모형
  if (city && city.buildings) {
    const pos = [];
    city.buildings.forEach(b => {
      const h = b[0]; let p = pairs(b, 1); if (p.length < 3) return;
      if (p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1]) p.pop();
      const v2 = p.map(q => new THREE.Vector2(q[0], q[1])); if (THREE.ShapeUtils.isClockWise(v2)) { v2.reverse(); p = p.slice().reverse(); }
      THREE.ShapeUtils.triangulateShape(v2, []).forEach(t => [t[0], t[2], t[1]].forEach(k => pos.push(p[k][0], h, -p[k][1])));
      for (let i = 0; i < p.length; i++) { const a = p[i], c = p[(i + 1) % p.length]; pos.push(a[0], 0, -a[1], c[0], 0, -c[1], c[0], h, -c[1], a[0], 0, -a[1], c[0], h, -c[1], a[0], h, -a[1]); }
    });
    const g = add(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, std(0xf3f1ec, { roughness: .9, side: THREE.DoubleSide })); m.castShadow = m.receiveShadow = true; scene.add(m);
  }

  // 나무: 칸 수관비율 × 400㎡ ÷ 64㎡ 그루(저사양은 절반) — 수관+줄기 한 모양 · InstancedMesh 하나 · 카메라에서 600m 넘는 나무는 절반만
  let TREES = null;
  const CROWN = add(crownGeo()), TL = [];
  { let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < N; i++) { let n = Math.round(TR[i] * CELL_M2 / CANOPY_M2); if (low) n = Math.round(n / 2); for (let k = 0; k < n; k++) { const u = r(), v = r(), q = Q[i]; TL.push([(q[0][0] * (1 - u) + q[1][0] * u) * (1 - v) + (q[3][0] * (1 - u) + q[2][0] * u) * v, (q[0][1] * (1 - u) + q[1][1] * u) * (1 - v) + (q[3][1] * (1 - u) + q[2][1] * u) * v, 2.4 + r() * 1.5, r(), r() * 6.28]); } } }
  const NT = Math.max(1, TL.length), TM = new Float32Array(NT * 16), TC = new Float32Array(NT * 3);
  { const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    TL.forEach((t, k) => { qt.setFromAxisAngle(up, t[4]); sc.setScalar(t[2] / 3); ps.set(t[0], 0, -t[1]); m4.compose(ps, qt, sc); m4.toArray(TM, k * 16); c.setHSL(.24 + t[3] * .07, .36 + t[3] * .14, .34 + t[3] * .1); c.toArray(TC, k * 3); }); }
  const trees = new THREE.InstancedMesh(add(treeGeo(CROWN)), std(0xffffff, { roughness: .95, vertexColors: true }), NT);
  trees.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NT * 3), 3);
  trees.castShadow = true; trees.frustumCulled = false; scene.add(trees); TREES = trees;
  let lodAt = null, lodN = -1;
  function treeLOD() {
    const p = camera.position; if (lodAt && lodAt.distanceTo(p) < 40) return; lodAt = (lodAt || new THREE.Vector3()).copy(p);
    const im = trees.instanceMatrix.array, ic = trees.instanceColor.array; let c = 0;
    for (let k = 0; k < TL.length; k++) {
      const dx = TM[k * 16 + 12] - p.x, dz = TM[k * 16 + 14] - p.z; if (dx * dx + dz * dz + p.y * p.y > 360000 && (k & 1)) continue;
      im.set(TM.subarray(k * 16, k * 16 + 16), c * 16); ic[c * 3] = TC[k * 3]; ic[c * 3 + 1] = TC[k * 3 + 1]; ic[c * 3 + 2] = TC[k * 3 + 2]; c++;
    }
    if (c === lodN) return; lodN = c;
    trees.count = c; trees.instanceMatrix.needsUpdate = true; trees.instanceColor.needsUpdate = true; shadowDirty();
  }

  // 「칸 불편도」 원형 빛(기본 꺼짐)
  const glow = new THREE.InstancedMesh(add(new THREE.PlaneGeometry(34, 34)), add(new THREE.MeshBasicMaterial({ map: add(glowTex()), transparent: true, depthWrite: false, opacity: .85, toneMapped: false })), N);
  { const m4 = new THREE.Matrix4(), rx = new THREE.Matrix4().makeRotationX(-Math.PI / 2); for (let i = 0; i < N; i++) { m4.makeTranslation(CX[i], .4, -CY[i]).multiply(rx); glow.setMatrixAt(i, m4); } }
  glow.visible = false; glow.renderOrder = 2; scene.add(glow);
  function paintGlow(sc) { const c = new THREE.Color(); for (let i = 0; i < N; i++) { const v = ramp(sc[i]); c.setRGB(v[0] / 255, v[1] / 255, v[2] / 255, THREE.SRGBColorSpace); glow.setColorAt(i, c); } glow.instanceColor.needsUpdate = true; }

  // 방문객 평가 기둥(높이 = 건수, 색 = 만족 비율) + 바닥 고리
  const pillarG = new THREE.Group(); scene.add(pillarG);
  const PCYL = add(new THREE.CylinderGeometry(3, 3, 1, 24, 1)), PRING = add(new THREE.RingGeometry(5.5, 7, 40));
  hubs.forEach(h => {
    const p = P[h.id], pct = satPct(p), col = pct == null ? 0x8a948f : pctColor(pct), H = p && p.n ? Math.max(4, p.n * 2.2) : 0;
    const ring = new THREE.Mesh(PRING, add(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }))); ring.rotation.x = -Math.PI / 2; ring.position.set(h.x, .5, -h.y); ring.renderOrder = 1; ring.userData.hub = h.id; pillarG.add(ring);
    if (H) { const m = new THREE.Mesh(PCYL, add(new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: .25, transparent: true, opacity: .55, depthWrite: false, roughness: .4 }))); m.scale.y = H; m.position.set(h.x, H / 2, -h.y); m.userData.hub = h.id; pillarG.add(m); }
    h.top = H + 4; h.pct = pct; h.n = p ? p.n : 0;
  });

  // ---------- 시설 모형 ----------
  const MT = { wood: std(0xa8784e), dark: std(0x5a4636), metal: std(0xa3aea9, { metalness: .5, roughness: .45 }), fabric: std(0xfbf8f0, { side: THREE.DoubleSide }), crown: std(0x5aa865, { roughness: .9 }),
    trunk: std(0x6b4a30), white: std(0xf0f2ef), blue: std(0x4fa6d8, { roughness: .25 }), red: std(0xd9573f), yellow: std(0xf2c14e), deck: std(0xb98a5c), grass: std(0x86c46c, { roughness: 1 }) };
  const BOX = add(new THREE.BoxGeometry(1, 1, 1)), CYL = add(new THREE.CylinderGeometry(1, 1, 1, 12)), SPH = add(new THREE.SphereGeometry(1, 14, 10)), CONE = add(new THREE.ConeGeometry(1, 1, 4, 1, true)), TOR = add(new THREE.TorusGeometry(1, .08, 8, 32));
  function pt(g, m, sx, sy, sz, x, y, zz, ry) { const k = new THREE.Mesh(g, m); k.scale.set(sx, sy, sz); k.position.set(x, y, zz); if (ry) k.rotation.y = ry; k.castShadow = k.receiveShadow = true; return k; }
  function model(k) {
    const g = new THREE.Group(), a = (...p) => p.forEach(x => g.add(x));
    if (k === 'bench') a(pt(BOX, MT.wood, 1.8, .07, .45, 0, .45, 0), pt(BOX, MT.wood, 1.8, .36, .05, 0, .72, -.22), pt(BOX, MT.dark, .07, .45, .45, -.8, .22, 0), pt(BOX, MT.dark, .07, .45, .45, .8, .22, 0));
    if (k === 'pergola') { const s = 2.35, h = 2.7; [[-s, -s], [s, -s], [s, s], [-s, s]].forEach(p => a(pt(BOX, MT.wood, .2, h, .2, p[0], h / 2, p[1]))); a(pt(BOX, MT.dark, 5, .16, .2, 0, h - .1, -s), pt(BOX, MT.dark, 5, .16, .2, 0, h - .1, s), pt(BOX, MT.wood, 5, .06, 5, 0, h + .02, 0)); for (let i = -2; i <= 2; i++) a(pt(BOX, MT.dark, .12, .14, 5.2, i * 1.1, h + .12, 0)); }
    if (k === 'canopy') { const s = 1.9, h = 3; [[-s, -s], [s, -s], [s, s], [-s, s]].forEach(p => a(pt(CYL, MT.metal, .05, h, .05, p[0], h / 2, p[1]))); a(pt(CONE, MT.fabric, 2.83, .7, 2.83, 0, h + .35, 0, Math.PI / 4)); }
    if (k === 'tree') { const c = new THREE.Mesh(CROWN, MT.crown); c.scale.set(3.6, 3.2, 3.6); c.position.y = 5.5; c.castShadow = c.receiveShadow = true; a(pt(CYL, MT.trunk, .28, 3.6, .28, 0, 1.8, 0), c); }
    if (k === 'deck') { a(pt(BOX, MT.deck, 30, .22, 2.4, 0, .35, 0)); for (let i = -14; i <= 14; i += 4) a(pt(BOX, MT.dark, .12, .9, .12, i, .8, 1.15), pt(BOX, MT.dark, .12, .9, .12, i, .8, -1.15)); a(pt(BOX, MT.dark, 30, .07, .07, 0, 1.22, 1.15), pt(BOX, MT.dark, 30, .07, .07, 0, 1.22, -1.15)); }
    if (k === 'toilet') a(pt(BOX, MT.white, 3, 2.6, 2.2, 0, 1.3, 0), pt(BOX, MT.dark, 3.4, .15, 2.6, 0, 2.68, 0), pt(BOX, MT.dark, .8, 1.9, .05, -.6, .95, 1.11), pt(BOX, MT.dark, .8, 1.9, .05, .6, .95, 1.11));
    if (k === 'play') a(pt(BOX, MT.red, .15, 2.4, .15, -1.5, 1.2, -1), pt(BOX, MT.red, .15, 2.4, .15, -1.5, 1.2, 1), pt(BOX, MT.red, .15, 2.4, .15, .5, 1.2, -1), pt(BOX, MT.red, .15, 2.4, .15, .5, 1.2, 1), pt(BOX, MT.yellow, 2.2, .15, 2.2, -.5, 1.5, 0), pt(BOX, MT.blue, 3.2, .1, .9, 2, .8, 0), pt(CONE, MT.yellow, 1.6, 1, 1.6, -.5, 2.9, 0, Math.PI / 4));
    if (k === 'garden') { a(pt(BOX, MT.dark, 6, .35, 3, 0, .17, 0), pt(BOX, MT.grass, 5.7, .1, 2.7, 0, .38, 0)); let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 22; i++) a(pt(SPH, [MT.red, MT.yellow, MT.fabric, MT.blue][i % 4], .22, .22, .22, (r() - .5) * 5.2, .55, (r() - .5) * 2.3)); }
    if (k === 'photo') { const t = new THREE.Mesh(TOR, MT.yellow); t.scale.setScalar(1.4); t.position.y = 1.6; t.castShadow = true; a(t, pt(BOX, MT.dark, .15, .25, .8, 0, .12, 0)); }
    return g;
  }
  const lawnMesh = i => { const q = Q[i].map(p => [CX[i] + (p[0] - CX[i]) * .94, CY[i] + (p[1] - CY[i]) * .94]), m = new THREE.Mesh(add(new THREE.ShapeGeometry(new THREE.Shape(q.map(p => new THREE.Vector2(p[0], p[1]))))), LAWN); m.rotation.x = -Math.PI / 2; m.position.y = .03; m.renderOrder = 0; m.receiveShadow = true; return m; };
  const LAWN = std(0x8fcf6e, { roughness: 1, depthWrite: false });
  const HALO_G = add(new THREE.PlaneGeometry(1, 1));
  const HALO_FP = { bench: [2.4, 1.2], pergola: [5.6, 5.6], canopy: [4.4, 4.4], tree: [8, 8], deck: [31, 3], toilet: [3.8, 3], play: [6, 3], garden: [6.6, 3.6], photo: [3.4, 3.4], lawn: [19, 19] };
  function haloMesh(t) {
    const fp = HALO_FP[t.k] || [4, 4], w = Math.max(9, fp[0] + 4), h = Math.max(9, fp[1] + 4), K2 = 12, c = document.createElement('canvas'); c.width = Math.round(w * K2); c.height = Math.round(h * K2);
    const x = c.getContext('2d'), m = 1.6 * K2;
    x.fillStyle = 'rgba(106,245,176,.10)'; x.strokeStyle = 'rgba(106,245,176,.95)'; x.lineWidth = .5 * K2; x.shadowColor = 'rgba(106,245,176,.95)'; x.shadowBlur = 1.3 * K2;
    x.beginPath(); x.roundRect(m, m, c.width - 2 * m, c.height - 2 * m, 2.2 * K2); x.fill(); x.stroke(); x.stroke();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const me = new THREE.Mesh(HALO_G, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: .9, toneMapped: false }));
    const lw = t.k === 'lawn'; me.scale.set(w, h, 1); me.rotation.order = 'YXZ'; me.rotation.set(-Math.PI / 2, lw ? 0 : t.rot, 0);
    me.position.set(lw ? CX[t.cell] : t.x, .12, -(lw ? CY[t.cell] : t.y)); me.renderOrder = 5; return me;
  }
  const itemsG = new THREE.Group(); scene.add(itemsG);
  let items = [];

  // ---------- 화면 칸 점수(지금 시각) ----------
  let hour = o.hour >= 7 && o.hour <= 19 ? o.hour : 14, last = null, pred = null;
  const SMP = []; for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) SMP.push([(a + .5) / 4, (b + .5) / 4]);
  const SPX = new Float64Array(N * 16), SPY = new Float64Array(N * 16);
  for (let i = 0; i < N; i++) { const q = Q[i]; SMP.forEach(([u, v], s) => { SPX[i * 16 + s] = (q[0][0] * (1 - u) + q[1][0] * u) * (1 - v) + (q[3][0] * (1 - u) + q[2][0] * u) * v; SPY[i * 16 + s] = (q[0][1] * (1 - u) + q[1][1] * u) * (1 - v) + (q[3][1] * (1 - u) + q[2][1] * u) * v; }); }
  const cs = t => { if (t.c == null) { t.c = Math.cos(t.rot); t.s = Math.sin(t.rot); } };
  function hitObj(t, px, py, sd) {
    if (t.k === 'tree') { const ox = px - t.x, oy = py - t.y, oz = -5.5, bb = ox * sd.x + oy * sd.y + oz * sd.z, cc = ox * ox + oy * oy + oz * oz - 20.25, ds = bb * bb - cc; return ds >= 0 && -bb - Math.sqrt(ds) > 0; }
    const rf = FAC[t.k].roof, k = rf.h / sd.z, dx = px + sd.x * k - t.x, dy = py + sd.y * k - t.y; cs(t); const lx = dx * t.c + dy * t.s, ly = -dx * t.s + dy * t.c; return Math.abs(lx) <= rf.hx && Math.abs(ly) <= rf.hy;
  }
  const casts = t => t.k === 'tree' || !!FAC[t.k].roof;
  function maskOf(t, i, sd) { if (sd.z <= .035) return 0; const L = Math.min(160, (t.k === 'tree' ? 10 : FAC[t.k].roof.h) * Math.hypot(sd.x, sd.y) / sd.z); if (Math.hypot(CX[i] - t.x, CY[i] - t.y) > L + 22) return 0; let m = 0; for (let s = 0; s < 16; s++) if (hitObj(t, SPX[i * 16 + s], SPY[i * 16 + s], sd)) m |= 1 << s; return m; }
  let nearOcc = new Uint8Array(N);   // 그림자를 드리우는 시설에서 185m 안 칸만 광선(4×4) 계산
  function markNear() { nearOcc = new Uint8Array(N); const occ = items.filter(casts); if (occ.length) for (let i = 0; i < N; i++) for (const t of occ) if (Math.hypot(CX[i] - t.x, CY[i] - t.y) < 185) { nearOcc[i] = 1; break; } }
  function compute() {
    const sd = sunDir(hour), out = Float64Array.from(S0), changed = [], occ = items.filter(casts), rest = items.filter(t => FAC[t.k].rest), decks = items.filter(t => t.k === 'deck');
    let shadeM2 = 0;
    for (let i = 0; i < N; i++) {
      let trees = 0, lawn = false, dr = R[i], cr = CR[i], m = 0;
      for (const t of items) { if (t.cell === i) { if (t.k === 'tree') trees++; if (t.k === 'lawn') lawn = true; } }
      for (const t of rest) { const d = Math.hypot(CX[i] - t.x, CY[i] - t.y); if (d < dr) dr = d; }
      for (const t of decks) if (Math.hypot(CX[i] - t.x, CY[i] - t.y) <= DECK_R) cr *= DECK_K;
      if (nearOcc[i]) for (const t of occ) m |= maskOf(t, i, sd);
      if (!trees && !lawn && dr === R[i] && cr === CR[i] && !m) continue;
      const Tn = Math.min(1, TR[i] + trees * CANOPY_M2 / CELL_M2), Bn = lawn ? 0 : B[i], fr = POP[m] / 16, sh = Math.min(1, Tn + fr * (1 - Tn));
      out[i] = S0[i] + formula(i, A[i] + K_TREE * (Tn - TR[i]) + K_PAVE * (Bn - B[i]), sh, dr, cr) - F0[i];
      shadeM2 += fr * (1 - Tn) * CELL_M2; changed.push(i);
    }
    const wcs = items.filter(t => t.k === 'toilet'); let tOut = toiletOut0;
    if (wcs.length) { tOut = 0; for (let i = 0; i < N; i++) { let d = DT[i]; for (const t of wcs) d = Math.min(d, Math.hypot(CX[i] - t.x, CY[i] - t.y)); if (d > TOILET_M) tOut++; } }
    last = { score: out, changed, shadeM2, toilet: [toiletOut0, tOut] };
    pred = o.predict(changed, out, Math.floor(hour));
    if (glow.visible) paintGlow(out);
  }

  // ---------- 최선안 찾기 ----------
  const SDS = OPT_HRS.map(sunDir), NH = OPT_HRS.length;
  function nearEdge(x, y) {
    let bd = 1e9, ang = 0, nx = 0, ny = 0;
    for (const e of NE) { const a = NX[e[0]], b = NX[e[1]], vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / l2)), px = a[0] + vx * t, py = a[1] + vy * t, d = Math.hypot(x - px, y - py); if (d < bd) { bd = d; ang = Math.atan2(vy, vx); nx = x - px; ny = y - py; } }
    return { d: bd, ang, nx, ny };
  }
  const plans = {};
  function bestPlan(h) {
    let cells = []; for (const R0 of [ENV_R, 150]) { cells = []; for (let i = 0; i < N; i++) if (Math.hypot(CX[i] - h.x, CY[i] - h.y) < R0) cells.push(i); if (cells.length) break; }
    if (!cells.length) return null;
    const n = cells.length, cand = [];
    cells.forEach(i => {
      if (blocked[i]) return;
      // 길 위면 길 옆(4.5m)으로 비켜 놓고, 길 방향에 맞춰 돌림
      const ed = NE.length ? nearEdge(CX[i], CY[i]) : { d: 99, ang: 0 }; let x = CX[i], y = CY[i];
      if (ed.d < 3.5) { const l = Math.hypot(ed.nx, ed.ny); const ux = l > .01 ? ed.nx / l : -Math.sin(ed.ang), uy = l > .01 ? ed.ny / l : Math.cos(ed.ang); x += ux * (4.5 - ed.d); y += uy * (4.5 - ed.d); }
      const rot = ed.ang, mk = k => ({ k, x, y, rot, cell: i, pathD: ed.d });
      cand.push(mk('bench'));
      if (TR[i] < .7) { cand.push(mk('pergola')); cand.push(mk('canopy')); }
      if (TR[i] < .75) cand.push(mk('tree'));
      if (B[i] > .15) { const t = mk('lawn'); t.x = CX[i]; t.y = CY[i]; cand.push(t); }
      if (ed.d < 30) cand.push(mk('deck'));
    });
    cand.forEach(t => {
      if (casts(t)) { t.masks = new Uint16Array(n * NH); cells.forEach((i, j) => { for (let k = 0; k < NH; k++) t.masks[j * NH + k] = maskOf(t, i, SDS[k]); }); }
      if (FAC[t.k].rest) t.dist = Float32Array.from(cells, i => Math.hypot(CX[i] - t.x, CY[i] - t.y));
      if (t.k === 'deck') t.deck = Uint8Array.from(cells, i => Math.hypot(CX[i] - t.x, CY[i] - t.y) <= DECK_R ? 1 : 0);
      t.j = cells.indexOf(t.cell);
    });
    function evalPlan(pl, keep) {
      let sum = 0, sSh = 0, sRe = 0, sLst = 0, far = 0; const sc = keep ? new Float64Array(n) : null;
      for (let j = 0; j < n; j++) {
        const i = cells[j]; let trees = 0, lawn = false, dr = R[i], cr = CR[i];
        for (const t of pl) { if (t.j === j) { if (t.k === 'tree') trees++; else if (t.k === 'lawn') lawn = true; } if (t.dist && t.dist[j] < dr) dr = t.dist[j]; if (t.deck && t.deck[j]) cr *= DECK_K; }
        const Tn = Math.min(1, TR[i] + trees * CANOPY_M2 / CELL_M2), Bn = lawn ? 0 : B[i], a = A[i] + K_TREE * (Tn - TR[i]) + K_PAVE * (Bn - B[i]);
        let s = 0, shs = 0; for (let k = 0; k < NH; k++) { let m = 0; for (const t of pl) if (t.masks) m |= t.masks[j * NH + k]; const sh = Math.min(1, Tn + POP[m] / 16 * (1 - Tn)); shs += sh; s += S0[i] + formula(i, a, sh, dr, cr) - F0[i]; }
        s /= NH; sum += s; if (sc) { sc[j] = s; sSh += shs / NH; sRe += dr; sLst += a - A[i]; if (dr > 150) far++; }
      }
      return { env: Math.max(20, Math.min(98, 100 - (sum / n - 10) * 1.25)), sc, shade: sSh / n, rest: sRe / n, dLst: sLst / n, far, n };
    }
    const base = evalPlan([]).env, plan = []; let cur = base;
    // 1단계: 데이터로 맞다고 확인된 아쉬움(공원 전체 검증 '맞음' + 이 거점에서 나온 것)은 그에 맞는 시설 중 가장 효과 큰 것을 먼저 넣음
    hubEv(h.id).filter(e => e.park.v === 'yes').forEach(e => {
      let best = null;
      for (const c of cand) { if (!FORCE[e.key].includes(c.k) || plan.some(t => t.cell === c.cell && t.k !== 'lawn' && c.k !== 'lawn')) continue; const v = evalPlan(plan.concat(c)).env; if (!best || v > best.v) best = { c, v }; }
      if (best && best.v > cur + 1e-6) { best.c.gain = best.v - cur; best.c.forced = e.key; plan.push(best.c); cur = best.v; }
    });
    // 2단계: 나머지는 주변 환경 점수를 가장 많이 올리는 것부터
    while (plan.length < MAX_ITEMS) {
      const used = new Set(plan.filter(t => t.k !== 'lawn').map(t => t.cell)), lawns = new Set(plan.filter(t => t.k === 'lawn').map(t => t.cell));
      let best = null;
      for (const c of cand) {
        if (c.k === 'lawn' ? lawns.has(c.cell) : used.has(c.cell)) continue;
        const v = evalPlan(plan.concat(c)).env; if (!best || v > best.v) best = { c, v };
      }
      if (!best || best.v - cur < MIN_GAIN) break;
      best.c.gain = best.v - cur; plan.push(best.c); cur = best.v;
    }
    // 고른 시설마다 근거 문구
    plan.forEach(t => {
      const d = Math.hypot(t.x - h.x, t.y - h.y), dir = DIR8[Math.round(((Math.atan2(t.x - h.x, t.y - h.y) * 180 / Math.PI) + 360) % 360 / 45) % 8], bits = [];
      t.where = d < 8 ? '거점 바로 옆' : '거점에서 ' + dir + '쪽 ' + Math.round(d) + 'm';
      if (t.masks) { let m2 = 0; cells.forEach((i, j) => { let s = 0; for (let k = 0; k < NH; k++) s += POP[t.masks[j * NH + k]] / 16; m2 += s / NH * (1 - TR[i]) * CELL_M2; }); bits.push('10~16시 평균 그늘 ' + Math.round(m2) + '㎡'); }
      if (FAC[t.k].rest) bits.push('쉴 곳까지 ' + Math.round(R[t.cell]) + 'm였던 자리');
      if (t.k === 'tree') bits.push('수관 +16%p · 땅 온도 ' + (K_TREE * .16).toFixed(2) + '℃');
      if (t.k === 'lawn') bits.push('포장 ' + Math.round(B[t.cell] * 100) + '% → 0% · 땅 온도 ' + (-K_PAVE * B[t.cell]).toFixed(2) + '℃');
      if (t.k === 'deck') bits.push('반경 25m 칸 ' + t.deck.reduce((a, b) => a + b, 0) + '개 붐빔 ×0.88');
      if (t.forced) { const e = hubEv(h.id).find(x => x.key === t.forced); bits.unshift('근거 반영: 「' + BAD[t.forced] + '」 ' + (e ? e.n : '') + '건 · 이 아쉬움은 공원 전체에서 실제 상황과 맞음'); }
      t.why = bits.join(' · ');
    });
    // 점수 밖: 방문객 아쉬운 이유에 맞춰 함께 놓을 것
    const p = P[h.id] || { reasons: {} }, rs = p.reasons || {}, extra = [], taken = new Set(plan.map(t => t.cell));
    const freeCell = pref => { const c = cells.filter(i => !blocked[i] && !taken.has(i)).sort((a, b) => pref(b) - pref(a) || Math.hypot(CX[a] - h.x, CY[a] - h.y) - Math.hypot(CX[b] - h.x, CY[b] - h.y))[0]; if (c != null) taken.add(c); return c; };
    const put = (k, cell, why) => { if (cell == null) return; const ed = NE.length ? nearEdge(CX[cell], CY[cell]) : { ang: 0 }; extra.push({ k, x: CX[cell], y: CY[cell], rot: ed.ang, cell, why, where: '' }); };
    if (rs.boring) { put('garden', freeCell(i => B[i]), '「' + BAD.boring + '」 ' + rs.boring + '건'); put('photo', freeCell(i => B[i]), '「' + BAD.boring + '」 ' + rs.boring + '건'); }
    if ((rs.far || rs.facility) && cells.some(i => DT[i] > TOILET_M)) put('toilet', freeCell(i => DT[i]), '화장실 250m 밖 칸이 있고 「' + (rs.facility ? BAD.facility : BAD.far) + '」 ' + (rs.facility || rs.far) + '건');
    const r = evalPlan(plan, true), changed = [], full = Float64Array.from(S0);
    cells.forEach((i, j) => { if (Math.abs(r.sc[j] - S0[i]) > 1e-9) { full[i] = r.sc[j]; changed.push(i); } });
    const pr = o.predict(changed, full, 14).hubs[h.id];
    return { cells, plan, extra, base, env: cur, nCand: cand.length, gain14: pr ? pr.after - pr.before : 0, cmp: { b: evalPlan([], true), a: r } };
  }
  const planFor = h => (h.id in plans) ? plans[h.id] : (plans[h.id] = bestPlan(h));

  // ---------- 해 ----------
  const ctr = new THREE.Vector3();
  function placeSun() {
    const sd = sunDir(hour), v = new THREE.Vector3(sd.x, Math.max(.02, sd.z), -sd.y).normalize();
    const k = clamp01(sd.alt / 25);
    [sunL, sun].forEach(l => { l.target.position.copy(ctr); l.position.copy(ctr).addScaledVector(v, 1200); l.target.updateMatrixWorld(); l.intensity = sd.alt <= 0 ? 0 : .8 + 1.6 * k; l.color.setHSL(.1, .55 - .4 * k, .65 + .28 * k); });
    shadowDirty();
  }

  // ---------- 카메라 ----------
  const controls = new OrbitControls(camera, cvs);
  controls.maxPolarAngle = 1.38; controls.minDistance = 25; controls.maxDistance = 2600; controls.screenSpacePanning = false; controls.enableDamping = true; controls.dampingFactor = .12;
  let dirty = true, fly = null, labDirty = true, shL = true, shR = true;
  function shadowDirty() { shL = shR = true; dirty = true; }
  controls.addEventListener('end', () => treeLOD());
  controls.addEventListener('change', () => { dirty = labDirty = true; if (controls.target.distanceTo(ctr) > 140) { ctr.copy(controls.target); placeSun(); } });
  const hubOf = id => hubs.find(h => h.id === id);
  let sel = hubOf(o.hub.id) || hubs[0];
  if (o.auto) { const lo = hubs.filter(h => h.n >= 5).sort((a, b) => a.pct - b.pct)[0]; if (lo) sel = lo; }
  const above = h => ({ t: new THREE.Vector3(h.x, 0, -h.y), p: new THREE.Vector3(h.x, 1300, -h.y + 1) });
  // 거점 + 놓은 시설이 모두 '개선 후' 화면(보이는 부분)에 들어오도록 비스듬한 시점의 거리를 맞춤
  function planView(h) {
    const pl = plans[h.id], pts = [[h.x, h.y]].concat(pl ? pl.plan.concat(pl.extra).map(t => [t.x, t.y]) : []);
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const R = Math.max(25, ...pts.map(q => Math.hypot(q[0] - cx, q[1] - cy))) + 8, v = views[views.length - 1], dir = new THREE.Vector3(-120, 150, 170).normalize();
    let d = 256;
    if (v) { const fh = v.cam.view ? v.cam.view.fullHeight : v.h, f = fh / 2 / Math.tan(v.cam.fov * Math.PI / 360), wv = v.vis.x1 - v.vis.x0, hv = v.vis.y1 - v.vis.y0; d = Math.min(700, Math.max(d, R * f / (.5 * Math.min(wv, hv * 1.25)))); }
    return { t: new THREE.Vector3(cx, 0, -cy), p: new THREE.Vector3(cx, 0, -cy).addScaledVector(dir, d) };
  }
  function flyTo(to, dur, done) { fly = { a: { t: controls.target.clone(), p: camera.position.clone() }, b: to, t0: performance.now(), dur, done }; controls.enabled = false; }
  { const s = above(sel); camera.position.copy(s.p); controls.target.copy(s.t); camera.lookAt(s.t); ctr.copy(s.t); }

  // ---------- 덧씌운 화면 ----------
  const ui = document.createElement('div'); ui.className = 'tw-ui'; root.appendChild(ui);
  ui.innerHTML =
    '<header class="tw-top tw-g"><b>디지털트윈 개선 시뮬레이션</b><span class="tw-tag">관리자</span>' + (rat.demo ? '<span class="tw-demo">시연용 가상 평가</span>' : '') +
    '<span class="tw-sp"></span><button type="button" data-t="rate" aria-pressed="true">방문객 평가</button><button type="button" data-t="glow" aria-pressed="false">칸 불편도</button><span class="tw-seg" role="group" aria-label="보기 방식"><button type="button" data-t="one" aria-pressed="false">한 화면</button><button type="button" data-t="split" aria-pressed="true">나눠 보기</button></span><button type="button" data-t="hq" aria-pressed="false" title="틈 그늘(GTAO)을 켜요. 느린 기기에서는 끄세요">고화질</button><span class="tw-q" hidden></span>' +
    '<button type="button" class="tw-exit" data-t="exit">지도로 나가기</button></header>' +
    '<aside class="tw-left tw-g"><div class="tw-livebox"></div><h3>방문객 평가가 낮은 곳 <small>누르면 그곳의 최선안을 보여 줘요</small></h3><div class="tw-lowl"></div></aside>' +
    '<aside class="tw-right tw-g"><div class="tw-pred"></div><div class="tw-rate"></div></aside>' +
    '<div class="tw-time tw-g"><div class="t"><span>8월 1일</span><b class="tw-hr">—</b><small class="tw-sun"></small></div><input class="tw-range" type="range" min="7" max="19" step="0.25" aria-label="해 위치 시각"><div class="tw-ticks">' + [7, 10, 13, 16, 19].map(h => '<span>' + h + '시</span>').join('') + '</div></div>' +
    '<div class="tw-split"><i class="tw-div"></i><b class="tw-vl" data-s="L">지금</b><b class="tw-vl" data-s="R">개선 후</b><div class="tw-vs" data-s="L"></div><div class="tw-vs" data-s="R"></div></div>' +
    '<div class="tw-labs"></div><div class="tw-nums"></div><div class="tw-fps" hidden></div><div class="tw-report" hidden></div>';
  const $ = s => ui.querySelector(s), range = $('.tw-range'), labs = $('.tw-labs'), nums = $('.tw-nums');
  range.value = hour;
  const NUM = '①②③④⑤⑥⑦⑧⑨⑩';
  function lowList() { return hubs.filter(h => h.n >= 5).sort((a, b) => a.pct - b.pct).slice(0, 5); }
  function lowHTML() {
    const L = lowList(); if (!L.includes(sel)) L.push(sel);
    $('.tw-lowl').innerHTML = L.map(h => { const tb = topBad(P[h.id]), pl = plans[h.id];
      return '<button type="button" class="tw-lo' + (h.id === sel.id ? ' on' : '') + '" data-h="' + h.id + '"><span class="nm"><b>' + esc(h.name) + '</b>' + (h.pct == null ? '<em class="na">평가 없음</em>' : '<em style="color:' + pctCss(h.pct) + '">😊 ' + Math.round(h.pct) + '%</em>') + '</span>' +
        '<small>' + (h.n ? h.n + '건' + (tb ? ' · ' + BAD[tb[0]] + ' ' + tb[1] : '') : '') + '</small>' +
        '<span class="pl">' + (pl === undefined ? '최선안 계산 중…' : !pl || !pl.plan.length ? '더 넣어도 효과가 작아요' : '최선안 ' + pl.plan.length + '개 · 14시 ' + f1(pl.gain14) + '점') + '</span></button>'; }).join('');
  }
  function evHub(id) {
    const L = hubEv(id); if (!L.length) return '';
    return '<h4 class="tw-evh">아쉬움 근거 확인 <small>평가 당시 서울시 실시간 도시데이터와 대조</small></h4><ul class="tw-ev">' + L.map(e => {
      const c = COND[e.key], ok = e.park.v === 'yes';
      return '<li class="v-' + e.park.v + '"><b>「' + BAD[e.key] + '」 ' + e.n + '건 · ' + (e.inCond != null ? c.inLabel + ' 때 ' + e.inCond + '건' : '') + '</b><small>공원 전체: ' + VTXT[e.park.v] + ' (' + esc(evLine(e.key)) + ')' +
        (ok ? ' → 최선안에 ' + FORCE[e.key].map(x => FAC[x].label).join('·') + ' 중 하나를 먼저 넣었어요' : ' → 우선순위를 올리지 않고 점수 효과로만 골랐어요') +
        // 이 거점의 아쉬움 가운데 절반 넘게 '여유' 때 나왔으면 공원 전체 혼잡보다 이 자리의 좁은 길·병목을 의심
        (e.key === 'crowded' && e.inCond != null && e.n >= 2 && e.inCond / e.n < .5 ? '. 다만 이 거점은 ' + (e.n - e.inCond) + '/' + e.n + '건이 「여유」 때 나와, 공원 전체 혼잡보다 이 자리가 좁거나 길이 막히는 문제일 수 있어요 → 현장에서 병목 지점 확인·길 넓히기 검토' : '') + '</small></li>';
    }).join('') + '</ul>';
  }
  // 한눈에 보기: 바뀌는 것 · 왜 · 좋아지는 것 + 전후 비교표
  function summary(pl, hp) {
    const b = pl.cmp.b, a = pl.cmp.a, p = P[sel.id] || {}, rs = p.reasons || {}, cnt = {};
    pl.plan.concat(pl.extra).forEach(t => { cnt[t.k] = (cnt[t.k] || 0) + 1; });
    const what = Object.keys(cnt).length ? Object.keys(cnt).map(k => FAC[k].label + ' ' + cnt[k] + '개').join(' · ') + ' 설치' : '시설 추가 없음(운영 개선 우선)';
    const why = [];
    const rk = Object.keys(BAD).filter(k => rs[k]).sort((x, y) => rs[y] - rs[x]);
    if (p.n) why.push('방문객 만족 ' + Math.round(satPct(p)) + '%(' + p.n + '건)' + (rk.length ? ' · 아쉬움 ' + rk.map(k => '「' + BAD[k] + '」 ' + rs[k] + '건' + (COND[k] && EV[k].v === 'yes' ? '(실제 상황과 맞음)' : '')).join(', ') : ''));
    if (b.rest > 60) why.push('둘레 칸에서 쉴 곳까지 평균 ' + Math.round(b.rest) + 'm' + (b.far ? ' · 150m 넘게 먼 칸 ' + b.far + '개' : ''));
    if (b.shade < .5) why.push('여름 한낮 그늘이 둘레 땅의 ' + pc(b.shade) + '뿐');
    if (!why.length) why.push('주변 환경 점수 ' + hp.envBefore.toFixed(1) + '점 — 더 올릴 여지가 있는 곳');
    const good = ['예측 만족도 ' + hp.before.toFixed(1) + ' → ' + hp.after.toFixed(1) + '점 (' + f1(hp.after - hp.before) + ')'];
    if (a.rest < b.rest - 1) good.push('쉴 곳까지 평균 ' + Math.round(b.rest) + ' → ' + Math.round(a.rest) + 'm');
    if (a.shade > b.shade + .002) good.push('그늘 ' + pc(b.shade) + ' → ' + pc(a.shade));
    if (a.dLst < -.005) good.push('땅 온도 평균 ' + a.dLst.toFixed(2) + '℃ (위성 회귀)');
    if (pl.extra.length) good.push('볼거리·편의: ' + pl.extra.map(t => FAC[t.k].label).join('·') + ' (점수 밖)');
    const m = v => Math.round(v) + 'm', up = (x, y, lower) => lower ? y < x - 1e-6 : y > x + 1e-6;
    const rows = [
      ['예측 만족도<small>' + hm(hour) + ' · 붐빔·날씨 오늘 예보</small>', hp.before.toFixed(1) + '점', hp.after.toFixed(1) + '점', up(hp.before, hp.after)],
      ['주변 환경 점수', hp.envBefore.toFixed(1), hp.envAfter.toFixed(1), up(hp.envBefore, hp.envAfter)],
      ['그늘 비율', pc(b.shade), pc(a.shade), up(b.shade, a.shade)],
      ['쉴 곳까지 평균 거리', m(b.rest), m(a.rest), up(b.rest, a.rest, 1)],
      ['쉴 곳 150m 밖 칸', b.far + '칸', a.far + '칸', up(b.far, a.far, 1)],
      ['땅 온도 변화<small>팀 Landsat 회귀</small>', '0.00℃', a.dLst.toFixed(2) + '℃', a.dLst < -.005],
      ['새로 생긴 그늘<small>' + hm(hour) + ' 해 위치</small>', '0㎡', Math.round(last.shadeM2).toLocaleString() + '㎡', last.shadeM2 > 0],
      ['화장실 250m 밖 칸<small>공원 전체</small>', last.toilet[0] + '칸', last.toilet[1] + '칸', last.toilet[1] < last.toilet[0]],
      ['공원 평균 만족도<small>사람 수 가중</small>', pred.parkBefore.toFixed(1), pred.parkAfter.toFixed(1), up(pred.parkBefore, pred.parkAfter)]
    ].filter(r => r[3] || !/땅 온도|새로 생긴 그늘|화장실/.test(r[0]));
    return { what, why, good, rows };
  }
  function panelHTML() {
    const p = P[sel.id], pct = satPct(p);
    let h = '<h2>' + esc(sel.name) + '<small>' + esc(sel.zone || '') + '</small></h2>';
    if (p && p.n) {
      const reasons = Object.keys(BAD).filter(k => (p.reasons || {})[k]).sort((a, b) => p.reasons[b] - p.reasons[a]);
      h += '<div class="tw-rt"><div class="tw-face"><span>😊 ' + p.good + '</span><span>😐 ' + p.mid + '</span><span>😞 ' + p.bad + '</span><b style="color:' + pctCss(pct) + '">만족 ' + Math.round(pct) + '%</b></div>' +
        '<div class="tw-sbar"><i class="g" style="width:' + p.good / p.n * 100 + '%"></i><i class="m" style="width:' + p.mid / p.n * 100 + '%"></i><i class="b" style="width:' + p.bad / p.n * 100 + '%"></i></div>' +
        '<small>방문객 평가 ' + p.n + '건' + (rat.demo ? ' · 시연용 가상 평가' : ' · 최근 90일') + ' · 만족 비율 = (😊×100 + 😐×50) ÷ 건수</small>' +
        (reasons.length ? '<ul class="tw-why">' + reasons.map(k => '<li><span>' + BAD[k] + ' <b>' + p.reasons[k] + '</b></span><span>→ ' + REC[k].map(x => FAC[x].label).join(' · ') + '</span></li>').join('') + '</ul>' : '<p class="tw-note">아쉬운 이유가 아직 없어요.</p>') + evHub(sel.id) + '</div>';
    } else h += '<p class="tw-note">이 거점에는 방문객 평가가 아직 없어요.</p>';
    $('.tw-rate').innerHTML = h;
    const pl = plans[sel.id], hp = pred && pred.hubs[sel.id];
    if (!pl || !hp) { $('.tw-pred').innerHTML = '<p class="tw-note">' + (pl === null ? '이 거점은 팀 20m 격자 밖이라 계산할 수 없어요.' : '최선안을 계산하고 있어요…') + '</p>'; return; }
    const li = (t, k) => '<li><span class="no">' + NUM[k] + '</span><span><b>' + FAC[t.k].label + '</b>' + (t.gain ? '<em>주변 환경 ' + f1(t.gain) + '</em>' : '') + '<small>' + esc([t.where, t.why].filter(Boolean).join(' · ')) + '</small></span></li>';
    const S1 = summary(pl, hp);
    $('.tw-pred').innerHTML = '<h3>' + esc(sel.name) + ' 개선안 <small>3D 왼쪽은 지금, 오른쪽은 개선 후 · 바뀐 곳은 민트색 테두리</small></h3>' +
      '<dl class="tw-sum"><dt>바뀌는 것</dt><dd>' + esc(S1.what) + '</dd><dt>왜</dt><dd>' + S1.why.map(esc).join('<br>') + '</dd><dt>좋아지는 것</dt><dd>' + S1.good.map(esc).join('<br>') + '</dd></dl>' +
      '<h4>전후 비교 <small>거점 둘레 80m(칸 ' + pl.cmp.a.n + '개) · 그늘은 8월 1일 10~16시 평균</small></h4>' +
      '<table class="tw-cmp"><thead><tr><th></th><th>지금</th><th>개선 후</th></tr></thead><tbody>' + S1.rows.map(r => '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td><td class="' + (r[3] ? 'up' : '') + '">' + r[2] + '</td></tr>').join('') + '</tbody></table>' +
      '<h4>무엇을 어디에 <small>번호는 3D의 번호와 같아요 · 후보 ' + pl.nCand + '개 중 고름</small></h4>' +
      (pl.plan.length ? '<ol class="tw-plan">' + pl.plan.map(li).join('') + '</ol>' : '<p class="tw-note">어떤 시설을 더해도 주변 환경이 ' + MIN_GAIN + '점 넘게 오르지 않아요. 이곳은 시설보다 운영(붐빔 분산·안내)이 먼저예요.</p>') +
      (pl.extra.length ? '<ol class="tw-plan ex">' + pl.extra.map((t, k) => li(t, pl.plan.length + k)).join('') + '</ol>' : '') +
      '<div class="tw-act"><button type="button" class="tw-main" data-t="report">개선안 보고서 만들기</button></div>' +
      '<p class="tw-foot">고르는 법: 데이터로 맞다고 확인된 아쉬움(예: 「붐볐어요」가 실제 혼잡 때 더 많이 나옴)은 그에 맞는 시설을 먼저 넣고, 나머지는 시설을 하나씩 더해 보며 8월 1일 10~16시 평균으로 주변 환경 점수를 가장 많이 올리는 것을 고르고, 더 넣어도 ' + MIN_GAIN + '점 미만이면 멈춰요(최대 ' + MAX_ITEMS + '개). 시설 크기·수관 64㎡·데크 ×0.88·멈춤 기준은 팀 가정값, 땅 온도 계수는 팀 Landsat 회귀(R² 0.21)예요.</p>';
  }
  function labelsHTML() { labs.innerHTML = hubs.map(h => '<button type="button" class="tw-lab' + (h.id === sel.id ? ' on' : '') + '" data-h="' + h.id + '">' + esc(h.name) + ' <em style="color:' + (h.pct == null ? '#aab' : pctCss(h.pct)) + '">' + (h.pct == null ? '평가 없음' : '😊' + Math.round(h.pct) + '%') + '</em> <b></b></button>').join(''); }
  function labelScores() { [...labs.children].forEach((el, k) => { const hp = pred && pred.hubs[hubs[k].id]; el.querySelector('b').textContent = hp ? hp.after.toFixed(0) + '점' : ''; }); }
  function numsHTML() { nums.innerHTML = items.map((t, k) => '<span class="tw-num' + (FAC[t.k].g === 'score' ? '' : ' ex') + '">' + NUM[k] + '</span>').join(''); }
  let blocks = [];
  function layoutBlocks() { blocks = ['.tw-left', '.tw-right', '.tw-top', '.tw-time'].map(s => ui.querySelector(s)).filter(Boolean).map(e => e.getBoundingClientRect()); layoutViews(); }
  const v3 = new THREE.Vector3();
  function project(x, y, z, el) {
    const v = views[views.length - 1]; v3.set(x, z, -y).project(v.cam); const px = v.x + (v3.x + 1) / 2 * v.w, py = v.y + (1 - v3.y) / 2 * v.h;
    const hide = v3.z > 1 || px < v.x || px > v.x + v.w || py < v.y || py > v.y + v.h || blocks.some(b => px > b.left - 16 && px < b.right + 16 && py > b.top - 8 && py < b.bottom + 20);
    el.style.display = hide ? 'none' : ''; if (!hide) el.style.transform = 'translate(' + px.toFixed(1) + 'px,' + py.toFixed(1) + 'px) translate(-50%,-100%)';
  }
  function placeLabels() {
    const only = split && W <= 800;   // 폰 위아래 나눠 보기: 고른 곳 이름표만
    [...labs.children].forEach((el, k) => { const h = hubs[k]; if (only && h.id !== sel.id) { el.style.display = 'none'; return; } project(h.x, h.y, pillarG.visible ? h.top : 6, el); });
    [...nums.children].forEach((el, k) => { const t = items[k]; if (t) project(t.x, t.y, t.k === 'tree' ? 11 : t.k === 'lawn' ? 1.5 : 5, el); });
  }
  function showPlan() {
    items.forEach(t => { if (t.mesh) itemsG.remove(t.mesh); if (t.halo) { itemsG.remove(t.halo); t.halo.material.map.dispose(); t.halo.material.dispose(); t.halo = null; } });
    const pl = plans[sel.id]; items = pl ? pl.plan.concat(pl.extra) : [];
    items.forEach(t => { t.mesh = t.k === 'lawn' ? lawnMesh(t.cell) : model(t.k); if (t.k !== 'lawn') { t.mesh.position.set(t.x, 0, -t.y); t.mesh.rotation.y = t.rot; } t.halo = haloMesh(t); itemsG.add(t.mesh, t.halo); });
    itemsG.traverse(m => m.layers.set(1));   // 개선안은 오른쪽(개선 후) 카메라와 개선 후 해에만 보임
    markNear(); shadowDirty(); numsHTML(); compute(); panelHTML(); updStats(); labelScores(); labDirty = true;
  }
  function selectHub(id, flyDur) {
    const h = hubOf(id); if (!h) return; sel = h; labelsHTML(); lowHTML(); labDirty = true;
    if (!(h.id in plans)) { panelHTML(); setTimeout(() => { planFor(h); if (sel === h) { showPlan(); lowHTML(); if (flyDur) flyTo(planView(h), flyDur); } }, 30); }
    else { showPlan(); if (flyDur) flyTo(planView(h), flyDur); }
  }
  function timeText() { const sd = sunDir(hour); $('.tw-hr').textContent = hm(hour); $('.tw-sun').textContent = '해 높이 ' + Math.round(sd.alt) + '° · ' + DIR8[Math.round(sd.az / 45) % 8] + '쪽'; }

  let down = null;
  cvs.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  cvs.addEventListener('pointerup', e => {
    if (!down || fly) { down = null; return; } const mv = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
    if (mv > 6 || dt > 650) return;
    const r = cvs.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, v = views.find(w => mx >= w.x && mx < w.x + w.w && my >= w.y && my < w.y + w.h) || views[views.length - 1];
    ndc.set((mx - v.x) / v.w * 2 - 1, -(my - v.y) / v.h * 2 + 1); ray.setFromCamera(ndc, v.cam);
    const ph = ray.intersectObjects(pillarG.children)[0]; if (ph) selectHub(ph.object.userData.hub, 1.4);
  });
  function onKey(e) { if (e.key === 'Escape' && !$('.tw-report').hidden) $('.tw-report').hidden = true; }
  addEventListener('keydown', onKey);
  ui.addEventListener('click', e => {
    const hb = e.target.closest('[data-h]'); if (hb) { selectHub(hb.dataset.h, 1.4); return; }
    const t = e.target.closest('[data-t]'); if (!t) return; const a = t.dataset.t;
    if (a === 'rate') { pillarG.visible = !pillarG.visible; t.setAttribute('aria-pressed', pillarG.visible); dirty = labDirty = true; }
    if (a === 'glow') { glow.visible = !glow.visible; t.setAttribute('aria-pressed', glow.visible); if (glow.visible) paintGlow(last.score); dirty = true; }
    if (a === 'one' || a === 'split') { split = a === 'split'; ui.querySelector('[data-t="one"]').setAttribute('aria-pressed', !split); ui.querySelector('[data-t="split"]').setAttribute('aria-pressed', split); layoutViews(); if (!fly) flyTo(planView(sel), .8); }
    if (a === 'hq') setHQ(t.getAttribute('aria-pressed') !== 'true', t);
    if (a === 'exit') exit();
    if (a === 'report') report();
    if (a === 'print') window.print();
    if (a === 'png') savePNG();
    if (a === 'close-report') $('.tw-report').hidden = true;
  });
  let rq = 0;
  range.addEventListener('input', () => { hour = +range.value; timeText(); placeSun(); });
  range.addEventListener('change', () => { hour = +range.value; compute(); panelHTML(); updStats(); labelScores(); dirty = true; });

  // ---------- 보고서 ----------
  function reportData() {
    const p = P[sel.id], pct = satPct(p), hp = pred.hubs[sel.id], pl = plans[sel.id] || { plan: [], extra: [] }, d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const reasons = p ? Object.keys(BAD).filter(k => (p.reasons || {})[k]).sort((a, b) => p.reasons[b] - p.reasons[a]).map(k => BAD[k] + ' ' + p.reasons[k] + '건') : [];
    return {
      hub: sel.name, date: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
      why: p && p.n ? '방문객 평가 ' + p.n + '건 · 만족 ' + Math.round(pct) + '%' + (rat.demo ? ' (시연용 가상 평가)' : ' (최근 90일)') + (reasons.length ? ' · 아쉬운 이유: ' + reasons.join(', ') : '') : '방문객 평가 없음 · 예측 점수로 고름',
      fac: pl.plan.map((t, k) => NUM[k] + ' ' + FAC[t.k].label + ' — ' + [t.where, t.why].filter(Boolean).join(' · ') + ' (주변 환경 ' + f1(t.gain) + ', 점수 반영)')
        .concat(pl.extra.map((t, k) => NUM[pl.plan.length + k] + ' ' + FAC[t.k].label + ' — ' + t.why + (t.k === 'toilet' ? ' (250m 밖 칸 수만 반영)' : ' (점수 없음 · 개선안에 담김)'))),
      eff: pl.cmp ? summary(pl, hp).rows.map(r => r[0].replace(/<small>(.*?)<\/small>/, ' ($1)') + ': ' + r[1] + ' → ' + r[2]) : ['예측 만족도 ' + hp.before.toFixed(1) + ' → ' + hp.after.toFixed(1) + '점 (' + f1(hp.after - hp.before) + ', 8월 1일 ' + hm(hour) + ')', '주변 환경 ' + hp.envBefore.toFixed(1) + ' → ' + hp.envAfter.toFixed(1), '새로 생긴 그늘 ' + Math.round(last.shadeM2).toLocaleString() + '㎡ (' + hm(hour) + ' 해 위치)', '공원 평균(사람 수 가중) ' + pred.parkBefore.toFixed(1) + ' → ' + pred.parkAfter.toFixed(1), '화장실 250m 밖 칸 ' + last.toilet[0] + ' → ' + last.toilet[1] + '칸'],
      ev: hubEv(sel.id).map(e => '「' + BAD[e.key] + '」 ' + e.n + '건 — 공원 전체 ' + VTXT[e.park.v] + ' (' + evLine(e.key) + ')' + (e.park.v === 'yes' ? ' → 맞춤 시설 우선 반영' : '')),
      ops: opsRecs(),
      how: '데이터로 확인된 아쉬움은 맞춤 시설을 먼저 넣고, 나머지는 거점 80m 안 20m 칸마다 시설 6종(벤치·파고라·그늘막·그늘 나무·잔디마당·데크)을 후보로 두고, 8월 1일 10~16시 평균으로 주변 환경 점수를 가장 많이 올리는 것을 하나씩 더함. 더해도 ' + MIN_GAIN + '점 미만이면 멈춤(최대 ' + MAX_ITEMS + '개).',
      check: ['설치 뒤 같은 곳의 방문객 평가(😊😐😞·아쉬운 이유)를 설치 전과 비교한다.', '시설 크기, 수관 64㎡, 데크 붐빔 ×0.88, 화장실 250m, 멈춤 기준, 만족도 환산 비율은 팀 가정값이다. 땅 온도 계수(−0.839·+1.345)는 팀 Landsat 회귀(R² 0.21)다.', '바닥면적 33㎡ 이하 휴게시설은 도시공원법 시행령 제13조의 경미한 변경 대상인지 확인한다.', '현장에서 지하 매설물·기존 수목 뿌리·보행 동선과 겹치지 않는지 확인한다.']
    };
  }
  let shot = '';
  function report() {
    const sv = [{ cam: camera, side: 'R', x: 0, y: 0, w: W, h: H, vis: VIS }]; setOffset(camera, sv[0]); draw(sv, true);
    try { shot = cvs.toDataURL('image/jpeg', .85); } catch (e) { shot = ''; } layoutViews();
    const r = reportData(), el = $('.tw-report'), ul = a => '<ul>' + a.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
    el.innerHTML = '<div class="tw-sheet"><header><span>서울숲 디지털트윈 · 개선안 보고서</span><span>' + r.date + '</span></header><h1>' + esc(r.hub) + '</h1>' + (shot ? '<img src="' + shot + '" alt="개선안 3D 장면">' : '') +
      '<h4>왜 여기인가</h4><p>' + esc(r.why) + '</p><h4>제안 시설</h4>' + (r.fac.length ? ul(r.fac) : '<p>시설보다 운영 개선이 먼저인 곳이에요.</p>') +
      (r.ev.length ? '<h4>아쉬움 근거 확인</h4>' + ul(r.ev) : '') + '<h4>예측 효과</h4>' + ul(r.eff) + (r.ops.length ? '<h4>오늘 운영 추천 (실시간 도시데이터)</h4>' + ul(r.ops) : '') + '<h4>고른 방법</h4><p>' + esc(r.how) + '</p><h4>확인할 것</h4>' + ul(r.check) +
      '<footer>가상 시험 결과이며 실제 효과는 다를 수 있어요.</footer><div class="tw-ra"><button type="button" data-t="print">인쇄</button><button type="button" data-t="png">PNG 저장</button><button type="button" data-t="close-report">닫기</button></div></div>';
    el.hidden = false;
  }
  function savePNG() {
    const r = reportData(), Wc = 1240, c = document.createElement('canvas'), x = c.getContext('2d'), F = 'Pretendard Variable, Pretendard, sans-serif', lines = [];
    const push = (t, s, w, col, gap) => lines.push({ t, s, w, col, gap });
    push('서울숲 디지털트윈 · 개선안 보고서 · ' + r.date, 22, 600, '#5b6b63', 10); push(r.hub, 48, 800, '#0d1a14', 18);
    const sec = (h, arr) => { push(h, 26, 800, '#0b7a45', 8); arr.forEach(t => push('· ' + t, 21, 500, '#1d2a24', 4)); push('', 10, 400, '#000', 8); };
    sec('왜 여기인가', [r.why]); sec('제안 시설', r.fac.length ? r.fac : ['시설보다 운영 개선이 먼저']); if (r.ev.length) sec('아쉬움 근거 확인', r.ev); sec('예측 효과', r.eff); if (r.ops.length) sec('오늘 운영 추천 (실시간 도시데이터)', r.ops); sec('고른 방법', [r.how]); sec('확인할 것', r.check);
    push('가상 시험 결과이며 실제 효과는 다를 수 있어요.', 18, 500, '#6b7a73', 0);
    const wrap = (t, s, w) => { x.font = w + ' ' + s + 'px ' + F; const out = []; let cur = ''; for (const ch of t) { if (x.measureText(cur + ch).width > Wc - 160 && cur) { out.push(cur); cur = ch; } else cur += ch; } out.push(cur); return out; };
    const img = new Image(), draw = () => {
      const ih = img.width ? Math.round((Wc - 160) * img.height / img.width) : 0; let H2 = 120 + ih + 40;
      const wl = lines.map(l => { const w = l.t ? wrap(l.t, l.s, l.w) : ['']; H2 += w.length * l.s * 1.45 + l.gap; return w; });
      c.width = Wc; c.height = Math.ceil(H2 + 60); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); let y = 80;
      lines.forEach((l, k) => { x.font = l.w + ' ' + l.s + 'px ' + F; x.fillStyle = l.col; wl[k].forEach(t => { x.fillText(t, 80, y); y += l.s * 1.45; }); y += l.gap; if (k === 1 && ih) { x.drawImage(img, 80, y, Wc - 160, ih); y += ih + 30; } });
      const a = document.createElement('a'); a.download = '서울숲_개선안_' + r.hub.replace(/[^\w가-힣]+/g, '_') + '_' + r.date + '.png'; a.href = c.toDataURL('image/png'); a.click();
    };
    if (shot) { img.onload = draw; img.onerror = draw; img.src = shot; } else draw();
  }

  // ---------- 그리기 루프(바뀔 때만 그림) ----------
  let W = 1, H = 1, split = true, views = [], VIS = null, hq = false, HQ = null;
  function size() { W = root.clientWidth || innerWidth; H = root.clientHeight || innerHeight; renderer.setSize(W, H, false); layoutBlocks(); }
  // 패널에 가리지 않는 3D 영역
  function visRect() {
    const g = q => { const e = ui.querySelector(q); return e ? e.getBoundingClientRect() : null; }, L = g('.tw-left'), R = g('.tw-right'), T = g('.tw-top'), Tm = g('.tw-time');
    const v = W >= 900 ? { x0: L ? L.right : 0, x1: R ? R.left : W, y0: T ? T.bottom : 0, y1: Tm ? Tm.top : H }
      : { x0: 0, x1: W, y0: T ? T.bottom : 0, y1: Math.min(L ? L.top : H, Tm ? Tm.top : H, R ? R.top : H) };
    return v.x1 - v.x0 < 160 || v.y1 - v.y0 < 120 ? { x0: 0, x1: W, y0: 0, y1: H } : v;
  }
  // 화면 칸의 투영 중심을 '보이는 부분'의 가운데로(패널 뒤로 거점이 숨지 않게)
  function setOffset(cam, v) {
    const cx = (v.vis.x0 + v.vis.x1) / 2 - v.x, cy = (v.vis.y0 + v.vis.y1) / 2 - v.y, fw = 2 * Math.max(cx, v.w - cx), fh = 2 * Math.max(cy, v.h - cy);
    cam.setViewOffset(fw, fh, fw / 2 - cx, fh / 2 - cy, v.w, v.h);
  }
  function layoutViews() {
    const v = VIS = visRect(), vert = W <= 800;
    if (!split) views = [{ cam: camera, side: 'R', x: 0, y: 0, w: W, h: H, vis: v }];
    else if (!vert) { const m = Math.round((v.x0 + v.x1) / 2); views = [{ cam: camL, side: 'L', x: 0, y: 0, w: m, h: H, vis: { x0: v.x0, x1: m, y0: v.y0, y1: v.y1 } }, { cam: camera, side: 'R', x: m, y: 0, w: W - m, h: H, vis: { x0: m, x1: v.x1, y0: v.y0, y1: v.y1 } }]; }
    else { const m = Math.round((v.y0 + v.y1) / 2); views = [{ cam: camL, side: 'L', x: 0, y: 0, w: W, h: m, vis: { x0: 0, x1: W, y0: v.y0, y1: m } }, { cam: camera, side: 'R', x: 0, y: m, w: W, h: H - m, vis: { x0: 0, x1: W, y0: m, y1: v.y1 } }]; }
    views.forEach(w => setOffset(w.cam, w));
    if (hq && HQ) views.forEach(w => { const c = HQ[w.side]; c.setPixelRatio(renderer.getPixelRatio()); c.setSize(w.w, w.h); });
    const sp = $('.tw-split'); sp.hidden = !split;
    if (split) {
      const b = views[1]; $('.tw-div').style.cssText = vert ? 'left:0;top:' + (b.y - 1) + 'px;width:' + W + 'px;height:2px' : 'left:' + (b.x - 1) + 'px;top:' + v.y0 + 'px;width:2px;height:' + (v.y1 - v.y0) + 'px';
      views.forEach(w => { const l = sp.querySelector('.tw-vl[data-s="' + w.side + '"]'), st = sp.querySelector('.tw-vs[data-s="' + w.side + '"]');
        l.style.transform = 'translate(' + (w.vis.x0 + 14) + 'px,' + (w.vis.y0 + 12) + 'px)';
        st.style.transform = 'translate(' + ((w.vis.x0 + w.vis.x1) / 2) + 'px,' + (w.vis.y1 - 10) + 'px) translate(-50%,-100%)'; st.style.maxWidth = (w.vis.x1 - w.vis.x0 - 16) + 'px'; });
    }
    const fp = $('.tw-fps'); fp.hidden = !SHOW_FPS; fp.style.transform = 'translate(' + (v.x1 - 10) + 'px,' + (v.y0 + 12) + 'px) translate(-100%,0)';
    dirty = labDirty = true;
  }
  // 각 화면 아래 핵심 숫자 3개(오른쪽은 차이)
  function updStats() {
    const pl = plans[sel.id], hp = pred && pred.hubs[sel.id], L = $('.tw-vs[data-s="L"]'), R = $('.tw-vs[data-s="R"]');
    if (!pl || !pl.cmp || !hp) { L.innerHTML = R.innerHTML = ''; return; }
    const b = pl.cmp.b, a = pl.cmp.a, cell = (k, v, df) => '<span><small>' + k + '</small><b>' + v + '</b>' + (df || '') + '</span>';
    const d = (v, u, good, dg) => '<em class="' + (good ? 'up' : '') + '">' + (Math.abs(v) < Math.pow(10, -dg) / 2 ? '±0' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(dg)) + u + '</em>';
    const ds = hp.after - hp.before, dsh = Math.round(a.shade * 100) - Math.round(b.shade * 100), dr = Math.round(a.rest) - Math.round(b.rest);
    L.innerHTML = cell('예측 만족도', hp.before.toFixed(1) + '점') + cell('그늘 비율', pc(b.shade)) + cell('쉴 곳까지 평균', Math.round(b.rest) + 'm');
    R.innerHTML = cell('예측 만족도', hp.after.toFixed(1) + '점', d(ds, '', ds > .05, 1)) + cell('그늘 비율', pc(a.shade), d(dsh, '%p', dsh > 0, 0)) + cell('쉴 곳까지 평균', Math.round(a.rest) + 'm', d(dr, 'm', dr < 0, 0));
  }
  // 한 프레임: 렌더러 하나로 화면 칸마다 viewport/scissor를 바꿔 그림. 그림자 지도는 그 쪽 해가 바뀌었을 때만 다시 그림
  function draw(vs, noHQ) {
    camL.position.copy(camera.position); camL.quaternion.copy(camera.quaternion);
    for (const v of vs) {
      const gy = H - v.y - v.h; renderer.setViewport(v.x, gy, v.w, v.h); renderer.setScissor(v.x, gy, v.w, v.h);
      renderer.shadowMap.needsUpdate = v.side === 'L' ? shL : shR;
      if (hq && HQ && !noHQ) HQ[v.side].render(); else renderer.render(scene, v.cam);
      if (v.side === 'L') shL = false; else shR = false;
    }
  }
  // 고화질: 틈 그늘(GTAO) — 켤 때만 불러옴, 화면 칸마다 합성기 하나
  async function setHQ(on, btn) {
    if (on && !HQ) {
      btn.disabled = true;
      try {
        const [{ EffectComposer }, { RenderPass }, { GTAOPass }, { OutputPass }] = await Promise.all(['EffectComposer', 'RenderPass', 'GTAOPass', 'OutputPass'].map(n => import('three/addons/postprocessing/' + n + '.js')));
        const mk = cam => { const c = new EffectComposer(renderer); c.addPass(new RenderPass(scene, cam)); const g = new GTAOPass(scene, cam, 2, 2); g.updateGtaoMaterial({ radius: 3, distanceExponent: 1, thickness: 3, scale: 1.2 }); c.addPass(g); c.addPass(new OutputPass()); return c; };
        HQ = { L: mk(camL), R: mk(camera) };
      } catch (e) { console.warn('[디지털트윈] 고화질을 켜지 못했어요', e); on = false; }
      btn.disabled = false;
    }
    if (!alive) return; hq = on && !!HQ; btn.setAttribute('aria-pressed', hq); shadowDirty(); layoutViews();
  }
  const SHOW_FPS = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || /[?&](fps|debug3d)\b/.test(location.search);   // 개발 중에만
  let fN = 0, fMs = 0, fT = 0;
  let raf = 0, alive = true, lastR = 0, ft = [], qLevel = 0;
  function degrade(l) {
    if (l === 1) { renderer.setPixelRatio(1); size(); }
    if (l === 2 && TREES) { TREES.castShadow = false; shadowDirty(); }
    if (l === 3) { renderer.shadowMap.enabled = false; scene.traverse(m => { if (m.material) [].concat(m.material).forEach(x => { x.needsUpdate = true; }); }); }
    const q = $('.tw-q'); if (q) { q.hidden = false; q.textContent = '느린 기기라 화질을 낮췄어요 (' + l + '/3)'; }
  }
  function frame(now) {
    if (!alive) return; raf = requestAnimationFrame(frame);
    if (fly) {
      const t = Math.min(1, (now - fly.t0) / (fly.dur * 1000)), e = ease(t);
      controls.target.lerpVectors(fly.a.t, fly.b.t, e); camera.position.lerpVectors(fly.a.p, fly.b.p, e); camera.lookAt(controls.target); dirty = labDirty = true;
      if (controls.target.distanceTo(ctr) > 140) { ctr.copy(controls.target); placeSun(); }
      if (t >= 1) { const d = fly.done; fly = null; controls.enabled = true; ctr.copy(controls.target); placeSun(); treeLOD(); if (d) d(); }
    } else if (controls.update()) dirty = true;
    if (dirty) {
      dirty = false; const t0 = performance.now(); draw(views); if (labDirty) { labDirty = false; placeLabels(); } fN++; fMs += performance.now() - t0;
      if (now - lastR < 120) { ft.push(now - lastR); if (ft.length >= 30) { const avg = ft.reduce((a, b) => a + b, 0) / ft.length; ft = []; if (avg > 28 && qLevel < 3) degrade(++qLevel); } }
      lastR = now;
    }
    if (SHOW_FPS && now - fT > 500) { $('.tw-fps').textContent = fN ? 'FPS ' + Math.round(fN * 1000 / (now - fT)) + ' · CPU ' + (fMs / fN).toFixed(1) + 'ms' : '멈춤 · 다시 그리지 않음'; fN = 0; fMs = 0; fT = now; }
  }
  const ro = new ResizeObserver(size); ro.observe(root);

  // ---------- 시작 ----------
  labelsHTML(); timeText(); size(); treeLOD(); $('.tw-livebox').innerHTML = liveHTML();
  plans[sel.id] = bestPlan(sel); showPlan(); lowHTML();
  if (/[?&]debug3d\b/.test(location.search)) window.__tw = { THREE, renderer, scene, camera, camL, get views() { return views; }, get trees() { return trees.count + '/' + TL.length; }, get items() { return items; }, get pred() { return pred; }, plans };
  root.querySelector('.tw-load').remove(); root.classList.add('in'); raf = requestAnimationFrame(frame);
  flyTo(planView(sel), 1.6, () => { root.classList.add('ready'); o.onReady && o.onReady(); layoutBlocks(); dirty = true; idle(); });
  // 다른 낮은 곳들의 최선안은 쉬는 틈에 하나씩
  function idle() { const h = lowList().find(x => !(x.id in plans)); if (!h || !alive) return; setTimeout(() => { if (!alive) return; planFor(h); lowHTML(); idle(); }, 60); }

  let leaving = false;
  function exit() {
    if (leaving) return; leaving = true; root.classList.remove('ready'); o.onLeave && o.onLeave();
    flyTo(above(sel), 1.4, () => { root.classList.add('out'); setTimeout(dispose, 400); });
  }
  function dispose() {
    alive = false; cancelAnimationFrame(raf); cancelAnimationFrame(rq);
    removeEventListener('keydown', onKey); ro.disconnect(); controls.dispose();
    if (HQ) Object.values(HQ).forEach(c => { c.passes.forEach(p => p.dispose && p.dispose()); c.dispose(); });
    items.forEach(t => { if (t.halo) { t.halo.material.map.dispose(); t.halo.material.dispose(); } });
    scene.traverse(m => { if (m.geometry && !disp.includes(m.geometry)) m.geometry.dispose(); });
    disp.forEach(d => d.dispose && d.dispose()); renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); root.remove();
    o.onExit && o.onExit();
  }
  return { exit };
}
