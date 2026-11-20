"""보행망 구간(edge)마다 두 가지 속성을 붙여 needs/data/edges_extra.json 으로 저장합니다.

1) 포장 상태(surface): OpenStreetMap 길(highway)의 surface 태그를 구간에 맞춰 붙임
   0 = 모름(태그 없음) · 1 = 포장(아스팔트·콘크리트·보도블록·데크 등) · 2 = 비포장(흙·자갈·잔디·모래 등)
   구간을 3곳(1/4·1/2·3/4 지점) 찍어, 12m 안의 가장 가까운 '태그 있는 길'의 값을 다수결로 정함
2) 상권 인접(biz): 구간 중간점 60m 안의 상점·음식점·카페 수 (data/shops.json, OSM)
   → 성수동 상권과 맞닿은 번잡한 경계 구간을 알아보는 데 씀

쓰는 법:  python needs/tools/edge_extras.py   (recovery-station 폴더에서. Overpass API로 공개 OSM 자료를 받음)
자료 출처: © OpenStreetMap 기여자, ODbL
"""
import json, math, sys, time, urllib.request, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]           # recovery-station
NET = json.loads((ROOT / 'data/network.json').read_text(encoding='utf8'))
SHOPS = json.loads((ROOT / 'data/shops.json').read_text(encoding='utf8'))
OUT = ROOT / 'needs/data/edges_extra.json'

PAVED = {'asphalt', 'concrete', 'concrete:plates', 'concrete:lanes', 'paving_stones', 'paving_stones:30', 'sett', 'bricks', 'paved', 'wood', 'metal', 'rubber', 'tartan', 'cobblestone', 'unhewn_cobblestone', 'stone'}
UNPAVED = {'unpaved', 'gravel', 'fine_gravel', 'compacted', 'dirt', 'earth', 'ground', 'grass', 'sand', 'woodchips', 'mud', 'pebblestone', 'grass_paver', '황토', '흙'}   # 한국어로 적힌 태그도 있음(서울숲 황톳길)
NEAR_SURF = 12      # m
NEAR_BIZ = 60       # m

nodes = NET['nodes']
lons = [n[0] for n in nodes]; lats = [n[1] for n in nodes]
s, w, n, e = min(lats) - .001, min(lons) - .001, max(lats) + .001, max(lons) + .001
lat0 = (s + n) / 2
KX, KY = 111320 * math.cos(math.radians(lat0)), 110540
xy = lambda lon, lat: ((lon - w) * KX, (lat - s) * KY)

query = f'[out:json][timeout:60];way["highway"]["surface"]({s},{w},{n},{e});out geom;'
req = urllib.request.Request('https://overpass-api.de/api/interpreter', data=urllib.parse.urlencode({'data': query}).encode(),
                             headers={'User-Agent': 'park-dashboard-student-project'})
for attempt in range(3):
    try:
        osm = json.loads(urllib.request.urlopen(req, timeout=90).read().decode('utf8')); break
    except Exception as ex:
        print('Overpass 재시도', attempt + 1, ex, file=sys.stderr); time.sleep(5)
else:
    sys.exit('Overpass 응답 없음')

# 태그 있는 길의 선분 목록 (x1,y1,x2,y2,class)
segs, tagcount = [], {}
for way in osm.get('elements', []):
    sv = way.get('tags', {}).get('surface', '')
    cls = 1 if sv in PAVED else 2 if sv in UNPAVED else 0
    tagcount[sv] = tagcount.get(sv, 0) + 1
    if not cls: continue
    g = way.get('geometry') or []
    for a, b in zip(g, g[1:]):
        segs.append((*xy(a['lon'], a['lat']), *xy(b['lon'], b['lat']), cls))

# 격자로 빠르게 찾기
CELL = 30
grid = {}
for i, (x1, y1, x2, y2, _) in enumerate(segs):
    for gx in range(int(min(x1, x2) // CELL) - 1, int(max(x1, x2) // CELL) + 2):
        for gy in range(int(min(y1, y2) // CELL) - 1, int(max(y1, y2) // CELL) + 2):
            grid.setdefault((gx, gy), []).append(i)

def seg_dist(px, py, x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1; L = dx * dx + dy * dy
    t = 0 if not L else max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / L))
    return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))

def surf_at(px, py):
    best, bd = 0, NEAR_SURF
    for i in grid.get((int(px // CELL), int(py // CELL)), []):
        d = seg_dist(px, py, *segs[i][:4])
        if d < bd: bd, best = d, segs[i][4]
    return best

biz_pts = [xy(p[1], p[0]) for p in SHOPS['points'] if p[2] in ('shop', 'food', 'cafe')]
bgrid = {}
for x, y in biz_pts: bgrid.setdefault((int(x // NEAR_BIZ), int(y // NEAR_BIZ)), []).append((x, y))

surface, biz = [], []
for (a, b, *_rest) in NET['edges']:
    ax, ay = xy(*nodes[a]); bx, by = xy(*nodes[b])
    votes = [surf_at(ax + (bx - ax) * t, ay + (by - ay) * t) for t in (.25, .5, .75)]
    known = [v for v in votes if v]
    surface.append(max(set(known), key=known.count) if known else 0)
    mx, my = (ax + bx) / 2, (ay + by) / 2
    gx, gy = int(mx // NEAR_BIZ), int(my // NEAR_BIZ)
    cnt = sum(1 for dx in (-1, 0, 1) for dy in (-1, 0, 1) for (x, y) in bgrid.get((gx + dx, gy + dy), []) if math.hypot(x - mx, y - my) <= NEAR_BIZ)
    biz.append(cnt)

stat = {'edges': len(surface), 'paved': surface.count(1), 'unpaved': surface.count(2), 'unknown': surface.count(0),
        'bizEdges': sum(1 for c in biz if c >= 3), 'osmWays': len(osm.get('elements', [])), 'surfaceTags': dict(sorted(tagcount.items(), key=lambda kv: -kv[1]))}
OUT.write_text(json.dumps({
    'source': 'OpenStreetMap(Overpass API) highway surface 태그 · data/shops.json(OSM 상점·음식점·카페) · ODbL',
    'fetched': time.strftime('%Y-%m-%d'),
    'note': 'surface: 0 모름 · 1 포장 · 2 비포장 (구간 3곳 다수결, 12m 안) / biz: 구간 중간점 60m 안 상점·음식점·카페 수',
    'stats': stat, 'surface': surface, 'biz': biz}, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
print(json.dumps(stat, ensure_ascii=False))
