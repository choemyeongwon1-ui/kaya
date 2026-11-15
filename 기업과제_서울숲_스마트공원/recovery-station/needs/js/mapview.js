// 지도. 기존 대시보드와 같은 방식(배경 타일 없이 자료를 직접 그림)으로 Leaflet 캔버스에 그립니다.
import { cssVar, iconSvg } from './ui.js';

const L = window.L;
const colors = () => Object.fromEntries(Object.entries({
  land: '--m-land', road: '--m-road', roadCase: '--m-road-case', water: '--m-water', park: '--m-park', lawn: '--m-lawn', forest: '--m-forest',
  bldg: '--m-bldg', path: '--m-path', ink: '--ink', surface: '--surface', brand: '--brand', goal3: '--goal3', muted: '--muted',
}).map(([k, v]) => [k, cssVar(v)]));
const ll = ([lon, lat]) => [lat, lon];

export function createMap(el, model) {
  const { data, g } = model;
  const map = L.map(el, { attributionControl: false, zoomSnap: .25, zoomDelta: .5, minZoom: 13.5, maxZoom: 19, wheelPxPerZoomLevel: 90 });
  const R = {};
  for (const [name, z] of [['bg', 240], ['ctx', 250], ['park', 300], ['cover', 320], ['cells', 360], ['paths', 380], ['route', 420]]) {
    map.createPane(name).style.zIndex = z;
    R[name] = L.canvas({ pane: name, padding: .4 });
  }
  map.getPane('bg').style.pointerEvents = map.getPane('ctx').style.pointerEvents = map.getPane('park').style.pointerEvents = 'none';
  map.getPane('cover').style.pointerEvents = map.getPane('paths').style.pointerEvents = map.getPane('route').style.pointerEvents = 'none';

  // ── 바탕: 강·도로·공원·잔디·숲·물·건물·산책로 ──
  const base = [];
  const add = (layer, style) => { base.push({ layer, style }); layer.addTo(map); return layer; };
  const off = { interactive: false };
  if (data.backdrop?.water?.length) add(L.polygon(data.backdrop.water.map(r => [r.map(ll)]), { ...off, renderer: R.bg, stroke: false, fillOpacity: 1 }), c => ({ fillColor: c.water }));
  const roads = kind => ({ type: 'FeatureCollection', features: data.context.features.filter(f => f.properties.kind === kind) });
  const ROADS = [['local', 2.6, 1.5], ['minor', 3.8, 2.6], ['major', 5.6, 4.2]];
  for (const [kind, w] of ROADS) add(L.geoJSON(roads(kind), { ...off, renderer: R.ctx }), c => ({ color: c.roadCase, weight: w, opacity: 1 }));
  for (const [kind, , w] of ROADS) add(L.geoJSON(roads(kind), { ...off, renderer: R.ctx }), c => ({ color: c.road, weight: w, opacity: 1 }));
  add(L.geoJSON(data.park, { ...off, renderer: R.park }), c => ({ stroke: false, fillColor: c.park, fillOpacity: 1 }));
  const feat = kind => ({ type: 'FeatureCollection', features: data.features.features.filter(f => f.properties.kind === kind) });
  for (const [kind, key] of [['lawn', 'lawn'], ['forest', 'forest'], ['water', 'water'], ['building', 'bldg']])
    add(L.geoJSON(feat(kind), { ...off, renderer: R.cover }), c => ({ stroke: false, fillColor: c[key], fillOpacity: 1 }));
  const segs = g.edges.filter(e => e.inPark).map(e => [ll(g.nodes[e.a]), ll(g.nodes[e.b])]);
  add(L.polyline(segs, { ...off, renderer: R.paths, lineCap: 'round' }), c => ({ color: c.roadCase, weight: 3.4, opacity: 1 }));
  add(L.polyline(segs, { ...off, renderer: R.paths, lineCap: 'round' }), c => ({ color: c.path, weight: 2, opacity: 1 }));

  let C = colors();
  const redraw = new Set();                        // 테마가 바뀌면 다시 그릴 것들
  const restyle = () => { C = colors(); el.style.background = C.land; for (const b of base) b.layer.setStyle(b.style(C)); redraw.forEach(fn => fn()); };
  restyle();

  const ring = data.park.features[0].geometry;
  const parkBounds = L.latLngBounds((ring.type === 'MultiPolygon' ? ring.coordinates.flat(2) : ring.coordinates.flat()).map(ll));
  map.fitBounds(parkBounds, { padding: [14, 14] });

  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => map.invalidateSize({ pan: false })).observe(el);

  // ── 그때그때 바뀌는 것 ──
  const groups = new Map();
  const group = key => groups.get(key) ?? groups.set(key, L.layerGroup().addTo(map)).get(key);

  /** 표지. items: [{lat, lon, cls, html, size, tip, permanent, onClick, z}] */
  function markers(key, items) {
    const grp = group(key); grp.clearLayers();
    for (const it of items) {
      const size = it.size ?? 24;
      const m = L.marker([it.lat, it.lon], { icon: L.divIcon({ className: '', html: `<div class="nd-mk ${it.cls ?? ''}" style="width:${size}px;height:${size}px">${it.html ?? ''}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
        zIndexOffset: it.z ?? 0, interactive: !!(it.tip || it.onClick), keyboard: false });
      if (it.tip) m.bindTooltip(it.tip, { direction: 'top', offset: [0, -size / 2 - 2], permanent: !!it.permanent, className: it.permanent ? 'hub-label' : '' });
      if (it.onClick) m.on('click', ev => { L.DomEvent.stopPropagation(ev); it.onClick(it); });
      m.addTo(grp);
    }
  }

  /** 길. lines: [{coords([lat, lon]…), color, weight, dash, opacity}] */
  function lines(key, list) {
    const grp = group(key); grp.clearLayers();
    for (const ln of list) {
      if (!ln?.coords?.length) continue;
      if (!ln.dash) L.polyline(ln.coords, { renderer: R.route, interactive: false, color: C.surface, weight: (ln.weight ?? 5) + 4, opacity: .95, lineCap: 'round', lineJoin: 'round' }).addTo(grp);
      L.polyline(ln.coords, { renderer: R.route, interactive: false, color: ln.color ?? C.brand, weight: ln.weight ?? 5, opacity: ln.opacity ?? 1, dashArray: ln.dash ?? null, lineCap: 'round', lineJoin: 'round' }).addTo(grp);
    }
  }

  /** 20m 칸 (관리자 화면). styleOf(id) → {fill, opacity} 또는 null(안 그림) */
  let cellLayer = null, cellStyle = () => null, cellSel = null;
  const styleCell = f => {
    const s = cellStyle(f.properties.id), sel = cellSel === f.properties.id;
    if (!s) return { stroke: sel, color: C.ink, weight: 2, fill: true, fillOpacity: 0, opacity: 1 };
    return { stroke: true, color: sel ? C.ink : s.fill, weight: sel ? 2.5 : .5, opacity: sel ? 1 : s.opacity * .6, fillColor: s.fill, fillOpacity: s.opacity };
  };
  function cells(styleOf, onClick) {
    cellStyle = styleOf;
    if (!cellLayer) {
      cellLayer = L.geoJSON(data.team.grid, { renderer: R.cells, style: styleCell, onEachFeature: (f, layer) => layer.on('click', ev => { L.DomEvent.stopPropagation(ev); onClick?.(f.properties.id, ev.latlng); }) }).addTo(map);
      redraw.add(() => cellLayer.setStyle(styleCell));
    } else cellLayer.setStyle(styleCell);
  }
  const selectCell = id => { cellSel = id; cellLayer?.setStyle(styleCell); };

  return {
    map, markers, lines, cells, selectCell, restyle, parkBounds,
    color: k => C[k],
    clear: key => groups.get(key)?.clearLayers(),
    fit: (pts, pad = 40) => { const b = L.latLngBounds(pts); if (b.isValid()) map.fitBounds(b, { padding: [pad, pad], maxZoom: 17.5 }); },
    fitPark: () => map.fitBounds(parkBounds, { padding: [14, 14] }),
    panTo: (lat, lon, zoom) => map.setView([lat, lon], Math.max(map.getZoom(), zoom ?? 0)),
    onClick: fn => map.on('click', ev => fn(ev.latlng.lat, ev.latlng.lng)),
    invalidate: () => map.invalidateSize(),
    cursor: c => { el.style.cursor = c ?? ''; },
  };
}

/** 표지 안에 넣는 그림 */
export const mk = (name, size = 13) => iconSvg(name, size);
