// 자료를 읽어 계산에 쓰는 모형으로 엮습니다.
// 기존 대시보드의 data/*.json(공원·보행망·격자·거점)과 이 화면의 data/*.json(시설·근처 장소)을 함께 씁니다.
import { PLACE_NOTE, REST_NEAR, SNAP_PARK, TOILET_INSIDE, FLOOD_PENALTY } from './config.js';
import { toXY, inPolygon, PointIndex } from './geo.js';
import { buildGraph, nearestNode, dijkstra } from './graph.js';

export const APP_FILES = ['park.geojson', 'grid.geojson', 'network.json', 'features.geojson', 'context.geojson', 'hubs.json', 'team.json', 'meta.json'];
export const OWN_FILES = ['facilities.json', 'nearby.json', 'backdrop.json', 'survey.json', 'legal.json', 'programs.json'];
const OPTIONAL = ['survey.json', 'backdrop.json', 'legal.json', 'programs.json'];      // 없어도 화면은 열림

/** loadJson(경로) → 자료 묶음. appBase: 기존 대시보드 data 폴더, ownBase: 이 화면 data 폴더 */
export async function loadData(loadJson, appBase = '../data/', ownBase = './data/') {
  const names = [...APP_FILES.map(f => appBase + f), ...OWN_FILES.map(f => ownBase + f)];
  const got = await Promise.all(names.map(n => loadJson(n).catch(err => { if (OPTIONAL.some(o => n.endsWith(o))) return null; throw new Error(`${n} — ${err.message}`); })));
  const key = n => n.split('/').pop().replace(/\.(geo)?json$/, '');
  return Object.fromEntries(names.map((n, i) => [key(n), got[i]]));
}

const SEAT_KINDS = new Set(['bench', 'shelter', 'indoor']);
export const FAC_LABEL = { toilet: '화장실', bench: '벤치', shelter: '정자·쉼터', indoor: '실내 휴게실', water: '음수대' };

/**
 * extra: 현장 조사로 더한 시설 [{kind, lat, lon, name?}] (관리자 화면에서 입력)
 */
