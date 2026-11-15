// 관리자 화면: 쉬기 어려운 곳과 이유, 벤치·그늘·화장실이 필요한 자리
// 판정 단위는 팀의 20m 칸입니다. 칸마다 네 가지(앉을 곳·그늘·화장실·붐빔)를 기준과 견줍니다.
import { REST_STD, REST_REASONS, HARD_FROM } from './config.js';
import { dijkstra } from './graph.js';
import { PointIndex, inPolygon } from './geo.js';

const CELL_HA = .04;                       // 20m × 20m
const DIRS = ['동쪽', '북동쪽', '북쪽', '북서쪽', '서쪽', '남서쪽', '남쪽', '남동쪽'];

/** 가장 가까운 거점을 기준으로 한 자리 이름: "가족마당 서쪽 80m" */
export function nearLabel(model, x, y, area = false) {
  let best = null;
  for (const h of model.places) { const d = Math.hypot(h.x - x, h.y - y); if (!best || d < best.d) best = { h, d }; }
  if (!best) return '';
  if (best.d < 35) return area ? best.h.name : `${best.h.name} 바로 옆`;
  const ang = Math.atan2(y - best.h.y, x - best.h.x), dir = DIRS[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8];
  return `${best.h.name} ${dir} ${Math.round(best.d / 10) * 10}m`;
}

/** 칸이 물 위인지(호수·연못) — 시설을 놓을 수 없는 칸 */
function waterCells(model) {
  const water = model.data.features.features.filter(f => f.properties.kind === 'water');
  return new Set(model.cells.filter(c => water.some(f => inPolygon(c.lon, c.lat, f.geometry))).map(c => c.id));
}

const failsOf = (std, v) => {
  const f = [];
  if (v.dSeat > std.seat) f.push('seat');
  if (v.tree < std.shade) f.push('shade');
  if (v.dToilet > std.toilet) f.push('toilet');
  if (v.crowd >= std.crowd) f.push('crowd');
  return f;
};

function summarize(rows) {
  const n = rows.length, hard = rows.filter(r => r.hard);
  const wAll = rows.reduce((a, r) => a + r.w, 0), wHard = hard.reduce((a, r) => a + r.w, 0);
  const byReason = Object.fromEntries(REST_REASONS.map(k => {
    const m = rows.filter(r => r.fails.includes(k.key));
    return [k.key, { n: m.length, ha: +(m.length * CELL_HA).toFixed(2), share: n ? m.length / n : 0, inHard: hard.filter(r => r.fails.includes(k.key)).length }];
  }));
  const hist = [0, 1, 2, 3, 4].map(k => rows.filter(r => r.n === k).length);
  return { cells: n, ha: +(n * CELL_HA).toFixed(1), hard: hard.length, hardHa: +(hard.length * CELL_HA).toFixed(1), hardShare: n ? hard.length / n : 0,
    useShare: wAll ? wHard / wAll : 0, byReason, hist };
}

/** 붙어 있는 '쉬기 어려운 칸'을 한 구역으로 묶습니다 */
function clusters(model, rows) {
  const hard = rows.filter(r => r.hard), idx = new PointIndex(hard.map(r => ({ x: r.c.x, y: r.c.y })), 40);
  const seen = new Uint8Array(hard.length), out = [];
  for (let s = 0; s < hard.length; s++) {
    if (seen[s]) continue;
    const members = []; const stack = [s]; seen[s] = 1;
    while (stack.length) {
      const i = stack.pop(); members.push(hard[i]);
      for (const j of idx.within(hard[i].c.x, hard[i].c.y, 29)) if (!seen[j]) { seen[j] = 1; stack.push(j); }
    }
    const wsum = members.reduce((a, r) => a + r.w, 0);
    const cx = members.reduce((a, r) => a + r.c.x * r.w, 0) / wsum, cy = members.reduce((a, r) => a + r.c.y * r.w, 0) / wsum;
    const center = members.reduce((b, r) => { const d = Math.hypot(r.c.x - cx, r.c.y - cy); return !b || d < b.d ? { r, d } : b; }, null).r;
    const reasons = REST_REASONS.map(k => ({ key: k.key, label: k.label, short: k.short, share: members.filter(r => r.fails.includes(k.key)).length / members.length }))
      .filter(k => k.share >= .34).sort((a, b) => b.share - a.share);
    const mean = f => members.reduce((a, r) => a + f(r), 0) / members.length;
    out.push({ cells: members, n: members.length, ha: +(members.length * CELL_HA).toFixed(2), score: members.reduce((a, r) => a + r.w * r.n, 0),
      lat: center.c.lat, lon: center.c.lon, x: cx, y: cy, label: nearLabel(model, cx, cy, true), reasons,
      mean: { dSeat: Math.round(mean(r => r.v.dSeat)), dToilet: Math.round(mean(r => r.v.dToilet)), tree: mean(r => r.v.tree), crowd: Math.round(mean(r => r.v.crowd)), nfail: mean(r => r.n) } });
  }
  return out.sort((a, b) => b.score - a.score).map((c, i) => ({ ...c, rank: i + 1 }));
}

