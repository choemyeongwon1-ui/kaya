// 가는 길과 산책 코스. 조건: 그늘(추운 날은 볕) · 쉼터 · 계단 없음 · 한산함
import { ROUTE_W, OUT_PENALTY, REST_DETOUR, PREF_DETOUR } from './config.js';
import { dijkstra, pathTo, makeCost, summarize } from './graph.js';

/** prefs: {shade, rest, nostairs, quiet} / env: {scale(시각별 혼잡 배수), sunMode('shade'|'sun'|'none'), floodPenalty(큰비 때 물이 차는 구역 구간 벌점 Map | null)} */
function costOf(prefs, env, extra = {}, w = ROUTE_W) {
  return makeCost({ shade: prefs.shade && env.sunMode !== 'none' ? w : 0, quiet: prefs.quiet ? w : 0, scale: env.scale ?? 1, sunMode: env.sunMode === 'sun' ? 'sun' : 'shade', penalty: env.floodPenalty ?? null, ...extra });
}

/** 길이 물이 차는 구역(유수지·하천구역)을 지나는 길이 m */
const floodLen = (model, sum) => model.floodPenalty ? Math.round(sum.edges.reduce((a, e) => a + (model.floodPenalty.has(e.id) ? e.len : 0), 0)) : 0;

/** 길이 지나는 쉼터와 쉼터 사이 가장 긴 구간 */
export function restsAlong(model, sum) {
  const first = new Map();
  sum.nodes.forEach((u, i) => { for (const r of model.restSpots) if (!first.has(r) && r.near.has(u)) first.set(r, sum.cum[i]); });
  const stops = [...first.entries()].map(([r, at]) => ({ spot: r, at: Math.round(at) })).sort((a, b) => a.at - b.at);
  const marks = [0, ...stops.map(s => s.at), sum.cum[sum.cum.length - 1] ?? 0];
  let maxGap = 0;
  for (let i = 1; i < marks.length; i++) maxGap = Math.max(maxGap, marks[i] - marks[i - 1]);
  return { stops, maxGap: Math.round(maxGap) };
}

function finish(model, legs, speed) {
  const s = summarize(model.g, legs);
  return { ...s, minutes: Math.max(1, Math.round(s.meters / speed)), floodLen: floodLen(model, s), ...restsAlong(model, s) };
}

/**
 * 출발지에서 목적지까지 가는 길
 * 반환: {main, base(가장 짧은 길), via(들르는 쉼터)}
 */
export function planRoute(model, from, to, prefs, env, speed) {
  const g = model.g, bf = !!prefs.nostairs;
  if (from === to) return null;
  const len = e => e.len;
  const baseTree = dijkstra(g, [from], len, { barrierFree: bf });
  const basePath = pathTo(baseTree, to);
  if (!basePath) return null;
  const base = finish(model, [basePath], speed);
  // 그늘·한산함 조건은 가장 짧은 길의 PREF_DETOUR배까지만 돌아가게 합니다. 넘으면 가중치를 줄이고, 그래도 넘으면 가장 짧은 길
  let tree, cost, main, seq = [from, to];
  const treeOf = n => tree.get(n) ?? tree.set(n, dijkstra(g, [n], cost, { barrierFree: bf })).get(n);
  const build = s => {
    const legs = [];
    for (let i = 0; i < s.length - 1; i++) { if (s[i] === s[i + 1]) continue; const p = pathTo(treeOf(s[i]), s[i + 1]); if (!p) return null; legs.push(p); }
    return legs.length ? finish(model, legs, speed) : null;
  };
  for (const w of [ROUTE_W, ROUTE_W / 2, ROUTE_W / 5, 0]) {
    tree = new Map(); cost = costOf(prefs, env, {}, w); main = build(seq);
    if (!main || main.meters <= base.meters * PREF_DETOUR + 20) break;
  }
  const via = [];
  if (prefs.rest && main) {
    // 쉼터 사이가 먼 구간에 쉼터를 하나씩 끼워 넣습니다. 가장 짧은 길의 REST_DETOUR배까지만 돌아갑니다.
    // 간격 기준: 기본 200m, 어르신 동행은 prefs.restGap(= REST_STD.care.seat 100m, 팀 가정).
    // 근거 방향: Lin, Li & Lin(2024) — 고령자 좌석 만족에서 가장 시급한 요소가 '설치 밀도'(중요/만족 1.355, 20개 중 1위)
    const budget = base.meters * REST_DETOUR, gap = prefs.restGap ?? 200;
    for (let round = 0; round < 3 && main.maxGap > gap; round++) {
      let best = null;
      for (const r of model.restSpots) {
        if (seq.includes(r.node)) continue;
        for (let pos = 1; pos < seq.length; pos++) {
          const cand = build([...seq.slice(0, pos), r.node, ...seq.slice(pos)]);
          if (!cand || cand.meters > budget) continue;
          if (!best || cand.maxGap < best.sum.maxGap - 5 || (Math.abs(cand.maxGap - best.sum.maxGap) <= 5 && cand.meters < best.sum.meters)) best = { sum: cand, r, pos };
        }
      }
      if (!best || best.sum.maxGap > main.maxGap * .85) break;
      seq = [...seq.slice(0, best.pos), best.r.node, ...seq.slice(best.pos)]; main = best.sum; via.push(best.r);
    }
  }
  return { main, base, via };
}

