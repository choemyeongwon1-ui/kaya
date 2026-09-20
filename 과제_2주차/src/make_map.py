"""반경·중심을 직접 조절하는 건물 용도 지도(output/map.html) 생성.

data/ 폴더의 OSM 원본(Overpass API로 수집)을 읽어 HTML 한 파일에 담는다.
  - 자체 베이스맵: 도로(위계별)·철도·하천·수면·녹지·자치구 경계
  - 종로구청 반경 5km 건물 중심점 + 용도 분류(analyze.py와 같은 기준)
Leaflet도 파일 안에 포함하므로 인터넷 없이 열린다(Esri 온라인 지도 옵션만 인터넷 필요).
"""
import json
from datetime import date
from pathlib import Path

from analyze import ORDER, classify

BASE = Path(__file__).parent
DATA = BASE / "data"
OUT = BASE / "output"

ORIGIN = (37.5735, 126.9788)  # 종로구청
DATA_RADIUS_M = 5000
SCALE = 100000  # 좌표를 1e-5도(약 1m) 정수로 저장

COLORS = {
    "미분류": "#C0521F", "상업·업무": "#1F4E9C", "주거": "#2FA4E7", "공공·교육": "#2E9E6B",
    "종교·문화": "#8E44AD", "공업": "#6B4F2A", "기타": "#8A9099",
}
ROAD_RANK = {"motorway": 0, "trunk": 0, "primary": 1, "secondary": 2, "tertiary": 3,
             "unclassified": 4, "residential": 4, "living_street": 4}


def load(name):
    path = DATA / name
    if not path.exists():
        print(f"경고: data/{name} 없음 — 해당 레이어를 건너뜀")
        return []
    return json.loads(path.read_text(encoding="utf-8"))["elements"]


def encode(coords):
    """[(lat, lon), ...] → 1e-5도 정수 델타 인코딩 [dlat, dlon, dlat, dlon, ...] (원점 기준 시작)."""
    out = []
    plat, plon = round(ORIGIN[0] * SCALE), round(ORIGIN[1] * SCALE)
    for lat, lon in coords:
        ilat, ilon = round(lat * SCALE), round(lon * SCALE)
        if out and ilat == plat and ilon == plon:
            continue
        out += [ilat - plat, ilon - plon]
        plat, plon = ilat, ilon
    return out


def way_coords(el):
    return [(g["lat"], g["lon"]) for g in el.get("geometry") or [] if g]


def assemble_rings(lines):
    """relation의 조각난 멤버 way를 끝점끼리 이어 링으로 만든다."""
    pool = [line for line in lines if len(line) > 1]
    rings = []
    while pool:
        cur = pool.pop()
        while cur[0] != cur[-1]:
            for i, w in enumerate(pool):
                if w[0] == cur[-1]:
                    cur = cur + w[1:]
                elif w[-1] == cur[-1]:
                    cur = cur + w[-2::-1]
                elif w[-1] == cur[0]:
                    cur = w[:-1] + cur
                elif w[0] == cur[0]:
                    cur = w[:0:-1] + cur
                else:
                    continue
                pool.pop(i)
                break
            else:
                break
        rings.append(cur)
    return rings


def polygons(el):
    """닫힌 way 또는 multipolygon relation → 링 목록."""
    if el["type"] == "way":
        c = way_coords(el)
        return [c] if len(c) > 3 and c[0] == c[-1] else []
    return assemble_rings([way_coords(m) for m in el.get("members", []) if m["type"] == "way"])


def centroid(ring):
    """면적 가중 중심(원점 기준 평면 근사)."""
    pts = [(lat - ORIGIN[0], lon - ORIGIN[1]) for lat, lon in ring]
    a = cx = cy = 0.0
    for (y0, x0), (y1, x1) in zip(pts, pts[1:] + pts[:1]):
        f = x0 * y1 - x1 * y0
        a += f
        cx += (x0 + x1) * f
        cy += (y0 + y1) * f
    if abs(a) < 1e-12:
        return ring[0]
    return ORIGIN[0] + cy / (3 * a), ORIGIN[1] + cx / (3 * a)


