"""맞춤 추천·산책 코스 화면(recovery-station/needs)에서 쓰는 자료 가공
  facilities.json  공원 안 화장실·벤치·정자(쉼터)·실내 휴게·음수대 (OSM)
  nearby.json      공원 밖 걸어갈 수 있는 무료 장소: 도서관·주민센터·공원 (OSM)
  backdrop.json    넓은 지도 배경용 한강·중랑천 수면
사용: python -I analysis/06_needs.py <프로젝트 폴더>
공원 밖 장소 원자료(data/raw/nearby/places.json, walk_wide.json)가 없으면 Overpass에서 내려받습니다."""
import json, sys, math, datetime as dt
sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path
import numpy as np, shapely, pyproj
from shapely.geometry import LineString, Polygon, Point, box
from shapely.ops import polygonize, unary_union

ROOT = Path(sys.argv[1]); RAW = ROOT/"data/raw"; OUT = ROOT/"recovery-station/needs/data"; OUT.mkdir(parents=True, exist_ok=True)
CRS = 5186
NEAR_BBOX = (37.5246, 127.0138, 37.5646, 127.0609)   # S, W, N, E  (공원 경계에서 약 1.5km)
NEAR_MAX = 1300          # 공원 경계에서 직선 m. 이보다 먼 곳은 '근처'에서 뺀다
RIVER_LAT = 37.5365      # 이보다 남쪽은 한강 건너편이라 걸어가기 어렵다고 보고 뺀다
SKIP_NAMES = {"서울숲", "Rose Garden", "쉼터", "팔각정", "사잇길", "Seongsam Park", "행당한신 공원", "행당한신 정자", "용비교아래쉼터", "물댄동산어린이도서관"}
#   용비교아래쉼터는 서울숲 서쪽 끝과 맞닿은 다리 밑 쉼터라 '공원 밖 대안'으로 보기 어려워 뺀다. 아파트 단지 안 공원도 뺀다.
#   물댄동산어린이도서관과 이름이 '문고'로 끝나는 곳은 2009년 일괄 등록 자료라 지금 운영하는지 확인할 수 없어 뺀다.
# OSM에 도서관으로 등록돼 있지 않지만 운영이 확인된 곳 (좌표는 같은 건물의 OSM 요소)
MANUAL = [dict(id="w894988852", kind="library", name="성수도서관 (성수문화복지회관 7층)", lat=37.54541, lon=127.04697,
               src="위치: OSM 성수아트홀 건물(뚝섬로1길 43) · 7층 도서관 입주는 서울시 미디어허브 기사로 확인")]
tr = pyproj.Transformer.from_crs(4326, CRS, always_xy=True); inv = pyproj.Transformer.from_crs(CRS, 4326, always_xy=True)
def tf(g): return shapely.transform(g, lambda c: np.column_stack(tr.transform(c[:, 0], c[:, 1])))
def back(g): return shapely.transform(g, lambda c: np.column_stack(inv.transform(c[:, 0], c[:, 1])))
def ll(gs): return [(p["lon"], p["lat"]) for p in gs]
def dump(name, obj):
    p = OUT/name; p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf8"); print("저장", p.name, p.stat().st_size, "bytes")

# ---------- 공원 경계 (02_vulnerability.py와 같은 방법) ----------
pk = json.load(open(RAW/"osm/park.json", encoding="utf8"))["elements"][0]
polys = sorted([tf(p) for p in polygonize(unary_union([LineString(ll(m["geometry"])) for m in pk["members"]]))], key=lambda p: -p.area)
PARKALL = unary_union(polys[:2])
ex = json.load(open(RAW/"osm/extra.json", encoding="utf8"))["elements"]
_r = []
for e in ex:
    t = e.get("tags", {})
    if e["type"] != "way" or "geometry" not in e: continue
    c = ll(e["geometry"])
    if len(c) < 4 or c[0] != c[-1]: continue
    if t.get("man_made") == "water_works" or t.get("access") == "private" or t.get("landuse") == "commercial":
        g = tf(Polygon(c).buffer(0))
        if g.intersects(polys[0]) and g.intersection(polys[0]).area > 100: _r.append(g)
