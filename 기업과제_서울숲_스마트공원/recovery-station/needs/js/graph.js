// 보행망 그래프와 최단 경로. 자료는 기존 대시보드의 data/network.json을 그대로 씁니다.
import { STEP_PENALTY } from './config.js';
import { haversine, toXY, PointIndex } from './geo.js';

export class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(v) {
    const a = this.a; a.push(v);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

/**
 * network: {nodes: [[lon, lat]], edges: [[u, v, 길이m, 열 0~1, 대기 0~1, 계단, 30m칸 번호]]}
 * grid30: 30m 칸 속성 배열(혼잡·지표온도) / sunAt(lon, lat): 볕 노출 0~1 또는 null / inPark(lon, lat)
 */
export function buildGraph(network, grid30, sunAt, inPark) {
  const nodes = network.nodes, n = nodes.length;
  const xy = nodes.map(([lon, lat]) => toXY(lon, lat));
  const adj = Array.from({ length: n }, () => []);
  const edges = network.edges.map(([a, b, len, heat, air, steps, cell], id) => {
    // 볕 노출: 구간을 15m마다 찍어 팀 20m 격자의 나무 비율로 계산. 격자 밖은 null(모름)
    const k = Math.max(1, Math.round(len / 15));
    let sum = 0, cnt = 0;
    for (let i = 0; i < k; i++) {
      const t = (i + .5) / k;
      const s = sunAt(nodes[a][0] + (nodes[b][0] - nodes[a][0]) * t, nodes[a][1] + (nodes[b][1] - nodes[a][1]) * t);
      if (s != null) { sum += s; cnt++; }
    }
    const mid = [(nodes[a][0] + nodes[b][0]) / 2, (nodes[a][1] + nodes[b][1]) / 2];
    const e = { id, a, b, len, heat, air, steps: !!steps, crowd: cell >= 0 ? grid30[cell].crowd : .5, lst: cell >= 0 ? grid30[cell].lst : null,
      sun: cnt >= k / 2 ? sum / cnt : null, inPark: inPark(mid[0], mid[1]) };
    adj[a].push({ to: b, e }); adj[b].push({ to: a, e });
    return e;
  });
  // 가장 큰 연결 덩어리만 길찾기에 씁니다 (기존 대시보드와 같음)
  const comp = new Int32Array(n).fill(-1), sizes = [];
  for (let s = 0; s < n; s++) {
    if (comp[s] >= 0) continue;
    const c = sizes.length; let size = 0; const stack = [s]; comp[s] = c;
    while (stack.length) { const u = stack.pop(); size++; for (const { to } of adj[u]) if (comp[to] < 0) { comp[to] = c; stack.push(to); } }
    sizes.push(size);
  }
  const main = sizes.indexOf(Math.max(...sizes));
  const nodeInPark = nodes.map(([lon, lat]) => inPark(lon, lat));
  const items = []; const itemNode = [];
  for (let i = 0; i < n; i++) if (comp[i] === main) { items.push({ x: xy[i][0], y: xy[i][1] }); itemNode.push(i); }
  const index = new PointIndex(items, 40);
  return { nodes, xy, adj, edges, comp, main, nodeInPark, index, itemNode };
}

/** 가장 가까운 길 위 지점(노드)과 떨어진 거리 */
export function nearestNode(g, lon, lat, filter = null) {
  const [x, y] = toXY(lon, lat);
  const r = g.index.nearest(x, y, Infinity, filter ? k => filter(g.itemNode[k]) : null);
  return r ? { node: g.itemNode[r.i], off: r.d } : null;
}

/**
 * 길 비용 함수. shade·quiet: 가중치(0이면 반영 안 함), sunMode: 'shade'(그늘 선호)·'sun'(볕 선호)
 * rough: 비포장 구간 가중(유모차·휠체어·어르신) / biz: 상권 인접 구간 가중(조용히 걷고 싶을 때, 성수동 상권 경계의 번잡함 회피)
 */
export const BIZ_FULL = 8;   // 60m 안 상점·음식점·카페가 이 수 이상이면 '상권 맞닿음' 최대치
export function makeCost({ shade = 0, quiet = 0, out = 0, scale = 1, sunMode = 'shade', penalty = null, rough = 0, biz = 0 } = {}) {
  return e => {
    let c = 1;
    if (shade) { const s = e.sun ?? .5; c += shade * (sunMode === 'sun' ? 1 - s : s); }
    if (quiet) c += quiet * e.crowd * scale;
    if (rough && e.surface === 2) c += rough;
    if (biz && e.biz) c += biz * Math.min(1, e.biz / BIZ_FULL);
    if (out && !e.inPark) c += out;
    c = e.len * c + (e.steps ? STEP_PENALTY : 0);
    if (penalty) { const p = penalty.get(e.id); if (p) c *= p; }
    return c;
  };
}

/**
 * 여러 출발점에서 모든 지점까지의 최소 비용. sources: [{node, d0}] 또는 노드 번호 배열
 * 반환: dist(비용), plen(그 길의 실제 길이 m), prev, prevEdge
 */
export function dijkstra(g, sources, cost, { barrierFree = false, maxCost = Infinity, target = -1 } = {}) {
  const n = g.nodes.length;
  const dist = new Float64Array(n).fill(Infinity), plen = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1), prevEdge = new Array(n).fill(null);
  const heap = new MinHeap();
  for (const s of sources) {
    const node = typeof s === 'number' ? s : s.node, d0 = typeof s === 'number' ? 0 : s.d0 ?? 0;
    if (d0 < dist[node]) { dist[node] = d0; plen[node] = d0; heap.push([d0, node]); }
  }
  while (heap.size) {
    const [d, u] = heap.pop();
    if (d > dist[u]) continue;
    if (u === target) break;
    for (const { to, e } of g.adj[u]) {
      if (barrierFree && e.steps) continue;
      const nd = d + cost(e);
      if (nd < dist[to] && nd <= maxCost) { dist[to] = nd; plen[to] = plen[u] + e.len; prev[to] = u; prevEdge[to] = e; heap.push([nd, to]); }
    }
  }
  return { dist, plen, prev, prevEdge };
}