/**
 * 진단. stdKey: 'all'(일반 이용자) | 'care'(어르신·유아)
 * override: 칸별로 바뀐 값(시설을 놓은 뒤의 모습을 계산할 때 씀) Map(cell id → {dSeat?, dToilet?, tree?})
 */
export function diagnose(model, stdKey = 'all', override = null) {
  const std = REST_STD[stdKey];
  const rows = [];
  let held = 0;
  for (const c of model.cells) {
    if (c.hold) { held++; continue; }
    const o = override?.get(c.id);
    const v = { dSeat: o?.dSeat ?? c.dSeat, dToilet: o?.dToilet ?? c.dToilet, tree: o?.tree ?? c.p.tree, crowd: c.p.crowd };
    const fails = failsOf(std, v);
    rows.push({ c, v, fails, n: fails.length, hard: fails.length >= HARD_FROM, w: .15 + c.p.crowd / 100 });
  }
  return { stdKey, std, rows, byId: new Map(rows.map(r => [r.c.id, r])), held, summary: summarize(rows), clusters: clusters(model, rows) };
}

/** 후보 지점(공원 안 길 위)마다, 그 자리에 시설을 놓으면 기준 거리 안에 들어오는 칸 */
function coverage(model, radius) {
  const key = `cover${radius}`;
  if (model[key]) return model[key];
  const g = model.g, len = e => e.len, out = new Map();
  for (let v = 0; v < g.nodes.length; v++) {
    if (g.comp[v] !== g.main || !g.nodeInPark[v]) continue;
    const res = dijkstra(g, [v], len, { maxCost: radius });
    const list = [];
    for (const [u, cellIdx] of model.nodeCells) {
      const d = res.dist[u];
      if (!Number.isFinite(d)) continue;
      for (const i of cellIdx) { const t = d + model.cells[i].off; if (t <= radius) list.push([i, t]); }
    }
    if (list.length) out.set(v, list);
  }
  return (model[key] = out);
}

/** 가까운 것부터 차례로 고르는 최대 포괄: 기준 밖 칸(이용 가중)을 가장 많이 줄이는 자리부터 */
function greedy(model, rows, cover, count, need, bonus) {
  const cellIdx = new Map(model.cells.map((c, i) => [c.id, i]));
  const open = new Map();                               // 아직 기준 밖인 칸 번호 → 가중치
  for (const r of rows) if (need(r)) open.set(cellIdx.get(r.c.id), r.w);
  const total = [...open.values()].reduce((a, b) => a + b, 0), picked = [];
  const reach = new Map();                              // 칸 번호 → 새 시설까지 거리
  while (picked.length < count && open.size) {
    let best = null;
    for (const [v, list] of cover) {
      let gain = 0, n = 0;
      for (const [i] of list) { const w = open.get(i); if (w) { gain += w; n++; } }
      if (!n) continue;
      const score = gain * bonus(v);
      if (!best || score > best.score) best = { v, score, gain, n, list };
    }
    if (!best) break;
    for (const [i, d] of best.list) { open.delete(i); if (!(reach.get(i) <= d)) reach.set(i, d); }
    const [lon, lat] = model.g.nodes[best.v], [x, y] = model.g.xy[best.v];
    picked.push({ node: best.v, lat, lon, cells: best.n, ha: +(best.n * CELL_HA).toFixed(2), gain: best.gain, share: total ? best.gain / total : 0, label: nearLabel(model, x, y) });
  }
  return { picked, reach, left: open.size };
}

/**
 * 시설 배치 제안과 놓은 뒤의 모습
 * counts: {bench, shade, toilet} 개수 / 반환: {sites, after(진단), before(진단), effect}
 */
