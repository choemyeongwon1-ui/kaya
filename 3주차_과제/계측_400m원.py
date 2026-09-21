# -*- coding: utf-8 -*-
"""1 계획단위 가설의 셈 - 중심에서 400m 원 안의 초등학교.공원.역과, 원을 가로지르는 간선도로.

  py 계측_400m원.py

페리(1929)의 근린주구 원칙 1(반경 약 400m 안에 초등학교 1개교)과 원칙 2(네 면의 간선도로가 경계)를
대상지에 대입해 '인상이 아니라 개수로' 확인한다. 출처 OpenStreetMap(ODbL) Overpass API.
"""
import csv, json, math, time, urllib.request, urllib.parse, datetime

LAT, LON = 37.5735, 126.9790          # 중심 - 종로구청 (1.2주차와 같은 좌표)
EPS = ["https://overpass-api.de/api/interpreter",
       "https://overpass.kumi.systems/api/interpreter",
       "https://overpass.private.coffee/api/interpreter"]   # 504 가 잦아 미러를 순회한다
QDATE = datetime.date.today().isoformat()

def overpass(q):
    last = None
    for attempt in range(6):
        ep = EPS[attempt % len(EPS)]
        try:
            req = urllib.request.Request(ep, data=urllib.parse.urlencode({"data": q}).encode(),
                                         headers={"User-Agent": "smartcity-class-week3/1.0"})
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.load(r)
        except Exception as e:                      # 504.429 는 재시도, 마지막까지 실패하면 올린다
            last = e
            print("  재시도 %d - %s (%s)" % (attempt + 1, ep, e))
            time.sleep(8)
    raise last

def dist(la, lo):
    R = 6371000.0
    dla, dlo = math.radians(la - LAT), math.radians(lo - LON)
    a = math.sin(dla / 2) ** 2 + math.cos(math.radians(LAT)) * math.cos(math.radians(la)) * math.sin(dlo / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))

# 1) 시설 - 반경 1,200m 를 받아 400 / 500 / 800m 로 나눠 센다
q1 = """[out:json][timeout:120];
(
  nwr(around:1200,{0},{1})["amenity"="school"];
  nwr(around:1200,{0},{1})["leisure"="park"];
  nwr(around:1200,{0},{1})["landuse"="recreation_ground"];
  nwr(around:1200,{0},{1})["railway"="station"];
  nwr(around:1200,{0},{1})["station"="subway"];
);
out center tags;""".format(LAT, LON)

rows = []
for e in overpass(q1)["elements"]:
    t = e.get("tags", {})
    la = e.get("lat") or (e.get("center") or {}).get("lat")
    lo = e.get("lon") or (e.get("center") or {}).get("lon")
    if la is None:
        continue
    name = t.get("name:ko") or t.get("name") or "(무명)"
    if t.get("amenity") == "school":
        kind = "초등학교" if ("초등학교" in name or t.get("isced:level") == "1") else "학교(기타)"
    elif t.get("leisure") == "park" or t.get("landuse") == "recreation_ground":
        kind = "근린공원" if "근린공원" in name else "공원(소공원.광장 등)"
    elif t.get("railway") == "station" or t.get("station") == "subway":
        kind = "역"
    else:
        continue
    rows.append([round(dist(la, lo)), kind, name, round(la, 5), round(lo, 5),
                 "%s/%s" % (e["type"], e["id"])])
rows.sort()

with open("계측_400m원_시설목록.csv", "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f)
    w.writerow(["중심거리(m)", "구분", "명칭", "위도", "경도", "OSM 식별자", "조회일"])
    for r in rows:
        if r[0] <= 900:
            w.writerow(r + [QDATE])

print("== 반경별 개수 (중심 종로구청 %s, %s) ==" % ((LAT, LON), QDATE))
for R in (400, 500, 800):
    c = {}
    for r in rows:
        if r[0] <= R:
            c[r[1]] = c.get(r[1], 0) + 1
    print(" 반경 %d m:" % R, c if c else "없음")
near = [r for r in rows if r[1] == "초등학교"][:3]
print(" 가장 가까운 초등학교:", ", ".join("%s %dm" % (r[2], r[0]) for r in near))

# 2) 간선도로 - 원의 경계가 되는가, 원을 가로지르는가
q2 = """[out:json][timeout:120];
(way(around:700,{0},{1})["highway"~"^(trunk|primary|secondary)$"];);
out geom tags;""".format(LAT, LON)

agg = {}
for e in overpass(q2)["elements"]:
    t = e.get("tags", {})
    n = t.get("name:ko") or t.get("name") or "(무명)"
    ds = [dist(p["lat"], p["lon"]) for p in e.get("geometry", [])]
    if not ds:
        continue
    k = (n, t.get("highway"))
    cur = agg.get(k)
    agg[k] = (min(cur[0], min(ds)), max(cur[1], max(ds))) if cur else (min(ds), max(ds))

with open("계측_400m원_간선도로.csv", "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f)
    w.writerow(["도로명", "OSM highway 등급", "중심 최근접(m)", "최원접(m)", "400m 원과의 관계", "조회일"])
    inside = 0
    for (n, h), (mn, mx) in sorted(agg.items(), key=lambda x: x[1][0]):
        rel = "원 안까지 들어옴" if mn < 400 else "원 밖"
        if mn < 400:
            inside += 1
        w.writerow([n, h, round(mn), round(mx), rel, QDATE])
print(" 400m 원 안으로 들어오는 간선도로 구간:", inside, "개 /", len(agg), "개")
