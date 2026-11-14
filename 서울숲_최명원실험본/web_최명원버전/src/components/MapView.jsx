import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

// 타일 배경 없이 OSM 데이터로 직접 그리는 서울숲 전용 지도 (공원 안내도 스타일)
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
/** Resolve a CSS custom property to a concrete color (Leaflet canvas can't read var()). */
export const cssVar = css;

// 그리는 순서 = 레이어(pane) 순서
const PANES = [['ctx', 250], ['park', 300], ['cover', 320], ['grid', 360], ['paths', 380], ['route', 420]];

/**
 * props: data {park, features, context}, theme, grid {geojson, fill(id), outline?(id), tooltip(props), onClick},
 *        hubs [{id, lat, lon, color, radius, tooltip, permanent, onClick}], route [[lat,lon]], routeAlt, legend, height
 */
/** 지도 칸에 실제 크기가 있는지 (0이면 Leaflet 계산이 NaN 이 됨) */
function hasSize(m, node) {
  if (node && (node.clientWidth === 0 || node.clientHeight === 0)) return false;
  const c = m.getContainer();
  return c.clientWidth > 0 && c.clientHeight > 0;
}

/** 지도가 실패해도 페이지 본문은 보이도록 */
class MapBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err) { console.warn('지도 표시 오류:', err); }
  render() {
    if (this.state.failed) {
      return (
        <div className="map-wrap map-fail" style={{ height: this.props.height ?? '100%' }}>
          <span>지도를 표시하지 못했습니다.</span>
          <button type="button" className="btn" onClick={() => this.setState({ failed: false })}>다시 그리기</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function MapView(props) {
  return <MapBoundary height={props.height}><MapInner {...props} /></MapBoundary>;
}

function MapInner({ data, theme, grid, hubs, route, routeAlt, focus, legend, height = '100%', still = false }) {
  const el = useRef(null);
  const map = useRef(null);
  const layers = useRef({});
  const renderers = useRef({});

  // 초기화
  useEffect(() => {
    // still = 보기 전용(소개 화면 장식용): 확대·이동 끔
    const m = L.map(el.current, {
      zoomControl: !still, attributionControl: true, scrollWheelZoom: !still, dragging: !still,
      doubleClickZoom: !still, touchZoom: !still, boxZoom: !still, keyboard: !still, zoomSnap: 0.25, zoomDelta: 0.5,
    });
    map.current = m;
    m.attributionControl.setPrefix(false).addAttribution(ATTR);
    PANES.forEach(([name, z]) => {
      m.createPane(name).style.zIndex = z;
      renderers.current[name] = L.canvas({ pane: name, padding: 0.5 });
    });
    const bounds = L.geoJSON(data.park).getBounds();
    // 크기가 0인 칸(숨겨진 장면·전환 중)에서 fitBounds/setMaxBounds 를 부르면 NaN 좌표 → 앱 전체가 멈춤.
    // 그래서 처음엔 고정 줌으로만 놓고, 실제 크기가 생긴 뒤에 맞춘다.
    m.setView(bounds.getCenter(), 15, { animate: false });
    m.setMinZoom(13.5);
    let limited = false;
    let touched = false;
    const fit = () => {
      if (!hasSize(m)) return;
      m.fitBounds(bounds, { padding: [24, 24], animate: false });
      if (!limited) { m.setMaxBounds(bounds.pad(1.2)); limited = true; }
    };
    m.whenReady(() => { m.invalidateSize(); fit(); });
    const node = el.current;
    ['pointerdown', 'wheel'].forEach((ev) => node.addEventListener(ev, () => { touched = true; }, { passive: true }));
    const ro = new ResizeObserver(() => {
      if (!hasSize(m, node)) return;
      m.invalidateSize();
      if (!touched || !limited) fit();
    });
    ro.observe(node);
    return () => { ro.disconnect(); m.stop(); m.remove(); map.current = null; };
  }, [data.park]);

  // 바탕: 주변 길·물 → 공원 → 숲·잔디·물·건물 → 산책로
  useEffect(() => {
    const m = map.current;
    ['ctx', 'park', 'cover', 'paths', 'edge'].forEach((k) => layers.current[k]?.remove());
    const R = renderers.current;
    const ctx = data.context?.features ?? [];
    const lineW = { major: 7, minor: 4.5, local: 2.5 };

    layers.current.ctx = L.layerGroup([
      L.geoJSON({ type: 'FeatureCollection', features: ctx.filter((f) => f.properties.kind === 'water') }, {
        renderer: R.ctx, interactive: false, style: { stroke: false, fillColor: css('--m-water'), fillOpacity: 1 },
      }),
      // 도로 테두리 → 도로 면
      ...['local', 'minor', 'major'].flatMap((k) => {
        const fc = { type: 'FeatureCollection', features: ctx.filter((f) => f.properties.kind === k) };
        return [
          L.geoJSON(fc, { renderer: R.ctx, interactive: false, style: { color: css('--m-road-case'), weight: lineW[k] + 1.5, lineCap: 'round', lineJoin: 'round' } }),
          L.geoJSON(fc, { renderer: R.ctx, interactive: false, style: { color: css('--m-road'), weight: lineW[k], lineCap: 'round', lineJoin: 'round' } }),
        ];
      }),
    ]).addTo(m);

    layers.current.park = L.geoJSON(data.park, {
      renderer: R.park, interactive: false, style: { stroke: false, fillColor: css('--m-park'), fillOpacity: 1 },
    }).addTo(m);

    const fill = { water: '--m-water', forest: '--m-forest', lawn: '--m-lawn', building: '--m-bldg' };
    layers.current.cover = L.geoJSON(data.features, {
      renderer: R.cover, interactive: false,
      style: (f) => ({ stroke: false, fillColor: css(fill[f.properties.kind] ?? '--m-park'), fillOpacity: grid ? 0.55 : 1 }),
    }).addTo(m);

    layers.current.paths = L.geoJSON({ type: 'FeatureCollection', features: ctx.filter((f) => f.properties.kind === 'path') }, {
      renderer: R.paths, interactive: false,
      style: { color: css('--m-path'), weight: grid ? 1 : 1.6, opacity: grid ? 0.55 : 0.95, lineCap: 'round', lineJoin: 'round' },
    }).addTo(m);

    layers.current.edge = L.geoJSON(data.park, {
      renderer: R.paths, interactive: false, style: { color: css('--brand'), weight: 1.5, opacity: 0.55, fill: false },
    }).addTo(m);
  }, [theme, data.features, data.park, data.context, !!grid]);

  // 취약도 격자
  useEffect(() => {
    const m = map.current;
    layers.current.grid?.remove();
    layers.current.gridLeave?.();
    layers.current.gridLeave = null;
    if (!grid) return;
    layers.current.grid = L.geoJSON(grid.geojson, {
      renderer: renderers.current.grid,
      style: (f) => {
        const c = grid.fill(f.properties.id);
        const sel = grid.outline?.(f.properties.id);
        return c
          ? { stroke: !!sel, color: css('--ink'), weight: 2, fillColor: c, fillOpacity: 0.82 }
          : { stroke: false, fillOpacity: 0 };
      },
      onEachFeature: (f, lyr) => {
        if (grid.tooltip) lyr.bindTooltip(() => grid.tooltip(f.properties), { sticky: true, direction: 'top', offset: [0, -8] });
        if (grid.onClick) lyr.on('click', () => grid.onClick(f.properties));
        if (grid.onHover) {
          // 마우스를 올린 칸: 테두리 강조 + 상세 패널 갱신
          lyr.on('mouseover', () => { lyr.setStyle({ stroke: true, color: css('--ink'), weight: 2 }); lyr.bringToFront(); grid.onHover(f.properties); });
          lyr.on('mouseout', () => { layers.current.grid?.resetStyle(lyr); });
        }
      },
    }).addTo(m);
    if (grid.onHover) {
      const leave = () => grid.onHover(null);
      el.current.addEventListener('mouseleave', leave);
      const node = el.current;
      layers.current.gridLeave = () => node.removeEventListener('mouseleave', leave);
    }
  }, [grid]);

  // 거점 표시: 흰 테두리 + 상태색 점
  useEffect(() => {
    const m = map.current;
    layers.current.hubs?.remove();
    if (!hubs?.length) return;
    const g = L.layerGroup();
    hubs.forEach((h) => {
      const r = h.radius ?? 7;
      if (h.permanent) {
        g.addLayer(L.circleMarker([h.lat, h.lon], { radius: r + 7, stroke: false, fillColor: h.color, fillOpacity: 0.22, interactive: false }));
      }
      const mk = L.circleMarker([h.lat, h.lon], { radius: r, color: '#ffffff', weight: 2.5, fillColor: h.color, fillOpacity: 1 });
      if (h.tooltip) mk.bindTooltip(h.tooltip, { direction: 'top', offset: [0, -r - 2], permanent: !!h.permanent, className: h.permanent ? 'hub-label' : '' });
      if (h.onClick) mk.on('click', h.onClick);
      g.addLayer(mk);
    });
    g.addTo(m);
    layers.current.hubs = g;
  }, [hubs, theme]);

  // 경로
  useEffect(() => {
    const m = map.current;
    ['routeAlt', 'routeCasing', 'route'].forEach((k) => layers.current[k]?.remove());
    const R = renderers.current.route;
    if (routeAlt?.length) {
      layers.current.routeAlt = L.polyline(routeAlt, { renderer: R, color: css('--ink-2'), weight: 3, opacity: 0.55, dashArray: '1 7', lineCap: 'round' }).addTo(m);
    }
    if (route?.length) {
      layers.current.routeCasing = L.polyline(route, { renderer: R, color: '#ffffff', weight: 10, opacity: 1, lineCap: 'round', lineJoin: 'round' }).addTo(m);
      layers.current.route = L.polyline(route, { renderer: R, color: css('--brand'), weight: 5.5, opacity: 1, lineCap: 'round', lineJoin: 'round' }).addTo(m);
      // 경로가 보이되 공원 맥락이 사라질 만큼 확대하지는 않음
      if (hasSize(m)) m.fitBounds(layers.current.route.getBounds(), { padding: [70, 70], maxZoom: 16 });
    }
  }, [route, routeAlt, theme]);

  useEffect(() => {
    const m = map.current;
    if (focus && m && hasSize(m)) m.flyTo(focus, 17, { duration: 0.6 });
  }, [focus]);

  return (
    <div className="map-wrap" style={{ height }}>
      <div ref={el} className="map" role="application" aria-label="서울숲 지도" />
      {legend ? <div className="map-legend">{legend}</div> : null}
    </div>
  );
}