def build_basemap():
    layers = {"forest": [], "park": [], "water": [], "waterway": [], "rail": [],
              "roads": [[] for _ in range(5)], "admin": [], "labels": []}
    done = set()
    # base_rels.json(멤버 geometry 포함)을 먼저 읽어야 태그만 있는 relation 사본보다 우선함
    for el in load("base_rels.json") + load("base_green.json") + load("base_water.json"):
        key = (el["type"], el["id"])
        if key in done:
            continue
        t = el.get("tags", {})
        if t.get("tunnel") in ("yes", "culvert"):
            continue
        if t.get("railway"):
            layers["rail"].append(encode(way_coords(el)))
        elif t.get("waterway"):
            layers["waterway"].append(encode(way_coords(el)))
        else:
            rings = [encode(r) for r in polygons(el)]
            if not rings:
                continue
            if t.get("natural") == "water":
                kind = "water"
            elif t.get("landuse") == "forest" or t.get("natural") in ("wood", "scrub"):
                kind = "forest"
            else:
                kind = "park"
            layers[kind].append(rings)
        done.add(key)

    for name in ("base_roads_major_a.json", "base_roads_major_b.json", "base_roads_minor.json"):
        for el in load(name):
            t = el.get("tags", {})
            if t.get("tunnel") in ("yes", "building_passage") or t.get("area") == "yes":
                continue
            rank = ROAD_RANK.get(t.get("highway", "").removesuffix("_link"))
            if rank is not None:
                layers["roads"][rank].append(encode(way_coords(el)))

    for el in load("base_admin.json"):
        rings = assemble_rings([way_coords(m) for m in el.get("members", [])
                                if m["type"] == "way" and m.get("role") == "outer"])
        if not rings:
            continue
        layers["admin"] += [encode(r) for r in rings]
        lat, lon = centroid(max(rings, key=len))
        layers["labels"].append([el["tags"].get("name", ""), *encode([(lat, lon)])])
    return layers


def build_buildings():
    raw = json.loads((DATA / "osm_buildings_5km.json").read_text(encoding="utf-8"))
    cols = {"lat": [], "lon": [], "cat": [], "val": [], "id": [], "names": {}}
    values = {}
    for e in raw["elements"]:
        c = e.get("center")
        if not c:
            continue
        t = e.get("tags", {})
        i = len(cols["lat"])
        cols["lat"].append(round((c["lat"] - ORIGIN[0]) * SCALE))
        cols["lon"].append(round((c["lon"] - ORIGIN[1]) * SCALE))
        cols["cat"].append(ORDER.index(classify(t)))
        cols["val"].append(values.setdefault(t.get("building", "yes"), len(values)))
        cols["id"].append(e["id"] if e["type"] == "way" else -e["id"])  # 음수 = relation
        if t.get("name"):
            cols["names"][i] = t["name"]
    cols["values"] = list(values)
    return cols, raw["osm3s"]["timestamp_osm_base"][:10]


def main():
    basemap = build_basemap()
    buildings, osm_base = build_buildings()
    meta = {
        "origin": ORIGIN, "originName": "종로구청", "dataRadius": DATA_RADIUS_M,
        "scale": SCALE, "order": ORDER, "colors": [COLORS[c] for c in ORDER],
        "osmBase": osm_base.replace("-", "."), "built": date.today().isoformat().replace("-", "."),
    }
    payload = json.dumps({"meta": meta, "basemap": basemap, "buildings": buildings},
                         ensure_ascii=False, separators=(",", ":"))
    vendor = DATA / "vendor"
    html = (TEMPLATE
            .replace("/*__LEAFLET_CSS__*/", (vendor / "leaflet.min.css").read_text(encoding="utf-8"))
            .replace("/*__LEAFLET_JS__*/", (vendor / "leaflet.min.js").read_text(encoding="utf-8"))
            .replace("/*__DATA__*/null", payload.replace("</", "<\\/")))
    OUT.mkdir(exist_ok=True)
    path = OUT / "map.html"
    path.write_text(html, encoding="utf-8")
    n_roads = sum(len(r) for r in basemap["roads"])
    print(f"{path}  {path.stat().st_size / 1024 / 1024:.1f} MB")
    print(f"건물 {len(buildings['lat']):,}동 · 도로 {n_roads:,} · 녹지 {len(basemap['forest']) + len(basemap['park']):,}"
          f" · 수면 {len(basemap['water']):,} · 하천 {len(basemap['waterway']):,} · 철도 {len(basemap['rail']):,}"
          f" · 구 경계 {len(basemap['labels'])}")