/** 공원 안에 고루 퍼진 지점을 뽑습니다(가장 먼 점부터 고르기) */
function spread(model, count, seeds) {
  const g = model.g, pool = [];
  for (let i = 0; i < g.nodes.length; i++) if (g.comp[i] === g.main && g.nodeInPark[i]) pool.push(i);
  const chosen = [...seeds], d = new Float64Array(pool.length).fill(Infinity);
  const upd = n => pool.forEach((p, i) => { const v = Math.hypot(g.xy[p][0] - g.xy[n][0], g.xy[p][1] - g.xy[n][1]); if (v < d[i]) d[i] = v; });
  chosen.forEach(upd);
  while (chosen.length < seeds.length + count) {
    let bi = -1, bd = -1;
    for (let i = 0; i < pool.length; i++) if (d[i] > bd) { bd = d[i]; bi = i; }
    if (bi < 0 || bd < 40) break;
    chosen.push(pool[bi]); upd(pool[bi]);
  }
  return [...new Set(chosen)];
}

/**
 * 산책 코스. from에서 떠나 to에서 끝납니다(to === from이면 한 바퀴 도는 코스).
 * minutes: 20·40·60 / 반환: {…요약, target(목표 m), loop, tooShort(직행이 이미 더 긴 경우)}
 */
export function planCourse(model, from, to, minutes, prefs, env, speed) {
  const g = model.g, bf = !!prefs.nostairs, loop = from === to;
  const target = minutes * speed;
  const cost = costOf(prefs, env, { out: OUT_PENALTY });
  const opt = { barrierFree: bf };
  const tFrom = dijkstra(g, [from], cost, opt), tTo = loop ? tFrom : dijkstra(g, [to], cost, opt);
  if (!loop) {
    const direct = pathTo(tFrom, to);
    if (!direct) return null;
    const d = finish(model, [direct], speed);
    if (d.meters >= target * .9) return { ...d, target, loop, tooShort: true };
  }
  // 거쳐 갈 후보: 쉼터·거점 + 공원 안에 고루 퍼진 지점
  const seeds = [...new Set([...model.restSpots.map(r => r.node), ...model.places.map(p => p.node)])].filter(n => g.nodeInPark[n] && Number.isFinite(tFrom.dist[n]));
  const cands = spread(model, 44, seeds).filter(n => n !== from && n !== to && Number.isFinite(tFrom.dist[n]));
  const trees = new Map(cands.map(n => [n, dijkstra(g, [n], cost, opt)]));
  // 길이만 보고 목표에 가까운 조합을 추립니다
  const list = [];
  for (const a of cands) {
    const la = tFrom.plen[a];
    if (la > target) continue;
    const one = la + tTo.plen[a];
    list.push({ seq: [a], L: one });
    const ta = trees.get(a);
    for (const b of cands) {
      if (b === a) continue;
      const L = la + ta.plen[b] + tTo.plen[b];
      if (Number.isFinite(L)) list.push({ seq: [a, b], L });
    }
  }
  list.sort((p, q) => Math.abs(p.L - target) - Math.abs(q.L - target));
  const short = list.slice(0, 60);
  // 같은 길을 되짚지 않도록, 이미 지난 구간에 벌점을 주고 구간별로 다시 찾습니다
  let best = null;
  for (const c of short) {
    const seq = [from, ...c.seq, to], penalty = new Map(), legs = [];
    let ok = true;
    for (let i = 0; i < seq.length - 1 && ok; i++) {
      const res = dijkstra(g, [seq[i]], makeCostWith(cost, penalty), { ...opt, target: seq[i + 1] });
      const p = pathTo(res, seq[i + 1]);
      if (!p) { ok = false; break; }
      for (const e of p.edges) penalty.set(e.id, 4);
      legs.push(p);
    }
    if (!ok) continue;
    const s = finish(model, legs, speed);
    let score = Math.abs(s.meters - target) / target * 2 + s.repeat / Math.max(1, s.meters) * 1.5 + s.outLen / Math.max(1, s.meters) * 1.2;
    if (prefs.shade && s.shade != null && env.sunMode !== 'none') score += (env.sunMode === 'sun' ? s.shade : 1 - s.shade) * .8;
    if (prefs.quiet) score += s.crowd * .8;
    if (prefs.rest) score += -Math.min(3, s.stops.length) * .12 + Math.min(1, s.maxGap / target) * .5;
    if (!best || score < best.score) best = { score, s };
  }
  if (!best) return null;
  return { ...best.s, target, loop, tooShort: false };
}
function makeCostWith(cost, penalty) { return e => { const p = penalty.get(e.id); return p ? cost(e) * p : cost(e); }; }

