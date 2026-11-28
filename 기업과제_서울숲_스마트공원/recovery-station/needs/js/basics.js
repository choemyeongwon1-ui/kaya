// 지도 기본 정보: 화장실·매점·쉼터·음수대·안내소·따릉이·주차장 + 정원 꽃 — 버튼으로 켜고 끔
// 자료: data/basics.json (OpenStreetMap, 서울숲 경계 안). OSM에 올라간 것만 있어 실제보다 적을 수 있음 → 눌렀을 때 그렇게 알려 줌
import { h } from './ui.js';

document.head.append(h('link', { rel: 'stylesheet', href: new URL('../basics.css?v=1', import.meta.url).href }));

// 아이콘(24칸 선 그림)
const P = {
  toilet: 'M8 4.5a1.5 1.5 0 1 0 0 .01M16 4.5a1.5 1.5 0 1 0 0 .01M6 8h4l-.5 6H8v5M16 8l-2.5 7h5L16 8M15 15v4M17 15v4M12 3v18',
  shop: 'M4 9l1.5-4.5h13L20 9M4 9h16v2a2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-6 0 2.5 2.5 0 0 1-5 0zM5.5 13v7h13v-7M10 20v-4h4v4',
  rest: 'M3.5 10L12 4.5l8.5 5.5zM6.5 10v9M17.5 10v9M9 15h6M9.5 15v4M14.5 15v4',
  water: 'M12 3.5c3 4 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0c0-3 2.5-6 5.5-10zM9.5 14a2.5 2.5 0 0 0 2.5 2.5',
  info: 'M3.5 12a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0-17 0M12 11v5.5M12 7.8h.01',
  bike: 'M3 16a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M14 16a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M6.5 16l3.5-7h5l2.5 7M10 9L8.5 6H7M15 9l-1.5-3H16',
  parking: 'M5 4h14v16H5zM10 16V8h3a2.5 2.5 0 0 1 0 5h-3',
  garden: 'M12 13v8M12 21c-3 0-5-2-5-4 2 0 4 1 5 4M12 9a2.5 2.5 0 1 0 0 .01M12 6.5a2.5 2.5 0 1 1 2.4 1.8M12 6.5a2.5 2.5 0 1 0-2.4 1.8M14.4 8.3a2.5 2.5 0 1 1-1 3.5M9.6 8.3a2.5 2.5 0 1 0 1 3.5',
};
const svg = (k, s = 14) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[k]}"/></svg>`;

// 버튼 묶음(자료의 kind → 버튼)
const GROUPS = [
  { key: 'toilet', label: '화장실', kinds: ['toilet'], on: true },
  { key: 'shop', label: '매점', kinds: ['shop'], on: true },
  { key: 'rest', label: '쉼터', kinds: ['shelter', 'indoor', 'bench'], on: true },
  { key: 'water', label: '음수대·안내', kinds: ['water', 'info'], on: false },
  { key: 'bike', label: '따릉이·주차', kinds: ['bike', 'parking'], on: false },
];
const KIND = {
  toilet: { g: 'toilet', ico: 'toilet', label: '화장실' },
  shop: { g: 'shop', ico: 'shop', label: '매점·편의점' },
  shelter: { g: 'rest', ico: 'rest', label: '그늘 쉼터(정자·파고라)' },
  indoor: { g: 'rest', ico: 'rest', label: '실내 쉼터' },
  bench: { g: 'rest', ico: 'rest', label: '벤치' },
  water: { g: 'water', ico: 'water', label: '음수대' },
  info: { g: 'water', ico: 'info', label: '안내소' },
  bike: { g: 'bike', ico: 'bike', label: '따릉이 대여소' },
  parking: { g: 'bike', ico: 'parking', label: '주차장' },
};
const MIN_ZOOM = 15;   // 공원이 보일 만큼 다가가야 점을 보여 줌(멀리선 겹쳐서 안 보임)
const SAVE = 'sf-tour-basics';
const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * @param {object} o
 * @param {L.Map} o.map
 * @param {object} o.L
 * @param {HTMLElement} o.root     버튼 줄을 붙일 곳
 * @param {HTMLElement} o.mapEl    정원 꽃을 숨길 때 클래스를 다는 지도 요소
 * @param {() => Array} o.gardens  코스가 없을 때 보여 줄 정원 전체 [{lat, lon, name, g}]
 * @param {() => boolean} o.routeGardens  코스 화면이 정원 꽃을 이미 그리고 있는지
 * @param {string} o.flower        꽃 SVG
 * @param {(g) => void} o.onGarden 꽃을 눌렀을 때
 */
