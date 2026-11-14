import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { cssVar } from './MapView.jsx';

// [최명원 버전] 스크롤 이야기용 지도 하나 — 장면(scene)이 바뀌면 카메라·점·칸 색이 이어서 바뀜
// scene: { view: 'seongsu' | 'park', show: [groups], cls: [classes], outer: {hot, forest},
//          cellColor(i) -> [color, opacity] | null, routes: [{coords, kind}], markers: [{lat, lon, label}] }
// 스크롤 진행도는 조상 요소의 CSS 변수 --p(0~1)로 들어옴 → CSS 에서 점·칸이 스크롤에 맞춰 나타남

const SEONGSU = [[37.5355, 127.033], [37.552, 127.064]];
const STN = [37.544581, 127.055961];
const HOT = new Set(['library', 'community_centre', 'social_facility', 'shelter']);

function hasSize(m) {
  const c = m.getContainer();
  return c.clientWidth > 0 && c.clientHeight > 0;
}

export default function StoryMap({ data, theme, scene }) {
  const el = useRef(null);
  const st = useRef({});

  // 1) 지도 + 정적 레이어 (한 번)
  useEffect(() => {
    const m = L.map(el.current, {
      zoomControl: false, attributionControl: true, scrollWheelZoom: false, dragging: false, doubleClickZoom: false,
      touchZoom: false, boxZoom: false, keyboard: false, zoomSnap: 0.1,
    });
    m.attributionControl.setPrefix(false).addAttribution('&copy; OpenStreetMap');
    [['base', 200], ['outer', 380], ['cells', 400], ['dots', 450], ['route', 500], ['mark', 600]].forEach(([n, z]) => { m.createPane(n).style.zIndex = z; });
    const svg = (pane) => L.svg({ pane, padding: 0.6 });
    const R = { outer: svg('outer'), cells: svg('cells'), dots: svg('dots'), route: svg('route') };
    m.fitBounds(SEONGSU, { animate: false });
    const parkB = L.geoJSON(data.park).getBounds();
    st.current = { m, R, parkB, view: 'seongsu' };

    const O = data.burden.outer;
    st.current.outer = O.cells.map((c) => L.rectangle([[c.b[0], c.b[1]], [c.b[2], c.b[3]]], { renderer: R.outer, className: 'sm-oc', interactive: false }).addTo(m));

    // 유료 점: 성수역에서 가까운 순서(--r 0~1)로 스크롤에 맞춰 퍼짐
    const dist = O.paid.map((p) => Math.hypot((p[0] - STN[0]) * 110540, (p[1] - STN[1]) * 88000));
    const order = dist.map((d, i) => [d, i]).sort((a, b) => a[0] - b[0]);
    const rank = new Array(dist.length);
    order.forEach(([, i], k) => { rank[i] = k / Math.max(1, order.length - 1); });
    st.current.paid = O.paid.map((p, i) => {
      const mk = L.circleMarker([p[0], p[1]], { renderer: R.dots, radius: 2.6, className: 'sm-paid', interactive: false }).addTo(m);
      const e = mk.getElement();
      e?.style.setProperty('--r', rank[i].toFixed(3));
      e?.style.setProperty('--d', `${Math.round(rank[i] * 1200)}ms`);
      return mk;
    });
    st.current.free = O.freePts.map((p) => L.circleMarker([p[0], p[1]], {
      renderer: R.dots, radius: HOT.has(p[2]) ? 6.5 : 4.5, className: `sm-free ${HOT.has(p[2]) ? 'hot' : 'cool'} ${p[2] === 'bench' ? 'bench' : ''}`, interactive: false,
    }).addTo(m));
    st.current.freeA = O.freeAreas.map((a) => L.polygon(a.c, { renderer: R.outer, className: 'sm-free-area', interactive: false }).addTo(m));
    st.current.glow = L.geoJSON(data.park, { renderer: R.route, className: 'sm-glow', interactive: false }).addTo(m);
    L.circleMarker(STN, { renderer: R.dots, radius: 7, className: 'sm-stn', interactive: false }).addTo(m);
    L.marker(STN, { pane: 'mark', interactive: false, icon: L.divIcon({ className: 'sm-lab stn', html: '<span>성수역</span>', iconSize: null }) }).addTo(m);
    // 서울숲 위치는 모든 장면에서 항상 보이게: 테두리 + 이름표
    L.geoJSON(data.park, { renderer: R.outer, className: 'sm-park-line', interactive: false }).addTo(m);
    st.current.parkLab = L.marker(parkB.getCenter(), { pane: 'mark', interactive: false, icon: L.divIcon({ className: 'sm-lab park', html: '<span><i></i>서울숲</span>', iconSize: null }) }).addTo(m);

    // 서울숲 칸: 북서쪽에서 퍼지는 물결 순서(--w ms, --r 0~1)
    const lat0 = parkB.getNorth();
    const lon0 = parkB.getWest();
    const waves = data.burden.inner.cells.map((c) => (lat0 - c.b[2]) * 110540 + (c.b[1] - lon0) * 88000);
    const wmax = Math.max(...waves);
    st.current.cells = data.burden.inner.cells.map((c, i) => {
      const r = L.rectangle([[c.b[0], c.b[1]], [c.b[2], c.b[3]]], { renderer: R.cells, className: `sm-ic${c.n >= 3 ? ' prio' : ''}`, interactive: false }).addTo(m);
      const e = r.getElement();
      e?.style.setProperty('--w', `${Math.round(waves[i] * 0.55)}ms`);
      e?.style.setProperty('--r', (waves[i] / wmax).toFixed(3));
      return r;
    });

    const ro = new ResizeObserver(() => { if (hasSize(m)) { m.invalidateSize(); m.fitBounds(st.current.view === 'park' ? parkB.pad(0.04) : SEONGSU, { animate: false }); } });
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); };
  }, [data]);

  // 2) 테마에 맞는 바탕 (캔버스)
  useEffect(() => {
    const { m } = st.current;
    if (!m) return;
    st.current.base?.remove();
    const R = L.canvas({ pane: 'base', padding: 0.6 });
    const bm = data.basemap;
    const ll = (c) => c.map(([lo, la]) => [la, lo]);
    const g = L.layerGroup([
      L.rectangle([[37.52, 127.02], [37.57, 127.08]], { renderer: R, stroke: false, fillColor: cssVar('--m-ground') || cssVar('--surface-2'), fillOpacity: 1, interactive: false }),
      ...bm.water.map((c) => L.polygon(ll(c), { renderer: R, stroke: false, fillColor: cssVar('--m-water'), fillOpacity: 1, interactive: false })),
      ...bm.minor.map((c) => L.polyline(ll(c), { renderer: R, color: cssVar('--m-road'), weight: 2, interactive: false })),
      ...bm.major.map((c) => L.polyline(ll(c), { renderer: R, color: cssVar('--m-road-case'), weight: 4.5, interactive: false })),
      L.geoJSON(data.park, { renderer: R, interactive: false, style: { stroke: false, fillColor: cssVar('--m-park'), fillOpacity: 1 } }),
      L.geoJSON(data.features, {
        renderer: R, interactive: false,
        style: (f) => ({ stroke: false, fillColor: cssVar({ water: '--m-water', forest: '--m-forest', lawn: '--m-lawn', building: '--m-bldg' }[f.properties.kind] ?? '--m-park'), fillOpacity: 0.9 }),
      }),
    ]).addTo(m);
    st.current.base = g;
  }, [data, theme]);

  // 3) 장면 적용
  useEffect(() => {
    const s = st.current;
    if (!s.m || !scene) return;
    const { m } = s;
    const box = el.current;
    box.dataset.show = scene.show.join(' ');
    box.className = ['story-map', `v-${scene.view}`, ...(scene.cls ?? [])].join(' ');
    // 이름표: 성수 전체에선 공원 가운데, 서울숲 확대 땐 공원 북쪽 가장자리(칸을 가리지 않게)
    s.parkLab.setLatLng(scene.view === 'park' ? [s.parkB.getNorth(), s.parkB.getCenter().lng] : s.parkB.getCenter());

    if (scene.view !== s.view) {
      s.view = scene.view;
      if (hasSize(m)) m.flyToBounds(scene.view === 'park' ? s.parkB.pad(0.04) : SEONGSU, { duration: 1.6, easeLinearity: 0.15 });
    }

    // 바깥 칸 색
    const O = data.burden.outer;
    const warn = cssVar('--warn-b');
    const good = cssVar('--good-b');
    O.cells.forEach((c, i) => {
      const d = scene.outer?.hot ? (scene.outer.forest ? c.hW : c.hWo) : (scene.outer?.forest ? c.dW : c.dWo);
      const e = s.outer[i].getElement();
      if (!e) return;
      const far = d > O.near;
      e.style.fill = far ? warn : good;
      e.style.fillOpacity = far ? 0.5 : 0.18;
    });

    // 서울숲 칸 색
    if (scene.cellColor) {
      s.cells.forEach((r, i) => {
        const e = r.getElement();
        if (!e) return;
        const v = scene.cellColor(i);
        e.style.fill = v ? v[0] : 'transparent';
        e.style.fillOpacity = v ? v[1] : 0;
      });
    }

    // 경로: 선이 그려지듯
    s.routes?.forEach((r) => r.remove());
    s.routes = (scene.routes ?? []).map((rt) => {
      const pl = L.polyline(rt.coords, { renderer: s.R.route, className: `sm-route ${rt.kind}`, interactive: false }).addTo(m);
      const p = pl.getElement();
      if (p) {
        const len = p.getTotalLength();
        if (rt.kind === 'best' || rt.kind === 'swap') {
          p.style.strokeDasharray = `${len}`;
          p.style.strokeDashoffset = `${len}`;
          requestAnimationFrame(() => requestAnimationFrame(() => { p.style.strokeDashoffset = '0'; }));
        }
      }
      return pl;
    });

    // 대표 상점 말풍선: 순서대로 뿅뿅 (지연 --i)
    s.calls?.forEach((x) => x.remove());
    s.calls = (scene.callouts ?? []).map((c, i) => L.marker([c.lat, c.lon], {
      pane: 'mark', interactive: false,
      icon: L.divIcon({ className: `sm-call ${c.side ?? ''} ${c.tone ?? ''}`, html: `<div style="--i:${i};--b:${scene.callDelay ?? 1}s;--g:${scene.callGap ?? 0.8}s"><i></i><span><b>${c.title}</b><em>${c.sub}</em></span></div>`, iconSize: null }),
    }).addTo(m));

    // 추천 거점: 가까운 이름표끼리는 아래로 쌓음
    s.marks?.forEach((x) => x.remove());
    const placed = [];
    s.marks = (scene.markers ?? []).map((k, i) => {
      const near = placed.filter((p) => Math.hypot((p[0] - k.lat) * 110540, (p[1] - k.lon) * 88000) < 120).length;
      placed.push([k.lat, k.lon]);
      return L.marker([k.lat, k.lon], {
        pane: 'mark', interactive: false,
        icon: L.divIcon({ className: 'sm-mark', html: `<span style="--i:${i};--dy:${near * 34}"><b>${i + 1}</b>${k.label}</span>`, iconSize: null }),
      }).addTo(m);
    });
  }, [scene, data, theme]);

  return <div ref={el} className="story-map" role="img" aria-label="부담지도 이야기 지도" />;
}