/** dijkstra 결과에서 target까지의 길(출발→도착 순서) */
export function pathTo(res, target) {
  if (!Number.isFinite(res.dist[target])) return null;
  const nodes = [], edges = [];
  for (let u = target; u !== -1; u = res.prev[u]) { nodes.push(u); if (res.prevEdge[u]) edges.push(res.prevEdge[u]); }
  return { nodes: nodes.reverse(), edges: edges.reverse() };
}

const lengthOnly = e => e.len;
/** 길이만 따진 최단 경로 */
export function shortest(g, from, to, barrierFree = false) {
  return pathTo(dijkstra(g, [from], lengthOnly, { barrierFree, target: to }), to);
}

/** 이어 붙인 구간들의 요약 */
export function summarize(g, legs) {
  const coords = [], nodes = [], edges = [];
  for (const leg of legs) {
    leg.nodes.forEach((u, i) => { if (i > 0 || nodes.length === 0) { nodes.push(u); coords.push([g.nodes[u][1], g.nodes[u][0]]); } });
    edges.push(...leg.edges);
  }
  let meters = 0, sunKnown = 0, sunLen = 0, crowd = 0, stairs = 0, outLen = 0, repeat = 0, unpaved = 0, bizLen = 0;
  const seen = new Set();
  for (const e of edges) {
    meters += e.len; crowd += e.crowd * e.len; if (e.steps) stairs++; if (!e.inPark) outLen += e.len;
    if (e.surface === 2) unpaved += e.len; if (e.biz >= 3) bizLen += e.len;
    if (e.sun != null) { sunKnown += e.len; sunLen += e.sun * e.len; }
    if (seen.has(e.id)) repeat += e.len; else seen.add(e.id);
  }
  // 지나는 지점까지의 누적 거리 (쉼터 간격 계산에 씀)
  const cum = [0];
  for (let i = 1; i < nodes.length; i++) cum.push(cum[i - 1] + haversine(g.nodes[nodes[i - 1]], g.nodes[nodes[i]]));
  return { coords, nodes, cum, edges, meters: Math.round(meters), shade: sunKnown ? 1 - sunLen / sunKnown : null, sunKnown: Math.round(sunKnown),
    crowd: meters ? crowd / meters : 0, stairs, outLen: Math.round(outLen), repeat: Math.round(repeat), unpaved: Math.round(unpaved), bizLen: Math.round(bizLen) };
}
