// [최명원 버전] 부담지도 — 다섯 가지 부담, 상황별 가중치, 처방
// 데이터: public/data/burden.json (부담지도/src/build.py 가 생성)

export const BURDENS = [
  { key: 'cost', label: '비용', color: '--b-cost', q: '돈 없이 먹고 마시고 앉을 수 있나', who: '돈 없이 머물고 싶은 사람' },
  { key: 'time', label: '시간', color: '--b-time', q: '해가 진 뒤에도 머물 수 있나', who: '평일 저녁에만 시간이 나는 1인 가구' },
  { key: 'mind', label: '심리', color: '--b-mind', q: '혼자 와도 편히 앉을 수 있나', who: '혼자 온 사람' },
  { key: 'body', label: '신체', color: '--b-body', q: '몸이 불편해도 쉬어 갈 수 있나', who: '고령층 · 유아 동반 가족' },
  { key: 'env', label: '환경', color: '--b-env', q: '덥거나 공기가 나쁘지 않나', who: '모두 (폭염·미세먼지 날 특히)' },
];

// 주제서 p.10 취약 유형 4개 ↔ 다섯 부담
export const TOPIC = [
  { key: 'heat', label: '열', maps: '환경', how: '환경 부담의 70% (지표온도·녹지)' },
  { key: 'crowd', label: '혼잡', maps: '심리 · 상황(주말)', how: '심리 부담의 40%, 주말 낮 상황에서 가중' },
  { key: 'access', label: '접근성', maps: '신체', how: '화장실·쉼터 거리 + 계단(무장애 단절)' },
  { key: 'air', label: '대기', maps: '환경', how: '환경 부담의 30% (도로 근접)' },
];

// 상황별 가중치 (가정값). time=0 은 낮이라 조명 부담이 의미 없다는 뜻
export const SCENES = [
  { key: 'now', label: '지금' },
  { key: 'normal', label: '평일 낮', w: { cost: 1, time: 0, mind: 1, body: 1, env: 1 }, why: '평소 낮 기준. 다섯 부담 중 조명(시간)은 제외' },
  { key: 'heat', label: '폭염·미세먼지', w: { cost: 1.5, time: 0, mind: 0.7, body: 1.5, env: 2.5 }, why: '열·대기(환경)를 가장 크게, 물을 구할 곳(비용)과 쉬어 갈 곳(신체)을 더 크게' },
  { key: 'evening', label: '평일 저녁', w: { cost: 0.7, time: 2.5, mind: 1.5, body: 1, env: 0.3 }, why: '퇴근 후 1인 가구 기준. 밝은 길(시간)과 혼자 앉을 자리(심리)를 크게' },
  { key: 'weekend', label: '주말 낮', w: { cost: 1.5, time: 0, mind: 1.5, body: 1, env: 1.2 }, why: '인파가 몰릴 때. 자리 경쟁(심리·혼잡)과 피크닉 비용을 크게' },
];

/** '지금' 상황 판정: 시간 → 날씨 → 요일 순 */
export function pickScene(now, snap) {
  const h = now?.hour ?? 12;
  if (h >= 18 || h < 6) return 'evening';
  const hot = (snap?.feels ?? 0) >= 31 || (snap?.pm25 ?? 0) >= 36 || (snap?.pm10 ?? 0) >= 81;
  if (hot) return 'heat';
  if (now?.dow === 0 || now?.dow === 6) return 'weekend';
  return 'normal';
}

/** 칸 하나의 상황별 부담 점수 (0~1, 높을수록 부담 큼) */
export function sceneScore(cell, w) {
  let s = 0;
  let t = 0;
  for (const b of BURDENS) {
    s += (w[b.key] ?? 0) * cell[b.key];
    t += w[b.key] ?? 0;
  }
  return t ? s / t : 0;
}

/** 값 배열 → 백분위(0~1) 배열 */
export function percentile(values) {
  const order = values.map((v, i) => i).sort((a, b) => values[a] - values[b]);
  const out = new Array(values.length);
  order.forEach((i, r) => { out[i] = values.length > 1 ? r / (values.length - 1) : 0; });
  return out;
}

export const ACT_COLOR = {
  shade: '--b-env', buffer: '--b-air', water: '--b-cost', light: '--b-time', seat: '--b-mind', rest: '--b-body', toilet: '--b-body',
};