RESTRICT = unary_union(_r)
CEN = PARKALL.centroid

def rep_point(e):
    """요소의 대표점(투영 좌표). 면은 안쪽 점, 선은 가운데 점."""
    if e["type"] == "node": return tf(Point(e["lon"], e["lat"]))
    if e["type"] == "way" and e.get("geometry"):
        c = ll(e["geometry"])
        g = Polygon(c).buffer(0) if len(c) > 3 and c[0] == c[-1] else LineString(c)
        g = tf(g)
        return g.representative_point() if g.geom_type in ("Polygon", "MultiPolygon") and not g.is_empty else g.interpolate(.5, normalized=True)
    if e.get("center"): return tf(Point(e["center"]["lon"], e["center"]["lat"]))
    return None

# ---------- 공원 안 쉼·편의 시설 ----------
OSM = json.load(open(RAW/"osm/osm.json", encoding="utf8"))
KIND = lambda t: ("toilet" if t.get("amenity") == "toilets" else "bench" if t.get("amenity") == "bench" else "shelter" if t.get("amenity") == "shelter"
                  else "indoor" if t.get("amenity") == "community_centre" else "water" if t.get("amenity") == "drinking_water" or t.get("man_made") == "water_tap" else None)
inP = PARKALL.buffer(15)
raw = []
for e in OSM["elements"]:
    t = e.get("tags") or {}; k = KIND(t)
    if not k: continue
    p = rep_point(e)
    if p is None or not p.within(inP) or (not RESTRICT.is_empty and p.within(RESTRICT)): continue
    raw.append(dict(k=k, p=p, id=f"{e['type'][0]}{e['id']}", name=t.get("name"), t=t))
# 같은 종류가 가까이 모여 있으면 한 곳으로 묶는다 (벤치 여러 개가 나란히 있는 자리, 건물과 점이 겹친 화장실)
MERGE = dict(bench=15, toilet=20, shelter=10, indoor=20, water=10)
fac = []
for k in ("toilet", "bench", "shelter", "indoor", "water"):
    items = [r for r in raw if r["k"] == k]; used = [False]*len(items)
    for i, a in enumerate(items):
        if used[i]: continue
        grp = [a]; used[i] = True
        for j in range(i+1, len(items)):
            if not used[j] and any(items[j]["p"].distance(g["p"]) <= MERGE[k] for g in grp): grp.append(items[j]); used[j] = True
        c = Point(float(np.mean([g["p"].x for g in grp])), float(np.mean([g["p"].y for g in grp])))
        lon, lat = inv.transform(c.x, c.y)
        name = next((g["name"] for g in grp if g["name"]), None)
        tags = {}
        for g in grp:
            for kk in ("wheelchair", "opening_hours", "fee", "backrest", "shelter_type", "bench", "changing_table", "unisex", "access"):
                if kk in g["t"]: tags.setdefault(kk, g["t"][kk])
        fac.append(dict(id=grp[0]["id"], kind=k, n=len(grp), name=name, lat=round(lat, 6), lon=round(lon, 6), tags=tags))
cnt = {k: sum(1 for f in fac if f["kind"] == k) for k in MERGE}
print("공원 안 시설(묶은 뒤):", cnt, "| 벤치 낱개", sum(f["n"] for f in fac if f["kind"] == "bench"))
for f in fac: print("  ", f["kind"], f["id"], f["n"], f["name"], f["lat"], f["lon"], f["tags"])
dump("facilities.json", dict(source="OpenStreetMap (Overpass API) · ODbL", osm_base=OSM.get("osm3s", {}).get("timestamp_osm_base"), generated=dt.date.today().isoformat(),
     note="벤치는 OSM에 등록된 것만 있어 실제보다 훨씬 적습니다. 현장 조사로 보완해야 합니다.", counts=cnt, points=fac))