TEMPLATE = r"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>반경 조절 건물 용도 지도</title>
<style>/*__LEAFLET_CSS__*/</style>
<style>
  html, body, #map { height: 100%; margin: 0; }
  body { font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; color: #262B33; }
  #map { background: #EEF0F2; }
  #map.bg-none { background: #FFFFFF; }
  .panel { position: absolute; top: 12px; right: 12px; z-index: 1000; width: 300px;
           max-width: calc(100vw - 24px); max-height: calc(100vh - 24px); overflow: auto; box-sizing: border-box;
           background: #fff; padding: 14px 16px; border-radius: 10px; box-shadow: 0 2px 12px rgba(0,0,0,.2); }
  .panel h1 { font-size: 15px; margin: 0; color: #1F3A68; }
  .sub { font-size: 11.5px; color: #6B7280; margin: 2px 0 10px; }
  .sec { border-top: 1px solid #E4E8EF; padding-top: 10px; margin-top: 10px; }
  .lbl { font-size: 12px; color: #6B7280; margin-bottom: 4px; display: flex; justify-content: space-between; }
  .radius { display: flex; align-items: center; gap: 8px; }
  .radius input[type=range] { flex: 1; accent-color: #1F4E9C; }
  .radius input[type=number] { width: 58px; font: inherit; font-size: 13px; padding: 3px 4px;
                               border: 1px solid #C9D2E0; border-radius: 5px; text-align: right; }
  .presets { display: flex; gap: 4px; margin-top: 6px; }
  .presets button, .btn { font: inherit; font-size: 12px; padding: 4px 0; border: 1px solid #C9D2E0;
                          background: #F5F7FA; border-radius: 5px; cursor: pointer; color: #1F3A68; flex: 1; }
  .presets button:hover, .btn:hover { background: #E8EEF7; }
  .presets button.on { background: #1F4E9C; color: #fff; border-color: #1F4E9C; }
  .center-row { display: flex; align-items: center; gap: 6px; font-size: 12px; }
  .center-row span { flex: 1; font-variant-numeric: tabular-nums; }
  .center-row .btn { flex: none; padding: 4px 8px; }
  .chk { display: flex; align-items: center; gap: 6px; font-size: 12px; margin-top: 6px; cursor: pointer; }
  .warn { background: #FDECEA; color: #A23B1E; font-size: 11.5px; padding: 6px 8px; border-radius: 5px; margin-top: 8px; }
  .big { font-size: 13px; }
  .big b { font-size: 20px; color: #1F3A68; }
  .big .rate b { font-size: 15px; color: #C0521F; }
  .bar { display: flex; height: 12px; border-radius: 3px; overflow: hidden; margin: 8px 0 6px; background: #E4E8EF; }
  .row { display: flex; align-items: center; gap: 7px; font-size: 13px; padding: 2px 0; cursor: pointer; user-select: none; }
  .row input { margin: 0; }
  .dot { width: 11px; height: 11px; border-radius: 50%; flex: none; }
  .row .n { margin-left: auto; font-variant-numeric: tabular-nums; color: #6B7280; font-size: 12px; }
  .btns { display: flex; gap: 6px; margin-top: 8px; }
  select { font: inherit; font-size: 12px; padding: 3px; border: 1px solid #C9D2E0; border-radius: 5px; }
  .opt { display: flex; align-items: center; justify-content: space-between; font-size: 12px; margin-top: 6px; }
  .legend { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 10px; font-size: 11.5px; color: #4B5260; margin-top: 8px; }
  .legend i { display: inline-block; width: 16px; height: 8px; margin-right: 5px; vertical-align: middle; border-radius: 2px; }
  .src { font-size: 10.5px; color: #8A9099; margin-top: 10px; line-height: 1.45; }
  .center-pin { width: 16px; height: 16px; border-radius: 50%; background: #1F3A68; border: 3px solid #fff;
                box-shadow: 0 0 0 1.5px #1F3A68, 0 2px 6px rgba(0,0,0,.35); box-sizing: border-box; cursor: grab; }
  .leaflet-popup-content { font-size: 12.5px; line-height: 1.5; }
  .move-mode #map { cursor: crosshair; }
  .move-mode .leaflet-grab { cursor: crosshair; }
</style>
</head>
<body>
<div id="map"></div>
<div class="panel" id="panel">
  <h1>건물 용도 지도</h1>
  <div class="sub">중심점을 끌어 옮기고 반경을 조절하면 집계가 바로 바뀌어요</div>

  <div class="sec" style="border:0;margin:0;padding:0">
    <div class="lbl"><span>반경</span><span id="covLbl"></span></div>
    <div class="radius">
      <input type="range" id="rRange" min="0.1" max="5" step="0.1" value="3">
      <input type="number" id="rNum" min="0.1" max="5" step="0.1" value="3"> km
    </div>
    <div class="presets" id="presets"></div>
    <div class="lbl" style="margin-top:10px"><span>중심점</span></div>
    <div class="center-row"><span id="cTxt"></span><button class="btn" id="cReset">종로구청으로</button></div>
    <label class="chk"><input type="checkbox" id="clickMove"> 지도를 클릭해서 중심점 옮기기</label>
    <div class="warn" id="warn" hidden></div>
  </div>

  <div class="sec">
    <div class="big"><b id="tot">0</b>동 <span class="rate">· 용도 기재율 <b id="rate">0%</b></span></div>
    <div class="bar" id="bar"></div>
    <div id="rows"></div>
    <div class="btns"><button class="btn" id="hideUncl">미분류 숨기기</button><button class="btn" id="showAll">전체 보기</button></div>
  </div>

  <div class="sec">
    <div class="opt">반경 밖 건물
      <select id="outside"><option value="dim">흐리게 표시</option><option value="hide">숨기기</option></select></div>
    <div class="opt">배경지도
      <select id="bg"><option value="own">자체 베이스맵</option><option value="esri">Esri 온라인 지도</option><option value="none">배경 없음</option></select></div>
    <div class="legend" id="legend">
      <span><i style="background:#F3C77F"></i>간선도로</span><span><i style="background:#fff;border:1px solid #C5CAD2"></i>일반도로</span>
      <span><i style="background:#CBE2BF"></i>산림</span><span><i style="background:#DCEDD0"></i>공원·녹지</span>
      <span><i style="background:#AFCFEA"></i>하천·수면</span><span><i style="background:#8E7CC3;height:2px"></i>자치구 경계</span>
    </div>
  </div>
  <div class="src" id="src"></div>
</div>

<script>/*__LEAFLET_JS__*/</script>
<script>
const DATA = /*__DATA__*/null;
const M = DATA.meta, S = M.scale, NCAT = M.order.length;
const LAT_M = 110989, LON_M = 88334;          // 위도 37.57°에서 1도당 m
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = n => n.toLocaleString("ko-KR");

// ── 좌표 준비: Web Mercator 단위좌표(0~1)로 미리 변환 ──
const mercX = lon => (lon + 180) / 360;
const mercY = lat => (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2;
function decode(arr) {
  const c = new Float64Array(arr.length);
  let la = Math.round(M.origin[0] * S), lo = Math.round(M.origin[1] * S);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < arr.length; i += 2) {
    la += arr[i]; lo += arr[i + 1];
    const x = mercX(lo / S), y = mercY(la / S);
    c[i] = x; c[i + 1] = y;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { c, b: [x0, y0, x1, y1] };
}
function decodePoly(rings) {
  const rs = rings.map(decode);
  return { rings: rs, b: [Math.min(...rs.map(r => r.b[0])), Math.min(...rs.map(r => r.b[1])),
                          Math.max(...rs.map(r => r.b[2])), Math.max(...rs.map(r => r.b[3]))] };
}
const BM = DATA.basemap;
const base = {
  forest: BM.forest.map(decodePoly), park: BM.park.map(decodePoly), water: BM.water.map(decodePoly),
  waterway: BM.waterway.map(decode), rail: BM.rail.map(decode), roads: BM.roads.map(r => r.map(decode)),
  admin: BM.admin.map(decode),
  labels: BM.labels.map(([name, dla, dlo]) => ({ name, x: mercX(M.origin[1] + dlo / S), y: mercY(M.origin[0] + dla / S) })),
};

const B = DATA.buildings, N = B.lat.length;
const bx = new Float64Array(N), by = new Float64Array(N);   // 메르카토르
const mx = new Float64Array(N), my = new Float64Array(N);   // 원점 기준 m
const cat = Uint8Array.from(B.cat);
const inside = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  const lat = M.origin[0] + B.lat[i] / S, lon = M.origin[1] + B.lon[i] / S;
  bx[i] = mercX(lon); by[i] = mercY(lat);
  mx[i] = B.lon[i] / S * LON_M; my[i] = B.lat[i] / S * LAT_M;
}

// ── 상태 ──
const state = { center: L.latLng(M.origin), radius: 3000, visible: Array(NCAT).fill(true),
                outside: "dim", bg: "own", counts: Array(NCAT).fill(0), total: 0 };

// ── 지도 ──
const map = L.map("map", { zoomControl: true, attributionControl: true });
map.attributionControl.setPrefix(false).addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors');
map.createPane("basemap").style.zIndex = 250;
map.createPane("buildings").style.zIndex = 350;

const CanvasLayer = L.Layer.extend({
  initialize(pane, draw) { this._paneName = pane; this._draw = draw; },
  onAdd(m) {
    this._canvas = L.DomUtil.create("canvas", "leaflet-zoom-hide");
    m.getPane(this._paneName).appendChild(this._canvas);
    m.on("moveend resize", this.redraw, this);
    this.redraw();
  },
  onRemove(m) { this._canvas.remove(); m.off("moveend resize", this.redraw, this); },
  view() {
    const m = this._map, size = m.getSize(), pad = 0.5;
    const tl = m.containerPointToLayerPoint([-size.x * pad, -size.y * pad]);
    const world = tl.add(m.getPixelOrigin());
    const scale = 256 * Math.pow(2, m.getZoom());
    const w = size.x * (1 + 2 * pad), h = size.y * (1 + 2 * pad);
    return { tl, scale, ox: world.x, oy: world.y, w, h, zoom: m.getZoom(),
             bounds: [world.x / scale, world.y / scale, (world.x + w) / scale, (world.y + h) / scale] };
  },
  redraw() {
    if (!this._map) return;
    const v = this.view(), c = this._canvas, dpr = window.devicePixelRatio || 1;
    c.width = v.w * dpr; c.height = v.h * dpr; c.style.width = v.w + "px"; c.style.height = v.h + "px";
    L.DomUtil.setPosition(c, v.tl);
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._draw(ctx, v);
  }
});

const inView = (b, v) => !(b[2] < v.bounds[0] || b[0] > v.bounds[2] || b[3] < v.bounds[1] || b[1] > v.bounds[3]);
function trace(ctx, c, v, close) {
  for (let i = 0; i < c.length; i += 2) {
    const x = c[i] * v.scale - v.ox, y = c[i + 1] * v.scale - v.oy;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  if (close) ctx.closePath();
}
function fillPolys(ctx, polys, v, color) {
  ctx.fillStyle = color;
  for (const p of polys) {
    if (!inView(p.b, v)) continue;
    ctx.beginPath();
    for (const r of p.rings) trace(ctx, r.c, v, true);
    ctx.fill("evenodd");
  }
}
function strokeLines(ctx, lines, v, color, width, dash) {
  if (width <= 0) return;
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []);
  ctx.beginPath();
  for (const l of lines) if (inView(l.b, v)) trace(ctx, l.c, v, false);
  ctx.stroke();
}

const ROAD_W = [6, 5, 4.2, 3.4, 2.2];
const ROAD_MINZ = [0, 0, 11, 12, 13.5];
const ROAD_FILL = ["#F3C77F", "#F8DB9E", "#FCEBC3", "#FFFFFF", "#FFFFFF"];
const ROAD_CASE = ["#D29A4A", "#D8AE66", "#D9C29A", "#C5CAD2", "#CFD3DA"];

const basemapLayer = new CanvasLayer("basemap", (ctx, v) => {
  const z = v.zoom, k = Math.pow(2, (z - 16) * 0.75);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  fillPolys(ctx, base.forest, v, "#CBE2BF");
  fillPolys(ctx, base.park, v, "#DCEDD0");
  fillPolys(ctx, base.water, v, "#AFCFEA");
  strokeLines(ctx, base.waterway, v, "#AFCFEA", Math.max(1.2, 3 * k));
  for (let pass = 0; pass < 2; pass++) {
    for (let r = 4; r >= 0; r--) {
      if (z < ROAD_MINZ[r]) continue;
      const w = Math.max(r < 2 ? 1.6 : 0.8, ROAD_W[r] * k);
      strokeLines(ctx, base.roads[r], v, pass ? ROAD_FILL[r] : ROAD_CASE[r], pass ? w : w + (z >= 14 ? 2 : 1));
    }
  }
  strokeLines(ctx, base.rail, v, "#9AA0A8", Math.max(1, 1.8 * k), z >= 14 ? [7, 5] : []);
  strokeLines(ctx, base.admin, v, "#8E7CC3", 2, [10, 4, 2, 4]);
  ctx.setLineDash([]);
  if (z >= 11) {
    ctx.font = "bold 13px 'Malgun Gothic', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.fillStyle = "#6C5BA8";
    for (const lb of base.labels) {
      const x = lb.x * v.scale - v.ox, y = lb.y * v.scale - v.oy;
      if (x < 0 || y < 0 || x > v.w || y > v.h) continue;
      ctx.strokeText(lb.name, x, y); ctx.fillText(lb.name, x, y);
    }
  }
});

const dotR = z => z >= 17 ? 4.5 : z >= 16 ? 3.4 : z >= 15 ? 2.6 : z >= 14 ? 1.9 : z >= 13 ? 1.4 : 1;
const buildingLayer = new CanvasLayer("buildings", (ctx, v) => {
  const r = dotR(v.zoom);
  const plot = (test) => {
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      if (!test(i)) continue;
      const x = bx[i] * v.scale - v.ox, y = by[i] * v.scale - v.oy;
      if (x < -5 || y < -5 || x > v.w + 5 || y > v.h + 5) continue;
      if (r <= 1.4) ctx.rect(x - r, y - r, 2 * r, 2 * r);
      else { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 6.2832); }
    }
    ctx.fill();
  };
  if (state.outside === "dim") {
    ctx.fillStyle = "rgba(95,102,114,.45)";
    plot(i => !inside[i] && state.visible[cat[i]]);
  }
  for (let c = 0; c < NCAT; c++) {
    if (!state.visible[c]) continue;
    ctx.fillStyle = M.colors[c]; ctx.globalAlpha = 0.85;
    plot(i => inside[i] && cat[i] === c);
  }
  ctx.globalAlpha = 1;
});

const esri = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
                         { maxZoom: 19, attribution: "Tiles &copy; Esri" });
basemapLayer.addTo(map);
buildingLayer.addTo(map);

// 데이터 수집 범위(5km)와 선택 반경
L.circle(M.origin, { radius: M.dataRadius, color: "#8A9099", weight: 1, dashArray: "2 5", fill: false, interactive: false }).addTo(map);
const ring = L.circle(state.center, { radius: state.radius, color: "#1F3A68", weight: 2.5, dashArray: "8 6",
                                      fillColor: "#1F3A68", fillOpacity: 0.04, interactive: false }).addTo(map);
const pin = L.marker(state.center, { draggable: true, autoPan: true, zIndexOffset: 1000,
  icon: L.divIcon({ className: "", html: '<div class="center-pin"></div>', iconSize: [16, 16], iconAnchor: [8, 8] })
}).addTo(map).bindTooltip("중심점 — 끌어서 옮기기", { direction: "top", offset: [0, -8] });

// ── 집계 ──
const $ = id => document.getElementById(id);
function recompute() {
  const cxm = (state.center.lng - M.origin[1]) * LON_M, cym = (state.center.lat - M.origin[0]) * LAT_M;
  const r2 = state.radius * state.radius, counts = Array(NCAT).fill(0);
  for (let i = 0; i < N; i++) {
    const dx = mx[i] - cxm, dy = my[i] - cym;
    inside[i] = dx * dx + dy * dy <= r2 ? 1 : 0;
    if (inside[i]) counts[cat[i]]++;
  }
  state.counts = counts;
  state.total = counts.reduce((a, b) => a + b, 0);
  const reach = Math.hypot(cxm, cym) + state.radius;
  const warn = $("warn");
  warn.hidden = reach <= M.dataRadius + 1;
  warn.textContent = `선택 범위가 데이터 수집 범위(${M.originName} 반경 ${M.dataRadius / 1000}km, 회색 점선) 밖으로 ` +
                     `${((reach - M.dataRadius) / 1000).toFixed(1)}km 벗어났어요. 밖의 건물은 집계되지 않아요.`;
  renderStats();
}
function renderStats() {
  const t = state.total, c = state.counts, uncl = c[0];
  $("tot").textContent = fmt(t);
  $("rate").textContent = t ? `${((t - uncl) / t * 100).toFixed(1)}%` : "–";
  $("bar").innerHTML = c.map((n, i) => n && t ? `<span title="${M.order[i]} ${fmt(n)}동" style="width:${n / t * 100}%;background:${M.colors[i]}"></span>` : "").join("");
  M.order.forEach((name, i) => {
    $("n" + i).textContent = `${fmt(c[i])} · ${t ? (c[i] / t * 100).toFixed(1) : 0}%`;
  });
  $("cTxt").textContent = `${state.center.lat.toFixed(5)}, ${state.center.lng.toFixed(5)}`;
  document.querySelectorAll("#presets button").forEach(b => b.classList.toggle("on", +b.dataset.r === state.radius / 1000));
}

let lastDraw = 0;
function update({ redraw = true, throttle = false } = {}) {
  ring.setLatLng(state.center).setRadius(state.radius);
  recompute();
  const now = performance.now();
  if (redraw && (!throttle || now - lastDraw > 40)) { buildingLayer.redraw(); lastDraw = now; }
}

// ── 패널 ──
$("rows").innerHTML = M.order.map((name, i) => `<label class="row">
  <input type="checkbox" data-i="${i}" checked><span class="dot" style="background:${M.colors[i]}"></span>${name}
  <span class="n" id="n${i}"></span></label>`).join("");
$("presets").innerHTML = [0.5, 1, 2, 3, 5].map(r => `<button data-r="${r}">${r}km</button>`).join("");
$("src").innerHTML = `데이터: OpenStreetMap(Overpass API) · OSM 기준일 ${M.osmBase}<br>` +
  `미분류 = building=yes · 점은 건물 중심점 · 거리 계산은 평면 근사`;
$("covLbl").textContent = `최대 ${M.dataRadius / 1000}km`;

function setRadius(km, fromInput) {
  km = Math.min(M.dataRadius / 1000, Math.max(0.1, Math.round(+km * 10) / 10 || 0.1));
  state.radius = km * 1000;
  $("rRange").value = km;
  if (!fromInput) $("rNum").value = km;
  update();
}
$("rRange").addEventListener("input", e => setRadius(e.target.value));
$("rNum").addEventListener("change", e => setRadius(e.target.value));
$("presets").addEventListener("click", e => { if (e.target.dataset.r) { setRadius(e.target.dataset.r); fitRing(); } });

function setCenter(latlng, opts) { state.center = L.latLng(latlng); pin.setLatLng(state.center); update(opts); }
pin.on("drag", e => setCenter(e.target.getLatLng(), { throttle: true }));
pin.on("dragend", e => setCenter(e.target.getLatLng()));
$("cReset").addEventListener("click", () => { setCenter(M.origin); fitRing(); });
$("clickMove").addEventListener("change", e => document.body.classList.toggle("move-mode", e.target.checked));

$("rows").addEventListener("change", e => { state.visible[+e.target.dataset.i] = e.target.checked; buildingLayer.redraw(); });
function setVisible(fn) {
  document.querySelectorAll("#rows input").forEach(b => { b.checked = fn(+b.dataset.i); state.visible[+b.dataset.i] = b.checked; });
  buildingLayer.redraw();
}
$("hideUncl").addEventListener("click", () => setVisible(i => i !== 0));
$("showAll").addEventListener("click", () => setVisible(() => true));
$("outside").addEventListener("change", e => { state.outside = e.target.value; buildingLayer.redraw(); });
$("bg").addEventListener("change", e => {
  state.bg = e.target.value;
  state.bg === "own" ? basemapLayer.addTo(map) : basemapLayer.remove();
  state.bg === "esri" ? esri.addTo(map) : esri.remove();
  $("map").classList.toggle("bg-none", state.bg !== "own");
  $("legend").hidden = state.bg !== "own";
});
L.DomEvent.disableClickPropagation($("panel"));
L.DomEvent.disableScrollPropagation($("panel"));

// 지도 클릭: 중심 이동 모드면 중심점 이동, 아니면 가장 가까운 건물 정보
map.on("click", e => {
  if ($("clickMove").checked) { setCenter(e.latlng); return; }
  const v = buildingLayer.view(), p = e.containerPoint;   // view()는 화면 너비의 50% 여백 포함 → w/4, h/4 만큼 보정
  let best = -1, bd = 81;
  for (let i = 0; i < N; i++) {
    if (!state.visible[cat[i]] || (!inside[i] && state.outside === "hide")) continue;
    const dx = bx[i] * v.scale - v.ox - v.w / 4 - p.x, dy = by[i] * v.scale - v.oy - v.h / 4 - p.y;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  if (best < 0) return;
  const id = B.id[best], type = id < 0 ? "relation" : "way", name = B.names[best];
  const lat = M.origin[0] + B.lat[best] / S, lon = M.origin[1] + B.lon[best] / S;
  const dist = map.distance([lat, lon], state.center);
  L.popup().setLatLng([lat, lon]).setContent(
    `<b>${name ? esc(name) : "(이름 없음)"}</b><br>` +
    `용도: <b style="color:${M.colors[cat[best]]}">${M.order[cat[best]]}</b> (building=${esc(B.values[B.val[best]])})<br>` +
    `중심점에서 ${fmt(Math.round(dist))}m ${inside[best] ? "" : "(반경 밖)"}<br>` +
    `<a href="https://www.openstreetmap.org/${type}/${Math.abs(id)}" target="_blank">OSM에서 보기</a>`).openOn(map);
});

function fitRing() {
  const narrow = window.innerWidth < 700;
  map.fitBounds(ring.getBounds(), { paddingTopLeft: [20, 20], paddingBottomRight: [narrow ? 20 : 330, 20] });
}
L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
map.setView(M.origin, 13);
update({ redraw: false });
fitRing();
buildingLayer.redraw();
</script>
</body>
</html>
"""

if __name__ == "__main__":
    main()