/** '#rrggbb' 두 색을 t 비율로 섞음 (Leaflet canvas 는 var()/color-mix 를 못 읽음) */
export function mix(a, b, t) {
  const p = (h) => {
    const m = String(h).trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return null;
    let x = m[1];
    if (x.length === 3) x = x.split('').map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
  };
  const A = p(a);
  const B = p(b);
  if (!A || !B) return b;
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
}

// 모듈 2 생애주기 3그룹 (주제서 p.8) — 그룹마다 부담 가중치가 다름 (가정값)
export const PERSONAS = [
  { key: 'youth', label: '1인 가구 청년', when: '평일 저녁 · 혼자', w: { cost: 0.7, time: 2.5, mind: 1.8, body: 0.6, env: 0.3 }, need: '밝은 길, 혼자 앉을 자리' },
  { key: 'elder', label: '고령층', when: '평일 오전 · 산책', w: { cost: 0.8, time: 0, mind: 0.6, body: 2.5, env: 1.5 }, need: '가까운 화장실·쉼터, 계단 없는 길', barrierFree: true },
  { key: 'family', label: '유아 동반 가족', when: '주말 낮 · 피크닉', w: { cost: 1.5, time: 0, mind: 1.2, body: 1.3, env: 1.5 }, need: '그늘, 무료 피크닉 자리, 화장실' },
];

/** 점수가 낮은(부담 적은) 칸이 많이 모인 거점 상위 n개 */
export function bestHubs(cells, scores, hubs, n = 3, cut = 0.1) {
  const by = {};
  const pool = hubs.filter((h) => h.type !== 'gate');
  cells.forEach((c, i) => {
    if (scores[i] > cut) return;
    const h = nearestHub(pool, (c.b[0] + c.b[2]) / 2, (c.b[1] + c.b[3]) / 2);
    if (h) (by[h.id] ??= { h, n: 0 }).n += 1;
  });
  return Object.values(by).sort((a, b) => b.n - a.n).slice(0, n);
}

/**
 * 모듈 3 — 부담을 비용함수에 넣은 A* (주제서 p.9 g = α·거리 + … 에 ε·부담 항 추가)
 * network.edges: [a, b, len, heat, air, steps, cellIndex]
 */
export function burdenRoute(network, start, goal, cellScore, { eps = 0, barrierFree = false } = {}) {
  const N = network.nodes;
  if (!network._adj) {
    const adj = Array.from({ length: N.length }, () => []);
    for (const [a, b, len, , , steps, ci] of network.edges) {
      adj[a].push([b, len, steps, ci]);
      adj[b].push([a, len, steps, ci]);
    }
    network._adj = adj; // eslint-disable-line no-param-reassign
  }
  const adj = network._adj;
  const kx = Math.cos((37.544 * Math.PI) / 180) * 111320;
  const h = (i) => Math.hypot((N[i][0] - N[goal][0]) * kx, (N[i][1] - N[goal][1]) * 110540);
  const g = new Float64Array(N.length).fill(Infinity);
  const prev = new Int32Array(N.length).fill(-1);
  const pe = new Array(N.length);
  const done = new Uint8Array(N.length);
  g[start] = 0;
  const open = [[h(start), start]];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [, u] = open.splice(bi, 1)[0];
    if (done[u]) continue;
    done[u] = 1;
    if (u === goal) break;
    for (const [v, len, steps, ci] of adj[u]) {
      if (barrierFree && steps) continue;
      const s = ci >= 0 ? cellScore[ci] : 0.5;
      const ng = g[u] + len * (1 + eps * s) + (steps && eps ? 40 : 0);
      if (ng < g[v]) { g[v] = ng; prev[v] = u; pe[v] = [len, s]; open.push([ng + h(v), v]); }
    }
  }
  if (!Number.isFinite(g[goal])) return null;
  const coords = [];
  let len = 0;
  let bur = 0;
  for (let v = goal; v !== -1; v = prev[v]) {
    coords.push([N[v][1], N[v][0]]);
    if (pe[v]) { len += pe[v][0]; bur += pe[v][0] * pe[v][1]; }
  }
  coords.reverse();
  return { coords, len, burden: len ? bur / len : 0 };
}

/** 가장 가까운 거점 이름 */
export function nearestHub(hubs, lat, lon) {
  let best = null;
  let bd = Infinity;
  for (const h of hubs) {
    const d = (h.lat - lat) ** 2 + ((h.lon - lon) * 0.79) ** 2;
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}
