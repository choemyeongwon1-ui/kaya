// Module 3 — A* 경로 탐색 (주제서 p.9 비용함수)
// f(n) = g(n) + h(n),  g = Σ len × (α + β·열노출 + γ·혼잡 + δ·대기) + 계단 패널티,  h = α × 직선거리

const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;
export function haversine([lon1, lat1], [lon2, lat2]) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export const MODES = {
  shortest: { label: '최단 거리', alpha: 1, beta: 0, gamma: 0, delta: 0 },
  shade: { label: '그늘 우선', alpha: 1, beta: 2.5, gamma: 0.5, delta: 0.5 },
  quiet: { label: '한산 우선', alpha: 1, beta: 0.5, gamma: 2.5, delta: 0.5 },
  clean: { label: '맑은 공기', alpha: 1, beta: 0.5, gamma: 0.5, delta: 2.5 },
};

export function buildGraph(network, grid) {
  const nodes = network.nodes;
  const adj = Array.from({ length: nodes.length }, () => []);
  const cellProps = grid.features.map((f) => f.properties);
  for (const [a, b, len, heat, air, steps, ci] of network.edges) {
    const crowd = ci >= 0 ? cellProps[ci].crowd : 0.5;
    const lst = ci >= 0 ? cellProps[ci].lst : null;
    const e = { len, heat, air, steps, crowd, lst };
    adj[a].push({ to: b, ...e });
    adj[b].push({ to: a, ...e });
  }
  // largest connected component — routes are snapped into it
  const comp = new Int32Array(nodes.length).fill(-1);
  const sizes = [];
  for (let s = 0; s < nodes.length; s++) {
    if (comp[s] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [s];
    comp[s] = id;
    while (stack.length) {
      const u = stack.pop();
      size++;
      for (const { to } of adj[u]) if (comp[to] < 0) { comp[to] = id; stack.push(to); }
    }
    sizes.push(size);
  }
  const main = sizes.indexOf(Math.max(...sizes));
  return { nodes, adj, comp, main };
}

export function nearestNode(g, lonlat) {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < g.nodes.length; i++) {
    if (g.comp[i] !== g.main) continue;
    const d = haversine(g.nodes[i], lonlat);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

class Heap {
  constructor() { this.a = []; }
  push(x) {
    const a = this.a; a.push(x);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1; const r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

/**
 * @param opts.mode    key of MODES
 * @param opts.barrierFree  true → steps are forbidden (무장애)
 * @param opts.crowdScale   current park occupancy multiplier (0–1.3)
 */
export function astar(g, start, goal, { mode = 'shade', barrierFree = false, crowdScale = 1 } = {}) {
  const w = MODES[mode];
  const n = g.nodes.length;
  const gScore = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const prevEdge = new Array(n);
  const goalXY = g.nodes[goal];
  gScore[start] = 0;
  const open = new Heap();
  open.push([w.alpha * haversine(g.nodes[start], goalXY), start]);
  const closed = new Uint8Array(n);
  let expanded = 0;
  while (open.size) {
    const [, u] = open.pop();
    if (closed[u]) continue;
    closed[u] = 1;
    expanded++;
    if (u === goal) break;
    for (const e of g.adj[u]) {
      if (barrierFree && e.steps) continue;
      const cost = e.len * (w.alpha + w.beta * e.heat + w.gamma * e.crowd * crowdScale + w.delta * e.air) + (e.steps ? 40 : 0);
      const ng = gScore[u] + cost;
      if (ng < gScore[e.to]) {
        gScore[e.to] = ng;
        prev[e.to] = u;
        prevEdge[e.to] = e;
        open.push([ng + w.alpha * haversine(g.nodes[e.to], goalXY), e.to]);
      }
    }
  }
  if (!Number.isFinite(gScore[goal])) return null;
  const path = [];
  const edges = [];
  for (let v = goal; v !== -1; v = prev[v]) {
    path.push(v);
    if (prevEdge[v]) edges.push(prevEdge[v]);
  }
  path.reverse();
  edges.reverse();
  return { path, edges, cost: gScore[goal], expanded };
}

export function summarize(g, legs) {
  const coords = [];
  let len = 0; let heatLen = 0; let lstLen = 0; let lstW = 0; let steps = 0; let crowdLen = 0;
  for (const leg of legs) {
    leg.path.forEach((v, i) => { if (i > 0 || coords.length === 0) coords.push([g.nodes[v][1], g.nodes[v][0]]); });
    for (const e of leg.edges) {
      len += e.len; heatLen += e.heat * e.len; crowdLen += e.crowd * e.len;
      if (e.lst != null) { lstLen += e.lst * e.len; lstW += e.len; }
      steps += e.steps;
    }
  }
  return {
    coords,
    meters: Math.round(len),
    heat: len ? heatLen / len : 0,
    crowd: len ? crowdLen / len : 0,
    lst: lstW ? lstLen / lstW : null,
    stairs: steps,
  };
}

/** Route through ordered waypoints (lon/lat list). */
export function routeVia(g, points, opts) {
  const ids = points.map((p) => nearestNode(g, p));
  const legs = [];
  for (let i = 0; i < ids.length - 1; i++) {
    if (ids[i] === ids[i + 1]) continue;
    const leg = astar(g, ids[i], ids[i + 1], opts);
    if (!leg) return null;
    legs.push(leg);
  }
  return legs.length ? summarize(g, legs) : null;
}

/** 건강 목적: 목표 거리(걸음 수)에 맞춘 순환형 코스 — start → A → B → start, 후보 쌍 중 목표에 가장 가까운 것. */
export function loopRoute(g, start, candidates, targetMeters, opts) {
  let best = null;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = 0; j < candidates.length; j++) {
      if (i === j) continue;
      const r = routeVia(g, [start, candidates[i].lonlat, candidates[j].lonlat, start], opts);
      if (!r) continue;
      const score = Math.abs(r.meters - targetMeters) / targetMeters + r.heat * 0.15;
      if (!best || score < best.score) best = { ...r, score, via: [candidates[i].name, candidates[j].name] };
    }
  }
  return best;
}