export function mountBasics(o) {
  const { map, L } = o;
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(SAVE) || '{}') || {}; } catch { saved = {}; }
  const st = Object.fromEntries(GROUPS.map(g => [g.key, saved[g.key] ?? g.on]).concat([['garden', saved.garden ?? true]]));
  const save = () => { try { localStorage.setItem(SAVE, JSON.stringify(st)); } catch {} };

  if (!map.getPane('tr-basic')) { const p = map.createPane('tr-basic'); p.style.zIndex = 590; }
  const layer = L.layerGroup().addTo(map), gLayer = L.layerGroup().addTo(map);
  let points = [], meta = null;

  const bar = h('div', { class: 'tr-bx', role: 'group', 'aria-label': '지도에 보일 것' });
  const btn = (key, label, ico) => { const i = h('i'); i.innerHTML = svg(ico, 13);
    return h('button', { type: 'button', class: `tr-bx-b k-${key}`, 'data-k': key, 'aria-pressed': String(!!st[key]), onclick: () => flip(key) }, i, label, h('small', { class: 'n' })); };
  GROUPS.forEach(g => bar.append(btn(g.key, g.label, g.key)));
  bar.append(btn('garden', '정원', 'garden'));
  o.root.append(bar);

  function flip(key) {
    st[key] = !st[key]; save();
    bar.querySelector(`[data-k="${key}"]`).setAttribute('aria-pressed', String(st[key]));
    if (key === 'garden') syncGarden(); else draw();
  }
  function popHtml(p) {
    const k = KIND[p.kind], extra = [p.brand && p.brand !== p.name ? p.brand : null, p.fee === 'no' ? '무료' : p.fee === 'yes' ? '유료' : null, p.hours ? `운영 ${p.hours}` : null].filter(Boolean);
    return `<div class="tr-bx-pop"><small>${esc(k.label)}</small><b>${esc(p.name || k.label)}</b>${extra.length ? `<p>${esc(extra.join(' · '))}</p>` : ''}<em>OpenStreetMap 기준 · 현장과 다를 수 있어요</em></div>`;
  }
  function draw() {
    layer.clearLayers();
    const z = map.getZoom() >= MIN_ZOOM;
    bar.classList.toggle('far', !z);
    if (!z) return;
    for (const p of points) {
      const k = KIND[p.kind]; if (!k || !st[k.g]) continue;
      L.marker([p.lat, p.lon], { pane: 'tr-basic', icon: L.divIcon({ className: '', html: `<div class="tr-bx-pin k-${k.g}" title="${esc(p.name || k.label)}">${svg(k.ico, 12)}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }), keyboard: true })
        .bindPopup(popHtml(p), { className: 'tr-bx-popw', closeButton: false, offset: [0, -6], autoPanPaddingTopLeft: [20, 120], autoPanPaddingBottomRight: [20, 100] }).addTo(layer);
    }
  }
  // 정원: 코스 화면의 꽃은 클래스로 숨기고, 코스가 없을 땐 정원 전체를 꽃으로
  function syncGarden() {
    o.mapEl.classList.toggle('tr-nogarden', !st.garden);
    gLayer.clearLayers();
    if (!st.garden || o.routeGardens() || map.getZoom() < MIN_ZOOM) return;
    for (const g of o.gardens()) {
      L.marker([g.lat, g.lon], { pane: 'tr-basic', icon: L.divIcon({ className: '', html: `<div class="tr-flower mini" title="${esc(g.name)}">${o.flower}</div>`, iconSize: [18, 18], iconAnchor: [9, 9] }) })
        .on('click', () => o.onGarden(g.g)).addTo(gLayer);
    }
  }
  let t = 0; const later = () => { clearTimeout(t); t = setTimeout(syncGarden, 120); };
  map.on('zoomend', () => { draw(); syncGarden(); });
  map.on('layeradd layerremove', e => { if (e.layer?.options?.pane !== 'tr-basic') later(); });

  fetch(new URL('../data/basics.json', import.meta.url), { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null).then(d => {
    if (!d) { bar.querySelectorAll('.tr-bx-b:not(.k-garden)').forEach(b => { b.disabled = true; b.title = '시설 자료를 불러오지 못했어요'; }); return; }
    meta = d; points = d.points || [];
    GROUPS.forEach(g => { const n = points.filter(p => g.kinds.includes(p.kind)).length; bar.querySelector(`[data-k="${g.key}"] .n`).textContent = n; });
    bar.title = `${d.source} · ${d.fetched} · ${d.note}`;
    draw(); syncGarden();
  });
  return { refresh: () => { draw(); syncGarden(); }, get meta() { return meta; } };
}