export function buildModel(data, extra = []) {
  const parkGeom = data.park.features[0].geometry;
  const inPark = (lon, lat) => inPolygon(lon, lat, parkGeom);

  // ── 법적 구역 (없으면 null — 그 경우 구역 표시와 큰비 규칙을 쓰지 않음) ──
  const legal = data.legal?.zones && data.legal?.cells ? data.legal : null;
  const zoneOf = k => (k && legal?.zones[k]) || null;

  // ── 팀 20m 격자 ──
  const cells = data.team.grid.features.map(f => {
    const ring = f.geometry.coordinates[0];
    const lon = (ring[0][0] + ring[2][0]) / 2, lat = (ring[0][1] + ring[2][1]) / 2, [x, y] = toXY(lon, lat);
    return { id: f.properties.id, lon, lat, x, y, p: f.properties, hold: !!f.properties.hold, legal: legal?.cells[String(f.properties.id)] ?? null };
  });
  const cellIndex = new PointIndex(cells, 40);
  const cellAt = (lon, lat) => { const [x, y] = toXY(lon, lat); const r = cellIndex.nearest(x, y, 15); return r ? cells[r.i] : null; };
  const sunAt = (lon, lat) => { const c = cellAt(lon, lat); return c ? 1 - Math.min(1, Math.max(0, c.p.tree)) : null; };

  // ── 보행망 ──
  const grid30 = data.grid.features.map(f => f.properties);
  const g = buildGraph(data.network, grid30, sunAt, inPark);
  const len = e => e.len;
  // 공원 안 길까지의 보행 거리. 공원 밖 막다른 길에 붙어 멀리 돌아가게 되는 지점은 공원 안 길에 붙입니다.
  // (예: 서울숲역 방면 입구는 가장 가까운 길이 광장과 이어지지 않은 골목 끝이라, 그대로 두면 1.7km를 돌아갑니다)
  const parkNodes = [];
  for (let i = 0; i < g.nodes.length; i++) if (g.comp[i] === g.main && g.nodeInPark[i]) parkNodes.push(i);
  const dPark = dijkstra(g, parkNodes, len).dist;
  const snap = (lon, lat) => {
    const s = nearestNode(g, lon, lat);
    if (!s || g.nodeInPark[s.node]) return s;
    const p = nearestNode(g, lon, lat, n => g.nodeInPark[n]);
    return p && p.off <= SNAP_PARK && s.off + dPark[s.node] > p.off * 1.5 + 30 ? p : s;
  };

  // ── 시설 (OSM + 현장 조사 추가분) ──
  // 조사 자료는 사람이 손으로 넣은 것이라 종류·좌표가 맞고 길 가까이에 있는 것만 씁니다
  const okPoint = p => p && FAC_LABEL[p.kind] && Number.isFinite(p.lat) && Number.isFinite(p.lon) && !!snap(p.lon, p.lat);
  const surveyed = [...(data.survey?.points ?? []), ...extra].filter(okPoint).map((p, i) => ({ id: p.id ?? `s${i}`, n: 1, tags: {}, ...p, surveyed: true }));
  const fac = [...data.facilities.points, ...surveyed].map(f => { const s = snap(f.lon, f.lat); const [x, y] = toXY(f.lon, f.lat); return { ...f, x, y, node: s.node, off: s.off }; });
  const toilets = fac.filter(f => f.kind === 'toilet'), seats = fac.filter(f => SEAT_KINDS.has(f.kind));
  const dToilet = dijkstra(g, toilets.map(f => ({ node: f.node, d0: f.off })), len).dist;
  const dSeat = dijkstra(g, seats.map(f => ({ node: f.node, d0: f.off })), len).dist;

  // 길에서 가까운 쉼터(앉을 곳): 지점마다 근처 노드를 적어 둔다
  const nodeItems = g.nodes.map((_, i) => ({ x: g.xy[i][0], y: g.xy[i][1] }));
  const nodeIndex = new PointIndex(nodeItems, 40);
  const restSpots = seats.map(f => ({ ...f, near: new Set(nodeIndex.within(f.x, f.y, Math.max(REST_NEAR, f.off + 5))) }));

  // ── 격자 칸마다 가까운 길과 시설까지 걷는 거리 ──
  for (const c of cells) {
    const s = snap(c.lon, c.lat);
    c.node = s.node; c.off = s.off;
    c.dSeat = Math.round(dSeat[s.node] + s.off); c.dToilet = Math.round(dToilet[s.node] + s.off);
  }
  const nodeCells = new Map();
  cells.forEach((c, i) => (nodeCells.get(c.node) ?? nodeCells.set(c.node, []).get(c.node)).push(i));

  // ── 거점 ──
  const hubs = data.hubs.map(h => {
    const s = snap(h.lon, h.lat), [x, y] = toXY(h.lon, h.lat);
    const around = cellIndex.within(x, y, 45).map(i => cells[i]);
    const mean = k => around.length ? around.reduce((a, c) => a + c.p[k], 0) / around.length : null;
    const legalKey = legal?.hubs?.[h.id] ?? null;
    return { ...h, x, y, node: s.node, off: s.off, note: PLACE_NOTE[h.id] ?? '', legal: legalKey, flood: !!zoneOf(legalKey)?.flood, tree: mean('tree'), lst: mean('lst'), dRoad: mean('dRoad'),
      dToilet: TOILET_INSIDE.has(h.id) ? 0 : Math.round(dToilet[s.node] + s.off), toiletInside: TOILET_INSIDE.has(h.id), dSeat: Math.round(dSeat[s.node] + s.off) };
  });
  const places = hubs.filter(h => h.type !== 'gate'), gates = hubs.filter(h => h.type === 'gate');
  const treeMean = cells.filter(c => !c.hold).reduce((a, c) => a + c.p.tree, 0) / cells.filter(c => !c.hold).length;

  return { data, g, inPark, cells, cellIndex, cellAt, nodeCells, nodeIndex, fac, toilets, seats, restSpots, dToilet, dSeat, hubs, places, gates,
    hubById: Object.fromEntries(hubs.map(h => [h.id, h])), treeMean, snap, dPark,
    legal, zoneOf,
    // 큰비 때 길 찾기에서 물이 차는 구역(유수지·하천구역)의 구간을 덜 고르도록 하는 벌점
    floodPenalty: legal?.floodEdges?.length ? new Map(legal.floodEdges.map(id => [id, FLOOD_PENALTY])) : null };
}