# ---------- 공원 밖 무료 장소 ----------
NB = RAW/"nearby/places.json"
if not NB.exists():
    import requests
    NB.parent.mkdir(parents=True, exist_ok=True)
    b = ",".join(map(str, NEAR_BBOX))
    q = f'[out:json][timeout:90];(nwr["amenity"="library"]({b});nwr["amenity"="community_centre"]({b});nwr["amenity"="townhall"]({b});nwr["office"="government"]({b});nwr["leisure"="park"]["name"]({b});nwr["amenity"="public_bookcase"]({b});nwr["amenity"="social_facility"]({b}););out center tags;'
    r = requests.post("https://overpass-api.de/api/interpreter", data={"data": q}, headers={"User-Agent": "park-analysis-student-project"}, timeout=120)
    r.raise_for_status(); NB.write_bytes(r.content)
PL = json.load(open(NB, encoding="utf8"))
DIRS = ["동", "북동", "북", "북서", "서", "남서", "남", "남동"]
def kind_of(t):
    n = t.get("name") or ""
    if t.get("amenity") == "library": return "library"
    if t.get("amenity") == "townhall" and "주민센터" in n: return "community"
    if t.get("leisure") == "park": return "park"
    return None
cand = []
def add(id_, k, n, lat, lon, hours=None, way=False, src=None):
    p = tf(Point(lon, lat)); d = p.distance(PARKALL)
    if d > NEAR_MAX: return
    ang = math.degrees(math.atan2(p.y-CEN.y, p.x-CEN.x)) % 360
    cand.append(dict(id=id_, kind=k, name=n.replace("  ", " ").strip(), lat=round(lat, 6), lon=round(lon, 6), d=int(round(d/10)*10), dir=DIRS[int((ang+22.5)//45) % 8],
                     hours=hours, kids=("어린이" in n) or None, src=src, p=p, way=way))
for e in PL["elements"]:
    t = e.get("tags") or {}; k = kind_of(t); n = t.get("name")
    if not k or not n or n in SKIP_NAMES or n.endswith("문고"): continue
    lat = e.get("lat") or (e.get("center") or {}).get("lat"); lon = e.get("lon") or (e.get("center") or {}).get("lon")
    if lat is None or lat < RIVER_LAT: continue
    add(f"{e['type'][0]}{e['id']}", k, n, lat, lon, t.get("opening_hours"), e["type"] != "node")
for m in MANUAL: add(m["id"], m["kind"], m["name"], m["lat"], m["lon"], way=True, src=m["src"])
# 같은 곳이 점과 면으로 두 번 등록된 경우 하나만 남긴다 (이름의 띄어쓰기 차이는 무시)
key = lambda c: c["name"].replace(" ", "").replace("·", "")
out = []
for c in sorted(cand, key=lambda c: (not c["way"], c["d"])):
    if any(key(o) == key(c) and o["p"].distance(c["p"]) < 400 for o in out): continue
    out.append(c)

# 걷는 거리: 보행 가능한 길을 따라 공원 경계에서부터 잰다 (하천은 다리로만 건넌다)
# 넓은 범위 보행망(data/raw/nearby/walk_wide.json)이 없으면 내려받고, 그래도 없으면 공원 주변 원자료만 쓴다
import networkx as nx
WALKABLE = {"footway", "path", "pedestrian", "steps", "cycleway", "corridor", "residential", "living_street", "service", "unclassified", "tertiary", "tertiary_link", "secondary", "secondary_link", "primary", "primary_link"}
WW = RAW/"nearby/walk_wide.json"
if not WW.exists():
    import requests
    b = f"37.5300,{NEAR_BBOX[1]},{NEAR_BBOX[2]},{NEAR_BBOX[3]}"
    q = f'[out:json][timeout:150];way["highway"~"^({"|".join(sorted(WALKABLE - {"corridor"}))})$"]({b});out geom;'
    for ep in ("https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"):
        try:
            r = requests.post(ep, data={"data": q}, headers={"User-Agent": "park-analysis-student-project"}, timeout=200)
            if r.ok and r.content[:1] == b"{": WW.write_bytes(r.content); break
        except Exception as err:
            print("보행망 내려받기 실패", ep, err)
if WW.exists():
    WALKSRC = json.load(open(WW, encoding="utf8"))["elements"]; WALKBOX = tf(box(NEAR_BBOX[1], 37.5300, NEAR_BBOX[3], NEAR_BBOX[2])).buffer(-30)
else:
    WALKSRC = OSM["elements"]; WALKBOX = tf(box(127.024, 37.532, 127.050, 37.556)).buffer(-30)
G = nx.Graph(); XY = {}
for e in WALKSRC:
    t = e.get("tags") or {}
    if e["type"] != "way" or t.get("highway") not in WALKABLE or not e.get("geometry") or t.get("access") in ("private", "no"): continue
    xs, ys = tr.transform([p["lon"] for p in e["geometry"]], [p["lat"] for p in e["geometry"]])
    for i, n in enumerate(e["nodes"]): XY[n] = (xs[i], ys[i])
    for i in range(len(e["nodes"])-1):
        G.add_edge(e["nodes"][i], e["nodes"][i+1], w=math.hypot(xs[i+1]-xs[i], ys[i+1]-ys[i]))
comp = max(nx.connected_components(G), key=len); G = G.subgraph(comp).copy()
ids = np.array(list(G.nodes)); pts = np.array([XY[n] for n in ids])
src = [int(n) for n, (x, y) in zip(ids, pts) if Point(x, y).within(PARKALL.buffer(2))]
dist = nx.multi_source_dijkstra_path_length(G, src, weight="w")
for c in out:
    c["walk"] = None
    if not c["p"].within(WALKBOX): continue
    dd = np.hypot(pts[:, 0]-c["p"].x, pts[:, 1]-c["p"].y); j = int(dd.argmin())
    if dd[j] <= 120 and int(ids[j]) in dist: c["walk"] = int(round((dist[int(ids[j])] + dd[j])/10)*10)
print("보행망", G.number_of_nodes(), "노드 · 공원 안 출발 노드", len(src), "· 걷는 거리 계산된 곳", sum(1 for c in out if c["walk"]), "/", len(out))
out.sort(key=lambda c: c["walk"] if c["walk"] else c["d"]*1.4)
near = [{k: v for k, v in c.items() if k not in ("p", "way") and v is not None} for c in out]
print("공원 밖 무료 장소:", {k: sum(1 for c in near if c["kind"] == k) for k in ("library", "community", "park")})
for c in near: print("  ", c["kind"], c["name"], "직선", c["d"], "m · 걷는 거리", c.get("walk"), c["dir"], c.get("hours") or "")
dump("nearby.json", dict(source="OpenStreetMap (Overpass API) · ODbL", osm_base=PL.get("osm3s", {}).get("timestamp_osm_base"), generated=dt.date.today().isoformat(),
     note="d는 공원 경계에서 잰 직선거리, walk는 보행 가능한 길을 따라 공원 경계에서 잰 거리입니다(원자료 범위 밖은 없음). 운영시간·휴관일은 OSM에 거의 없어 방문 전 확인이 필요합니다.", max_m=NEAR_MAX, places=near))

# ---------- 넓은 지도 배경: 한강·중랑천 ----------
VIEW = tf(box(127.012, 37.527, 127.066, 37.566))
water = []
for e in OSM["elements"]:
    t = e.get("tags") or {}
    if e["type"] != "relation" or t.get("natural") != "water": continue
    try:
        ls = [LineString(ll(m["geometry"])) for m in e["members"] if m.get("geometry") and len(m["geometry"]) > 1 and m.get("role") in ("outer", "")]
        g = unary_union([tf(p) for p in polygonize(unary_union(ls))]).intersection(VIEW).simplify(4)
        for p in (g.geoms if hasattr(g, "geoms") else [g]):
            if p.geom_type == "Polygon" and p.area > 2000:
                water.append([[round(x, 5), round(y, 5)] for x, y in back(p).exterior.coords])
        print("수면", t.get("name"), round(g.area/1e4, 1), "ha")
    except Exception as err:
        print("수면 건너뜀", t.get("name"), err)
dump("backdrop.json", dict(source="OpenStreetMap (Overpass API) · ODbL", water=water))