export function siteFacilities(model, diag, counts) {
  const std = diag.std, water = model._water ?? (model._water = waterCells(model));
  const treeAt = v => { const [lon, lat] = model.g.nodes[v]; return model.cellAt(lon, lat)?.p.tree ?? .5; };
  const holdNode = v => { const [lon, lat] = model.g.nodes[v]; const c = model.cellAt(lon, lat); return !!c && (c.hold || water.has(c.id)); };
  const usable = cover => new Map([...cover].filter(([v]) => !holdNode(v)));

  // 벤치: 앉을 곳이 먼 칸을 가장 많이 줄이는 길가. 그늘진 자리를 조금 더 쳐 줍니다.
  const bench = greedy(model, diag.rows, usable(coverage(model, std.seat)), counts.bench ?? 0, r => r.fails.includes('seat'), v => 1 + .3 * treeAt(v));
  // 화장실: 화장실이 먼 칸을 가장 많이 줄이는 길가
  const toilet = greedy(model, diag.rows, usable(coverage(model, std.toilet)), counts.toilet ?? 0, r => r.fails.includes('toilet'), () => 1);

  // 그늘: 그늘이 모자라고 사람이 많이 지나는 길가 칸. 서로 40m 이상 떨어뜨리고, 벤치 자리 근처를 먼저 봅니다.
  const benchXY = bench.picked.map(b => model.g.xy[b.node]);
  const cand = diag.rows.filter(r => r.fails.includes('shade') && r.c.off <= 25 && !water.has(r.c.id)).map(r => {
    const lack = (std.shade - r.v.tree) / std.shade, nearSeat = r.v.dSeat <= 40 || benchXY.some(([x, y]) => Math.hypot(x - r.c.x, y - r.c.y) <= 40);
    return { r, score: r.w * (.5 + .5 * lack) * (nearSeat ? 1.4 : 1) * (r.c.p.cand === 'shade' || r.c.p.cand === 'plant' ? 1.25 : 1), nearSeat };
  }).sort((a, b) => b.score - a.score);
  const shade = [];
  for (const c of cand) {
    if (shade.length >= (counts.shade ?? 0)) break;
    if (shade.some(s => Math.hypot(s.x - c.r.c.x, s.y - c.r.c.y) < 40)) continue;
    const around = model.cellIndex.within(c.r.c.x, c.r.c.y, 29).map(i => model.cells[i]).filter(k => !k.hold && !water.has(k.id) && k.p.tree < std.shade);
    shade.push({ cell: c.r.c.id, lat: c.r.c.lat, lon: c.r.c.lon, x: c.r.c.x, y: c.r.c.y, tree: c.r.v.tree, nearSeat: c.nearSeat, team: c.r.c.p.cand ?? null,
      cover: around.map(k => k.id), cells: around.length, ha: +(around.length * CELL_HA).toFixed(2), label: nearLabel(model, c.r.c.x, c.r.c.y) });
  }

  // 놓은 뒤의 모습: 새 시설까지의 거리와 그늘을 반영해 다시 판정
  const override = new Map();
  const put = (id, k, v) => { const o = override.get(id) ?? override.set(id, {}).get(id); o[k] = k === 'tree' ? Math.max(o[k] ?? 0, v) : Math.min(o[k] ?? Infinity, v); };
  for (const [i, d] of bench.reach) put(model.cells[i].id, 'dSeat', Math.min(model.cells[i].dSeat, Math.round(d)));
  for (const [i, d] of toilet.reach) put(model.cells[i].id, 'dToilet', Math.min(model.cells[i].dToilet, Math.round(d)));
  for (const s of shade) for (const id of s.cover) put(id, 'tree', std.shade);     // 그늘막·큰 나무 한 곳이 둘레 한 칸까지 덮는다고 봄(가정)
  const after = diagnose(model, diag.stdKey, override);
  const b = diag.summary, a = after.summary;
  const effect = {
    hard: { before: b.hard, after: a.hard, ha: +(b.hardHa - a.hardHa).toFixed(1), cut: b.hard ? 1 - a.hard / b.hard : 0 },
    useShare: { before: b.useShare, after: a.useShare },
    reasons: Object.fromEntries(REST_REASONS.map(k => [k.key, { before: b.byReason[k.key].n, after: a.byReason[k.key].n }])),
  };
  return { sites: { bench: bench.picked, toilet: toilet.picked, shade }, left: { bench: bench.left, toilet: toilet.left }, before: diag, after, effect };
}

/** 관리자 화면에 늘 보이는 규칙 기반 요약(AI 없이 계산) */
export function ruleSummary(model, diag, plan) {
  const s = diag.summary, top = REST_REASONS.map(k => ({ ...k, ...s.byReason[k.key] })).sort((a, b) => b.inHard - a.inHard)[0];
  const pct = v => `${Math.round(v * 100)}%`;
  const lines = [];
  lines.push(`판정한 ${s.cells}칸(${s.ha}ha) 가운데 ${s.hard}칸(${s.hardHa}ha, ${pct(s.hardShare)})이 쉬기 어려운 곳입니다. 이용이 많은 정도로 따지면 ${pct(s.useShare)}에 해당합니다.`);
  if (s.hard) lines.push(`쉬기 어려운 곳의 가장 흔한 이유는 ‘${top.label}’입니다(${top.inHard}칸).`);
  const c = diag.clusters[0];
  if (c) lines.push(`가장 먼저 볼 곳은 ${c.label} 일대 ${c.ha}ha입니다(이유: ${c.reasons.map(r => r.label).join(', ')}).`);
  if (plan) {
    const e = plan.effect, k = plan.sites;
    lines.push(`벤치 ${k.bench.length}곳·그늘 ${k.shade.length}곳·화장실 ${k.toilet.length}곳을 제안한 자리에 놓으면 쉬기 어려운 곳이 ${e.hard.before}칸에서 ${e.hard.after}칸으로 ${pct(e.hard.cut)} 줄어듭니다.`);
  }
  return lines;
}

/** AI에 넘기는 요약 자료(개인정보 없음, 집계값과 장소 이름만) */
export function briefData(model, diag, plan) {
  const s = diag.summary, r1 = v => Math.round(v * 1000) / 10;
  return {
    기준: { 대상: diag.std.label, 앉을곳_최대거리_m: diag.std.seat, 화장실_최대거리_m: diag.std.toilet, 나무그늘_최소비율: diag.std.shade, 붐빔지수_상한: diag.std.crowd, 쉬기어려움_판정: `${HARD_FROM}가지 이상 부족` },
    전체: { 판정칸수: s.cells, 면적_ha: s.ha, 쉬기어려운칸: s.hard, 쉬기어려운면적_ha: s.hardHa, 비율_pct: r1(s.hardShare), 이용가중비율_pct: r1(s.useShare), 판정제외칸_보류: diag.held,
      부족개수별칸수: Object.fromEntries(s.hist.map((n, i) => [`${i}가지`, n])) },
    이유별: Object.fromEntries(REST_REASONS.map(k => [k.label, { 칸수: s.byReason[k.key].n, 비율_pct: r1(s.byReason[k.key].share), 쉬기어려운곳_안: s.byReason[k.key].inHard }])),
    쉬기어려운구역_상위: diag.clusters.slice(0, 6).map(c => ({ 순위: c.rank, 위치: c.label, 면적_ha: c.ha, 주된이유: c.reasons.map(r => r.short), 앉을곳까지_m: c.mean.dSeat, 화장실까지_m: c.mean.dToilet, 나무그늘_pct: Math.round(c.mean.tree * 100), 붐빔지수: c.mean.crowd })),
    지금_있는_시설: { 화장실: model.toilets.length, 앉을곳: model.seats.length, 현장조사로_더한_시설: model.fac.filter(f => f.surveyed).length, 주의: '앉을 곳은 OpenStreetMap에 등록된 것만 셌으므로 실제보다 적을 수 있음' },
    제안: plan ? {
      벤치: plan.sites.bench.map(b => ({ 위치: b.label, 기준안으로_들어오는_면적_ha: b.ha })),
      그늘: plan.sites.shade.map(b => ({ 위치: b.label, 지금_나무그늘_pct: Math.round(b.tree * 100), 팀_식재후보와_겹침: !!b.team })),
      화장실: plan.sites.toilet.map(b => ({ 위치: b.label, 기준안으로_들어오는_면적_ha: b.ha })),
      효과: { 쉬기어려운칸_전: plan.effect.hard.before, 쉬기어려운칸_후: plan.effect.hard.after, 줄어드는면적_ha: plan.effect.hard.ha,
        이유별_전후: Object.fromEntries(REST_REASONS.map(k => [k.label, `${plan.effect.reasons[k.key].before} → ${plan.effect.reasons[k.key].after}`])) },
    } : null,
  };
}
